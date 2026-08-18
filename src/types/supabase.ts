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
        };
        Functions: {};
        Enums: {};
    };
}
