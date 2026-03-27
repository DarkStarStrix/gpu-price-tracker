/**
 * Pricing page — Free vs Pro tier cards.
 * Unauthenticated users see the page and can start checkout (redirects to login first).
 */

import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import {
  Check, X, Zap, ArrowRight, ChevronLeft, Sparkles, Loader2,
} from "lucide-react";

const FREE_FEATURES = [
  { label: "Live GPU offers table (10 rows)", included: true },
  { label: "Market stats & metrics", included: true },
  { label: "Price trends chart", included: true },
  { label: "GPU comparison drawer", included: false },
  { label: "Price alerts", included: false },
  { label: "CSV export", included: false },
  { label: "7-day sparklines", included: false },
];

const PRO_FEATURES = [
  { label: "Everything in Free", included: true },
  { label: "Full offers table (all rows)", included: true },
  { label: "GPU comparison drawer (2–3 GPUs)", included: true },
  { label: "Price alerts with coral highlights", included: true },
  { label: "CSV export", included: true },
  { label: "7-day sparklines per offer", included: true },
  { label: "API key settings", included: true },
];

export default function Pricing() {
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);

  const planQuery = trpc.subscription.myPlan.useQuery(undefined, { retry: false });
  const createCheckout = trpc.subscription.createCheckout.useMutation();

  const isPro = planQuery.data?.isPro ?? false;

  async function handleUpgrade() {
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }
    setLoading(true);
    try {
      const { url } = await createCheckout.mutateAsync();
      if (url) {
        toast.info("Redirecting to checkout…");
        window.open(url, "_blank");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to start checkout.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* Nav */}
      <nav className="sticky top-0 z-50 glass-card border-b">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
            <ChevronLeft size={14} />
            Back to Dashboard
          </Link>
          <span className="mono-label text-muted-foreground">Pricing</span>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-20">

        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono tracking-widest uppercase mb-6 bg-teal-subtle border border-teal text-[oklch(0.42_0.16_218)]">
            <Sparkles size={10} />
            Simple Pricing
          </div>
          <h1 className="text-4xl font-bold mb-4 text-foreground tracking-tight">
            Start free.<br />
            <span className="gradient-text-teal">Go Pro when you're ready.</span>
          </h1>
          <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
            No credit card required to start. Upgrade to Pro for the full intelligence suite — comparison, alerts, and live sparklines.
          </p>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">

          {/* Free */}
          <div className="rounded-xl p-8 bg-card border border-border shadow-[var(--shadow-sm)]">
            <div className="mb-6">
              <div className="mono-label text-muted-foreground mb-2">Free</div>
              <div className="text-4xl font-bold text-foreground tracking-tight">
                $0
                <span className="text-base font-normal ml-1 text-muted-foreground">/mo</span>
              </div>
              <p className="text-sm mt-2 text-muted-foreground">No account needed. Start immediately.</p>
            </div>

            <ul className="space-y-3 mb-8">
              {FREE_FEATURES.map((f) => (
                <li key={f.label} className="flex items-start gap-3 text-sm">
                  {f.included
                    ? <Check size={14} className="mt-0.5 shrink-0 text-[oklch(0.62_0.19_218)]" />
                    : <X size={14} className="mt-0.5 shrink-0 text-muted-foreground/40" />}
                  <span className={f.included ? "text-foreground" : "text-muted-foreground"}>
                    {f.label}
                  </span>
                </li>
              ))}
            </ul>

            <Link href="/">
              <button className="w-full py-2.5 rounded-lg text-sm font-medium border border-border bg-transparent text-foreground hover:bg-card hover:border-[oklch(0.82_0.012_85)] transition-all">
                Use Free Dashboard
              </button>
            </Link>
          </div>

          {/* Pro */}
          <div className="rounded-xl p-8 relative overflow-hidden bg-[oklch(0.18_0.045_255)] border border-[oklch(0.62_0.19_218_/_0.5)]"
            style={{ boxShadow: "0 0 40px oklch(0.62 0.19 218 / 0.12)" }}>

            {/* Glow accent */}
            <div className="absolute top-0 right-0 w-48 h-48 pointer-events-none"
              style={{ background: "radial-gradient(circle, oklch(0.62 0.19 218 / 0.18) 0%, transparent 70%)" }} />

            <div className="mb-6 relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="mono-label text-[oklch(0.72_0.14_218)]">Pro</div>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-[oklch(0.62_0.19_218_/_0.2)] text-[oklch(0.72_0.14_218)] border border-[oklch(0.62_0.19_218_/_0.4)]">
                  Most Popular
                </span>
              </div>
              <div className="text-4xl font-bold text-white tracking-tight">
                $10
                <span className="text-base font-normal ml-1 text-white/50">/mo</span>
              </div>
              <p className="text-sm mt-2 text-white/60">Full intelligence suite. Cancel anytime.</p>
            </div>

            <ul className="space-y-3 mb-8 relative">
              {PRO_FEATURES.map((f) => (
                <li key={f.label} className="flex items-start gap-3 text-sm">
                  <Check size={14} className="mt-0.5 shrink-0 text-[oklch(0.72_0.14_218)]" />
                  <span className="text-white/85">{f.label}</span>
                </li>
              ))}
            </ul>

            {isPro ? (
              <div className="w-full py-2.5 rounded-lg text-sm font-medium text-center bg-[oklch(0.62_0.19_218_/_0.2)] border border-[oklch(0.62_0.19_218_/_0.5)] text-[oklch(0.72_0.14_218)]">
                ✓ You're on Pro
              </div>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all bg-[oklch(0.62_0.19_218)] text-white hover:bg-[oklch(0.55_0.19_218)] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {loading ? "Redirecting…" : isAuthenticated ? "Upgrade to Pro" : "Sign up & Upgrade"}
                {!loading && <ArrowRight size={14} />}
              </button>
            )}
          </div>
        </div>

        {/* FAQ strip */}
        <div className="mt-16 max-w-2xl mx-auto text-center">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Payments are processed securely by Stripe. Cancel anytime from your account page — no questions asked.{" "}
            Test card:{" "}
            <span className="font-mono text-[oklch(0.62_0.19_218)]">4242 4242 4242 4242</span>
          </p>
        </div>
      </div>
    </div>
  );
}
