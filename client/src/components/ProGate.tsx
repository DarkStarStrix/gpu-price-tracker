/**
 * ProGate — wraps any feature that requires Pro.
 * Free/unauthenticated users see a lock overlay with an upgrade CTA.
 * Pro users see the children as-is.
 */

import { Link } from "wouter";
import { Lock, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

interface ProGateProps {
  children: React.ReactNode;
  /** Short label shown in the lock overlay, e.g. "GPU Comparison" */
  featureName: string;
  /** If true, renders children but blurs + overlays them. If false, hides children entirely. */
  blur?: boolean;
}

export function ProGate({ children, featureName, blur = true }: ProGateProps) {
  const { isAuthenticated } = useAuth();
  const planQuery = trpc.subscription.myPlan.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });

  const isPro = planQuery.data?.isPro ?? false;

  // Still loading — render children normally to avoid layout shift
  if (planQuery.isLoading) return <>{children}</>;

  // Pro user — full access
  if (isPro) return <>{children}</>;

  // Free / unauthenticated — show lock overlay
  return (
    <div className="relative" style={{ isolation: "isolate" }}>
      {/* Blurred content underneath */}
      {blur && (
        <div style={{ filter: "blur(4px)", pointerEvents: "none", userSelect: "none", opacity: 0.4 }}>
          {children}
        </div>
      )}

      {/* Lock overlay */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center rounded-xl"
        style={{
          background: "rgba(248,246,240,0.88)",
          backdropFilter: "blur(8px)",
          border: "1px solid var(--color-border)",
          zIndex: 10,
        }}
      >
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <div className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "var(--color-teal-muted)", border: "1px solid var(--color-teal)" }}>
            <Lock size={16} style={{ color: "var(--color-teal)" }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-navy)", fontFamily: "var(--font-display)" }}>
              {featureName}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)", fontFamily: "var(--font-body)" }}>
              Available on Pro
            </p>
          </div>
          <Link href="/pricing">
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: "var(--color-teal)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              <Zap size={11} />
              {isAuthenticated ? "Upgrade to Pro — $10/mo" : "Sign up for Pro"}
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
