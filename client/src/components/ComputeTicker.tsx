import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { isCurrent, isStale, type Snapshot } from "@shared/catalog";
import { computeKinds, type ComputeKind } from "@shared/compute";
import { hourlyPrice } from "@/lib/data";

const featuredModels = new Map([
  ["h100-sxm", "H100 SXM"],
  ["h200-sxm", "H200 SXM"],
  ["b200-sxm", "B200"],
  ["b300", "B300"],
  ["mi300x", "MI300X"],
  ["mi350x", "MI350X"],
  ["a100-sxm-80", "A100 80 GB SXM"],
  ["l40s", "L40S"],
  ["rtx-5090", "RTX 5090"],
  ["rtx-4090", "RTX 4090"],
  ["rtx-pro-6000", "RTX PRO 6000"],
]);

export function ComputeTicker({
  snapshot,
  onGpu,
  onCompute,
}: {
  snapshot: Snapshot;
  onGpu: (id: string) => void;
  onCompute: (kind: ComputeKind) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState({
    left: false,
    right: false,
  });
  const now = Date.now();
  const gpu = new Map<string, { price: number; providers: Set<string> }>();
  for (const offer of snapshot.offers) {
    if (
      !featuredModels.has(offer.gpuModelId) ||
      offer.billingModel === "spot" ||
      offer.availability === "unavailable" ||
      !isCurrent(snapshot, offer, now)
    )
      continue;
    const current = gpu.get(offer.gpuModelId) ?? {
      price: Infinity,
      providers: new Set<string>(),
    };
    current.price = Math.min(current.price, offer.pricePerGpuHr);
    current.providers.add(offer.providerId);
    gpu.set(offer.gpuModelId, current);
  }
  const gpuCards = [...gpu]
    .sort(([, a], [, b]) => b.providers.size - a.providers.size)
    .map(([id, { price }]) => ({
      id,
      label: featuredModels.get(id)!,
      price,
      unit: "GPU-hour",
      open: () => onGpu(id),
    }));
  const otherCards = (Object.keys(computeKinds) as ComputeKind[]).flatMap(
    kind => {
      const prices = (snapshot.compute ?? [])
        .filter(
          feed =>
            feed.status === "ok" &&
            feed.observedAt &&
            !isStale(feed.observedAt, now)
        )
        .flatMap(feed =>
          feed.rates
            .filter(
              rate =>
                rate.kind === kind &&
                rate.billing === "on-demand" &&
                rate.availability !== "unavailable"
            )
            .map(rate => rate.price)
        );
      return prices.length
        ? [
            {
              id: kind,
              ...computeKinds[kind],
              price: Math.min(...prices),
              open: () => onCompute(kind),
            },
          ]
        : [];
    }
  );
  const cards = [...gpuCards.slice(0, 3), ...otherCards, ...gpuCards.slice(3)];
  useEffect(() => {
    const node = track.current;
    if (!node) return;
    const update = () => {
      const left = node.scrollLeft > 1;
      const right = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
      setScrollPosition(current =>
        current.left === left && current.right === right
          ? current
          : { left, right }
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    node.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", update);
    };
  }, [cards.length]);
  if (!cards.length) return null;

  function scroll(direction: number) {
    const node = track.current;
    if (node) node.scrollBy({ left: direction * node.clientWidth * 0.75 });
  }

  return (
    <section
      aria-label="Compute watchlist"
      className="border-b border-border bg-card"
    >
      <div className="container flex items-center gap-3">
        <div className="hidden sm:block shrink-0 pr-2">
          <h2 className="text-sm font-semibold">Compute watchlist</h2>
          <p className="text-[11px] text-muted-foreground">
            On-demand price floors
          </p>
        </div>
        <div ref={track} className="compute-ticker flex flex-1 overflow-x-auto">
          {cards.map(card => (
            <button
              key={card.id}
              type="button"
              onClick={card.open}
              className="min-w-37 shrink-0 border-l border-border px-3 py-2.5 text-left hover:bg-muted focus-visible:bg-muted"
            >
              <span className="block whitespace-nowrap text-xs font-semibold">
                {card.label}
              </span>
              <span className="whitespace-nowrap font-data text-xs text-teal">
                {hourlyPrice.format(card.price)}
              </span>
              <span className="ml-1 whitespace-nowrap text-[10px] text-muted-foreground">
                / {card.unit}
              </span>
            </button>
          ))}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label="Scroll compute watchlist left"
            disabled={!scrollPosition.left}
            onClick={() => scroll(-1)}
            className="header-control"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Scroll compute watchlist right"
            disabled={!scrollPosition.right}
            onClick={() => scroll(1)}
            className="header-control"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
