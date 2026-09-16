import { FormEvent, useState } from 'react';
import { KeyRound, LoaderCircle, LogIn, Mail, Music2, User as UserIcon, X } from 'lucide-react';
import type { AuthSession } from '@/lib/auth';

type Mode = 'signin' | 'signup';

export default function AuthPage({ state, signUp, signIn, onClose }: {
  state: AuthSession;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null; hasSession: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  onClose?: () => void;
}) {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setNotice('');
    if (!email.trim() || !password) {
      setMessage('Please enter your email and password.');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setMessage('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const result = await signUp(email.trim(), password, name.trim());
        if (result.error) {
          setMessage(result.error.message);
        } else if (result.hasSession) {
          setMessage('');
        } else {
          setNotice('We sent you a confirmation email. Check your inbox, then sign in.');
          setMode('signin');
        }
      } else {
        const result = await signIn(email.trim(), password);
        if (result.error) setMessage(result.error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setMessage('');
    setNotice('');
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        {onClose && <button className="auth-close" onClick={onClose} aria-label="Close"><X size={17} /></button>}
        <div className="auth-brand">
          <span className="brand-mark"><Music2 size={21} strokeWidth={2.8} /></span>
          <div className="auth-brand-title">
            <strong>StreamHub</strong>
            <small>Music & Podcasts</small>
          </div>
        </div>

        <h1>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="auth-sub">{mode === 'signin' ? 'Sign in to keep your downloads in sync.' : 'Sign up in seconds and start saving offline.'}</p>

        {state === 'signed-in' && <div className="auth-message ok">You're signed in — taking you to the library…</div>}
        {notice && <div className="auth-message ok">{notice}</div>}
        {message && <div className="auth-message err">{message}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <label className="auth-field">
              <span>Name</span>
              <div className="auth-input"><UserIcon size={17} /><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" /></div>
            </label>
          )}
          <label className="auth-field">
            <span>Email</span>
            <div className="auth-input"><Mail size={17} /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></div>
          </label>
          <label className="auth-field">
            <span>Password</span>
            <div className="auth-input"><KeyRound size={17} /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></div>
          </label>

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <LogIn size={17} />}
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'signin' ? (
            <>New here? <button type="button" onClick={() => switchMode('signup')}>Create an account</button></>
          ) : (
            <>Already have an account? <button type="button" onClick={() => switchMode('signin')}>Sign in</button></>
          )}
        </p>
      </div>
    </div>
  );
}