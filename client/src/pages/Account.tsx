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

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      window.location.href = "/login";
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-[oklch(0.62_0.19_218)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* Nav */}
      <nav className="sticky top-0 z-50 glass-card border-b">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
            <ChevronLeft size={14} />
            Back to Dashboard
          </Link>
          <span className="mono-label text-muted-foreground">Account</span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-16 space-y-6">

        {/* Profile card */}
        <div className="rounded-xl p-6 bg-card border border-border shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold bg-teal-subtle text-[oklch(0.42_0.16_218)] border border-[oklch(0.62_0.19_218_/_0.3)]">
              {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="font-semibold text-foreground">{user?.name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{user?.email ?? "No email on file"}</p>
            </div>
            <div className="ml-auto">
              <span className={`px-3 py-1 rounded-full text-xs font-mono tracking-wide border ${
                isPro
                  ? "bg-[oklch(0.62_0.19_218_/_0.1)] text-[oklch(0.42_0.16_218)] border-[oklch(0.62_0.19_218_/_0.3)]"
                  : "bg-muted text-muted-foreground border-border"
              }`}>
                {isPro ? "PRO" : "FREE"}
              </span>
            </div>
          </div>
        </div>

        {/* Plan card */}
        <div className="rounded-xl p-6 bg-card border border-border shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} className="text-[oklch(0.62_0.19_218)]" />
            <h2 className="font-semibold text-sm text-foreground">Subscription</h2>
          </div>

          {planQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Loading plan…
            </div>
          ) : isPro ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle size={18} className="text-[oklch(0.62_0.19_218)]" />
                <div>
                  <p className="font-medium text-sm text-foreground">Pro Plan — $10/mo</p>
                  {plan?.currentPeriodEnd && (
                    <p className="text-xs text-muted-foreground">
                      Renews {new Date(plan.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={handleManageBilling}
                disabled={portalMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-border bg-transparent text-foreground hover:bg-muted transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {portalMutation.isPending
                  ? <Loader2 size={14} className="animate-spin" />
                  : <CreditCard size={14} />}
                Manage Billing
                <ExternalLink size={12} className="text-muted-foreground" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Clock size={18} className="text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm text-foreground">Free Plan</p>
                  <p className="text-xs text-muted-foreground">3 features included. Upgrade for full access.</p>
                </div>
              </div>
              <button
                onClick={handleUpgrade}
                disabled={checkoutMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[oklch(0.62_0.19_218)] text-white hover:bg-[oklch(0.55_0.19_218)] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
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
        <div className="rounded-xl p-6 bg-card border border-border shadow-[var(--shadow-sm)]">
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-[oklch(0.58_0.22_25)] transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>

      </div>
    </div>
  );
}
