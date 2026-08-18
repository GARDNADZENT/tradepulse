import { supabase, type StatusRecord } from './client';

const isMissingColumnError = (error: { message?: string; code?: string } | null) => {
    if (!error) return false;
    const msg = error.message || '';
    return msg.includes('does not exist') || error.code === '42703';
};

export const statusService = {
    async saveStatus(status: string, details?: Record<string, unknown>): Promise<StatusRecord | null> {
        if (!supabase) {
            console.warn('[Supabase] saveStatus skipped — client not initialized');
            return null;
        }

        const { data, error } = await supabase
            .from('statuses')
            .upsert({ status, details, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
            .select()
            .single();

        if (error) {
            if (isMissingColumnError(error)) {
                console.warn('[Supabase] statuses table is missing expected columns. Run supabase/statuses-table.sql in Supabase SQL Editor.');
            } else {
                console.error('Supabase saveStatus error:', error);
            }
            return null;
        }

        return data as StatusRecord;
    },

    async getStatus(): Promise<StatusRecord | null> {
        if (!supabase) {
            console.warn('[Supabase] getStatus skipped — client not initialized');
            return null;
        }

        const { data, error } = await supabase
            .from('statuses')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            if (isMissingColumnError(error)) {
                console.warn('[Supabase] statuses table is missing expected columns. Run supabase/statuses-table.sql in Supabase SQL Editor.');
            } else {
                console.error('Supabase getStatus error:', error);
            }
            return null;
        }

        return data as StatusRecord | null;
    },
};
