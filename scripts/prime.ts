import { z } from "zod";
import { offerSchema } from "../shared/catalog";
import { gpuId } from "./gpu";
import type { Source } from "./providers";
const url = "https://api.primeintellect.ai/api/v1/availability/gpus";
const schema = z.object({
  totalCount: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      cloudId: z.string(),
      gpuType: z.string(),
      socket: z.string(),
      provider: z.string(),
      gpuCount: z.literal(1),
      gpuMemory: z.number().positive(),
      region: z.string().nullable().optional(),
      dataCenter: z.string().nullable().optional(),
      security: z.enum(["secure_cloud", "community_cloud"]),
      stockStatus: z.string().optional(),
      prices: z.object({
        currency: z.literal("USD"),
        onDemand: z.number().positive().nullable().optional(),
        communityPrice: z.number().positive().nullable().optional(),
      }),
    })
  ),
});
export function parsePrime(payload: unknown, at: string) {
  const d = schema.parse(payload);
  if (d.totalCount !== d.items.length) throw Error("Incomplete Prime catalog");
  return d.items.flatMap(p => {
    const price =
      p.security === "secure_cloud"
        ? p.prices.onDemand
        : p.prices.communityPrice;
    if (!price) return [];
    const name = `${p.gpuType} ${p.socket}`;
    return [
      offerSchema.parse({
        offerId: `prime:${p.provider}:${p.cloudId}:${p.security}:on-demand`,
        providerId: "prime",
        providerName: "Prime Intellect",
        gpuModelId: gpuId(name, p.gpuMemory),
        gpuModelName: name,
        gpuCount: 1,
        configurationKnown: true,
        billingModel: "on-demand",
        vramPerGpuGb: p.gpuMemory,
        vcpus: null,
        ramGb: null,
        region: p.region ?? p.dataCenter ?? "Not specified",
        pricePerGpuHr: price,
        totalNodePriceHr: price,
        availability: ["Available", "High", "Medium"].includes(
          p.stockStatus ?? ""
        )
          ? "available"
          : p.stockStatus === "Low"
            ? "limited"
            : p.stockStatus === "Unavailable"
              ? "unavailable"
              : "unknown",
        providerLink: "https://app.primeintellect.ai/dashboard/create",
        sourceUrl: url,
        cloudType: p.security === "secure_cloud" ? "secure" : "community",
        dataSource: "api",
        observedAt: at,
      }),
    ];
  });
}
export function primeSource(env: NodeJS.ProcessEnv): Source {
  return {
    id: "prime",
    name: "Prime Intellect",
    connected: true,
    configured: Boolean(env.PRIME_API_KEY),
    fetch: async at => {
      const items: unknown[] = [];
      let expected: number | undefined;
      for (let page = 1; page <= 30; page++) {
        const response = await fetch(
          `${url}?gpu_count=1&page_size=100&page=${page}`,
          {
            headers: { Authorization: `Bearer ${env.PRIME_API_KEY}` },
            signal: AbortSignal.timeout(20_000),
          }
        );
        if (!response.ok) throw Error("Prime API failed");
        const payload = await response.json();
        const d = schema.parse({
          ...payload,
          totalCount: payload.items?.length,
        });
        if (!Number.isInteger(payload.totalCount) || payload.totalCount < 0)
          throw Error("Invalid pagination");
        if (expected !== undefined && expected !== payload.totalCount)
          throw Error("Catalog changed during paging");
        expected = payload.totalCount;
        items.push(...d.items);
        if (items.length === expected)
          return { offers: parsePrime({ items, totalCount: expected }, at) };
        if (!d.items.length || items.length > expected!)
          throw Error("Incomplete Prime catalog");
      }
      throw Error("Prime pagination exceeded limit");
    },
  };
}
