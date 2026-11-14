import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { HttpError } from './http';

export async function requireUser(req: NextRequest): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new HttpError(503, 'Authentication is not configured.');
  const header = req.headers.get('authorization') || '';
  const token = /^Bearer ([^\s]+)$/.exec(header)?.[1];
  if (!token) throw new HttpError(401, 'Please sign in.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Session expired. Please sign in again.');
  return data.user.id;
}
