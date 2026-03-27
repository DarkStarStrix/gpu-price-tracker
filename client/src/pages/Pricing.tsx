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
  Check, X, Zap, ArrowRight, ChevronLeft, Sparkles,
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
  const { user, isAuthenticated } = useAuth();
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
    <div className="min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
      {/* Nav */}
      <nav style={{
        borderBottom: "1px solid var(--color-border)",
        background: "rgba(248,246,240,0.92)",
        backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-mono" style={{ color: "var(--color-muted)" }}>
            <ChevronLeft size={14} />
            Back to Dashboard
          </Link>
          <span className="font-mono text-xs tracking-widest uppercase" style={{ color: "var(--color-muted)" }}>
            Pricing
          </span>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-20">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono tracking-widest uppercase mb-6"
            style={{ background: "var(--color-teal-muted)", color: "var(--color-teal)", border: "1px solid var(--color-teal)" }}>
            <Sparkles size={10} />
            Simple Pricing
          </div>
          <h1 className="text-4xl font-bold mb-4" style={{ fontFamily: "var(--font-display)", color: "var(--color-navy)" }}>
            Start free.<br />
            <span style={{ color: "var(--color-teal)" }}>Go Pro when you're ready.</span>
          </h1>
          <p className="text-base max-w-md mx-auto" style={{ color: "var(--color-muted)", fontFamily: "var(--font-body)" }}>
            No credit card required to start. Upgrade to Pro for the full intelligence suite — comparison, alerts, and live sparklines.
          </p>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">

          {/* Free */}
          <div className="rounded-xl p-8" style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-sm)",
          }}>
            <div className="mb-6">
              <div className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: "var(--color-muted)" }}>Free</div>
              <div className="text-4xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-navy)" }}>
                $0
                <span className="text-base font-normal ml-1" style={{ color: "var(--color-muted)" }}>/mo</span>
              </div>
              <p className="text-sm mt-2" style={{ color: "var(--color-muted)" }}>No account needed. Start immediately.</p>
            </div>

            <ul className="space-y-3 mb-8">
              {FREE_FEATURES.map((f) => (
                <li key={f.label} className="flex items-start gap-3 text-sm">
                  {f.included
                    ? <Check size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-teal)" }} />
                    : <X size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-muted)" }} />}
                  <span style={{ color: f.included ? "var(--color-text)" : "var(--color-muted)" }}>{f.label}</span>
                </li>
              ))}
            </ul>

            <Link href="/">
              <button className="w-full py-2.5 rounded-lg text-sm font-medium transition-all" style={{
                border: "1px solid var(--color-border)",
                background: "transparent",
                color: "var(--color-navy)",
                cursor: "pointer",
              }}>
                Use Free Dashboard
              </button>
            </Link>
          </div>

          {/* Pro */}
          <div className="rounded-xl p-8 relative overflow-hidden" style={{
            background: "var(--color-navy)",
            border: "1px solid var(--color-teal)",
            boxShadow: "0 0 40px rgba(0,163,163,0.15)",
          }}>
            {/* Glow accent */}
            <div style={{
              position: "absolute", top: 0, right: 0, width: 200, height: 200,
              background: "radial-gradient(circle, rgba(0,163,163,0.2) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />

            <div className="mb-6 relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-xs font-mono tracking-widest uppercase" style={{ color: "var(--color-teal)" }}>Pro</div>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{
                  background: "rgba(0,163,163,0.2)", color: "var(--color-teal)", border: "1px solid var(--color-teal)",
                }}>
                  Most Popular
                </span>
              </div>
              <div className="text-4xl font-bold" style={{ fontFamily: "var(--font-display)", color: "#fff" }}>
                $10
                <span className="text-base font-normal ml-1" style={{ color: "rgba(255,255,255,0.5)" }}>/mo</span>
              </div>
              <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.5)" }}>Full intelligence suite. Cancel anytime.</p>
            </div>

            <ul className="space-y-3 mb-8 relative">
              {PRO_FEATURES.map((f) => (
                <li key={f.label} className="flex items-start gap-3 text-sm">
                  <Check size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-teal)" }} />
                  <span style={{ color: "rgba(255,255,255,0.85)" }}>{f.label}</span>
                </li>
              ))}
            </ul>

            {isPro ? (
              <div className="w-full py-2.5 rounded-lg text-sm font-medium text-center" style={{
                background: "rgba(0,163,163,0.2)",
                border: "1px solid var(--color-teal)",
                color: "var(--color-teal)",
              }}>
                ✓ You're on Pro
              </div>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all relative"
                style={{
                  background: "var(--color-teal)",
                  color: "#fff",
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                <Zap size={14} />
                {loading ? "Redirecting…" : isAuthenticated ? "Upgrade to Pro" : "Sign up & Upgrade"}
                {!loading && <ArrowRight size={14} />}
              </button>
            )}
          </div>
        </div>

        {/* FAQ strip */}
        <div className="mt-16 max-w-2xl mx-auto text-center">
          <p className="text-sm" style={{ color: "var(--color-muted)", fontFamily: "var(--font-body)" }}>
            Payments are processed securely by Stripe. Cancel anytime from your account page — no questions asked.
            Test card: <span className="font-mono" style={{ color: "var(--color-teal)" }}>4242 4242 4242 4242</span>
          </p>
        </div>
      </div>
    </div>
  );
}
