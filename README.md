# GPU Price Observatory

A public GPU price tracker on [GitHub Pages](https://darkstarstrix.github.io/gpu-price-tracker/), with the original Data Observatory dashboard. No accounts, subscriptions, paid server, or database are required.

## Run locally

Use Node 22.12+ and pnpm 10.4.1:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The committed `client/public/data/latest.json` provides real observations without credentials. To refresh it from the public providers:

```sh
pnpm collect
pnpm check
pnpm test
pnpm build:pages
pnpm preview
```

`pnpm build` builds for the root URL; `pnpm build:pages` builds for `/gpu-price-tracker/`. Source formatting is available with `pnpm format`; `pnpm audit:deps` checks current dependency advisories.

## Public data coverage

| Provider        | Collected data                           | Important interpretation                                                                                                |
| --------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| RunPod          | Public GraphQL catalog and stock reports | Secure and Community are separate cloud tiers; catalog prices are per GPU-hour, with no asserted node configuration.    |
| CoreWeave       | Official regional on-demand price tables | Node rates are divided by GPU count once. Spot, inference, CPU and quote-only rows are excluded.                        |
| Paperspace      | Official DigitalOcean machine pricing    | Conflicting multi-GPU prices and ambiguous model labels are excluded explicitly.                                        |
| Hyperstack      | Official on-demand GPU price cards       | Maximum CPU/RAM specifications are not presented as allocated resources.                                                |
| Verda           | Official regular single-GPU instances    | Distinct CPU/RAM configurations retain separate listing identities.                                                     |
| Crusoe          | Official current on-demand rates         | Future December 1 prices are excluded; collection stops at that transition until the parser is reviewed.                |
| Vultr           | Public plans endpoint                    | Node prices and total VRAM are normalized per GPU; empty locations do not prove availability.                           |
| Nebius          | Public spot prices and hourly history    | Interruptible spot prices remain separate from on-demand comparisons.                                                   |
| Runcrate        | Public GPU pricing feed                  | Lowest listed per-GPU rate per type. Types with no orderable option are excluded; no node configuration is asserted.    |
| Hot Aisle       | Official MI300X pricing                  | Published per-GPU rates for 1-, 2- and 4-GPU VMs and 8-GPU bare metal.                                                  |
| DigitalOcean    | Official GPU Droplet pricing             | On-demand and spot node rates, with 1- and 8-GPU SKUs kept separate.                                                    |
| Civo            | Official NVIDIA GPU pricing              | On-demand hourly node rates. Commitment-only plans are excluded.                                                        |
| Jarvislabs      | Official USD instance pricing            | Single-GPU on-demand and spot rates from the public USD table.                                                          |
| Massed Compute  | Official on-demand GPU pricing           | Published node configurations and hourly rates. Quote-only configurations are excluded.                                 |
| Lium            | Public nodes API                         | Secure and Spot node rates, free GPU counts, and minimum rentable GPU counts. Rented nodes retain their observed price. |
| GPU.ai          | Public pricing and GPU types APIs        | Whole configuration rates, stock counts, and Community or Secure tier.                                                  |
| OpenRelay       | Public GPU catalog API                   | Community and Verified USD per-GPU rates with no stock claim.                                                           |
| Akamai Cloud    | Public Linode plans API                  | Published hourly VM rates and GPU counts.                                                                               |
| Oracle Cloud    | OCI price list API                       | GPU compute meters in USD. Separate software license meters and shapes with ambiguous hardware are excluded.            |
| Microsoft Azure | Retail Prices API                        | Selected Linux VM SKUs in East US, Central US, and West US 2. On-demand and Spot rates are separate.                    |
| Thunder Compute | Public instance pricing                  | Single-GPU on-demand compute rates. Sandboxes and optional add-ons are excluded.                                        |
| OVHcloud        | US public cloud price list               | Hourly GPU VM prices from the US catalog.                                                                               |
| Canopy Wave     | Public GPU cloud price table             | Per-GPU hourly prices with whole instance counts. Quote-only rows are excluded.                                         |
| Latitude.sh     | Public metal GPU plan table              | Starting hourly bare-metal prices. Specific regions may differ.                                                         |
| Denvr Dataworks | Public GPU cloud price table             | On-demand rates for whole accelerators. Reserved-only and fractional MIG configurations are excluded.                   |
| Oblivus         | Public GPU configurations and pricing    | On-demand per-GPU prices with configured node sizes.                                                                    |
| Google Cloud    | Accelerator-optimized VM price table     | USD on-demand and Spot reference rates for full-GPU instances. Commitments and fractional GPUs are excluded.            |
| Spheron AI      | Public paginated marketplace API        | On-demand and Spot node rates with provider-reported stock and regions.                                                 |
| VoltageGPU      | Public price and stock snapshot         | Standard price floors have unspecified machine sizes. Confidential VMs and dedicated nodes retain their full counts.    |
| Sixtytwo        | Public capacity listings                | Exact USD per-GPU-hour lease quotes appear on the profile with quantity, term and published ready date.                |

The disconnected Prime Intellect, Lambda, TensorDock and Fluidstack adapters have been removed. Historical observations and Git history are retained. Adding a provider requires a verified first-party data contract and parser tests; credentials must never enter frontend assets.

Pricing pages establish a published rate, not stock. Missing stock becomes a **Check stock** link; explicit available/limited/unavailable reports keep their colored indicators. Failed or old observations remain visible in Offers with their actual timestamps and never count as current market data. Overview, comparisons and provider inventory retain their last observed prices with explicit stale labels when fresh data is unavailable. Old stock reports become stock-check links. The freshness limit is two hours.

## Updates, history and comparison

GitHub Actions is scheduled to collect around the clock at minutes 8/23/38/53 UTC, then commit observations, build, and deploy Pages. GitHub can delay or skip scheduled runs. The browser checks the published snapshot every minute and when returning to the tab. **Refresh** checks immediately and reports whether a newer snapshot arrived. **Run collector on GitHub** opens the workflow, where users with repository write access can select **Run workflow**. Refresh the dashboard after deployment completes.

The **Providers** tab creates a profile for every source in the published snapshot and updates in place as newer snapshots arrive. Listings, regions, billing models, prices, and refresh status come from the snapshot. **Source details** links to the pricing evidence and shows the latest check time. The card's **Updated** time records the last successful check.

The hero tracks the current H100 SXM floor with separate spot/on-demand selectors. Trends displays real prices for an exact listing with 1H/24H/7D ranges, sample inspection, start and end sliders, high/low/change and sample count. A flat price remains flat. Nebius imports provider hourly-last observations; other providers accumulate samples through collection. No prices are interpolated to manufacture movement.

**Price movers only** shows listings with at least two different recorded prices in the selected period, including listings that returned to their starting price.

The provider movement timeline replays recorded listing additions/removals, price changes, stock changes and counts. The Offers page filters current listings by GPU, billing, cloud tier, stock and region. Comparison supports two or three current listing IDs, follows them across refreshes, and removes disappeared IDs. Mixed GPU/billing comparisons are labeled.

**Copy share link** restores exact listing IDs, filters and the selected history period. Open **Estimate job cost** for one listing or a comparison to apply the observed rate to a GPU count and runtime. Whole-node offers are rounded up to whole nodes. Lium's split rentals use the provider's minimum GPU count. A per-GPU quote with an unreported node size is labeled as an estimate.

In-tab price alerts remain available. Background price and stock watchlists require the optional Worker service and browser notification permission. See [watchlist activation](alerts/README.md). CSV export protects spreadsheet cells from formula injection.

## Ownership and failure behavior

- `shared/catalog.ts` owns snapshot validation, prices, timestamps and provenance.
- `scripts/http.ts` owns bounded provider requests; adapters own extraction and units.
- `scripts/collect.ts` owns provider replacement, seven-day history and local atomic publication.
- `shared/browser-snapshot.ts` reads expanded and compact durable snapshots, preserving individual observations and source provenance. It also derives the current catalog and chart files. `client/src/lib/catalog.ts` owns browser loading, revision matching, refresh serialization and subscriptions.
- `shared/market.ts`, `shared/movement.ts` and `shared/offer-view.ts` own market calculations and filters.

Success replaces a provider's full listing set, including an authoritative empty set. Failure preserves the last verified offers without advancing their timestamps or inventing history. Malformed previous snapshots stop collection. Provider exception text is not published. Public source payloads and receipts are retained separately as a one-day Actions artifact, including rejected pages for diagnosis.

See [ARCHITECTURE.md](ARCHITECTURE.md) for contracts, failure modes and release gates. Official logo source URLs are recorded in `client/public/images/providers/SOURCES.json`. The decorative GPU illustration is a refined derivative of the user-supplied drawing, not an engineering specification.

## GitHub Pages deployment

1. In repository **Settings → Pages**, select **GitHub Actions** as the source.
2. Push verified changes to `main`, or run **Refresh prices and deploy Pages** manually.
3. Check both the build and deploy jobs in Actions; a local build alone does not publish the site.

The workflow uses Node 22, a frozen pnpm lockfile, type checking, tests, collection and a Pages build. Only the build job can commit observations; only the deployment job receives Pages/OIDC write permissions. Collection needs no Actions secrets. Keep the committed snapshot and fixtures: they are data and parser evidence, not build output.
