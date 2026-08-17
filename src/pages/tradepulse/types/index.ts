export interface Journey {
    loginid: string;
    initial_balance: number;
    daily_target_pct: number;
    cycle_length_days: number;
    start_date: string;
    created_at: string;
    updated_at: string;
}

export interface JourneyDay {
    day_number: number;
    date: string;
    expected_start: number;
    expected_end: number;
    actual_balance: number | null;
    status: ScheduleStatus;
}

export type ScheduleStatus = 'pending' | 'complete' | 'behind' | 'missed';

export interface PerformanceStats {
    total_profit: number;
    win_rate: number;
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    avg_win: number;
    avg_loss: number;
    profit_factor: number;
    current_streak: number;
    largest_win: number;
    largest_loss: number;
    win_streak: number;
    loss_streak: number;
    best_day: { date: string; profit: number } | null;
    worst_day: { date: string; profit: number } | null;
    most_traded: number;
    most_traded_market: string | null;
    most_traded_contract: string | null;
}

export interface DailyPnL {
    date: string;
    profit: number;
    trades: number;
}

export interface ScheduleRow {
    day: number;
    date: string;
    start: number;
    end: number;
    profit: number;
    rate: number;
    actual: number | null;
    diff: number | null;
    status: ScheduleStatus;
}
