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

| Provider   | Collected data                           | Important interpretation                                                                                             |
| ---------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| RunPod     | Public GraphQL catalog and stock reports | Secure and Community are separate cloud tiers; catalog prices are per GPU-hour, with no asserted node configuration. |
| CoreWeave  | Official regional on-demand price tables | Node rates are divided by GPU count once. Spot, inference, CPU and quote-only rows are excluded.                     |
| Paperspace | Official DigitalOcean machine pricing    | Conflicting multi-GPU prices and ambiguous model labels are excluded explicitly.                                     |
| Hyperstack | Official on-demand GPU price cards       | Maximum CPU/RAM specifications are not presented as allocated resources.                                             |
| Verda      | Official regular single-GPU instances    | Distinct CPU/RAM configurations retain separate listing identities.                                                  |
| Crusoe     | Official current on-demand rates         | Future December 1 prices are excluded; collection stops at that transition until the parser is reviewed.             |
| Vultr      | Public plans endpoint                    | Node prices and total VRAM are normalized per GPU; empty locations do not prove availability.                        |
| Nebius     | Public spot prices and hourly history    | Interruptible spot prices remain separate from on-demand comparisons.                                                |

The disconnected Prime Intellect, Lambda, TensorDock and Fluidstack adapters have been removed. Historical observations and Git history are retained. Adding a provider requires a verified first-party data contract and parser tests; credentials must never enter frontend assets.

Pricing pages establish a published rate, not stock. Missing stock becomes a **Check stock** link; explicit available/limited/unavailable reports keep their colored indicators. Failed or old observations remain visible in Offers with their actual timestamps and never count as current market data. Overview, comparisons and provider inventory retain their last observed prices with explicit stale labels when fresh data is unavailable. Old stock reports become stock-check links. The freshness limit is two hours.

## Updates, history and comparison

GitHub Actions is scheduled to collect at minutes 2/17/32/47, then commit observations, build, and deploy Pages. Actual runs can be delayed by GitHub. The browser checks the published snapshot every minute and when returning to the tab. **Refresh** checks immediately and reports whether a newer snapshot arrived. **Run collector on GitHub** opens the workflow, where users with repository write access can select **Run workflow**. Refresh the dashboard after deployment completes.

The hero tracks the current H100 SXM floor with separate spot/on-demand selectors. Trends displays real prices for an exact listing with 1H/24H/7D ranges, crosshair, brush, high/low/change and sample count. A flat price remains flat. Nebius imports provider hourly-last observations; other providers accumulate samples through collection. No prices are interpolated to manufacture movement.

Pool replay shows recorded listing additions/removals, price changes, stock changes and counts. Filters include GPU, billing, cloud tier, stock and region. Comparison supports two or three current listing IDs, follows them across refreshes, and removes disappeared IDs. Mixed GPU/billing comparisons are labeled.

Price alerts are local to this browser and evaluated while the app is open. Invalid saved entries are discarded individually. Failed browser storage is reported without claiming the alert was saved. No email or background notifications are sent. CSV export protects spreadsheet cells from formula injection.

## Ownership and failure behavior

- `shared/catalog.ts` owns snapshot validation, prices, timestamps and provenance.
- `scripts/http.ts` owns bounded provider requests; adapters own extraction and units.
- `scripts/collect.ts` owns provider replacement, seven-day history and local atomic publication.
- `client/src/lib/catalog.ts` owns browser loading, refresh serialization and subscriptions.
- `shared/market.ts`, `shared/movement.ts` and `shared/offer-view.ts` own market calculations and filters.
- `ProviderIdentity` owns the common official logo, billing, cloud tier and source treatment.

Success replaces a provider's full listing set, including an authoritative empty set. Failure preserves the last verified offers without advancing their timestamps or inventing history. Malformed previous snapshots stop collection. Provider exception text is not published. Public source payloads and receipts are retained separately as a one-day Actions artifact, including rejected pages for diagnosis.

See [ARCHITECTURE.md](ARCHITECTURE.md) for contracts, failure modes and release gates. Official logo source URLs are recorded in `client/public/images/providers/SOURCES.json`. The decorative GPU illustration is a refined derivative of the user-supplied drawing, not an engineering specification.

## GitHub Pages deployment

1. In repository **Settings → Pages**, select **GitHub Actions** as the source.
2. Push verified changes to `main`, or run **Refresh prices and deploy Pages** manually.
3. Check both the build and deploy jobs in Actions; a local build alone does not publish the site.

The workflow uses Node 22, a frozen pnpm lockfile, type checking, tests, collection and a Pages build. Only the build job can commit observations; only the deployment job receives Pages/OIDC write permissions. Collection needs no Actions secrets. Keep the committed snapshot and fixtures: they are data and parser evidence, not build output.
