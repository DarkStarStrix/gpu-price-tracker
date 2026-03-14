/*
  AvailabilityBadge — Premium availability state indicator
  Design: Data Observatory v2 — pill badges with pulsing dot for available state
*/

import type { AvailabilityState } from "@/lib/data";
import { availabilityLabel } from "@/lib/data";

interface AvailabilityBadgeProps {
  state: AvailabilityState;
  className?: string;
}

const stateStyles: Record<AvailabilityState, {
  container: string;
  dot: string;
  text: string;
  pulse: boolean;
}> = {
  available: {
    container: "bg-[oklch(0.60_0.18_155_/_0.08)] border border-[oklch(0.60_0.18_155_/_0.2)]",
    dot: "bg-[oklch(0.60_0.18_155)]",
    text: "text-[oklch(0.42_0.15_155)]",
    pulse: true,
  },
  limited: {
    container: "bg-[oklch(0.68_0.18_80_/_0.08)] border border-[oklch(0.68_0.18_80_/_0.2)]",
    dot: "bg-[oklch(0.68_0.18_80)]",
    text: "text-[oklch(0.48_0.14_80)]",
    pulse: false,
  },
  unavailable: {
    container: "bg-[oklch(0.58_0.22_25_/_0.07)] border border-[oklch(0.58_0.22_25_/_0.2)]",
    dot: "bg-[oklch(0.58_0.22_25)]",
    text: "text-[oklch(0.42_0.16_25)]",
    pulse: false,
  },
};

export function AvailabilityBadge({ state, className = "" }: AvailabilityBadgeProps) {
  const s = stateStyles[state];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-data text-[10px] tracking-wide font-medium ${s.container} ${s.text} ${className}`}>
      <span className={`relative w-1.5 h-1.5 rounded-full ${s.dot} flex-shrink-0`}>
        {s.pulse && (
          <span className={`absolute inset-0 rounded-full ${s.dot} animate-ping opacity-60`} />
        )}
      </span>
      {availabilityLabel(state)}
    </span>
  );
}
