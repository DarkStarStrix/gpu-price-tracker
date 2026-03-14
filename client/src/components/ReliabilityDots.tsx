/*
  ReliabilityDots — Dot-matrix reliability indicator (like signal strength)
  Data Observatory design: small circles, filled = reliable
*/

import { reliabilityDots } from "@/lib/data";

interface ReliabilityDotsProps {
  score: number;
  size?: number;
  className?: string;
}

export function ReliabilityDots({ score, size = 6, className = "" }: ReliabilityDotsProps) {
  const dots = reliabilityDots(score);

  return (
    <div className={`flex items-center gap-[3px] ${className}`} title={`Reliability: ${Math.round(score * 100)}%`}>
      {dots.map((filled, i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            backgroundColor: filled ? "oklch(0.65 0.18 220)" : "oklch(0.9 0.005 90)",
            display: "inline-block",
            transition: "background-color 0.2s ease",
          }}
        />
      ))}
    </div>
  );
}
