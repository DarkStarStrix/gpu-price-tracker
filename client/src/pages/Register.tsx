/**
 * Register page — create a new account with name, email, and password.
 * Works on Railway without Manus OAuth.
 * Redirects to "/" on success.
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Zap, Check } from "lucide-react";

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /[0-9]/.test(password) },
  ];
  if (!password) return null;
  return (
    <div className="flex gap-3 mt-2">
      {checks.map(c => (
        <span key={c.label} className={`flex items-center gap-1 text-[11px] ${c.ok ? "text-[oklch(0.62_0.19_218)]" : "text-muted-foreground"}`}>
          <Check className="w-3 h-3" />
          {c.label}
        </span>
      ))}
    </div>
  );
}

export default function Register() {
  const [, navigate] = useLocation();
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string }>({});

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("Account created! Welcome aboard.");
      navigate("/");
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        setFieldErrors(f => ({ ...f, email: "An account with this email already exists." }));
      } else {
        toast.error(err.message ?? "Registration failed.");
      }
    },
  });

  function validate() {
    const errs: typeof fieldErrors = {};
    if (!name.trim())              errs.name     = "Name is required.";
    if (!email)                    errs.email    = "Email is required.";
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = "Enter a valid email.";
    if (!password)                 errs.password = "Password is required.";
    else if (password.length < 8)  errs.password = "Password must be at least 8 characters.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    registerMutation.mutate({ name: name.trim(), email, password });
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
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Create account</h1>
          <p className="text-sm text-muted-foreground mt-1">Start tracking GPU prices for free</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-[var(--shadow-sm)]">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="name">
                Full name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={e => { setName(e.target.value); setFieldErrors(f => ({ ...f, name: undefined })); }}
                placeholder="Jane Smith"
                className={`w-full px-3 py-2 text-sm bg-background border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[oklch(0.62_0.19_218_/_0.4)] transition-all ${
                  fieldErrors.name ? "border-[oklch(0.58_0.22_25)]" : "border-border"
                }`}
              />
              {fieldErrors.name && (
                <p className="text-xs text-[oklch(0.58_0.22_25)] mt-1">{fieldErrors.name}</p>
              )}
            </div>

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
                  autoComplete="new-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setFieldErrors(f => ({ ...f, password: undefined })); }}
                  placeholder="Min. 8 characters"
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
              <PasswordStrength password={password} />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full py-2.5 rounded-lg text-sm font-medium bg-[oklch(0.62_0.19_218)] text-white hover:bg-[oklch(0.55_0.19_218)] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {registerMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {registerMutation.isPending ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        {/* Footer links */}
        <p className="text-center text-sm text-muted-foreground mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-[oklch(0.62_0.19_218)] hover:underline font-medium">
            Sign in
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
