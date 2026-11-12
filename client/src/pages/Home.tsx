/*
  Home — GPU Price Tracker Dashboard v2
  Design: "Data Observatory" — Scientific Instrument Panel, Premium Edition
  Key upgrades: animated hero, sticky navigation, scan-line effect,
  staggered section entrances, blueprint illustration integration
*/

import { lazy, startTransition, Suspense, useState, useEffect } from "react";
import { LiveH100 } from "@/components/LiveH100";
import { MarketPulse } from "@/components/MarketPulse";
import { QuickComparison } from "@/components/QuickComparison";
import { TrendsPanel } from "@/components/TrendsPanel";
import { ComputeTicker } from "@/components/ComputeTicker";
import {
  Activity,
  ArrowRight,
  ChevronRight,
  Cpu,
  Github,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";
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
import { readViewLink } from "@/lib/view-link";
import { computeKinds, type ComputeKind } from "@shared/compute";

// Generated assets
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
const ComputeRates = lazy(() =>
  import("@/components/ComputeRates").then(module => ({
    default: module.ComputeRates,
  }))
);

type Tab = "overview" | "offers" | "providers" | "trends";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "offers", label: "All Offers" },
  { id: "providers", label: "Providers" },
  { id: "trends", label: "Trends" },
];

export default function Home() {
  const [sharedView, setSharedView] = useState(() =>
    readViewLink(window.location.search)
  );
  const [historyOfferId, setHistoryOfferId] = useState(
    sharedView?.view === "trends" ? sharedView.id : ""
  );
  const [initialGpu, setInitialGpu] = useState("");
  const [offerKind, setOfferKind] = useState<"gpu" | ComputeKind>("gpu");
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  const [activeTab, setActiveTab] = useState<Tab>(
    sharedView?.view ?? "overview"
  );
  const generatedAt = catalog.generatedAt;
  const offers = catalog.offers;
  const freshOffers = offers.filter(o => isCurrent(catalog, o));
  const snapshotTime = new Date(generatedAt);
  const snapshotHealthy = !snapshotLoadError && freshOffers.length > 0;
  const providerCount = new Set(offers.map(o => o.providerId)).size;
  const floor = (id: string) => {
    const quote = displayQuote(catalog, id);
    return quote
      ? `${formatPrice(quote.offer.pricePerGpuHr)}/hr${quote.retained ? " · last observed" : ""}`
      : "—";
  };

  function navigate(tab: Tab, gpu = "", kind: "gpu" | ComputeKind = "gpu") {
    if (tab === activeTab) return;
    if (sharedView) {
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState(null, "", url);
      setSharedView(undefined);
    }
    if (tab === "offers") {
      startTransition(() => {
        setInitialGpu(gpu);
        setOfferKind(kind);
        setActiveTab(tab);
      });
    } else setActiveTab(tab);
    window.scrollTo(0, 0);
  }

  function toggleTheme() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
    try {
      localStorage.setItem("compute-tracker-theme", next ? "dark" : "light");
    } catch {}
  }

  useEffect(() => {
    if (activeTab === "offers" && offerKind === "gpu")
      void loadHistory().catch(() => {});
  }, [activeTab, generatedAt, offerKind]);

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
    <div className="min-h-screen dashboard-surface">
      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 h-[60px] border-b border-border bg-card">
        <div className="container flex items-center justify-between gap-2 h-full">
          <button
            type="button"
            onClick={() => navigate("overview")}
            aria-label="GPU Price Tracker home"
            className="flex shrink-0 items-center gap-2.5 rounded-lg text-left"
          >
            <span
              className="header-brand-mark grid size-9 place-items-center rounded-xl"
              aria-hidden="true"
            >
              <Cpu className="size-5" strokeWidth={1.6} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-tight tracking-tight">
                GPU Price Tracker
              </span>
              <span className="hidden sm:block mt-0.5 text-[10px] font-data text-muted-foreground">
                Compute price observatory
              </span>
            </span>
          </button>

          {/* Tab navigation — desktop */}
          <nav
            aria-label="Dashboard"
            className="hidden lg:flex items-center gap-0.5"
          >
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => navigate(tab.id)}
                onPointerEnter={tab.id === "offers" ? warmOffers : undefined}
                onFocus={tab.id === "offers" ? warmOffers : undefined}
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={`relative whitespace-nowrap px-2.5 xl:px-4 py-2 text-sm rounded-md transition-colors ${
                  activeTab === tab.id
                    ? "text-foreground font-medium tab-active-indicator"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[oklch(0.62_0.19_218)]" />
                )}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            <time
              dateTime={generatedAt}
              title={`Snapshot published ${snapshotTime.toLocaleString()}`}
              className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1.5 font-data text-[10px] text-muted-foreground"
            >
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${snapshotHealthy ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {snapshotHealthy ? "Updated" : "Last snapshot"}{" "}
              {snapshotTime.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
            <button
              type="button"
              aria-label="Refresh prices"
              title="Check for a newer published price snapshot"
              className="header-control sm:px-2.5"
              disabled={snapshotRefreshing}
              onClick={() => {
                void loadCatalog().catch(() => {});
              }}
            >
              <RefreshCw
                className={`size-4 ${snapshotRefreshing ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">
                {snapshotRefreshing ? "Checking…" : "Refresh"}
              </span>
            </button>
            <button
              type="button"
              className="header-control"
              onClick={toggleTheme}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              title={dark ? "Light mode" : "Dark mode"}
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <a
              href="https://github.com/DarkStarStrix/gpu-price-tracker"
              aria-label="GitHub repository"
              title="GitHub repository"
              className="header-control"
            >
              <Github className="size-4" />
            </a>
          </div>
        </div>
      </header>

      {/* ── Mobile tab bar ──────────────────────────────────────────────── */}
      <nav
        aria-label="Dashboard"
        className="lg:hidden sticky top-[60px] z-40 bg-background border-b border-border px-4 py-2 flex gap-1 overflow-x-auto overscroll-x-contain"
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => navigate(tab.id)}
            onPointerEnter={tab.id === "offers" ? warmOffers : undefined}
            onFocus={tab.id === "offers" ? warmOffers : undefined}
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-all duration-200 ${
              activeTab === tab.id
                ? "bg-muted text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" && (
        <ComputeTicker
          snapshot={catalog}
          onGpu={gpu => navigate("offers", gpu)}
          onCompute={kind => navigate("offers", "", kind)}
        />
      )}

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
        <section className="observatory-hero overflow-hidden border-b border-border">
          <div className="container grid items-center gap-6 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] md:py-18">
            <div className="max-w-xl">
              {/* Eyebrow */}
              <div className="flex items-center gap-2 mb-5">
                <span className="mono-label text-teal">
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
                Compare GPU, CPU, and TPU pricing from official provider
                sources. Explore hourly rates, cloud tiers, and reported
                availability — with a source and observation time for every
                offer.
              </p>

              <LiveH100 />

              {/* CTA row */}
              <div className="mt-7 flex items-center gap-3">
                <button
                  onClick={() => navigate("offers")}
                  onPointerEnter={warmOffers}
                  onFocus={warmOffers}
                  className="primary-action group flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
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
            <div className="observatory-art hidden md:block" aria-hidden="true">
              <img
                src={GPU_DIAGRAM}
                alt=""
                width={1080}
                height={608}
                loading="lazy"
                decoding="async"
              />
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
                <div className="mono-label text-teal mb-3">Methodology</div>
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
                        className="category-badge bg-muted text-muted-foreground"
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
          </div>
        )}

        {activeTab === "offers" && (
          <>
            <div
              role="group"
              aria-label="Offer compute type"
              className="mb-4 flex flex-wrap gap-1.5"
            >
              {(
                ["gpu", ...Object.keys(computeKinds)] as ("gpu" | ComputeKind)[]
              ).map(kind => (
                <button
                  type="button"
                  key={kind}
                  aria-pressed={offerKind === kind}
                  onClick={() => setOfferKind(kind)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${offerKind === kind ? "border-primary bg-teal-subtle text-teal" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                >
                  {kind === "gpu" ? "GPUs" : computeKinds[kind].label}
                </button>
              ))}
            </div>
            <div hidden={offerKind !== "gpu"}>
              <Suspense fallback={<p role="status">Loading offers…</p>}>
                <OffersTable
                  initialGpu={initialGpu}
                  shared={
                    sharedView?.view === "offers" ? sharedView : undefined
                  }
                  onViewHistory={id => {
                    setHistoryOfferId(id);
                    navigate("trends");
                  }}
                />
              </Suspense>
            </div>
            {offerKind !== "gpu" && (
              <Suspense fallback={<p role="status">Loading compute prices…</p>}>
                <ComputeRates
                  key={offerKind}
                  feeds={catalog.compute ?? []}
                  kind={offerKind}
                />
              </Suspense>
            )}
          </>
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
                  <div className="mono-label text-teal mb-1">Network Map</div>
                  <h2 className="text-2xl font-bold text-foreground">
                    Provider Profiles
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Provider connections, observed inventory, and pricing
                  </p>
                </div>
              </div>
            </div>
            <aside className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">Vast.ai</h3>
                <p className="text-xs text-muted-foreground">
                  Browse pricing and availability on Vast.ai.
                </p>
              </div>
              <a
                href="https://cloud.vast.ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-teal hover:underline"
              >
                Open marketplace ↗
              </a>
            </aside>
            <Suspense fallback={<p role="status">Loading providers…</p>}>
              <ProviderCards snapshot={catalog} />
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
            <TrendsPanel
              initialOfferId={historyOfferId}
              shared={sharedView?.view === "trends" ? sharedView : undefined}
            />
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
      <footer className="border-t border-border bg-secondary">
        <div className="container py-7 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-3.5 h-3.5 text-teal" />
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
                    className="font-data text-[10px] px-2 py-0.5 bg-muted rounded text-foreground"
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
