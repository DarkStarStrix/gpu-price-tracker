# GPU Price Observatory

A public GPU price tracker with the original Data Observatory dashboard. No
accounts, subscriptions, billing, public API server, or database are required.

**Site:** https://darkstarstrix.github.io/gpu-price-tracker/

## Run locally

Use Node 22 and pnpm 10.4.1:

```sh
pnpm install --frozen-lockfile
pnpm collect
pnpm dev
```

The committed `client/public/data/latest.json` also lets the dashboard start
without provider credentials. Every price retains its actual observation time.
The browser reads this JSON and rechecks it every minute. The Refresh button
reloads the published snapshot; it does not trigger a provider collection.

```sh
pnpm check
pnpm test
pnpm build
pnpm preview
```

## Data pipeline

```
Provider APIs → scheduled collector → validated snapshot + seven-day history
             → GitHub Pages artifact → original React dashboard
```

- **RunPod:** public GraphQL catalog, separate Secure and Community offers. Prices
  are the catalog's USD per GPU-hour rates; availability is a separate provider
  stock observation for one GPU. Prices do not guarantee rentable capacity at
  that rate. Missing stock information is `unknown`. No CPU/RAM or region is
  invented when the catalog does not specify them.
- **CoreWeave:** official public pricing HTML, with separate North America and
  Europe configurations. On-demand node prices are divided by GPU count once;
  spot, inference-only, CPU, and contact-sales entries are not mixed into them.
- **Paperspace:** official DigitalOcean pricing tables, including only unambiguous
  single/multi-GPU rates. The collector excludes two multi-GPU prices that conflict
  with the page's multiplication rule, plus the combined V100 model label.
- **Hyperstack:** official on-demand per-GPU price card; published maximum CPU/RAM values are not reported as allocated specs.
- **Verda:** regular on-demand single-GPU instances with distinct CPU/RAM configuration identities. Discounts, confidential compute, serverless and cluster tables are excluded.
- **Crusoe:** current on-demand GPU rates; the future December 1 column and contact-sales rows are excluded. This parser deliberately stops at the transition pending rate review.
- **Vultr:** public plans API; full node price and VRAM are divided by GPU count. Empty location lists do not establish stock. Incomplete pagination fails collection.
- **Nebius:** public current spot-price API plus seven days of last-price-per-hour history. Interruptible spot rates are explicitly labeled and excluded from on-demand floors and comparisons. No availability is inferred.
- **Lambda:** authenticated API adapter available when `LAMBDA_API_KEY` is
  configured. Its public page currently advertises rates effective November 16,
  2026, so those are not used as current quotes. Authenticated integration remains
  unverified. API calls use the documented `cloud.lambda.ai` endpoint.
- **TensorDock:** API documentation requires a bearer token. An unauthenticated
  location-discovery request returned an empty catalog, so price coverage is not
  claimed. No verified collector is connected.
- **Fluidstack:** the current public website does not expose a verified retail
  price catalog. No prices are substituted from old or third-party listings.

Pricing pages establish **published rates**, not rentable capacity; availability
is always `unknown` for those offers. New observations include raw USD rate,
per-instance/per-GPU basis, retrieval time, source URL, and source-content SHA-256.
The dashboard labels published rates and links their official sources. Excluded
rows and reasons appear in provider profiles. Existing API snapshots and history
remain compatible.

See [ARCHITECTURE.md](ARCHITECTURE.md) for ownership, schema compatibility,
failure behavior, alternatives, and qualification gates.

Schemas and contracts are in `shared/catalog.ts`; adapters are in
`scripts/providers.ts`; `scripts/collect.ts` owns snapshots and history.

A successful provider response replaces that provider's whole offer set, so
removed listings disappear. A valid empty catalog clears its offers. Failed or
invalid responses retain the last verified offers without advancing observation
timestamps or adding history. Only validated public fields are published;
provider error messages and raw responses are never included in the website snapshot.
Public pricing HTML, unauthenticated public API payloads, and HTML retrieval receipts are saved separately as a one-day
Actions artifact, including rejected pages for reproducible parser diagnosis.
Authenticated API responses are never archived. Invalid previous
snapshot files stop collection rather than resetting history. Publication uses
a temporary file plus rename.

The UI marks data older than two hours or from a failed source as stale/retained,
shows unknown availability for those rows, and excludes them from overview
floors/comparisons/provider price summaries. Unknown specs display a dash.
History uses exact timestamps and separate offer identities; no synthetic
curves or reliability scores are generated. Nebius provider history makes replay immediately available. Other trends require at least two collected timestamps. Alerts live in this browser's local storage and
are checked only while the page is open; no background emails are sent.

## Watching movement

The Trends tab retains the original chart style and adds billing/GPU selectors,
Replay/Pause, a timestamp scrubber, and Return to latest. Time axes use elapsed
clock time. Replay reveals recorded samples; it never adds jitter to flat prices.
Nebius history is explicitly labeled as provider hourly-last prices, timestamped
at interval end, rather than our own retrospective observations.

The shifting-pool panel tracks **observed listings**, not physical fleet size.
For each successful refresh it stores counts by reported availability plus added,
removed, repriced and availability-changed listings against the previous success.
The first observation is a baseline. Failed refreshes add no movement events;
pricing-page listings remain availability unknown. Seven days are retained.
Published per-GPU rates with unknown node size are labeled as such and export no
node price. Their internal one-GPU normalization is not a rentable-node claim.

Additional source qualification on November 5: Cudo requires quotes; GMI exposes
“from” prices without a qualified on-demand contract; Oblivus has inconsistent
H100 rates across card/modal and unclear stock/configuration units; Genesis failed
TLS retrieval. These are not included in verified coverage. This is broad public
coverage, not an exhaustive worldwide inventory.

## Deploy and refresh

The workflow `.github/workflows/pages.yml` runs checks, collects prices, commits
validated observations to `main`, builds, and deploys an artifact to Pages.
It runs on pushes to `main`, manual dispatch, and at minutes 2, 17, 32, and 47 every hour (UTC).
GitHub schedules are best effort and can be delayed; observation ages, rather
than workflow or build time, determine freshness. The two-hour stale threshold
makes missed or delayed collections visible.

1. In repository **Settings → Pages**, choose **GitHub Actions** as the source.
2. Ensure Actions has permission to write repository contents. The workflow
   requests `contents: write` only for the collecting job and `pages: write` /
   `id-token: write` only for deployment.
3. Optionally configure repository Actions secret `LAMBDA_API_KEY`. Do not put
   secrets in Vite environment variables or the browser. Local collection can
   read a key exported in your shell; `.env` files are not automatically loaded.
4. Run **Refresh prices and deploy Pages** once and verify its completed run.

`pnpm build:pages` builds for `/gpu-price-tracker/`. `dist/` is the only published
artifact; scripts, dependencies, and any local credentials stay out of it.
Concurrent workflow runs are serialized. If committing observations conflicts
with another push, the run stops and the previous deployed site stays available.
The scheduled job persists history before deployment; a deployment failure does
not erase collected observations. GitHub retains the job logs separately.

The old `gh-pages` branch is retained as the prior static-demo rollback. It is
not the source for the new scheduled deployment once Actions is configured.
The original full-stack source and migrations remain recoverable in Git history.

## Provider references

- [RunPod GraphQL GPU catalog](https://docs.runpod.io/sdks/graphql/manage-pods)
- [CoreWeave published pricing](https://www.coreweave.com/pricing)
- [Paperspace published pricing](https://docs.digitalocean.com/products/paperspace/pricing/)
- [Lambda instance-types API](https://docs.lambda.ai/public-cloud/cloud-api/)
- [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
