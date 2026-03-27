/**
 * Account page — plan status, billing management, and sign out.
 * Redirects unauthenticated users to login.
 */

import { useEffect } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import {
  ChevronLeft, Zap, Shield, CreditCard, LogOut, ExternalLink,
  CheckCircle, Clock, XCircle, Loader2,
} from "lucide-react";

export default function Account() {
  const { user, isAuthenticated, loading, logout } = useAuth();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [loading, isAuthenticated]);

  const planQuery = trpc.subscription.myPlan.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const portalMutation = trpc.subscription.createPortal.useMutation();
  const checkoutMutation = trpc.subscription.createCheckout.useMutation();

  const plan = planQuery.data;
  const isPro = plan?.isPro ?? false;

  async function handleManageBilling() {
    try {
      const { url } = await portalMutation.mutateAsync();
      if (url) window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e.message ?? "Could not open billing portal.");
    }
  }

  async function handleUpgrade() {
    try {
      const { url } = await checkoutMutation.mutateAsync();
      if (url) {
        toast.info("Redirecting to checkout…");
        window.open(url, "_blank");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to start checkout.");
    }
  }

  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--color-teal)" }} />
      </div>
    );
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
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-mono" style={{ color: "var(--color-muted)" }}>
            <ChevronLeft size={14} />
            Back to Dashboard
          </Link>
          <span className="font-mono text-xs tracking-widest uppercase" style={{ color: "var(--color-muted)" }}>
            Account
          </span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-16 space-y-6">

        {/* Profile card */}
        <div className="rounded-xl p-6" style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-sm)",
        }}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
              style={{ background: "var(--color-teal-muted)", color: "var(--color-teal)", border: "1px solid var(--color-teal)" }}>
              {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="font-semibold" style={{ color: "var(--color-navy)", fontFamily: "var(--font-display)" }}>
                {user?.name ?? "—"}
              </p>
              <p className="text-sm" style={{ color: "var(--color-muted)", fontFamily: "var(--font-body)" }}>
                {user?.email ?? "No email on file"}
              </p>
            </div>
            <div className="ml-auto">
              <span className={`px-3 py-1 rounded-full text-xs font-mono tracking-wide ${
                isPro
                  ? "bg-[oklch(0.62_0.19_218_/_0.1)] text-[oklch(0.42_0.16_218)] border border-[oklch(0.62_0.19_218_/_0.3)]"
                  : "border text-muted-foreground"
              }`} style={{ borderColor: isPro ? undefined : "var(--color-border)" }}>
                {isPro ? "PRO" : "FREE"}
              </span>
            </div>
          </div>
        </div>

        {/* Plan card */}
        <div className="rounded-xl p-6" style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-sm)",
        }}>
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} style={{ color: "var(--color-teal)" }} />
            <h2 className="font-semibold text-sm" style={{ color: "var(--color-navy)", fontFamily: "var(--font-display)" }}>
              Subscription
            </h2>
          </div>

          {planQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
              <Loader2 size={14} className="animate-spin" /> Loading plan…
            </div>
          ) : isPro ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle size={18} style={{ color: "var(--color-teal)" }} />
                <div>
                  <p className="font-medium text-sm" style={{ color: "var(--color-navy)" }}>Pro Plan — $10/mo</p>
                  {plan?.currentPeriodEnd && (
                    <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                      Renews {new Date(plan.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={handleManageBilling}
                disabled={portalMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  border: "1px solid var(--color-border)",
                  background: "transparent",
                  color: "var(--color-navy)",
                  cursor: portalMutation.isPending ? "not-allowed" : "pointer",
                  opacity: portalMutation.isPending ? 0.7 : 1,
                }}
              >
                {portalMutation.isPending
                  ? <Loader2 size={14} className="animate-spin" />
                  : <CreditCard size={14} />}
                Manage Billing
                <ExternalLink size={12} style={{ color: "var(--color-muted)" }} />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Clock size={18} style={{ color: "var(--color-muted)" }} />
                <div>
                  <p className="font-medium text-sm" style={{ color: "var(--color-navy)" }}>Free Plan</p>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                    3 features included. Upgrade for full access.
                  </p>
                </div>
              </div>
              <button
                onClick={handleUpgrade}
                disabled={checkoutMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: "var(--color-teal)",
                  color: "#fff",
                  border: "none",
                  cursor: checkoutMutation.isPending ? "not-allowed" : "pointer",
                  opacity: checkoutMutation.isPending ? 0.7 : 1,
                }}
              >
                {checkoutMutation.isPending
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Zap size={14} />}
                Upgrade to Pro — $10/mo
              </button>
            </div>
          )}
        </div>

        {/* Sign out */}
        <div className="rounded-xl p-6" style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-sm)",
        }}>
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 text-sm transition-colors"
            style={{ color: "var(--color-muted)", cursor: "pointer", background: "none", border: "none" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--color-coral)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--color-muted)")}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>

      </div>
    </div>
  );
}
