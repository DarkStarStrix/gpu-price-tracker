import { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  computeKinds,
  type ComputeKind,
  type ComputeFeed,
} from "@shared/compute";
import { isStale } from "@shared/catalog";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { hourlyPrice } from "@/lib/data";

export function ComputeRates({
  feeds,
  kind,
}: {
  feeds: ComputeFeed[];
  kind: ComputeKind;
}) {
  const [provider, setProvider] = useState("");
  const [billing, setBilling] = useState("");
  const now = Date.now();
  const coverage = feeds.filter(feed =>
    feed.rates.some(rate => rate.kind === kind)
  );
  const rates = coverage
    .flatMap(feed =>
      feed.rates
        .filter(
          rate =>
            rate.kind === kind &&
            (!provider || provider === feed.providerId) &&
            (!billing || billing === rate.billing)
        )
        .map(rate => ({
          rate,
          feed,
          retained:
            feed.status === "error" ||
            !feed.observedAt ||
            isStale(feed.observedAt, now),
        }))
    )
    .sort(
      (a, b) =>
        Number(a.retained) - Number(b.retained) || a.rate.price - b.rate.price
    );

  return (
    <section aria-labelledby="compute-title">
      <div className="mb-5">
        <h2 id="compute-title" className="text-2xl font-semibold">
          {computeKinds[kind].label}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Published rates in USD per {computeKinds[kind].unit}.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Compute provider"
            className="rounded-md border border-border bg-card px-2 py-2 text-xs"
            value={provider}
            onChange={event => setProvider(event.target.value)}
          >
            <option value="">All providers</option>
            {coverage.map(feed => (
              <option key={feed.providerId} value={feed.providerId}>
                {feed.providerName}
              </option>
            ))}
          </select>
          {kind === "cpu" && (
            <select
              aria-label="Compute billing"
              className="rounded-md border border-border bg-card px-2 py-2 text-xs"
              value={billing}
              onChange={event => setBilling(event.target.value)}
            >
              <option value="">All billing</option>
              <option value="on-demand">On-demand</option>
              <option value="spot">Spot</option>
            </select>
          )}
        </div>
      </div>
      {kind === "tpu" && (
        <p className="mb-3 text-xs text-muted-foreground">
          Google lists TPU prices per chip. A TPU VM can use multiple chips.
        </p>
      )}
      {feeds.some(feed => feed.status === "error") && (
        <p className="mb-3 text-xs text-muted-foreground">
          Refresh failed for{" "}
          {feeds
            .filter(feed => feed.status === "error")
            .map(feed => feed.providerName)
            .join(", ")}
          .
        </p>
      )}
      {rates.length ? (
        <div
          tabIndex={0}
          role="region"
          aria-label={computeKinds[kind].label}
          className="overflow-x-auto rounded-xl border border-border bg-card"
        >
          <table className="w-full min-w-156 text-left text-sm">
            <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
              <tr>
                {[
                  "Configuration",
                  "Provider / region",
                  "Billing",
                  "Availability",
                  `USD / ${computeKinds[kind].unit}`,
                ].map(label => (
                  <th
                    key={label}
                    scope="col"
                    className="whitespace-nowrap px-4 py-3 font-medium"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rates.map(({ feed, rate, retained }) => (
                <tr
                  key={`${feed.providerId}:${rate.id}`}
                  className="hover:bg-muted/50"
                >
                  <th scope="row" className="px-4 py-2.5 font-medium">
                    {rate.model}
                    {rate.vcpus && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {rate.vcpus} vCPU · {rate.memoryGb} GB RAM
                        {rate.storageGb ? ` · ${rate.storageGb} GB disk` : ""}
                      </span>
                    )}
                  </th>
                  <td className="px-4 py-2.5">
                    <a
                      href={feed.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-teal hover:underline"
                    >
                      {feed.providerName}
                      <ExternalLink aria-hidden="true" className="size-3" />
                    </a>
                    {rate.region && (
                      <span className="block text-xs text-muted-foreground">
                        {rate.region}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {rate.billing === "spot" ? "Spot" : "On-demand"}
                  </td>
                  <td className="px-4 py-2.5">
                    <AvailabilityBadge
                      state={retained ? "unknown" : rate.availability}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-data font-semibold">
                      {hourlyPrice.format(rate.price)}
                    </span>
                    {retained && (
                      <span className="block text-[11px] text-muted-foreground">
                        Last observed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No rates for these filters.
        </p>
      )}
    </section>
  );
}
