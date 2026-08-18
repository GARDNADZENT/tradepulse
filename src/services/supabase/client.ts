import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

export const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

export type StatusRecord = {
    id?: string;
    user_id?: string;
    status: string;
    details?: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
};
