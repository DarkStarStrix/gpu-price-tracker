/**
 * Product definitions for GPU Price Tracker SaaS
 * Single source of truth for plan features and Stripe price IDs.
 */

export const PLANS = {
  free: {
    name: "Free",
    priceMonthly: 0,
    features: [
      "Live GPU offers table",
      "Market stats & metrics",
      "Price trends chart",
    ],
    limits: {
      offersVisible: 10,  // show first 10 rows, rest blurred
    },
  },
  pro: {
    name: "Pro",
    priceMonthly: 10,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? "", // set after creating price in Stripe
    features: [
      "Everything in Free",
      "Full offers table (all rows)",
      "GPU comparison drawer",
      "Price alerts with coral highlights",
      "CSV export",
      "7-day sparklines",
      "API key settings",
    ],
    limits: {
      offersVisible: Infinity,
    },
  },
} as const;

export type Plan = keyof typeof PLANS;

/** Features locked behind Pro */
export const PRO_FEATURES = [
  "comparison",
  "alerts",
  "csv_export",
  "sparklines",
  "settings",
  "full_table",
] as const;

export type ProFeature = (typeof PRO_FEATURES)[number];
