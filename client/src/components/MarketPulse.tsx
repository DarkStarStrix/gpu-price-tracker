/*
  MarketPulse — Current market metrics
*/

import { catalog, eligibleOffers } from "@/lib/catalog";
import { displayQuote } from "@shared/market";
import { Activity, TrendingDown, Server, Cpu } from "lucide-react";

export function MarketPulse() {
  const offers = eligibleOffers();
  const quote = displayQuote(catalog, "h100-sxm");
  const stats = {
    totalOffers: catalog.offers.length,
    availableOffers: offers.filter(
      o => o.availability === "available" || o.availability === "limited"
    ).length,
    providerCount: new Set(catalog.offers.map(o => o.providerId)).size,
    gpuModelCount: new Set(catalog.offers.map(o => o.gpuModelId)).size,
    h100Floor: quote?.offer.pricePerGpuHr ?? null,
  };

  const metrics = {
    totalOffers: stats.totalOffers,
    availableOffers: stats.availableOffers,
    providers: stats.providerCount,
    gpuModels: stats.gpuModelCount,
    lowestH100: stats.h100Floor,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
      <MetricCard
        icon={<Activity className="w-4 h-4" />}
        label="Reported capacity"
        value={metrics.availableOffers}
        suffix=""
        subtext={
          offers.length
            ? `of ${metrics.totalOffers} tracked`
            : "Awaiting a fresh stock report"
        }
        missing={offers.length === 0}
        accent="teal"
      />
      <MetricCard
        icon={<Server className="w-4 h-4" />}
        label="Providers"
        value={metrics.providers}
        suffix=""
        subtext="tracked cloud platforms"
        accent="navy"
      />
      <MetricCard
        icon={<TrendingDown className="w-4 h-4" />}
        label={quote?.retained ? "Last observed H100" : "H100 Floor"}
        value={metrics.lowestH100 ? Math.round(metrics.lowestH100 * 100) : 0}
        suffix=""
        prefix="$"
        divisor={100}
        decimals={2}
        subtext="On-demand · USD / GPU-hour"
        missing={metrics.lowestH100 === null}
        accent="sage"
      />
      <MetricCard
        icon={<Cpu className="w-4 h-4" />}
        label="GPU Models"
        value={metrics.gpuModels}
        suffix=""
        subtext="tracked configurations"
        accent="coral"
      />
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  suffix = "",
  prefix = "",
  subtext,
  accent,
  divisor = 1,
  decimals = 0,
  missing = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  subtext: string;
  accent: string;
  missing?: boolean;
  divisor?: number;
  decimals?: number;
}) {
  const displayValue =
    decimals > 0 ? (value / divisor).toFixed(decimals) : value.toString();

  const accentMap: Record<
    string,
    { bg: string; iconBg: string; iconColor: string; glow: string; bar: string }
  > = {
    teal: {
      bg: "bg-card",
      iconBg: "bg-teal-subtle",
      iconColor: "text-teal",
      glow: "hover:shadow-teal",
      bar: "bg-[oklch(0.62_0.19_218)]",
    },
    navy: {
      bg: "bg-card",
      iconBg: "bg-navy-subtle",
      iconColor: "text-navy",
      glow: "hover:shadow-[0_4px_20px_oklch(0.22_0.045_255_/_0.12)]",
      bar: "bg-[oklch(0.22_0.045_255)]",
    },
    sage: {
      bg: "bg-card",
      iconBg: "bg-sage-subtle",
      iconColor: "text-sage",
      glow: "hover:shadow-[0_4px_20px_oklch(0.60_0.18_155_/_0.18)]",
      bar: "bg-[oklch(0.60_0.18_155)]",
    },
    coral: {
      bg: "bg-card",
      iconBg: "bg-coral-subtle",
      iconColor: "text-coral",
      glow: "hover:shadow-coral",
      bar: "bg-[oklch(0.68_0.18_45)]",
    },
  };

  const s = accentMap[accent] ?? accentMap.teal;

  return (
    <div
      className={`relative overflow-hidden ${s.bg} border border-border rounded-lg px-5 py-4 transition-all duration-300 ${s.glow}`}
    >
      {/* Top accent bar */}
      <div
        className={`absolute top-0 left-0 right-0 h-[2px] ${s.bar} opacity-60`}
      />

      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-7 h-7 rounded-md flex items-center justify-center ${s.iconBg}`}
        >
          <span className={s.iconColor}>{icon}</span>
        </div>
        <span className="mono-label text-muted-foreground">{label}</span>
      </div>

      <div className="flex items-baseline gap-0.5">
        {prefix && (
          <span className="font-data text-lg text-muted-foreground">
            {prefix}
          </span>
        )}
        <span className="font-data text-3xl font-semibold text-foreground tracking-tight counter-animate">
          {missing ? "—" : displayValue}
        </span>
        {suffix && (
          <span className="font-data text-sm text-muted-foreground ml-1">
            {suffix}
          </span>
        )}
      </div>

      {subtext && (
        <p className="font-data text-[11px] text-muted-foreground mt-1">
          {subtext}
        </p>
      )}
    </div>
  );
}
