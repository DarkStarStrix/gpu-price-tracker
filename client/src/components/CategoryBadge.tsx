/*
  CategoryBadge — Provider category indicator
  Design: Data Observatory v2 — bordered mono badges
*/

import type { ProviderCategory } from "@/lib/data";
import { categoryLabel } from "@/lib/data";

interface CategoryBadgeProps {
  category: ProviderCategory;
  className?: string;
}

const catStyles: Record<ProviderCategory, string> = {
  stable:       "bg-[oklch(0.62_0.19_218_/_0.07)] text-[oklch(0.42_0.16_218)] border border-[oklch(0.62_0.19_218_/_0.2)]",
  marketplace:  "bg-[oklch(0.68_0.18_45_/_0.07)] text-[oklch(0.48_0.14_45)] border border-[oklch(0.68_0.18_45_/_0.2)]",
  shifting_pool:"bg-[oklch(0.68_0.18_80_/_0.07)] text-[oklch(0.48_0.14_80)] border border-[oklch(0.68_0.18_80_/_0.2)]",
};

export function CategoryBadge({ category, className = "" }: CategoryBadgeProps) {
  return (
    <span className={`category-badge ${catStyles[category]} ${className}`}>
      {categoryLabel(category)}
    </span>
  );
}
