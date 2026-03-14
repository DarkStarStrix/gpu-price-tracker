/*
  Home — GPU Price Tracker Dashboard
  Design: "Data Observatory" — Scientific Instrument Panel
  Layout: Full-width with graph paper background, asymmetric sections
*/

import { useState } from "react";
import { MarketPulse } from "@/components/MarketPulse";
import { QuickComparison } from "@/components/QuickComparison";
import { OffersTable } from "@/components/OffersTable";
import { ProviderCards } from "@/components/ProviderCards";
import { PriceTrends } from "@/components/PriceTrends";
import { Activity, Github, RefreshCw } from "lucide-react";

const HERO_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663288203906/L3MSxqVptRGomjLN7RuJgm/hero-banner-Yg6tuG9YQgN9vWKBQqgRkj.webp";
const GPU_CHIP_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663288203906/L3MSxqVptRGomjLN7RuJgm/gpu-chip-illustration-UFHk6gj8bRBL6PUkFDTCXx.webp";
const TREND_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663288203906/L3MSxqVptRGomjLN7RuJgm/price-trend-abstract-HbGkhpcaV56rQdDTzZCSyo.webp";

type Tab = "overview" | "offers" | "providers" | "trends";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [lastRefresh] = useState(() => new Date());

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "offers", label: "All Offers" },
    { id: "providers", label: "Providers" },
    { id: "trends", label: "Trends" },
  ];

  return (
    <div className="min-h-screen graph-paper">
      {/* Navigation */}
      <header className="sticky top-0 z-50 bg-[oklch(0.975_0.005_90_/_0.92)] backdrop-blur-md border-b border-border">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-[oklch(0.25_0.04_250)] flex items-center justify-center">
              <Activity className="w-4 h-4 text-[oklch(0.65_0.18_220)]" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-foreground leading-none">GPU Price Tracker</h1>
              <span className="font-data text-[10px] text-muted-foreground">Compute Market Intelligence</span>
            </div>
          </div>

          {/* Tab navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === tab.id
                    ? "bg-[oklch(0.25_0.04_250)] text-[oklch(0.95_0.005_90)] font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-[oklch(0.94_0.006_90)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="font-data text-[10px] text-muted-foreground hidden sm:block">
              Updated {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <button
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="w-3 h-3" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile tab bar */}
      <div className="md:hidden sticky top-14 z-40 bg-[oklch(0.975_0.005_90_/_0.95)] backdrop-blur-md border-b border-border px-4 py-2 flex gap-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "bg-[oklch(0.25_0.04_250)] text-[oklch(0.95_0.005_90)] font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Hero */}
      {activeTab === "overview" && (
        <section className="relative overflow-hidden border-b border-border">
          <div
            className="absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage: `url(${HERO_IMG})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="container relative py-10 md:py-14">
            <div className="max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground leading-tight">
                GPU Compute<br />Market Intelligence
              </h2>
              <p className="mt-3 text-base text-muted-foreground leading-relaxed max-w-lg">
                Real-time pricing aggregation across 6 providers. Normalized comparisons for H100, A100, RTX 4090, and more.
                Find the best price, assess reliability, and deploy directly.
              </p>
              <div className="mt-5 flex items-center gap-4">
                <button
                  onClick={() => setActiveTab("offers")}
                  className="px-4 py-2 text-sm font-medium bg-[oklch(0.25_0.04_250)] text-[oklch(0.95_0.005_90)] rounded-md hover:bg-[oklch(0.3_0.04_250)] transition-colors"
                >
                  Browse All Offers
                </button>
                <button
                  onClick={() => setActiveTab("trends")}
                  className="px-4 py-2 text-sm font-medium border border-border text-foreground rounded-md hover:bg-card transition-colors"
                >
                  View Price Trends
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Content */}
      <main className="container py-8">
        {activeTab === "overview" && (
          <>
            <MarketPulse />
            <QuickComparison />

            {/* Decorative break with GPU chip illustration */}
            <div className="flex items-center gap-6 my-10 py-6 border-y border-border/50">
              <img
                src={GPU_CHIP_IMG}
                alt="GPU architecture diagram"
                className="w-24 h-24 object-cover rounded-md opacity-60 hidden md:block"
              />
              <div>
                <h3 className="text-lg font-semibold text-foreground">How We Track Prices</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl leading-relaxed">
                  We aggregate pricing data from provider APIs and pricing pages, normalize GPU naming conventions,
                  standardize billing units, and compute reliability scores based on infrastructure stability and historical availability.
                </p>
              </div>
            </div>

            <PriceTrends />
          </>
        )}

        {activeTab === "offers" && <OffersTable />}
        {activeTab === "providers" && <ProviderCards />}
        {activeTab === "trends" && (
          <>
            <PriceTrends />
            {/* Trend illustration */}
            <div className="mt-8 rounded-md overflow-hidden border border-border">
              <img
                src={TREND_IMG}
                alt="Price trend visualization"
                className="w-full h-48 object-cover opacity-40"
              />
              <div className="px-4 py-3 bg-card border-t border-border">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Note:</strong> Historical data is based on periodic observations.
                  Marketplace providers (e.g., TensorDock) show higher volatility due to dynamic supply-demand pricing.
                  Stable providers (e.g., Lambda, CoreWeave) maintain more consistent rates.
                </p>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-[oklch(0.96_0.005_90)]">
        <div className="container py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">GPU Price Tracker</span>
            <span className="text-xs text-border">|</span>
            <span className="font-data text-[10px] text-muted-foreground">Aggregation & intelligence layer</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-data text-[10px] text-muted-foreground">
              Data sources: Lambda, RunPod, TensorDock, CoreWeave, FluidStack, Paperspace
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
