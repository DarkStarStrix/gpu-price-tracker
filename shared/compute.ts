import { z } from "zod/mini";

const label = z.string().check(z.minLength(1), z.maxLength(300));
const positive = z.number().check(z.positive());

export const computeKinds = {
  cpu: { label: "CPU instances", unit: "instance-hour" },
  tpu: { label: "Cloud TPUs", unit: "chip-hour" },
  sandbox: { label: "Sandboxes", unit: "sandbox-hour" },
} as const;

const computeRateSchema = z.object({
  id: label,
  kind: z.enum(["cpu", "tpu", "sandbox"]),
  model: label,
  region: z.optional(label),
  billing: z.enum(["on-demand", "spot"]),
  price: positive,
  vcpus: z.optional(z.int().check(z.positive())),
  memoryGb: z.optional(positive),
  storageGb: z.optional(positive),
  providerLink: z.optional(z.url().check(z.startsWith("https://"))),
  terms: z.optional(label),
  availability: z.enum(["available", "unavailable", "unknown"]),
});

export const computeFeedSchema = z
  .object({
    providerId: label,
    providerName: label,
    url: z.url().check(z.startsWith("https://")),
    providerLink: z.optional(z.url().check(z.startsWith("https://"))),
    dataSource: z.optional(z.enum(["api", "pricing_page"])),
    kinds: z.optional(z.array(z.enum(["cpu", "tpu", "sandbox"]))),
    status: z.enum(["ok", "error"]),
    observedAt: z.nullable(z.iso.datetime()),
    rates: z.array(computeRateSchema).check(z.maxLength(500)),
  })
  .check(
    z.refine(
      feed =>
        new Set(feed.rates.map(rate => rate.id)).size === feed.rates.length &&
        feed.rates.every(
          rate =>
            (!feed.kinds || feed.kinds.includes(rate.kind)) &&
            (feed.dataSource !== "pricing_page" ||
              rate.availability === "unknown") &&
            `compute:${rate.kind}:${feed.providerId}:${rate.id}`.length <= 300
        ) &&
        (feed.observedAt !== null ||
          (feed.status === "error" && !feed.rates.length)),
      { message: "Invalid compute feed observations" }
    )
  );

export type ComputeFeed = z.infer<typeof computeFeedSchema>;
export type ComputeRate = z.infer<typeof computeRateSchema>;
export type ComputeKind = ComputeRate["kind"];
