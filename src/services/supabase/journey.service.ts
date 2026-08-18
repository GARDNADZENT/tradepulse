import { supabase, type JourneyRecord } from './client';
import type { Journey } from '@/pages/tradepulse/types';

const isMissingColumnError = (error: { message?: string; code?: string } | null) => {
    if (!error) return false;
    const msg = error.message || '';
    return msg.includes('does not exist') || error.code === '42703';
};

export const journeyService = {
    async loadJourney(loginid: string): Promise<Journey | null> {
        if (!supabase) return null;

        const { data, error } = await supabase
            .from('journeys')
            .select('*')
            .eq('loginid', loginid)
            .maybeSingle();

        if (error) {
            if (isMissingColumnError(error)) {
                console.warn('[Supabase] journeys table is missing expected columns. Run supabase/journeys-table.sql in Supabase SQL Editor.');
            } else {
                console.error('Supabase loadJourney error:', error);
            }
            return null;
        }

        if (!data) return null;

        return {
            loginid: data.loginid,
            initial_balance: Number(data.initial_balance),
            daily_target_pct: Number(data.daily_target_pct),
            cycle_length_days: Number(data.cycle_length_days),
            start_date: data.start_date,
            created_at: data.created_at,
            updated_at: data.updated_at,
        };
    },

    async saveJourney(loginid: string, journey: Journey): Promise<Journey | null> {
        if (!supabase) return null;

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
                console.warn('[Supabase] journeys table is missing expected columns. Run supabase/journeys-table.sql in Supabase SQL Editor.');
            } else {
                console.error('Supabase saveJourney error:', error);
            }
            return null;
        }

        return data as Journey;
    },

    async deleteJourney(loginid: string): Promise<void> {
        if (!supabase) return;

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
