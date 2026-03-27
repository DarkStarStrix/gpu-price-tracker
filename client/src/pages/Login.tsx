/**
 * Login page — email + password sign-in.
 * Works on Railway without Manus OAuth.
 * Redirects to "/" on success; preserves ?next= return path.
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Zap } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast.success("Signed in successfully.");
      const params = new URLSearchParams(window.location.search);
      navigate(params.get("next") ?? "/");
    },
    onError: (err) => {
      toast.error(err.message ?? "Sign in failed.");
    },
  });

  function validate() {
    const errs: typeof fieldErrors = {};
    if (!email)                    errs.email    = "Email is required.";
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = "Enter a valid email.";
    if (!password)                 errs.password = "Password is required.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    loginMutation.mutate({ email, password });
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-[oklch(0.62_0.19_218)] flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-foreground tracking-tight">GPU Price Tracker</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground mt-1">Access your account and dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-[var(--shadow-sm)]">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setFieldErrors(f => ({ ...f, email: undefined })); }}
                placeholder="you@example.com"
                className={`w-full px-3 py-2 text-sm bg-background border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[oklch(0.62_0.19_218_/_0.4)] transition-all ${
                  fieldErrors.email ? "border-[oklch(0.58_0.22_25)]" : "border-border"
                }`}
              />
              {fieldErrors.email && (
                <p className="text-xs text-[oklch(0.58_0.22_25)] mt-1">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setFieldErrors(f => ({ ...f, password: undefined })); }}
                  placeholder="••••••••"
                  className={`w-full px-3 py-2 pr-10 text-sm bg-background border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[oklch(0.62_0.19_218_/_0.4)] transition-all ${
                    fieldErrors.password ? "border-[oklch(0.58_0.22_25)]" : "border-border"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-xs text-[oklch(0.58_0.22_25)] mt-1">{fieldErrors.password}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full py-2.5 rounded-lg text-sm font-medium bg-[oklch(0.62_0.19_218)] text-white hover:bg-[oklch(0.55_0.19_218)] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loginMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {loginMutation.isPending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        {/* Footer links */}
        <p className="text-center text-sm text-muted-foreground mt-4">
          Don't have an account?{" "}
          <Link href="/register" className="text-[oklch(0.62_0.19_218)] hover:underline font-medium">
            Create one
          </Link>
        </p>
        <p className="text-center text-sm text-muted-foreground mt-2">
          <Link href="/" className="hover:text-foreground transition-colors">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
