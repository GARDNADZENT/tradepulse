export type Json =
    | string
    | number
    | boolean
    | null
    | Json[]
    | { [key: string]: Json };

export interface Database {
    public: {
        Tables: {
            statuses: {
                Row: {
                    id: string;
                    user_id: string | null;
                    status: string;
                    details: Json | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id?: string | null;
                    status: string;
                    details?: Json | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string | null;
                    status?: string;
                    details?: Json | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            journeys: {
                Row: {
                    id: string;
                    loginid: string;
                    initial_balance: number;
                    daily_target_pct: number;
                    cycle_length_days: number;
                    start_date: string;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    loginid: string;
                    initial_balance: number;
                    daily_target_pct: number;
                    cycle_length_days: number;
                    start_date: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    loginid?: string;
                    initial_balance?: number;
                    daily_target_pct?: number;
                    cycle_length_days?: number;
                    start_date?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            journey_days: {
                Row: {
                    id: string;
                    journey_id: string;
                    day_number: number;
                    date: string;
                    expected_start: number;
                    expected_end: number;
                    actual_balance: number | null;
                    status: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    journey_id: string;
                    day_number: number;
                    date: string;
                    expected_start: number;
                    expected_end: number;
                    actual_balance?: number | null;
                    status?: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    journey_id?: string;
                    day_number?: number;
                    date?: string;
                    expected_start?: number;
                    expected_end?: number;
                    actual_balance?: number | null;
                    status?: string;
                    created_at?: string;
                };
                Relationships: [];
            };
        };
        Functions: {};
        Enums: {};
    };
}
