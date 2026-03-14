/*
  AvailabilityBadge — Colored indicator for offer availability state
*/

import type { AvailabilityState } from "@/lib/data";
import { availabilityLabel } from "@/lib/data";

interface AvailabilityBadgeProps {
  state: AvailabilityState;
  className?: string;
}

const stateStyles: Record<AvailabilityState, { bg: string; dot: string; text: string }> = {
  available: {
    bg: "bg-[oklch(0.65_0.2_150_/_0.08)]",
    dot: "bg-[oklch(0.65_0.2_150)]",
    text: "text-[oklch(0.45_0.15_150)]",
  },
  limited: {
    bg: "bg-[oklch(0.7_0.17_80_/_0.08)]",
    dot: "bg-[oklch(0.7_0.17_80)]",
    text: "text-[oklch(0.5_0.12_80)]",
  },
  unavailable: {
    bg: "bg-[oklch(0.6_0.15_25_/_0.08)]",
    dot: "bg-[oklch(0.6_0.15_25)]",
    text: "text-[oklch(0.45_0.12_25)]",
  },
};

export function AvailabilityBadge({ state, className = "" }: AvailabilityBadgeProps) {
  const styles = stateStyles[state];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm font-data text-[11px] tracking-wide ${styles.bg} ${styles.text} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
      {availabilityLabel(state)}
    </span>
  );
}
