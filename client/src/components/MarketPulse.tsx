/*
  MarketPulse — Key market metrics banner at top of dashboard
  Data Observatory design: compact metric cards with scientific precision
*/

import { useMemo } from "react";
import { OFFERS, PROVIDERS, GPU_MODELS, getProvider, getGpuModel, formatPrice } from "@/lib/data";
import { Activity, TrendingDown, Server, Cpu } from "lucide-react";

export function MarketPulse() {
  const metrics = useMemo(() => {
    const availableOffers = OFFERS.filter(o => o.availability === "available");
    const h100Offers = OFFERS.filter(o => o.gpuModelId === "h100-sxm" && o.availability !== "unavailable");
    const lowestH100 = h100Offers.length > 0 ? Math.min(...h100Offers.map(o => o.pricePerGpuHr)) : null;
    const highestH100 = h100Offers.length > 0 ? Math.max(...h100Offers.map(o => o.pricePerGpuHr)) : null;
    const avgPrice = OFFERS.reduce((sum, o) => sum + o.pricePerGpuHr, 0) / OFFERS.length;
    const gpuModelsTracked = new Set(OFFERS.map(o => o.gpuModelId)).size;

    return {
      totalOffers: OFFERS.length,
      availableOffers: availableOffers.length,
      providers: PROVIDERS.length,
      gpuModels: gpuModelsTracked,
      lowestH100,
      highestH100,
      avgPrice,
      h100Spread: lowestH100 && highestH100 ? ((highestH100 / lowestH100 - 1) * 100).toFixed(0) : null,
    };
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
      <MetricCard
        icon={<Activity className="w-4 h-4" />}
        label="Active Offers"
        value={`${metrics.availableOffers}`}
        subtext={`of ${metrics.totalOffers} total`}
        accent="teal"
      />
      <MetricCard
        icon={<Server className="w-4 h-4" />}
        label="Providers"
        value={`${metrics.providers}`}
        subtext="tracked"
        accent="navy"
      />
      <MetricCard
        icon={<TrendingDown className="w-4 h-4" />}
        label="H100 SXM Low"
        value={metrics.lowestH100 ? formatPrice(metrics.lowestH100) : "N/A"}
        subtext={metrics.h100Spread ? `${metrics.h100Spread}% spread` : ""}
        accent="green"
      />
      <MetricCard
        icon={<Cpu className="w-4 h-4" />}
        label="GPU Models"
        value={`${metrics.gpuModels}`}
        subtext="configurations"
        accent="coral"
      />
    </div>
  );
}

function MetricCard({
  icon, label, value, subtext, accent,
}: {
  icon: React.ReactNode; label: string; value: string; subtext: string; accent: string;
}) {
  const accentStyles: Record<string, { bg: string; icon: string }> = {
    teal: { bg: "bg-[oklch(0.65_0.18_220_/_0.06)]", icon: "text-[oklch(0.55_0.18_220)]" },
    navy: { bg: "bg-[oklch(0.25_0.04_250_/_0.06)]", icon: "text-[oklch(0.4_0.04_250)]" },
    green: { bg: "bg-[oklch(0.65_0.2_150_/_0.06)]", icon: "text-[oklch(0.5_0.18_150)]" },
    coral: { bg: "bg-[oklch(0.7_0.17_45_/_0.06)]", icon: "text-[oklch(0.55_0.15_45)]" },
  };

  const style = accentStyles[accent] ?? accentStyles.teal;

  return (
    <div className="bg-card border border-border rounded-md px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-6 h-6 rounded flex items-center justify-center ${style.bg}`}>
          <span className={style.icon}>{icon}</span>
        </div>
        <span className="text-[11px] font-data text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-data text-2xl font-semibold text-foreground tracking-tight">{value}</div>
      {subtext && <div className="font-data text-[11px] text-muted-foreground mt-0.5">{subtext}</div>}
    </div>
  );
}
