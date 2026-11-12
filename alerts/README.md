# Background watchlists

The GitHub Pages site registers a notification service worker when someone saves a watch. Cloudflare Workers and D1 keep that browser's subscription and exact listing rules. The existing GitHub Actions workflow evaluates the newly published snapshot and sends encrypted Web Push notifications. Opening a notification opens that listing's Trends view.

A first successful observation establishes a baseline. Subsequent observations alert when the price moves from above the target to at or below it, or when the provider reports available stock after a different or unknown state. Failed, stale, missing, and repeated observations do not trigger an alert. An unknown stock response preserves the last reported stock state. Each browser can save up to 20 listings. Delivery depends on scheduled collection, the browser's notification permission, and its push service.

## Activate the service

1. Authenticate Wrangler to the Cloudflare account for the tracker with `pnpm dlx wrangler@4.160.1 login`. Use a free Workers account and keep the GitHub Pages origin.
2. Create the database with `pnpm dlx wrangler@4.160.1 d1 create gpu-price-watchlists`. Copy `alerts/wrangler.example.jsonc` to `alerts/wrangler.local.jsonc` and enter the resulting database ID.
3. Generate one P-256 VAPID key pair and a separate 32-byte hex dispatch token. Keep the VAPID private key and dispatch token in a secure local store. Put the VAPID public key in `VAPID_PUBLIC_KEY` in the local Wrangler config.
4. Initialize D1 with `pnpm dlx wrangler@4.160.1 d1 execute gpu-price-watchlists --remote --config alerts/wrangler.local.jsonc --file alerts/schema.sql`. Deploy with `pnpm dlx wrangler@4.160.1 deploy --config alerts/wrangler.local.jsonc` and add `DISPATCH_TOKEN` with `pnpm dlx wrangler@4.160.1 secret put DISPATCH_TOKEN --config alerts/wrangler.local.jsonc`.
5. In GitHub Actions, set the `WATCH_VAPID_PUBLIC` variable and the `WATCH_VAPID_PRIVATE` and `WATCH_DISPATCH_TOKEN` secrets. The dispatch secret must match the Worker's token. Set `WATCH_API_URL` to the Worker HTTPS origin after the other values are set.
6. Run **Refresh prices and deploy Pages**. The build embeds the Worker origin, and the alerts job starts after Pages deploys. Check the Worker config from the Pages origin, then save a watch on a supported browser and test delivery with the tab closed.

The dispatcher stores pending notifications before sending and retries transient failures on the next run. Expired browser subscriptions are removed. Subscriptions and secret keys stay outside the public repository and Pages assets. Existing subscribers depend on the VAPID key pair, so retain it across deployments.
