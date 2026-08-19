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

export const loadJourney = async (loginid: string): Promise<Journey | null> => {
    const supabaseJourney = await journeyService.loadJourney(loginid);
    if (supabaseJourney) {
        return supabaseJourney;
    }
    return null;
};

export const loadJourneySync = (loginid: string): Journey | null => {
    return null;
};

export const saveJourney = async (loginid: string, journey: Journey) => {
    const saved = await journeyService.saveJourney(loginid, journey);
    if (saved?.id) {
        const schedule = buildSchedule(journey);
        await journeyService.saveJourneyDays(saved.id, journey, schedule);
    }
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
