import { z } from "zod";
import { offerSchema, type GpuOffer } from "../shared/catalog";

import { gpuId } from "./gpu";
export { gpuId } from "./gpu";
import type { SourceResult } from "../shared/catalog";
import { expandedSources } from "./expanded-sources";
import { publicPricingSources } from "./pricing-pages";

const nullableNumber = z.number().finite().nonnegative().nullable();
const capacitySchema = z
  .object({
    uninterruptablePrice: nullableNumber,
    stockStatus: z.string().nullable(),
  })
  .nullable();
const runpodSchema = z.object({
  data: z.object({
    gpuTypes: z.array(
      z.object({
        id: z.string(),
        displayName: z.string().min(1),
        memoryInGb: z.number().nonnegative(),
        secureCloud: z.boolean(),
        communityCloud: z.boolean(),
        securePrice: nullableNumber,
        communityPrice: nullableNumber,
        secure: capacitySchema,
        community: capacitySchema,
      })
    ),
  }),
});

export function parseRunpod(payload: unknown, observedAt: string): GpuOffer[] {
  if (typeof payload === "object" && payload && "errors" in payload)
    throw new Error("Provider GraphQL error");
  const { data } = runpodSchema.parse(payload);
  return data.gpuTypes.flatMap(gpu =>
    (["secure", "community"] as const).flatMap(cloud => {
      if (!(cloud === "secure" ? gpu.secureCloud : gpu.communityCloud))
        return [];
      // Catalog prices are per GPU-hour. Capacity is a separate observation, never inferred from a price.
      const price = cloud === "secure" ? gpu.securePrice : gpu.communityPrice;
      if (!price) return [];
      const stock = gpu[cloud]?.stockStatus;
      const availability =
        stock === "High" || stock === "Medium"
          ? "available"
          : stock === "Low"
            ? "limited"
            : stock === "None"
              ? "unavailable"
              : "unknown";
      return [
        offerSchema.parse({
          offerId: `runpod:${gpu.id}:${cloud}`,
          providerId: "runpod",
          providerName: "RunPod",
          gpuModelId: gpuId(gpu.displayName, gpu.memoryInGb),
          gpuModelName: gpu.displayName,
          gpuCount: 1,
          vramPerGpuGb: gpu.memoryInGb || null,
          vcpus: null,
          ramGb: null,
          region: "Not specified",
          pricePerGpuHr: price,
          totalNodePriceHr: price,
          availability,
          providerLink: "https://www.runpod.io/pricing",
          sourceUrl: "https://api.runpod.io/graphql",
          cloudType: cloud,
          dataSource: "api",
          observedAt,
        }),
      ];
    })
  );
}
const lambdaSchema = z.object({
  data: z.record(
    z.string(),
    z.object({
      instance_type: z.object({
        name: z.string(),
        gpu_description: z.string(),
        price_cents_per_hour: z.number().positive(),
        specs: z.object({
          gpus: z.number().int().positive(),
          memory_gib: z.number().positive(),
          vcpus: z.number().positive(),
        }),
      }),
      regions_with_capacity_available: z.array(z.object({ name: z.string() })),
    })
  ),
});
export function parseLambda(payload: unknown, observedAt: string): GpuOffer[] {
  return Object.entries(lambdaSchema.parse(payload).data).map(([id, row]) => {
    const item = row.instance_type;
    const nodePrice = item.price_cents_per_hour / 100;
    return offerSchema.parse({
      offerId: `lambda:${id}`,
      providerId: "lambda",
      providerName: "Lambda",
      gpuModelId: gpuId(item.gpu_description, null),
      gpuModelName: item.gpu_description,
      gpuCount: item.specs.gpus,
      vramPerGpuGb: null,
      vcpus: item.specs.vcpus,
      ramGb: item.specs.memory_gib,
      region:
        row.regions_with_capacity_available.map(r => r.name).join(", ") ||
        "No reported capacity",
      pricePerGpuHr: nodePrice / item.specs.gpus,
      totalNodePriceHr: nodePrice,
      availability: row.regions_with_capacity_available.length
        ? "available"
        : "unavailable",
      providerLink: "https://lambda.ai/pricing",
      sourceUrl: "https://cloud.lambda.ai/api/v1/instance-types",
      cloudType: "on-demand",
      dataSource: "api",
      observedAt,
    });
  });
}
async function request(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  return response.json();
}
export interface Source {
  id: string;
  name: string;
  configured: boolean;
  connected: boolean;
  fetch: (at: string) => Promise<SourceResult>;
}
export function sources(env: NodeJS.ProcessEnv = process.env): Source[] {
  return [
    {
      id: "runpod",
      name: "RunPod",
      configured: true,
      connected: true,
      fetch: async at => ({
        offers: parseRunpod(
          await request("https://api.runpod.io/graphql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: `{ gpuTypes { id displayName memoryInGb secureCloud communityCloud securePrice communityPrice secure: lowestPrice(input: {gpuCount: 1, secureCloud: true}) { uninterruptablePrice stockStatus } community: lowestPrice(input: {gpuCount: 1, secureCloud: false}) { uninterruptablePrice stockStatus } } }`,
            }),
          }),
          at
        ),
      }),
    },
    {
      id: "lambda",
      name: "Lambda",
      configured: Boolean(env.LAMBDA_API_KEY),
      connected: true,
      fetch: async at => ({
        offers: parseLambda(
          await request("https://cloud.lambda.ai/api/v1/instance-types", {
            headers: { Authorization: `Bearer ${env.LAMBDA_API_KEY}` },
          }),
          at
        ),
      }),
    },
    ...publicPricingSources(),
    ...expandedSources(),
    ...[
      ["tensordock", "TensorDock"],
      ["fluidstack", "FluidStack"],
    ].map(([id, name]) => ({
      id,
      name,
      configured: false,
      connected: false,
      fetch: async () => ({ offers: [] }),
    })),
  ];
}
