# GitHub Pages static demo

Site: https://darkstarstrix.github.io/gpu-price-tracker/

The Pages workflow builds the `pages` Vite mode and publishes only `dist/public`.
It uses the bundled sample catalog from `client/src/lib/data.ts`. Prices and
availability are illustrative; the demo makes no backend requests. Filtering,
price sorting, and links to provider pricing pages work entirely in the browser.
Live polling, history, accounts, payments, alerts, and API-key settings require
the full Node/MySQL deployment and are not exposed in the static demo.

## Build locally

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build:pages
pnpm exec vite preview --base=/gpu-price-tracker/ --host 127.0.0.1
```

Open the preview at `/gpu-price-tracker/`. The Pages build uses this project
subpath for assets and has no client-side routes requiring server rewrites.
The regular `pnpm build` / `pnpm start` full-stack commands remain available.

## Current publication

Pages currently publishes the root of the `gh-pages` branch. That branch contains
only the verified build and `.nojekyll`; application source stays on `main`.
GitHub did not register the custom Actions workflow during initial setup, so the
initial publication uses GitHub's branch-based Pages build instead.

To update this deployment, run `pnpm build:pages`, replace the generated files on
`gh-pages` with `dist/public`, retain `.nojekyll`, and push that branch. Never
publish the repository root, server bundle, or environment files.

## Optional Actions deployment

A manual workflow, **Deploy static demo to GitHub Pages**, is included for future
use. Once GitHub recognizes it, change Settings → Pages → Source to **GitHub
Actions**, then run that workflow on `main`. It checks types, builds the static
demo, and deploys it. To automate future updates, add a push trigger for `main`
after the first successful workflow deployment.

No API keys or database secrets are required. Do not place credentials in
client-side Vite variables.

## Existing backend test limitation

`pnpm test` currently reports 9 passed and 1 failed on the original repository
as well as this change. The GPU offers test mocks `getGpuOffers`, but the router
calls `getAllOffers`. This unrelated backend test is unchanged and is not a gate
for the standalone static demo.
