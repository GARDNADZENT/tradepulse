import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

let supabase: ReturnType<typeof createClient<Database>> | null = null;

if (supabaseUrl && supabaseKey) {
    supabase = createClient<Database>(supabaseUrl, supabaseKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
} else {
    console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY — status sync disabled');
}

export { supabase };

export type StatusRecord = {
    id?: string;
    user_id?: string;
    status: string;
    details?: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
};

export type JourneyRecord = {
    id?: string;
    loginid: string;
    initial_balance: number;
    daily_target_pct: number;
    cycle_length_days: number;
    start_date: string;
    created_at?: string;
    updated_at?: string;
};
