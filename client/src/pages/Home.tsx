/*
  Home — GPU Price Tracker Dashboard v2
  Design: "Data Observatory" — Scientific Instrument Panel, Premium Edition
  Key upgrades: animated hero, glassmorphic nav, scan-line effect,
  staggered section entrances, blueprint illustration integration
*/

import { useState, useEffect } from "react";
import { MarketPulse } from "@/components/MarketPulse";
import { QuickComparison } from "@/components/QuickComparison";
import { OffersTable } from "@/components/OffersTable";
import { ProviderCards } from "@/components/ProviderCards";
import { PriceTrends } from "@/components/PriceTrends";
import { Activity, RefreshCw, ChevronRight, ArrowRight, Settings, User, Zap } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";

// Generated assets
const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663288203906/L3MSxqVptRGomjLN7RuJgm/hero-grid-bg-NQsreG7zHjL8KoMjMjEHPf.webp";
const GPU_DIAGRAM = "https://d2xsxph8kpxj0f.cloudfront.net/310519663288203906/L3MSxqVptRGomjLN7RuJgm/gpu-node-diagram-82nRNVr8Fqh8sD8buCJnnV.webp";
const PRICE_WAVE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663288203906/L3MSxqVptRGomjLN7RuJgm/price-wave-PEENh3JnMuPVtwQALtE5Zn.webp";
const CONSTELLATION = "https://d2xsxph8kpxj0f.cloudfront.net/310519663288203906/L3MSxqVptRGomjLN7RuJgm/provider-constellation-aydpAtBkoHhZFdvSLqWQW3.webp";

type Tab = "overview" | "offers" | "providers" | "trends";

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: "overview",   label: "Overview",   desc: "Market snapshot" },
  { id: "offers",     label: "All Offers", desc: "36 live offers" },
  { id: "providers",  label: "Providers",  desc: "6 platforms" },
  { id: "trends",     label: "Trends",     desc: "7-day history" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [scrolled, setScrolled] = useState(false);
  const [lastRefresh] = useState(() => new Date());
  const { isAuthenticated } = useAuth();
  const planQuery = trpc.subscription.myPlan.useQuery(undefined, { enabled: isAuthenticated, retry: false, staleTime: 60_000 });
  const isPro = planQuery.data?.isPro ?? false;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen graph-paper grain">

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "glass-card border-b"
            : "bg-transparent border-b border-transparent"
        }`}
      >
        <div className="container flex items-center justify-between h-[60px]">

          {/* Logo */}
          <div className="flex items-center gap-3 animate-slide-right">
            <div className="relative w-9 h-9 rounded-lg bg-[oklch(0.22_0.045_255)] flex items-center justify-center shadow-[0_2px_8px_oklch(0.22_0.045_255_/_0.3)]">
              <Activity className="w-4.5 h-4.5 text-[oklch(0.62_0.19_218)]" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[oklch(0.60_0.18_155)] border-2 border-[var(--paper)] pulse-dot" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-foreground leading-none">
                GPU Price Tracker
              </div>
              <div className="mono-label text-muted-foreground mt-0.5">
                Compute Market Intelligence
              </div>
            </div>
          </div>

          {/* Tab navigation — desktop */}
          <nav className="hidden md:flex items-center gap-0.5 animate-fade-in delay-120">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-4 py-2 text-sm rounded-md transition-all duration-200 ${
                  activeTab === tab.id
                    ? "text-foreground font-medium tab-active-indicator"
                    : "text-muted-foreground hover:text-foreground hover:bg-[oklch(0.94_0.006_85)]"
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[oklch(0.62_0.19_218)]" />
                )}
              </button>
            ))}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-1.5 animate-fade-in delay-240">
            {/* Clock + Refresh — always visible */}
            <span className="font-data text-[10px] text-muted-foreground hidden lg:block mr-1">
              {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <button
              title="Refresh data"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-card hover:border-[oklch(0.82_0.012_85)] transition-all duration-200"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="w-3 h-3" />
              <span className="hidden md:inline">Refresh</span>
            </button>

            {/* Pro / Upgrade badge */}
            <Link
              href="/pricing"
              title={isPro ? "Pro plan active" : "Upgrade to Pro"}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md transition-all duration-200"
              style={isPro
                ? { color: "oklch(0.62 0.19 218)", borderColor: "oklch(0.62 0.19 218 / 0.35)", background: "oklch(0.62 0.19 218 / 0.08)" }
                : { color: "oklch(0.45 0.04 255)", borderColor: "var(--color-border)", background: "transparent" }
              }
            >
              <Zap className="w-3 h-3" />
              <span className="hidden sm:inline">{isPro ? "Pro" : "Upgrade"}</span>
            </Link>

            {/* Auth button */}
            {isAuthenticated ? (
              <Link
                href="/account"
                title="Account & billing"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-card hover:border-[oklch(0.82_0.012_85)] transition-all duration-200"
              >
                <User className="w-3 h-3" />
                <span className="hidden sm:inline">Account</span>
              </Link>
            ) : (
              <a
                href={getLoginUrl()}
                title="Sign in"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md font-medium transition-all duration-200"
                style={{ background: "oklch(0.62 0.19 218)", color: "#fff", border: "none" }}
              >
                <User className="w-3 h-3" />
                <span className="hidden sm:inline">Sign in</span>
              </a>
            )}

            {/* API Keys — icon only on small, label on md+ */}
            <Link
              href="/settings"
              title="Manage API keys"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-card hover:border-[oklch(0.82_0.012_85)] transition-all duration-200"
            >
              <Settings className="w-3 h-3" />
              <span className="hidden md:inline">API Keys</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Mobile tab bar ──────────────────────────────────────────────── */}
      <div className="md:hidden sticky top-[60px] z-40 glass-card border-b px-4 py-2 flex gap-1 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-all duration-200 ${
              activeTab === tab.id
                ? "bg-[oklch(0.22_0.045_255)] text-[oklch(0.95_0.004_85)] font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Hero Section ────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <section className="relative overflow-hidden border-b border-border">

          {/* Blueprint background image */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${HERO_BG})`,
              backgroundSize: "cover",
              backgroundPosition: "center top",
              opacity: 0.22,
            }}
          />

          {/* Gradient overlay — fades bg into paper */}
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--paper)] via-[var(--paper)/60%] to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--paper)] via-transparent to-transparent" />

          {/* Scan line animation */}
          <div className="absolute inset-0 scan-line overflow-hidden pointer-events-none" />

          {/* GPU Diagram — right side decorative */}
          <div
            className="absolute right-0 top-0 bottom-0 w-[45%] hidden lg:block"
            style={{ opacity: 0.12 }}
          >
            <img
              src={GPU_DIAGRAM}
              alt=""
              className="w-full h-full object-contain object-right"
            />
          </div>

          <div className="container relative py-16 md:py-20">
            <div className="max-w-xl">

              {/* Eyebrow */}
              <div className="flex items-center gap-2 mb-5 animate-slide-right">
                <span className="mono-label text-[oklch(0.62_0.19_218)]">Market Intelligence</span>
                <span className="w-8 h-px bg-[oklch(0.62_0.19_218_/_0.4)]" />
                <span className="mono-label text-muted-foreground">6 Providers · 36 Offers</span>
              </div>

              {/* Headline */}
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground leading-[1.1] text-balance animate-fade-up delay-60">
                GPU Compute<br />
                <span className="gradient-text-teal">Price Observatory</span>
              </h1>

              <p className="mt-4 text-base text-muted-foreground leading-relaxed max-w-md animate-fade-up delay-120">
                Normalized pricing across Lambda, RunPod, CoreWeave, TensorDock,
                FluidStack, and Paperspace. Compare H100, A100, RTX 4090, and
                more — with reliability scores and live availability.
              </p>

              {/* CTA row */}
              <div className="mt-7 flex items-center gap-3 animate-fade-up delay-180">
                <button
                  onClick={() => setActiveTab("offers")}
                  className="group flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[oklch(0.22_0.045_255)] text-[oklch(0.95_0.004_85)] rounded-lg hover:bg-[oklch(0.28_0.045_255)] transition-all duration-200 shadow-[0_2px_8px_oklch(0.22_0.045_255_/_0.25)]"
                >
                  Browse All Offers
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" />
                </button>
                <button
                  onClick={() => setActiveTab("trends")}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium border border-border text-foreground rounded-lg hover:bg-card hover:border-[oklch(0.82_0.012_85)] transition-all duration-200"
                >
                  Price Trends
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Inline stats row */}
              <div className="mt-8 flex items-center gap-6 animate-fade-up delay-240">
                {[
                  { label: "H100 floor", value: "$1.99/hr" },
                  { label: "B200 floor", value: "$5.74/hr" },
                  { label: "RTX 4090 floor", value: "$0.34/hr" },
                ].map((stat) => (
                  <div key={stat.label} className="flex flex-col">
                    <span className="font-data text-base font-semibold text-foreground">{stat.value}</span>
                    <span className="mono-label text-muted-foreground">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <main className="container py-10">

        {activeTab === "overview" && (
          <div className="animate-fade-up">
            <MarketPulse />

            {/* Section header */}
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-xl font-semibold text-foreground">Quick Comparison</h2>
              <div className="flex-1 section-rule" />
            </div>
            <QuickComparison />

            {/* Interstitial — blueprint + methodology */}
            <div className="my-12 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-center py-8 border-y border-border/60">
              <div className="animate-fade-up delay-60">
                <div className="mono-label text-[oklch(0.62_0.19_218)] mb-3">Methodology</div>
                <h3 className="text-xl font-semibold text-foreground mb-3">How We Track Prices</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                  We aggregate pricing from provider APIs and public pricing pages, normalize GPU naming
                  conventions (e.g., "H100 SXM5" → "H100 SXM"), standardize billing units to per-GPU/hr,
                  and compute reliability scores from infrastructure stability signals and historical availability windows.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {["Lambda API", "RunPod Pricing", "CoreWeave Docs", "TensorDock API", "FluidStack Pricing", "Paperspace Pricing"].map(src => (
                    <span key={src} className="category-badge bg-[oklch(0.22_0.045_255_/_0.06)] text-[oklch(0.42_0.04_255)]">
                      {src}
                    </span>
                  ))}
                </div>
              </div>
              <div className="hidden lg:block w-56 h-56 relative animate-fade-in delay-120">
                <img
                  src={GPU_DIAGRAM}
                  alt="GPU node cluster diagram"
                  className="w-full h-full object-contain opacity-55"
                />
              </div>
            </div>

            {/* Price Trends */}
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-xl font-semibold text-foreground">Price Trends</h2>
              <div className="flex-1 section-rule" />
            </div>
            <PriceTrends />
          </div>
        )}

        {activeTab === "offers" && (
          <div className="animate-fade-up">
            <OffersTable />
          </div>
        )}

        {activeTab === "providers" && (
          <div className="animate-fade-up">
            {/* Provider constellation header */}
            <div className="relative mb-8 rounded-xl overflow-hidden border border-border">
              <img
                src={CONSTELLATION}
                alt="Provider network constellation"
                className="w-full h-40 object-cover object-center opacity-30"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[var(--paper)] via-[var(--paper)/70%] to-transparent flex items-center px-8">
                <div>
                  <div className="mono-label text-[oklch(0.62_0.19_218)] mb-1">Network Map</div>
                  <h2 className="text-2xl font-bold text-foreground">Provider Profiles</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    6 GPU cloud platforms — reliability, inventory, and pricing
                  </p>
                </div>
              </div>
            </div>
            <ProviderCards />
          </div>
        )}

        {activeTab === "trends" && (
          <div className="animate-fade-up">
            {/* Wave banner */}
            <div className="relative mb-8 rounded-xl overflow-hidden border border-border">
              <img
                src={PRICE_WAVE}
                alt="Price wave visualization"
                className="w-full h-36 object-cover object-center opacity-45"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[var(--paper)] via-[var(--paper)/60%] to-transparent flex items-center px-8">
                <div>
                  <div className="mono-label text-[oklch(0.62_0.19_218)] mb-1">Historical Data</div>
                  <h2 className="text-2xl font-bold text-foreground">Price Trends</h2>
                  <p className="text-sm text-muted-foreground mt-1">7-day price history across providers</p>
                </div>
              </div>
            </div>
            <PriceTrends />
            <div className="mt-6 p-4 rounded-lg bg-card border border-border">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground font-medium">Note:</strong> Historical data is based on periodic observations.
                Marketplace providers (TensorDock) show higher volatility due to dynamic supply-demand pricing.
                Stable providers (Lambda, CoreWeave) maintain more consistent rates with SLA-backed infrastructure.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-[oklch(0.96_0.006_85)]">
        <div className="container py-7 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-3.5 h-3.5 text-[oklch(0.62_0.19_218)]" />
              <span className="text-sm font-semibold text-foreground">GPU Price Tracker</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Compute market intelligence for ML engineers. Normalized pricing,
              reliability scores, and live availability across major GPU cloud providers.
            </p>
          </div>
          <div>
            <div className="mono-label text-muted-foreground mb-2">Data Sources</div>
            <div className="flex flex-wrap gap-1.5">
              {["Lambda", "RunPod", "CoreWeave", "TensorDock", "FluidStack", "Paperspace"].map(p => (
                <span key={p} className="font-data text-[10px] px-2 py-0.5 bg-[oklch(0.92_0.006_85)] rounded text-foreground">
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="mono-label text-muted-foreground mb-2">Coverage</div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">GPU Models</span>
                <span className="font-data text-foreground">13</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Offers</span>
                <span className="font-data text-foreground">36</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Regions</span>
                <span className="font-data text-foreground">US, EU, Asia</span>
              </div>
            </div>
          </div>
        </div>
        <div className="container pb-4">
          <div className="section-rule mb-4" />
          <p className="font-data text-[10px] text-muted-foreground text-center">
            Prices are indicative and may vary. Always verify directly with providers before committing to workloads.
          </p>
        </div>
      </footer>
    </div>
  );
}
