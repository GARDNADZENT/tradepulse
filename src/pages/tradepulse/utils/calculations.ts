import type { Journey, JourneyDay, ScheduleStatus, ScheduleRow } from '@/pages/tradepulse/types';
import { addComma, getDecimalPlaces } from '@/components/shared';
import { journeyService } from '@/services/supabase/journey.service';

export const getDefaultJourney = (loginid: string): Journey => ({
    loginid,
    initial_balance: 0,
    daily_target_pct: 5,
    cycle_length_days: 30,
    start_date: new Date().toISOString().slice(0, 10),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
});

/* Convert the server's journey-day rows into the canonical plan shape the
   dashboard uses. Pure plan derivation only — no live balance is involved.
   Server rows use: day_number, date, expected_start, expected_end. */
export const normalizeJourneyDays = (rawDays: any[] | null | undefined, rate: number): ScheduleRow[] => {
    if (!Array.isArray(rawDays) || rawDays.length === 0) return [];
    return rawDays.map(d => {
        const day = d.day || d.day_number;
        const date = d.date;
        const start = Number(d.start != null ? d.start : d.expected_start) || 0;
        const end = Number(d.end != null ? d.end : d.expected_end) || 0;
        return {
            day: Number(day),
            date: String(date),
            start: Math.round(start * 100) / 100,
            end: Math.round(end * 100) / 100,
            profit: Math.round((end - start) * 100) / 100,
            rate: Number(rate),
            actual: null,
            diff: null,
            status: 'pending',
        };
    });
};

export const loadJourney = async (loginid: string): Promise<{ journey: Journey | null; schedule: { initial: number; days: number; rate: number; startDate: string; rows: ScheduleRow[] } | null }> => {
    try {
        const supabaseJourney = await journeyService.loadJourney(loginid);
        const days = await journeyService.loadJourneyDays(supabaseJourney.id);
        const schedule = {
            initial: supabaseJourney.initial_balance,
            days: supabaseJourney.cycle_length_days,
            rate: supabaseJourney.daily_target_pct,
            startDate: supabaseJourney.start_date,
            rows: normalizeJourneyDays(days, supabaseJourney.daily_target_pct),
        };

        return { journey: supabaseJourney, schedule };
    } catch (e) {
        console.error('Load journey failed:', e);
        return { journey: null, schedule: null };
    }
};

export const loadJourneySync = (loginid: string): Journey | null => {
    return null;
};

export const saveJourney = async (loginid: string, journey: Journey): Promise<{ journey: Journey; schedule: { initial: number; days: number; rate: number; startDate: string; rows: ScheduleRow[] } }> => {
    const saved = await journeyService.saveJourney(loginid, journey);

    const schedule = buildSchedule(journey);
    await journeyService.saveJourneyDays(saved.id, journey, schedule);

    const result = {
        journey: saved,
        schedule: {
            initial: saved.initial_balance,
            days: saved.cycle_length_days,
            rate: saved.daily_target_pct,
            startDate: saved.start_date,
            rows: schedule,
        },
    };

    return result;
};

export const buildSchedule = (journey: Journey): ScheduleRow[] => {
    const rows: ScheduleRow[] = [];
    let start = Number(journey.initial_balance);
    const r = Number(journey.daily_target_pct) / 100;
    const base = new Date(journey.start_date + 'T00:00:00');

    const days = Math.max(1, Math.min(Number(journey.cycle_length_days), 365));

    for (let i = 1; i <= days; i++) {
        const end = start * (1 + r);
        const profit = end - start;
        const date = new Date(base);
        date.setDate(base.getDate() + (i - 1));
        const dateStr = date.toISOString().slice(0, 10);

        rows.push({
            day: i,
            date: dateStr,
            start: Math.round(start * 100) / 100,
            end: Math.round(end * 100) / 100,
            profit: Math.round(profit * 100) / 100,
            rate: Number(journey.daily_target_pct),
            actual: null,
            diff: null,
            status: 'pending',
        });

        start = end;
    }

    return rows;
};

export const getCurrentJourneyDay = (startDate: string): number => {
    const start = new Date(startDate + 'T00:00:00');
    const now = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
    const msPerDay = 24 * 60 * 60 * 1000;
    const day = Math.floor((now.getTime() - start.getTime()) / msPerDay) + 1;
    return day >= 1 ? day : 1;
};

export const computeJourneyDay = (row: ScheduleRow | undefined, live: number, journeyDay: number): ScheduleRow | undefined => {
    if (!row) return undefined;
    const isToday = row.day === journeyDay;
    const isPast = row.day < journeyDay;
    let actual: number | null = null;
    let status: ScheduleStatus = 'pending';

    if (isToday) {
        actual = live;
        status = (live - row.end) >= 0 ? 'complete' : 'behind';
    } else if (isPast) {
        if (live - row.end >= 0) {
            actual = row.end;
            status = 'complete';
        } else {
            actual = live > 0 ? live : null;
            status = 'missed';
        }
    }

    const diff = actual != null ? actual - row.end : null;
    return { ...row, actual, diff, status };
};

export const formatCurrency = (value: number | null, currency = 'USD'): string => {
    if (value === null) return '—';
    const decimals = getDecimalPlaces(currency);
    return `${addComma(value.toFixed(decimals))} ${currency}`;
};

export const formatPercent = (value: number | null): string => {
    if (value === null) return '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
};
