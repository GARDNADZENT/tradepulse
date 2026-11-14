'use client';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';

type Auth = { client: SupabaseClient | null; session: Session | null; ready: boolean; request: <T>(path: string, init?: RequestInit) => Promise<T> };
const AuthContext = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } });
  }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!client);
  useEffect(() => {
    if (!client) return;
    let mounted = true;
    client.auth.getSession().then(({ data }) => { if (mounted) { setSession(data.session); setReady(true); } });
    const { data } = client.auth.onAuthStateChange((_event, next) => { if (mounted) { setSession(next); setReady(true); } });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, [client]);
  const request = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    // Refresh or retrieve the current in-memory session; never place tokens in URLs or storage.
    const current = await client?.auth.getSession();
    const token = current?.data.session?.access_token;
    if (!token) throw new Error('Please sign in to continue.');
    const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers, Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Request failed.');
    return body as T;
  };
  return <AuthContext.Provider value={{ client, session, ready, request }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const ctx = useContext(AuthContext); if (!ctx) throw new Error('AuthProvider missing'); return ctx; }
