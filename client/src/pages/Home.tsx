/*
  Home — GPU Price Tracker Dashboard v2
  Design: "Data Observatory" — Scientific Instrument Panel, Premium Edition
  Key upgrades: animated hero, glassmorphic nav, scan-line effect,
  staggered section entrances, blueprint illustration integration
*/

import { lazy, startTransition, Suspense, useState, useEffect } from "react";
import { LiveH100 } from "@/components/LiveH100";
import { MarketPulse } from "@/components/MarketPulse";
import { QuickComparison } from "@/components/QuickComparison";
import { TrendsPanel } from "@/components/TrendsPanel";
import { Activity, RefreshCw, ChevronRight, ArrowRight } from "lucide-react";
import {
  catalog,
  snapshotLoadError,
  snapshotRefreshing,
  lastCheckedAt,
  lastCheckResult,
  loadCatalog,
  loadHistory,
} from "@/lib/catalog";
import { displayQuote } from "@shared/market";
import { formatPrice } from "@/lib/data";
import { isStale, isCurrent } from "@shared/catalog";

// Generated assets
const HERO_BG = `${import.meta.env.BASE_URL}images/provider-network.svg`;
const GPU_DIAGRAM = `${import.meta.env.BASE_URL}images/gpu-blueprint.webp`;
const CONSTELLATION = `${import.meta.env.BASE_URL}images/provider-network.svg`;
const loadOffers = () =>
  import("@/components/OffersTable").then(module => ({
    default: module.OffersTable,
  }));
const OffersTable = lazy(loadOffers);
const warmOffers = () => void loadOffers().catch(() => {});
const ProviderCards = lazy(() =>
  import("@/components/ProviderCards").then(module => ({
    default: module.ProviderCards,
  }))
);

type Tab = "overview" | "offers" | "providers" | "trends";

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: "overview", label: "Overview", desc: "Market snapshot" },
  { id: "offers", label: "All Offers", desc: "Observed offers" },
  { id: "providers", label: "Providers", desc: "Connections" },
  { id: "trends", label: "Trends", desc: "7-day history" },
];

export default function Home() {
  const [historyOfferId, setHistoryOfferId] = useState("");
  const [initialGpu, setInitialGpu] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [scrolled, setScrolled] = useState(false);
  const generatedAt = catalog.generatedAt;
  const offers = catalog.offers;
  const freshOffers = offers.filter(o => isCurrent(catalog, o));
  const providerCount = new Set(offers.map(o => o.providerId)).size;
  const floor = (id: string) => {
    const quote = displayQuote(catalog, id);
    return quote
      ? `${formatPrice(quote.offer.pricePerGpuHr)}/hr${quote.retained ? " · last observed" : ""}`
      : "—";
  };

  function navigate(tab: Tab, gpu = "") {
    if (tab === activeTab) return;
    if (tab === "offers") {
      startTransition(() => {
        setInitialGpu(gpu);
        setActiveTab(tab);
      });
    } else setActiveTab(tab);
    window.scrollTo(0, 0);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (activeTab === "offers") void loadHistory().catch(() => {});
  }, [activeTab, generatedAt]);

  useEffect(() => {
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (connection?.saveData || connection?.effectiveType?.endsWith("2g"))
      return;
    // The overview has already mounted. Warm the primary destination after its first paint.
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") warmOffers();
    }, 700);
    return () => window.clearTimeout(timer);
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
          <div className="flex items-center gap-3">
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
          <nav className="hidden md:flex items-center gap-0.5">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => navigate(tab.id)}
                onPointerEnter={tab.id === "offers" ? warmOffers : undefined}
                onFocus={tab.id === "offers" ? warmOffers : undefined}
                aria-current={activeTab === tab.id ? "page" : undefined}
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
          <div className="flex items-center gap-1.5">
            {/* Clock + Refresh — always visible */}
            <span className="font-data text-[10px] text-muted-foreground hidden lg:block mr-1">
              {new Date(catalog.generatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <button
              type="button"
              aria-label="Refresh prices"
              title="Check for a newer published price snapshot"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-card hover:border-[oklch(0.82_0.012_85)] transition-all duration-200"
              disabled={snapshotRefreshing}
              onClick={() => {
                void loadCatalog().catch(() => {});
              }}
            >
              <RefreshCw
                className={`w-3 h-3 ${snapshotRefreshing ? "animate-spin" : ""}`}
              />
              <span className="hidden md:inline">
                {snapshotRefreshing ? "Checking…" : "Refresh"}
              </span>
            </button>

            <a
              href="https://github.com/DarkStarStrix/gpu-price-tracker"
              className="text-xs text-muted-foreground hover:text-foreground px-2"
            >
              GitHub
            </a>
          </div>
        </div>
      </header>

      {/* ── Mobile tab bar ──────────────────────────────────────────────── */}
      <div className="md:hidden sticky top-[60px] z-40 glass-card border-b px-4 py-2 flex gap-1 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => navigate(tab.id)}
            onPointerEnter={tab.id === "offers" ? warmOffers : undefined}
            onFocus={tab.id === "offers" ? warmOffers : undefined}
            aria-current={activeTab === tab.id ? "page" : undefined}
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

      <div className="container pt-4">
        <div className="text-xs text-muted-foreground border border-border rounded-lg px-4 py-3 bg-card">
          <p role="status">
            {snapshotRefreshing
              ? "Checking for a newer price snapshot… "
              : snapshotLoadError
                ? "Snapshot check failed, showing the last validated data. "
                : lastCheckResult === "unchanged"
                  ? "No newer snapshot has been published. "
                  : "New snapshot loaded. "}
            {lastCheckedAt &&
              `Last checked ${new Date(lastCheckedAt).toLocaleTimeString()} · `}
            Provider snapshot {new Date(catalog.generatedAt).toLocaleString()} ·{" "}
            {freshOffers.length} fresh offers.
            {catalog.sources.some(s => s.status === "error") &&
              " A provider refresh failed. Retained prices are marked below."}
            {offers.some(o => isStale(o.observedAt)) &&
              " Showing last observed prices where fresh data is unavailable."}
          </p>
          <p className="mt-1">
            <a
              href="https://github.com/DarkStarStrix/gpu-price-tracker/actions/workflows/pages.yml"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-teal underline"
            >
              Run collector on GitHub
            </a>{" "}
            · Requires repository write access
          </p>
        </div>
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
            aria-hidden="true"
            className="hero-blueprint absolute right-0 top-0 bottom-0 w-[45%] hidden lg:block"
          />

          <div className="container relative py-16 md:py-20">
            <div className="max-w-xl">
              {/* Eyebrow */}
              <div className="flex items-center gap-2 mb-5">
                <span className="mono-label text-[oklch(0.62_0.19_218)]">
                  Market Intelligence
                </span>
                <span className="w-8 h-px bg-[oklch(0.62_0.19_218_/_0.4)]" />
                <span className="mono-label text-muted-foreground">
                  {providerCount} Providers · {offers.length} Offers
                </span>
              </div>

              {/* Headline */}
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground leading-[1.1] text-balance">
                GPU Compute
                <br />
                <span className="gradient-text-teal">Price Observatory</span>
              </h1>

              <p className="mt-4 text-base text-muted-foreground leading-relaxed max-w-md">
                Normalized GPU pricing from official provider sources. Compare
                hourly rates, cloud tiers, and reported availability — with a
                source and observation time for every offer.
              </p>

              <LiveH100 />

              {/* CTA row */}
              <div className="mt-7 flex items-center gap-3">
                <button
                  onClick={() => navigate("offers")}
                  onPointerEnter={warmOffers}
                  onFocus={warmOffers}
                  className="group flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[oklch(0.22_0.045_255)] text-[oklch(0.95_0.004_85)] rounded-lg hover:bg-[oklch(0.28_0.045_255)] transition-all duration-200 shadow-[0_2px_8px_oklch(0.22_0.045_255_/_0.25)]"
                >
                  Browse All Offers
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" />
                </button>
                <button
                  onClick={() => navigate("trends")}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium border border-border text-foreground rounded-lg hover:bg-card hover:border-[oklch(0.82_0.012_85)] transition-all duration-200"
                >
                  Price Trends
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Inline stats row */}
              <div className="mt-8 flex items-center gap-6">
                {[
                  { label: "B200 floor", value: floor("b200-sxm") },
                  { label: "RTX 4090 floor", value: floor("rtx-4090") },
                ].map(stat => (
                  <div key={stat.label} className="flex flex-col">
                    <span className="font-data text-base font-semibold text-foreground">
                      {stat.value}
                    </span>
                    <span className="mono-label text-muted-foreground">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <main
        className={`container ${activeTab === "offers" ? "py-5" : "py-10"}`}
      >
        {activeTab === "overview" && (
          <div>
            <MarketPulse />

            {/* Section header */}
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                Quick Comparison
              </h2>
              <div className="flex-1 section-rule" />
            </div>
            <QuickComparison onBrowseOffers={gpu => navigate("offers", gpu)} />

            {/* Interstitial — blueprint + methodology */}
            <div className="my-12 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-center py-8 border-y border-border/60">
              <div className="animate-fade-up delay-60">
                <div className="mono-label text-[oklch(0.62_0.19_218)] mb-3">
                  Methodology
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  How We Track Prices
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                  A scheduled collector reads provider APIs and official pricing
                  tables, then publishes a validated snapshot. Prices are
                  normalized to USD per GPU-hour; node prices retain their GPU
                  count. History contains collector observations and labeled
                  provider hourly spot prices. Pool turnover counts listing
                  changes. Failed refreshes retain their original timestamps.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {catalog.sources
                    .filter(s => s.status === "ok")
                    .map(s => s.name + (s.evidence ? " pricing" : " API"))
                    .map(src => (
                      <span
                        key={src}
                        className="category-badge bg-[oklch(0.22_0.045_255_/_0.06)] text-[oklch(0.42_0.04_255)]"
                      >
                        {src}
                      </span>
                    ))}
                </div>
              </div>
              <div className="hidden lg:block w-56 h-56 relative animate-fade-in delay-120">
                <img
                  src={GPU_DIAGRAM}
                  alt="GPU node cluster diagram"
                  loading="lazy"
                  decoding="async"
                  width={1080}
                  height={608}
                  className="w-full h-full object-contain opacity-55"
                />
              </div>
            </div>

            {/* Price Trends */}
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                Price Trends
              </h2>
              <div className="flex-1 section-rule" />
            </div>
            <TrendsPanel initialOfferId={historyOfferId} belowFold />
          </div>
        )}

        {activeTab === "offers" && (
          <Suspense fallback={<p role="status">Loading offers…</p>}>
            <OffersTable
              initialGpu={initialGpu}
              onViewHistory={id => {
                setHistoryOfferId(id);
                navigate("trends");
              }}
            />
          </Suspense>
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
                  <div className="mono-label text-[oklch(0.62_0.19_218)] mb-1">
                    Network Map
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">
                    Provider Profiles
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Provider connections, observed inventory, and pricing
                  </p>
                </div>
              </div>
            </div>
            <Suspense fallback={<p role="status">Loading providers…</p>}>
              <ProviderCards />
            </Suspense>
          </div>
        )}

        {activeTab === "trends" && (
          <div className="animate-fade-up">
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-2xl font-bold">Market history</h2>
              <span className="text-xs text-muted-foreground">
                Recorded prices · rolling seven-day history
              </span>
            </div>
            <TrendsPanel initialOfferId={historyOfferId} />
            <div className="mt-6 p-4 rounded-lg bg-card border border-border">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground font-medium">Note:</strong>{" "}
                Collector history grows with each successful refresh. Nebius
                also supplies labeled hourly spot-price history. Replay contains
                no synthetic prices.
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
              <span className="text-sm font-semibold text-foreground">
                GPU Price Tracker
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Compute market intelligence for ML engineers. Normalized pricing,
              source timestamps, and observed availability from connected
              providers.
            </p>
          </div>
          <div>
            <div className="mono-label text-muted-foreground mb-2">
              Data Sources
            </div>
            <div className="flex flex-wrap gap-1.5">
              {catalog.sources
                .filter(s => s.lastSuccessAt)
                .map(s => s.name)
                .map(p => (
                  <span
                    key={p}
                    className="font-data text-[10px] px-2 py-0.5 bg-[oklch(0.92_0.006_85)] rounded text-foreground"
                  >
                    {p}
                  </span>
                ))}
            </div>
          </div>
          <div>
            <div className="mono-label text-muted-foreground mb-2">
              Coverage
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">GPU Models</span>
                <span className="font-data text-foreground">
                  {new Set(offers.map(o => o.gpuModelId)).size}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Offers</span>
                <span className="font-data text-foreground">
                  {offers.length}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Regions</span>
                <span className="font-data text-foreground">
                  Provider reported
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="container pb-4">
          <div className="section-rule mb-4" />
          <p className="font-data text-[10px] text-muted-foreground text-center">
            Prices are indicative and may vary. Always verify directly with
            providers before committing to workloads.
          </p>
        </div>
      </footer>
    </div>
  );
}
