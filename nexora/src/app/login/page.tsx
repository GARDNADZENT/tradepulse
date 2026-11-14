'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
export default function Login() {
  const { client } = useAuth(); const router = useRouter();
  const [signup, setSignup] = useState(false); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setMessage(''); if (!client) { setMessage('Authentication is not configured on this deployment.'); return; }
    setBusy(true);
    try {
      const result = signup ? await client.auth.signUp({ email, password }) : await client.auth.signInWithPassword({ email, password });
      if (result.error) { setMessage(result.error.message); return; }
      if (!result.data.session) { setMessage('Check your email to confirm your account, then sign in.'); return; }
      router.push('/dashboard');
    } catch { setMessage('Unable to sign in. Please try again.'); } finally { setBusy(false); }
  }
  return <div className="auth-page"><Link href="/" className="back-link"><ArrowLeft size={16}/> Back to home</Link><div className="auth-card"><Link href="/" className="wordmark"><span className="brand-mark">✳</span><span>NEXORA <b>STUDIO</b></span></Link><span className="eyebrow">YOUR CREATIVE WORKSPACE</span><h1>{signup ? 'Create your account' : 'Welcome back'}</h1><p>{signup ? 'Start building your next idea.' : 'Sign in to continue to your projects.'}</p>
    {!client && <div className="notice">Authentication is not configured. Set the public Supabase URL and anon key to enable sign in.</div>}
    <form onSubmit={submit} className="form-stack"><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={signup?'new-password':'current-password'} minLength={6} required/></label><button className="button" disabled={busy || !client}>{busy?'Please wait…':signup?'Create account':'Sign in'} <ArrowRight size={16}/></button></form>{message && <div role="status" className="notice">{message}</div>}<p className="auth-switch">{signup?'Already have an account?':'New to Nexora?'} <button onClick={()=>{ setSignup(!signup); setMessage(''); }}>{signup?'Sign in':'Create an account'}</button></p><small>For security, this preview keeps your session in memory. Refreshing requires signing in again.</small>
  </div></div>;
}
