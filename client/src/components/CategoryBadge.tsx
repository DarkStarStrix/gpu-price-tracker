/*
  CategoryBadge — Provider category indicator (Stable / Marketplace / Shifting Pool)
*/

import type { ProviderCategory } from "@/lib/data";
import { categoryLabel } from "@/lib/data";

interface CategoryBadgeProps {
  category: ProviderCategory;
  className?: string;
}

const catStyles: Record<ProviderCategory, string> = {
  stable: "bg-[oklch(0.65_0.18_220_/_0.1)] text-[oklch(0.45_0.14_220)]",
  marketplace: "bg-[oklch(0.7_0.17_45_/_0.1)] text-[oklch(0.5_0.14_45)]",
  shifting_pool: "bg-[oklch(0.7_0.17_80_/_0.1)] text-[oklch(0.5_0.12_80)]",
};

export function CategoryBadge({ category, className = "" }: CategoryBadgeProps) {
  return (
    <span className={`category-badge ${catStyles[category]} ${className}`}>
      {categoryLabel(category)}
    </span>
  );
}
