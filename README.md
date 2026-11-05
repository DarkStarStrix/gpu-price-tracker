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
The browser reads this JSON and rechecks it every 15 minutes. The Refresh button
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
- **Lambda:** API adapter available when `LAMBDA_API_KEY` is configured. Converts
  integer cents per node-hour to dollars per GPU-hour using the stated GPU count.
  The adapter has fixture coverage; authenticated integration is not yet verified.
- **TensorDock, CoreWeave, FluidStack, Paperspace:** profiles are retained in the
  original UI, but no verified collector is connected. They supply no prices.
  The old March 2026 sample prices are removed.

Schemas and contracts are in `shared/catalog.ts`; adapters are in
`scripts/providers.ts`; `scripts/collect.ts` owns snapshots and history.

A successful provider response replaces that provider's whole offer set, so
removed listings disappear. A valid empty catalog clears its offers. Failed or
invalid responses retain the last verified offers without advancing observation
timestamps or adding history. Only validated public fields are published;
provider error messages and raw responses are never included. Invalid previous
snapshot files stop collection rather than resetting history. Publication uses
a temporary file plus rename.

The UI marks data older than two hours or from a failed source as stale/retained,
shows unknown availability for those rows, and excludes them from overview
floors/comparisons/provider price summaries. Unknown specs display a dash.
History uses exact timestamps and separate offer identities; no synthetic
curves or reliability scores are generated. The first trend appears after at
least two collected timestamps. Alerts live in this browser's local storage and
are checked only while the page is open; no background emails are sent.

## Deploy and refresh

The workflow `.github/workflows/pages.yml` runs checks, collects prices, commits
validated observations to `main`, builds, and deploys an artifact to Pages.
It runs on pushes to `main`, manual dispatch, and at minute 17 every hour (UTC).
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
- [Lambda instance-types API](https://docs.lambda.ai/public-cloud/cloud-api/)
- [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
