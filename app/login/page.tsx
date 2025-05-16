"use client"

import { useState, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';

export default function LoginPage() {
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState<'login' | 'signup' | 'google' | 'reset' | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [resetEmail, setResetEmail] = useState("")

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading('login');
    setMessage("");
    const formData = new FormData(formRef.current!);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    else window.location.href = '/dashboard';
    setLoading(null);
  }

  async function handleSignup() {
    setLoading('signup');
    setMessage("");
    const formData = new FormData(formRef.current!);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: 'https://agent-flow-sigma.vercel.app' } });
    if (error) setMessage(error.message);
    else setMessage("Check your email for a confirmation link before logging in.");
    setLoading(null);
  }

  async function handleGoogleLogin() {
    setLoading('google')
    setMessage("")
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/dashboard' }
    })
    if (error) setMessage(error.message)
    setLoading(null)
  }

  async function handleResetPassword() {
    setLoading('reset');
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo: 'https://agent-flow-sigma.vercel.app/reset-password' });
    if (error) setMessage(error.message);
    else setMessage("Check your email for a password reset link.");
    setLoading(null);
    setResetEmail("");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-zinc-900 to-zinc-950">
      <div className="flex flex-col items-center w-full">
        <div className="mb-8 flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center font-bold text-2xl text-white shadow-lg">A</div>
          <span className="text-2xl font-bold text-white tracking-tight">AgentFlow</span>
        </div>
        <form ref={formRef} className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/60 rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-5 px-8 py-10" onSubmit={handleLogin}>
          <h1 className="text-3xl font-bold text-white mb-1 text-center">Welcome Back</h1>
          <div className="text-zinc-400 text-center mb-2">Sign in to your account or create a new one</div>
          {message && <div className="text-sm text-center bg-zinc-800/70 rounded-md py-2 px-3 mb-2 animate-fade-in text-white">{message}</div>}
          <input
            id="email"
            name="email"
            type="email"
            placeholder="Email"
            required
            autoComplete="email"
            className="px-4 py-3 rounded-lg bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition placeholder-zinc-500 text-base"
          />
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Password"
            required
            minLength={8}
            autoComplete="current-password"
            className="px-4 py-3 rounded-lg bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition placeholder-zinc-500 text-base"
          />
          <div className="flex w-full justify-end mt-1 mb-2">
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="text-xs text-cyan-300 hover:underline focus:outline-none"
                >
                  Forgot password?
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-xs w-full bg-white/10 border border-white/20 rounded-2xl shadow-2xl backdrop-blur-xl">
                <DialogHeader className="w-full text-center mb-2">
                  <DialogTitle className="text-lg font-semibold text-white">Reset Password</DialogTitle>
                </DialogHeader>
                <div className="w-full flex flex-col gap-3 mt-1">
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    className="px-4 py-2 rounded-lg bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition placeholder-zinc-400 text-sm"
                  />
                  <DialogFooter className="w-full">
                    <button
                      type="button"
                      className="w-full bg-primary text-white px-4 py-2 rounded-lg font-semibold shadow hover:bg-primary/90 transition text-sm"
                      disabled={loading === 'reset'}
                      onClick={handleResetPassword}
                    >
                      {loading === 'reset' ? 'Sending...' : 'Send Reset Link'}
                    </button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex gap-3 mt-2">
            <button
              type="submit"
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-lg font-semibold text-base shadow transition disabled:opacity-60 hover:bg-primary/80 hover:scale-105 hover:shadow-xl"
              disabled={loading !== null}
            >
              {loading === 'login' ? <Loader2 className="animate-spin" size={18} /> : null}
              {loading === 'login' ? "Signing in..." : "Sign In"}
            </button>
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-2 bg-zinc-700 text-white py-3 rounded-lg font-semibold text-base shadow transition disabled:opacity-60 hover:bg-zinc-600 hover:scale-105 hover:shadow-xl"
              onClick={e => {
                e.preventDefault();
                if (formRef.current) handleSignup();
              }}
              disabled={loading !== null}
            >
              {loading === 'signup' ? <Loader2 className="animate-spin" size={18} /> : null}
              {loading === 'signup' ? "Signing up..." : "Sign Up"}
            </button>
          </div>
          <div className="flex items-center my-4 w-full">
            <div className="flex-grow h-px bg-zinc-700" />
            <span className="mx-4 text-zinc-400 font-medium">or</span>
            <div className="flex-grow h-px bg-zinc-700" />
          </div>
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-white text-black py-3 rounded-lg font-semibold text-base shadow transition hover:bg-gray-200 hover:scale-105 hover:shadow-xl border border-zinc-300"
            disabled={loading !== null}
          >
            <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2"><g clipPath="url(#clip0_17_40)"><path d="M47.532 24.552c0-1.636-.146-3.2-.418-4.704H24.48v9.02h13.02c-.528 2.844-2.12 5.252-4.52 6.872v5.704h7.32c4.28-3.944 6.732-9.76 6.732-16.892z" fill="#4285F4"/><path d="M24.48 48c6.12 0 11.252-2.028 15.002-5.508l-7.32-5.704c-2.028 1.36-4.62 2.168-7.682 2.168-5.904 0-10.904-3.992-12.7-9.36H4.26v5.872C7.992 43.888 15.56 48 24.48 48z" fill="#34A853"/><path d="M11.78 29.596A13.98 13.98 0 0 1 10.2 24c0-1.944.352-3.828.98-5.596v-5.872H4.26A23.98 23.98 0 0 0 0 24c0 3.944.94 7.684 2.58 10.468l9.2-4.872z" fill="#FBBC05"/><path d="M24.48 9.52c3.34 0 6.32 1.148 8.68 3.396l6.48-6.48C35.728 2.028 30.6 0 24.48 0 15.56 0 7.992 4.112 4.26 10.532l9.2 5.872c1.796-5.368 6.796-9.36 12.7-9.36z" fill="#EA4335"/></g><defs><clipPath id="clip0_17_40"><path fill="#fff" d="M0 0h48v48H0z"/></clipPath></defs></svg>
            {loading === 'google' ? <Loader2 className="animate-spin" size={18} /> : null}
            Log in with Google
          </button>
        </form>
      </div>
    </div>
  )
} 