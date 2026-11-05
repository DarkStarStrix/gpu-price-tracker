import { useMemo, useState } from "react";
import { Activity, ExternalLink } from "lucide-react";
import {
  OFFERS,
  GPU_MODELS,
  PROVIDERS,
  formatPrice,
  getGpuModel,
  getProvider,
} from "@/lib/data";

/** Pages deliberately has no API, account, payment, or credential controls. */
export default function StaticDemo() {
  const [gpu, setGpu] = useState("");
  const [provider, setProvider] = useState("");
  const [sort, setSort] = useState("price-asc");
  const offers = useMemo(
    () =>
      OFFERS.filter(
        offer =>
          (!gpu || offer.gpuModelId === gpu) &&
          (!provider || offer.providerId === provider)
      ).sort((a, b) =>
        sort === "price-desc"
          ? b.pricePerGpuHr - a.pricePerGpuHr
          : a.pricePerGpuHr - b.pricePerGpuHr
      ),
    [gpu, provider, sort]
  );
  const selectClass =
    "px-3 py-2 text-sm bg-card border border-border rounded-lg";

  return (
    <div className="min-h-screen graph-paper">
      <header className="border-b border-border bg-card">
        <div className="container flex items-center justify-between h-16 gap-4">
          <div className="flex items-center gap-3">
            <Activity className="w-7 h-7 text-teal" />
            <div>
              <div className="font-bold tracking-tight">GPU Price Tracker</div>
              <div className="mono-label text-muted-foreground">
                Compute Market Intelligence
              </div>
            </div>
          </div>
          <a
            className="text-sm underline"
            href="https://github.com/DarkStarStrix/gpu-price-tracker"
          >
            Source on GitHub
          </a>
        </div>
      </header>
      <main className="container py-8 space-y-6">
        <aside
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
          aria-label="Demo notice"
        >
          <strong>Static demo — sample data only.</strong> Prices and
          availability are illustrative, not live or verified current quotes.
          Check provider websites before making a decision. Live polling, price
          history, accounts, billing, and API-key management require the full
          backend and are unavailable here.
        </aside>
        <div>
          <p className="mono-label text-teal mb-2">
            Explore the sample catalog
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            Compare GPU compute prices
          </h1>
          <p className="text-muted-foreground mt-2">
            Browse sample offers across cloud providers. All prices are in USD
            per GPU-hour.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            ["Sample offers", OFFERS.length],
            [
              "Providers represented",
              new Set(OFFERS.map(o => o.providerId)).size,
            ],
            ["GPU models", new Set(OFFERS.map(o => o.gpuModelId)).size],
          ].map(([label, value]) => (
            <div
              key={label}
              className="bg-card border border-border rounded-xl p-4"
            >
              <div className="font-data text-2xl font-semibold">{value}</div>
              <div className="text-sm text-muted-foreground mt-1">{label}</div>
            </div>
          ))}
        </div>
        <section aria-label="Sample GPU offers" className="space-y-4">
          <div className="flex items-end flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-sm">
              GPU model
              <select
                className={selectClass}
                value={gpu}
                onChange={e => setGpu(e.target.value)}
              >
                <option value="">All GPUs</option>
                {GPU_MODELS.filter(g =>
                  OFFERS.some(o => o.gpuModelId === g.id)
                ).map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Provider
              <select
                className={selectClass}
                value={provider}
                onChange={e => setProvider(e.target.value)}
              >
                <option value="">All providers</option>
                {PROVIDERS.filter(p =>
                  OFFERS.some(o => o.providerId === p.id)
                ).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Sort by
              <select
                className={selectClass}
                value={sort}
                onChange={e => setSort(e.target.value)}
              >
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
              </select>
            </label>
            <button
              className={selectClass}
              onClick={() => {
                setGpu("");
                setProvider("");
                setSort("price-asc");
              }}
            >
              Reset filters
            </button>
            <p
              className="text-sm text-muted-foreground ml-auto py-2"
              aria-live="polite"
            >
              {offers.length} sample offers
            </p>
          </div>
          <div className="overflow-x-auto border border-border rounded-xl bg-card">
            <table className="w-full text-sm text-left">
              <caption className="sr-only">
                Illustrative GPU offers; prices and availability are not live.
              </caption>
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {[
                    "GPU",
                    "Provider",
                    "VRAM",
                    "Configuration",
                    "Region",
                    "$/GPU/hr",
                    "Sample availability",
                    "Provider",
                  ].map((heading, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="px-4 py-3 whitespace-nowrap"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {offers.map(offer => (
                  <tr
                    key={offer.id}
                    className="border-t border-border hover:bg-muted/50"
                  >
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      {getGpuModel(offer.gpuModelId)?.name ?? offer.gpuModelId}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getProvider(offer.providerId)?.name ?? offer.providerId}
                      {offer.cloudType && (
                        <span className="block text-xs text-muted-foreground capitalize">
                          {offer.cloudType}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-data whitespace-nowrap">
                      {offer.vramPerGpuGb} GB
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {offer.gpuCount}× GPU · {offer.vcpus} vCPU · {offer.ramGb}{" "}
                      GB RAM
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {offer.region}
                    </td>
                    <td className="px-4 py-3 font-data font-semibold">
                      {formatPrice(offer.pricePerGpuHr)}
                      {offer.gpuCount > 1 && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {formatPrice(offer.totalNodePriceHr)}/node
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {offer.availability}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={offer.providerLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-teal underline whitespace-nowrap"
                      >
                        Pricing <ExternalLink className="w-3 h-3" />
                        <span className="sr-only">
                          for {getProvider(offer.providerId)?.name}
                        </span>
                      </a>
                    </td>
                  </tr>
                ))}
                {!offers.length && (
                  <tr>
                    <td
                      colSpan={8}
                      className="text-center p-10 text-muted-foreground"
                    >
                      No sample offers match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <footer className="text-xs text-muted-foreground border-t border-border pt-4">
          GitHub Pages demo · Bundled sample catalog · No live provider
          connections
        </footer>
      </main>
    </div>
  );
}
