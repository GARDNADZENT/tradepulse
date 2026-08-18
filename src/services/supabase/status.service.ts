import { supabase, type StatusRecord } from './client';

export const statusService = {
    async saveStatus(status: string, details?: Record<string, unknown>): Promise<StatusRecord | null> {
        const { data, error } = await supabase
            .from('statuses')
            .upsert({ status, details, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
            .select()
            .single();

        if (error) {
            console.error('Supabase saveStatus error:', error);
            return null;
        }

        return data as StatusRecord;
    },

    async getStatus(): Promise<StatusRecord | null> {
        const { data, error } = await supabase
            .from('statuses')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Supabase getStatus error:', error);
            return null;
        }

        return data as StatusRecord | null;
    },
};
