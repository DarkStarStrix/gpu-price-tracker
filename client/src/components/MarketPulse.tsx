/*
  MarketPulse — Premium animated market metrics banner
  Design: Data Observatory v2 — animated counters, teal glow, depth layers
*/

import { useMemo, useEffect, useState } from "react";
import { OFFERS, PROVIDERS, formatPrice } from "@/lib/data";
import { Activity, TrendingDown, Server, Cpu, Zap } from "lucide-react";

function useCountUp(target: number, duration = 800, delay = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      const start = performance.now();
      const step = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(eased * target));
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, delay);
    return () => clearTimeout(timer);
  }, [target, duration, delay]);
  return value;
}

export function MarketPulse() {
  const metrics = useMemo(() => {
    const availableOffers = OFFERS.filter(o => o.availability === "available");
    const h100Offers = OFFERS.filter(o => o.gpuModelId === "h100-sxm" && o.availability !== "unavailable");
    const lowestH100 = h100Offers.length > 0 ? Math.min(...h100Offers.map(o => o.pricePerGpuHr)) : null;
    const highestH100 = h100Offers.length > 0 ? Math.max(...h100Offers.map(o => o.pricePerGpuHr)) : null;
    const gpuModelsTracked = new Set(OFFERS.map(o => o.gpuModelId)).size;
    return {
      totalOffers: OFFERS.length,
      availableOffers: availableOffers.length,
      providers: PROVIDERS.length,
      gpuModels: gpuModelsTracked,
      lowestH100,
      highestH100,
      h100Spread: lowestH100 && highestH100 ? Math.round((highestH100 / lowestH100 - 1) * 100) : null,
    };
  }, []);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
      <MetricCard
        icon={<Activity className="w-4 h-4" />}
        label="Active Offers"
        value={metrics.availableOffers}
        suffix=""
        subtext={`of ${metrics.totalOffers} tracked`}
        accent="teal"
        delay={0}
      />
      <MetricCard
        icon={<Server className="w-4 h-4" />}
        label="Providers"
        value={metrics.providers}
        suffix=""
        subtext="cloud platforms"
        accent="navy"
        delay={80}
      />
      <MetricCard
        icon={<TrendingDown className="w-4 h-4" />}
        label="H100 Floor"
        value={metrics.lowestH100 ? Math.round(metrics.lowestH100 * 100) : 0}
        suffix=""
        prefix="$"
        divisor={100}
        decimals={2}
        subtext={metrics.h100Spread ? `${metrics.h100Spread}% spread vs ceiling` : ""}
        accent="sage"
        delay={160}
      />
      <MetricCard
        icon={<Cpu className="w-4 h-4" />}
        label="GPU Models"
        value={metrics.gpuModels}
        suffix=""
        subtext="configurations"
        accent="coral"
        delay={240}
      />
    </div>
  );
}

function MetricCard({
  icon, label, value, suffix = "", prefix = "", subtext, accent, delay = 0,
  divisor = 1, decimals = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  subtext: string;
  accent: string;
  delay?: number;
  divisor?: number;
  decimals?: number;
}) {
  const animated = useCountUp(value, 900, delay);
  const displayValue = decimals > 0
    ? (animated / divisor).toFixed(decimals)
    : animated.toString();

  const accentMap: Record<string, { bg: string; iconBg: string; iconColor: string; glow: string; bar: string }> = {
    teal:  { bg: "bg-card", iconBg: "bg-teal-subtle", iconColor: "text-teal", glow: "hover:shadow-teal", bar: "bg-[oklch(0.62_0.19_218)]" },
    navy:  { bg: "bg-card", iconBg: "bg-navy-subtle", iconColor: "text-navy", glow: "hover:shadow-[0_4px_20px_oklch(0.22_0.045_255_/_0.12)]", bar: "bg-[oklch(0.22_0.045_255)]" },
    sage:  { bg: "bg-card", iconBg: "bg-sage-subtle", iconColor: "text-sage", glow: "hover:shadow-[0_4px_20px_oklch(0.60_0.18_155_/_0.18)]", bar: "bg-[oklch(0.60_0.18_155)]" },
    coral: { bg: "bg-card", iconBg: "bg-coral-subtle", iconColor: "text-coral", glow: "hover:shadow-coral", bar: "bg-[oklch(0.68_0.18_45)]" },
  };

  const s = accentMap[accent] ?? accentMap.teal;

  return (
    <div
      className={`relative overflow-hidden ${s.bg} border border-border rounded-lg px-5 py-4 transition-all duration-300 ${s.glow} animate-fade-up`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Top accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] ${s.bar} opacity-60`} />

      <div className="flex items-center gap-2 mb-3">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${s.iconBg}`}>
          <span className={s.iconColor}>{icon}</span>
        </div>
        <span className="mono-label text-muted-foreground">{label}</span>
      </div>

      <div className="flex items-baseline gap-0.5">
        {prefix && <span className="font-data text-lg text-muted-foreground">{prefix}</span>}
        <span className="font-data text-3xl font-semibold text-foreground tracking-tight counter-animate">
          {displayValue}
        </span>
        {suffix && <span className="font-data text-sm text-muted-foreground ml-1">{suffix}</span>}
      </div>

      {subtext && (
        <p className="font-data text-[11px] text-muted-foreground mt-1">{subtext}</p>
      )}
    </div>
  );
}
