import { supabase, type JourneyRecord } from './client';
import type { Journey, ScheduleRow } from '@/pages/tradepulse/types';

const isMissingColumnError = (error: { message?: string; code?: string } | null) => {
    if (!error) return false;
    const msg = error.message || '';
    return msg.includes('does not exist') || error.code === '42703';
};

export const journeyService = {
    async loadJourney(loginid: string): Promise<(Journey & { id?: string })> {
        if (!supabase) {
            throw new Error('Supabase client not initialized. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variables.');
        }

        const { data, error } = await supabase
            .from('journeys')
            .select('*')
            .eq('loginid', loginid)
            .maybeSingle();

        if (error) {
            if (isMissingColumnError(error)) {
                const msg = 'journeys table is missing expected columns. Run supabase/journeys-table.sql in Supabase SQL Editor.';
                console.error('[Supabase]', msg, error);
                throw new Error(msg);
            }
            console.error('Supabase loadJourney error:', error);
            throw new Error(`Supabase error: ${error.message || JSON.stringify(error)}`);
        }

        if (!data) {
            throw new Error('No journey found for this account.');
        }

        return {
            id: data.id,
            loginid: data.loginid,
            initial_balance: Number(data.initial_balance),
            daily_target_pct: Number(data.daily_target_pct),
            cycle_length_days: Number(data.cycle_length_days),
            start_date: data.start_date,
            created_at: data.created_at,
            updated_at: data.updated_at,
        };
    },

    async saveJourney(loginid: string, journey: Journey): Promise<(Journey & { id?: string })> {
        if (!supabase) {
            throw new Error('Supabase client not initialized. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variables.');
        }

        const { data, error } = await supabase
            .from('journeys')
            .upsert({
                loginid,
                initial_balance: journey.initial_balance,
                daily_target_pct: journey.daily_target_pct,
                cycle_length_days: journey.cycle_length_days,
                start_date: journey.start_date,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'loginid' })
            .select()
            .single();

        if (error) {
            if (isMissingColumnError(error)) {
                const msg = 'journeys table is missing expected columns. Run supabase/journeys-table.sql in Supabase SQL Editor.';
                console.error('[Supabase]', msg, error);
                throw new Error(msg);
            }
            console.error('Supabase saveJourney error:', error);
            throw new Error(`Supabase error: ${error.message || JSON.stringify(error)}`);
        }

        if (!data) {
            throw new Error('Supabase returned no data after upsert.');
        }

        return {
            id: data.id,
            loginid: data.loginid,
            initial_balance: Number(data.initial_balance),
            daily_target_pct: Number(data.daily_target_pct),
            cycle_length_days: Number(data.cycle_length_days),
            start_date: data.start_date,
            created_at: data.created_at,
            updated_at: data.updated_at,
        };
    },

    async loadJourneyDays(journeyId: string): Promise<ScheduleRow[]> {
        if (!supabase || !journeyId) return [];

        const { data, error } = await supabase
            .from('journey_days')
            .select('*')
            .eq('journey_id', journeyId)
            .order('day_number', { ascending: true });

        if (error) {
            if (isMissingColumnError(error)) {
                const msg = 'journey_days table is missing expected columns. Run supabase/journeys-table.sql in Supabase SQL Editor.';
                console.error('[Supabase]', msg, error);
                throw new Error(msg);
            }
            console.error('Supabase loadJourneyDays error:', error);
            throw new Error(`Supabase error: ${error.message || JSON.stringify(error)}`);
        }

        if (!data || data.length === 0) return [];

        return data.map((row) => {
            const expectedStart = Number(row.expected_start);
            const expectedEnd = Number(row.expected_end);
            return {
                day: Number(row.day_number),
                date: row.date,
                start: expectedStart,
                end: expectedEnd,
                profit: expectedEnd - expectedStart,
                rate: expectedStart > 0 ? ((expectedEnd - expectedStart) / expectedStart) * 100 : 0,
                actual: row.actual_balance != null ? Number(row.actual_balance) : null,
                diff: row.actual_balance != null ? Number(row.actual_balance) - expectedEnd : null,
                status: (row.status as ScheduleRow['status']) || 'pending',
            };
        });
    },

    async saveJourneyDays(journeyId: string, journey: Journey, schedule: ScheduleRow[]): Promise<void> {
        if (!supabase || !journeyId) return;

        const rows = schedule.map((row) => ({
            journey_id: journeyId,
            day_number: row.day,
            date: row.date,
            expected_start: row.start,
            expected_end: row.end,
            actual_balance: row.actual,
            status: row.status,
            created_at: new Date().toISOString(),
        }));

        const { error } = await supabase
            .from('journey_days')
            .upsert(rows, { onConflict: 'journey_id,day_number' });

        if (error) {
            if (isMissingColumnError(error)) {
                const msg = 'journey_days table is missing expected columns. Run supabase/journeys-table.sql in Supabase SQL Editor.';
                console.error('[Supabase]', msg, error);
                throw new Error(msg);
            }
            console.error('Supabase saveJourneyDays error:', error);
            throw new Error(`Supabase error: ${error.message || JSON.stringify(error)}`);
        }
    },

    async updateJourneyDayStatus(journeyId: string, dayNumber: number, actualBalance: number, status: string): Promise<void> {
        if (!supabase || !journeyId) return;

        const { error } = await supabase
            .from('journey_days')
            .update({
                actual_balance: actualBalance,
                status,
            })
            .eq('journey_id', journeyId)
            .eq('day_number', dayNumber);

        if (error) {
            if (isMissingColumnError(error)) {
                console.warn('[Supabase] journey_days table is missing expected columns. Run supabase/journeys-table.sql in Supabase SQL Editor.');
            } else {
                console.error('Supabase updateJourneyDayStatus error:', error);
            }
        }
    },

    async deleteJourney(loginid: string): Promise<void> {
        if (!supabase) return;

        const journey = await this.loadJourney(loginid);
        if (journey?.id) {
            const { error: daysError } = await supabase
                .from('journey_days')
                .delete()
                .eq('journey_id', journey.id);

            if (daysError) {
                console.error('Supabase deleteJourneyDays error:', daysError);
            }
        }

        const { error } = await supabase
            .from('journeys')
            .delete()
            .eq('loginid', loginid);

        if (error) {
            if (isMissingColumnError(error)) {
                console.warn('[Supabase] journeys table is missing expected columns. Run supabase/journeys-table.sql in Supabase SQL Editor.');
            } else {
                console.error('Supabase deleteJourney error:', error);
            }
        }
    },
};
