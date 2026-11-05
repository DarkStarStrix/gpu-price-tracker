/*
  AvailabilityBadge — Premium availability state indicator
  Design: Data Observatory v2 — pill badges with pulsing dot for available state
*/

import type { AvailabilityState } from "@/lib/data";
import { availabilityLabel } from "@/lib/data";

interface AvailabilityBadgeProps {
  state: AvailabilityState;
  className?: string;
  providerLink?: string;
}

const stateStyles: Record<
  AvailabilityState,
  {
    container: string;
    dot: string;
    text: string;
    pulse: boolean;
  }
> = {
  available: {
    container:
      "bg-[oklch(0.60_0.18_155_/_0.08)] border border-[oklch(0.60_0.18_155_/_0.2)]",
    dot: "bg-[oklch(0.60_0.18_155)]",
    text: "text-[oklch(0.42_0.15_155)]",
    pulse: true,
  },
  limited: {
    container:
      "bg-[oklch(0.68_0.18_80_/_0.08)] border border-[oklch(0.68_0.18_80_/_0.2)]",
    dot: "bg-[oklch(0.68_0.18_80)]",
    text: "text-[oklch(0.48_0.14_80)]",
    pulse: false,
  },
  unknown: {
    container: "bg-muted border border-border",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    pulse: false,
  },
  unavailable: {
    container:
      "bg-[oklch(0.58_0.22_25_/_0.07)] border border-[oklch(0.58_0.22_25_/_0.2)]",
    dot: "bg-[oklch(0.58_0.22_25)]",
    text: "text-[oklch(0.42_0.16_25)]",
    pulse: false,
  },
};

export function AvailabilityBadge({
  state,
  className = "",
  providerLink,
}: AvailabilityBadgeProps) {
  if (state === "unknown")
    return providerLink ? (
      <a
        href={providerLink}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        title="This source reports prices but has no current stock report. Check availability with the provider."
        className={`inline-flex items-center gap-1 text-xs font-medium text-teal underline underline-offset-2 whitespace-nowrap ${className}`}
      >
        Check stock ↗
      </a>
    ) : (
      <span
        className={`text-xs text-muted-foreground ${className}`}
        title="No current stock report supplied by this source"
      >
        Stock not reported
      </span>
    );
  const s = stateStyles[state];

  return (
    <span
      title={`Provider reports ${availabilityLabel(state).toLowerCase()} capacity; checked at the offer timestamp`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-data text-[10px] tracking-wide font-medium ${s.container} ${s.text} ${className}`}
    >
      <span className={`relative w-2 h-2 rounded-full ${s.dot} flex-shrink-0`}>
        {s.pulse && (
          <span
            className={`absolute inset-0 rounded-full ${s.dot} animate-ping opacity-60`}
          />
        )}
      </span>
      {availabilityLabel(state)}
    </span>
  );
}
