import { useState } from "react";
import type { Listing } from "@shared/catalog";
import { estimateJobCost } from "@shared/job-cost";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function JobCostCalculator({ offers }: { offers: Listing[] }) {
  const [count, setCount] = useState("1");
  const kind = offers[0]?.kind;
  const unit =
    kind === "cpu"
      ? "instances"
      : kind === "tpu"
        ? "chips"
        : kind === "sandbox"
          ? "sandboxes"
          : "GPUs";
  const [runtime, setRuntime] = useState("1");
  const estimates = offers.map(offer =>
    estimateJobCost(offer, Number(count), Number(runtime))
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="offer-field">
          {unit[0].toUpperCase() + unit.slice(1)} needed
          <input
            type="number"
            min="1"
            step="1"
            value={count}
            onChange={e => setCount(e.target.value)}
          />
        </label>
        <label className="offer-field">
          Runtime (hours)
          <input
            type="number"
            min="0"
            step="any"
            value={runtime}
            onChange={e => setRuntime(e.target.value)}
          />
        </label>
      </div>
      {estimates.some(estimate => !estimate) ? (
        <p role="status" className="text-sm text-muted-foreground">
          Enter a whole number of {unit} and a runtime greater than zero.
        </p>
      ) : (
        <ul
          className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]"
          aria-live="polite"
        >
          {offers.map((offer, i) => {
            const estimate = estimates[i]!;
            return (
              <li
                key={offer.offerId}
                className="min-w-0 rounded-lg border border-border bg-background p-3"
              >
                <p className="text-xs font-medium">
                  {offer.providerName} · {offer.gpuModelName}
                </p>
                <p className="mt-1 font-data text-xl">
                  {usd.format(estimate.total)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {kind
                    ? `${count} × ${runtime} hours`
                    : estimate.nodes === null
                      ? "Per-GPU estimate. Node billing is unreported."
                      : `${estimate.nodes} ${estimate.nodes === 1 ? "node" : "nodes"} · ${estimate.billedGpus} billed GPUs`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {offers.some(offer => offer.kind && offer.terms) && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {offers.map(
            offer =>
              offer.kind &&
              offer.terms && (
                <li key={offer.offerId}>
                  {offer.providerName} · {offer.terms}
                </li>
              )
          )}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Compute estimate at the observed rate. Storage, network charges and
        taxes are excluded. Spot rates can change.
      </p>
    </div>
  );
}
