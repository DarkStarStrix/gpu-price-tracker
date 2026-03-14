/*
  GPU Provider Price Tracker — Data Layer
  Contains all provider data, GPU models, normalization logic, and utility functions.
  Data sourced from provider pricing pages (Lambda, RunPod, CoreWeave, TensorDock, FluidStack, Paperspace).
*/

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProviderCategory = "stable" | "marketplace" | "shifting_pool";
export type AvailabilityState = "available" | "limited" | "unavailable";
export type BillingModel = "on-demand" | "spot" | "reserved";

export interface Provider {
  id: string;
  name: string;
  category: ProviderCategory;
  website: string;
  regions: string[];
  billingModel: BillingModel;
  reliabilityScore: number;
  notes: string;
  logo?: string;
}

export interface GpuModel {
  id: string;
  name: string;
  aliases: string[];
  vramGb: number;
  architecture: string;
  generation: "current" | "previous" | "legacy";
}

export interface Offer {
  id: string;
  providerId: string;
  gpuModelId: string;
  gpuCount: number;
  vramPerGpuGb: number;
  vcpus: number;
  ramGb: number;
  storageTb: number;
  region: string;
  billingModel: BillingModel;
  pricePerGpuHr: number;
  totalNodePriceHr: number;
  availability: AvailabilityState;
  providerLink: string;
  cloudType?: string;
  observedAt: string;
  freshnessMinutes: number;
}

export interface ProviderSummary {
  provider: Provider;
  gpuInventory: string[];
  lowestPrices: Record<string, number>;
  regionCoverage: string[];
  offerCount: number;
}

export interface ComparisonRow {
  gpuModelId: string;
  gpuModelName: string;
  vramGb: number;
  providers: {
    providerId: string;
    providerName: string;
    lowestPrice: number;
    availability: AvailabilityState;
    reliabilityScore: number;
    link: string;
  }[];
  lowestOverall: number;
  bestValue: { providerId: string; score: number } | null;
}

// ─── GPU Models ──────────────────────────────────────────────────────────────

// FP16 TFLOP/s per GPU (BF16 for Hopper/Blackwell, FP16 for others)
// Sources: NVIDIA official spec sheets
export const GPU_TFLOPS: Record<string, number> = {
  "b200-sxm":     4500,  // BF16 with sparsity
  "h200-sxm":     1979,  // BF16
  "h100-sxm":     1979,  // BF16
  "a100-sxm-80":   312,  // BF16
  "a100-sxm-40":   312,
  "a100-pcie":     312,
  "l40s":          362,  // FP16
  "l40":           181,
  "rtx-4090":       82.6,
  "rtx-3090":       35.6,
  "rtx-a6000":      38.7,
  "rtx-a5000":      27.8,
  "v100":           14.0,
};

export const GPU_MODELS: GpuModel[] = [
  { id: "b200-sxm", name: "B200 SXM", aliases: ["B200", "NVIDIA B200 SXM6"], vramGb: 192, architecture: "Blackwell", generation: "current" },
  { id: "h200-sxm", name: "H200 SXM", aliases: ["H200", "NVIDIA H200 SXM"], vramGb: 141, architecture: "Hopper", generation: "current" },
  { id: "h100-sxm", name: "H100 SXM", aliases: ["H100", "NVIDIA H100 SXM5"], vramGb: 80, architecture: "Hopper", generation: "current" },
  { id: "a100-sxm-80", name: "A100 SXM 80GB", aliases: ["A100 80GB", "NVIDIA A100 SXM4 80GB"], vramGb: 80, architecture: "Ampere", generation: "previous" },
  { id: "a100-sxm-40", name: "A100 SXM 40GB", aliases: ["A100 40GB", "NVIDIA A100 SXM4 40GB"], vramGb: 40, architecture: "Ampere", generation: "previous" },
  { id: "a100-pcie", name: "A100 PCIe", aliases: ["A100 PCIE", "NVIDIA A100 PCIe"], vramGb: 80, architecture: "Ampere", generation: "previous" },
  { id: "l40s", name: "L40S", aliases: ["NVIDIA L40S"], vramGb: 48, architecture: "Ada Lovelace", generation: "current" },
  { id: "l40", name: "L40", aliases: ["NVIDIA L40"], vramGb: 48, architecture: "Ada Lovelace", generation: "current" },
  { id: "rtx-4090", name: "RTX 4090", aliases: ["4090", "GeForce RTX 4090"], vramGb: 24, architecture: "Ada Lovelace", generation: "current" },
  { id: "rtx-3090", name: "RTX 3090", aliases: ["3090", "GeForce RTX 3090"], vramGb: 24, architecture: "Ampere", generation: "previous" },
  { id: "rtx-a6000", name: "RTX A6000", aliases: ["A6000", "NVIDIA RTX A6000"], vramGb: 48, architecture: "Ampere", generation: "previous" },
  { id: "rtx-a5000", name: "RTX A5000", aliases: ["A5000", "NVIDIA RTX A5000"], vramGb: 24, architecture: "Ampere", generation: "previous" },
  { id: "v100", name: "V100", aliases: ["Tesla V100", "NVIDIA V100"], vramGb: 16, architecture: "Volta", generation: "legacy" },
];

// ─── Providers ───────────────────────────────────────────────────────────────

export const PROVIDERS: Provider[] = [
  {
    id: "lambda",
    name: "Lambda",
    category: "stable",
    website: "https://lambda.ai",
    regions: ["US-East", "US-West", "US-South", "EU-Central"],
    billingModel: "on-demand",
    reliabilityScore: 0.92,
    notes: "Enterprise-grade NVIDIA partner. Consistent pricing, 8-GPU node minimum.",
  },
  {
    id: "runpod",
    name: "RunPod",
    category: "shifting_pool",
    website: "https://www.runpod.io",
    regions: ["US", "EU", "CA"],
    billingModel: "on-demand",
    reliabilityScore: 0.85,
    notes: "Community + Secure cloud tiers. Single-GPU pods available.",
  },
  {
    id: "tensordock",
    name: "TensorDock",
    category: "marketplace",
    website: "https://www.tensordock.com",
    regions: ["US", "EU", "Asia"],
    billingModel: "on-demand",
    reliabilityScore: 0.78,
    notes: "Marketplace model with competitive pricing. Variable host quality.",
  },
  {
    id: "coreweave",
    name: "CoreWeave",
    category: "stable",
    website: "https://www.coreweave.com",
    regions: ["US-East", "US-West", "EU-West"],
    billingModel: "on-demand",
    reliabilityScore: 0.90,
    notes: "NVIDIA elite partner. Enterprise-focused, account approval required.",
  },
  {
    id: "fluidstack",
    name: "FluidStack",
    category: "shifting_pool",
    website: "https://www.fluidstack.io",
    regions: ["US", "EU", "Asia"],
    billingModel: "on-demand",
    reliabilityScore: 0.80,
    notes: "Aggregated GPU supply. Enterprise contracts available.",
  },
  {
    id: "paperspace",
    name: "Paperspace",
    category: "stable",
    website: "https://www.paperspace.com",
    regions: ["US-East", "US-West", "EU"],
    billingModel: "on-demand",
    reliabilityScore: 0.88,
    notes: "DigitalOcean subsidiary. Good ML workflow integration.",
  },
];

// ─── Offers (Normalized from provider pricing pages, March 2026) ─────────────

const NOW = new Date().toISOString();

export const OFFERS: Offer[] = [
  // Lambda
  { id: "lam-b200-1", providerId: "lambda", gpuModelId: "b200-sxm", gpuCount: 8, vramPerGpuGb: 180, vcpus: 208, ramGb: 2900, storageTb: 22, region: "US-East", billingModel: "on-demand", pricePerGpuHr: 5.74, totalNodePriceHr: 45.92, availability: "available", providerLink: "https://lambda.ai/pricing", observedAt: NOW, freshnessMinutes: 15 },
  { id: "lam-h100-1", providerId: "lambda", gpuModelId: "h100-sxm", gpuCount: 8, vramPerGpuGb: 80, vcpus: 208, ramGb: 1800, storageTb: 22, region: "US-East", billingModel: "on-demand", pricePerGpuHr: 3.44, totalNodePriceHr: 27.52, availability: "available", providerLink: "https://lambda.ai/pricing", observedAt: NOW, freshnessMinutes: 15 },
  { id: "lam-a100-80-1", providerId: "lambda", gpuModelId: "a100-sxm-80", gpuCount: 8, vramPerGpuGb: 80, vcpus: 240, ramGb: 1800, storageTb: 19.5, region: "US-West", billingModel: "on-demand", pricePerGpuHr: 2.06, totalNodePriceHr: 16.48, availability: "available", providerLink: "https://lambda.ai/pricing", observedAt: NOW, freshnessMinutes: 15 },
  { id: "lam-a100-40-1", providerId: "lambda", gpuModelId: "a100-sxm-40", gpuCount: 8, vramPerGpuGb: 40, vcpus: 124, ramGb: 1800, storageTb: 5.8, region: "US-South", billingModel: "on-demand", pricePerGpuHr: 1.48, totalNodePriceHr: 11.84, availability: "limited", providerLink: "https://lambda.ai/pricing", observedAt: NOW, freshnessMinutes: 15 },
  { id: "lam-v100-1", providerId: "lambda", gpuModelId: "v100", gpuCount: 8, vramPerGpuGb: 16, vcpus: 88, ramGb: 448, storageTb: 5.8, region: "US-East", billingModel: "on-demand", pricePerGpuHr: 0.63, totalNodePriceHr: 5.04, availability: "available", providerLink: "https://lambda.ai/pricing", observedAt: NOW, freshnessMinutes: 15 },

  // RunPod (Secure Cloud)
  { id: "rp-b200-s", providerId: "runpod", gpuModelId: "b200-sxm", gpuCount: 1, vramPerGpuGb: 192, vcpus: 32, ramGb: 256, storageTb: 1, region: "US", billingModel: "on-demand", pricePerGpuHr: 5.98, totalNodePriceHr: 5.98, availability: "limited", providerLink: "https://www.runpod.io/pricing", cloudType: "secure", observedAt: NOW, freshnessMinutes: 10 },
  { id: "rp-h200-s", providerId: "runpod", gpuModelId: "h200-sxm", gpuCount: 1, vramPerGpuGb: 141, vcpus: 26, ramGb: 250, storageTb: 1, region: "US", billingModel: "on-demand", pricePerGpuHr: 3.59, totalNodePriceHr: 3.59, availability: "available", providerLink: "https://www.runpod.io/pricing", cloudType: "secure", observedAt: NOW, freshnessMinutes: 10 },
  { id: "rp-h100-s", providerId: "runpod", gpuModelId: "h100-sxm", gpuCount: 1, vramPerGpuGb: 80, vcpus: 20, ramGb: 200, storageTb: 1, region: "US", billingModel: "on-demand", pricePerGpuHr: 2.69, totalNodePriceHr: 2.69, availability: "available", providerLink: "https://www.runpod.io/pricing", cloudType: "secure", observedAt: NOW, freshnessMinutes: 10 },
  { id: "rp-h100-c", providerId: "runpod", gpuModelId: "h100-sxm", gpuCount: 1, vramPerGpuGb: 80, vcpus: 16, ramGb: 150, storageTb: 0.5, region: "US", billingModel: "on-demand", pricePerGpuHr: 1.99, totalNodePriceHr: 1.99, availability: "available", providerLink: "https://www.runpod.io/pricing", cloudType: "community", observedAt: NOW, freshnessMinutes: 10 },
  { id: "rp-a100-s", providerId: "runpod", gpuModelId: "a100-sxm-80", gpuCount: 1, vramPerGpuGb: 80, vcpus: 16, ramGb: 125, storageTb: 0.5, region: "US", billingModel: "on-demand", pricePerGpuHr: 1.64, totalNodePriceHr: 1.64, availability: "available", providerLink: "https://www.runpod.io/pricing", cloudType: "secure", observedAt: NOW, freshnessMinutes: 10 },
  { id: "rp-a100-c", providerId: "runpod", gpuModelId: "a100-sxm-80", gpuCount: 1, vramPerGpuGb: 80, vcpus: 12, ramGb: 100, storageTb: 0.5, region: "US", billingModel: "on-demand", pricePerGpuHr: 1.24, totalNodePriceHr: 1.24, availability: "available", providerLink: "https://www.runpod.io/pricing", cloudType: "community", observedAt: NOW, freshnessMinutes: 10 },
  { id: "rp-l40s-s", providerId: "runpod", gpuModelId: "l40s", gpuCount: 1, vramPerGpuGb: 48, vcpus: 16, ramGb: 100, storageTb: 0.5, region: "US", billingModel: "on-demand", pricePerGpuHr: 0.74, totalNodePriceHr: 0.74, availability: "available", providerLink: "https://www.runpod.io/pricing", cloudType: "secure", observedAt: NOW, freshnessMinutes: 10 },
  { id: "rp-4090-s", providerId: "runpod", gpuModelId: "rtx-4090", gpuCount: 1, vramPerGpuGb: 24, vcpus: 16, ramGb: 62, storageTb: 0.5, region: "US", billingModel: "on-demand", pricePerGpuHr: 0.39, totalNodePriceHr: 0.39, availability: "available", providerLink: "https://www.runpod.io/pricing", cloudType: "secure", observedAt: NOW, freshnessMinutes: 10 },
  { id: "rp-4090-c", providerId: "runpod", gpuModelId: "rtx-4090", gpuCount: 1, vramPerGpuGb: 24, vcpus: 12, ramGb: 48, storageTb: 0.5, region: "US", billingModel: "on-demand", pricePerGpuHr: 0.34, totalNodePriceHr: 0.34, availability: "available", providerLink: "https://www.runpod.io/pricing", cloudType: "community", observedAt: NOW, freshnessMinutes: 10 },
  { id: "rp-3090-c", providerId: "runpod", gpuModelId: "rtx-3090", gpuCount: 1, vramPerGpuGb: 24, vcpus: 8, ramGb: 40, storageTb: 0.5, region: "US", billingModel: "on-demand", pricePerGpuHr: 0.22, totalNodePriceHr: 0.22, availability: "available", providerLink: "https://www.runpod.io/pricing", cloudType: "community", observedAt: NOW, freshnessMinutes: 10 },
  { id: "rp-a6000-s", providerId: "runpod", gpuModelId: "rtx-a6000", gpuCount: 1, vramPerGpuGb: 48, vcpus: 16, ramGb: 100, storageTb: 0.5, region: "US", billingModel: "on-demand", pricePerGpuHr: 0.53, totalNodePriceHr: 0.53, availability: "available", providerLink: "https://www.runpod.io/pricing", cloudType: "secure", observedAt: NOW, freshnessMinutes: 10 },

  // TensorDock
  { id: "td-h100-1", providerId: "tensordock", gpuModelId: "h100-sxm", gpuCount: 1, vramPerGpuGb: 80, vcpus: 16, ramGb: 128, storageTb: 1, region: "US", billingModel: "on-demand", pricePerGpuHr: 2.25, totalNodePriceHr: 2.25, availability: "available", providerLink: "https://www.tensordock.com/gpu-h100.html", observedAt: NOW, freshnessMinutes: 30 },
  { id: "td-a100-80-1", providerId: "tensordock", gpuModelId: "a100-sxm-80", gpuCount: 1, vramPerGpuGb: 80, vcpus: 16, ramGb: 128, storageTb: 1, region: "US", billingModel: "on-demand", pricePerGpuHr: 1.80, totalNodePriceHr: 1.80, availability: "available", providerLink: "https://www.tensordock.com/gpu-a100.html", observedAt: NOW, freshnessMinutes: 30 },
  { id: "td-a100-p-1", providerId: "tensordock", gpuModelId: "a100-pcie", gpuCount: 1, vramPerGpuGb: 80, vcpus: 12, ramGb: 96, storageTb: 0.5, region: "EU", billingModel: "on-demand", pricePerGpuHr: 1.50, totalNodePriceHr: 1.50, availability: "available", providerLink: "https://www.tensordock.com/cloud-gpus.html", observedAt: NOW, freshnessMinutes: 30 },
  { id: "td-l40-1", providerId: "tensordock", gpuModelId: "l40", gpuCount: 1, vramPerGpuGb: 48, vcpus: 12, ramGb: 96, storageTb: 0.5, region: "US", billingModel: "on-demand", pricePerGpuHr: 0.95, totalNodePriceHr: 0.95, availability: "available", providerLink: "https://www.tensordock.com/cloud-gpus.html", observedAt: NOW, freshnessMinutes: 30 },
  { id: "td-4090-1", providerId: "tensordock", gpuModelId: "rtx-4090", gpuCount: 1, vramPerGpuGb: 24, vcpus: 8, ramGb: 48, storageTb: 0.5, region: "US", billingModel: "on-demand", pricePerGpuHr: 0.35, totalNodePriceHr: 0.35, availability: "available", providerLink: "https://www.tensordock.com/cloud-gpus.html", observedAt: NOW, freshnessMinutes: 30 },
  { id: "td-3090-1", providerId: "tensordock", gpuModelId: "rtx-3090", gpuCount: 1, vramPerGpuGb: 24, vcpus: 8, ramGb: 32, storageTb: 0.5, region: "EU", billingModel: "on-demand", pricePerGpuHr: 0.20, totalNodePriceHr: 0.20, availability: "limited", providerLink: "https://www.tensordock.com/cloud-gpus.html", observedAt: NOW, freshnessMinutes: 30 },
  { id: "td-a6000-1", providerId: "tensordock", gpuModelId: "rtx-a6000", gpuCount: 1, vramPerGpuGb: 48, vcpus: 12, ramGb: 64, storageTb: 0.5, region: "US", billingModel: "on-demand", pricePerGpuHr: 0.50, totalNodePriceHr: 0.50, availability: "available", providerLink: "https://www.tensordock.com/cloud-gpus.html", observedAt: NOW, freshnessMinutes: 30 },

  // CoreWeave
  { id: "cw-h200-1", providerId: "coreweave", gpuModelId: "h200-sxm", gpuCount: 1, vramPerGpuGb: 141, vcpus: 16, ramGb: 240, storageTb: 1, region: "US-East", billingModel: "on-demand", pricePerGpuHr: 4.25, totalNodePriceHr: 4.25, availability: "limited", providerLink: "https://www.coreweave.com/pricing", observedAt: NOW, freshnessMinutes: 60 },
  { id: "cw-h100-1", providerId: "coreweave", gpuModelId: "h100-sxm", gpuCount: 1, vramPerGpuGb: 80, vcpus: 12, ramGb: 180, storageTb: 1, region: "US-East", billingModel: "on-demand", pricePerGpuHr: 2.23, totalNodePriceHr: 2.23, availability: "available", providerLink: "https://www.coreweave.com/pricing", observedAt: NOW, freshnessMinutes: 60 },
  { id: "cw-a100-80-1", providerId: "coreweave", gpuModelId: "a100-sxm-80", gpuCount: 1, vramPerGpuGb: 80, vcpus: 12, ramGb: 120, storageTb: 0.5, region: "US-West", billingModel: "on-demand", pricePerGpuHr: 2.21, totalNodePriceHr: 2.21, availability: "available", providerLink: "https://www.coreweave.com/pricing", observedAt: NOW, freshnessMinutes: 60 },
  { id: "cw-a100-40-1", providerId: "coreweave", gpuModelId: "a100-sxm-40", gpuCount: 1, vramPerGpuGb: 40, vcpus: 8, ramGb: 90, storageTb: 0.5, region: "US-East", billingModel: "on-demand", pricePerGpuHr: 1.62, totalNodePriceHr: 1.62, availability: "available", providerLink: "https://www.coreweave.com/pricing", observedAt: NOW, freshnessMinutes: 60 },
  { id: "cw-a6000-1", providerId: "coreweave", gpuModelId: "rtx-a6000", gpuCount: 1, vramPerGpuGb: 48, vcpus: 8, ramGb: 60, storageTb: 0.5, region: "EU-West", billingModel: "on-demand", pricePerGpuHr: 0.72, totalNodePriceHr: 0.72, availability: "available", providerLink: "https://www.coreweave.com/pricing", observedAt: NOW, freshnessMinutes: 60 },
  { id: "cw-a5000-1", providerId: "coreweave", gpuModelId: "rtx-a5000", gpuCount: 1, vramPerGpuGb: 24, vcpus: 8, ramGb: 48, storageTb: 0.5, region: "US-East", billingModel: "on-demand", pricePerGpuHr: 0.57, totalNodePriceHr: 0.57, availability: "available", providerLink: "https://www.coreweave.com/pricing", observedAt: NOW, freshnessMinutes: 60 },

  // FluidStack
  { id: "fs-h100-1", providerId: "fluidstack", gpuModelId: "h100-sxm", gpuCount: 1, vramPerGpuGb: 80, vcpus: 16, ramGb: 200, storageTb: 1, region: "US", billingModel: "on-demand", pricePerGpuHr: 2.45, totalNodePriceHr: 2.45, availability: "available", providerLink: "https://www.fluidstack.io/resources/pricing", observedAt: NOW, freshnessMinutes: 30 },
  { id: "fs-a100-80-1", providerId: "fluidstack", gpuModelId: "a100-sxm-80", gpuCount: 1, vramPerGpuGb: 80, vcpus: 12, ramGb: 120, storageTb: 0.5, region: "US", billingModel: "on-demand", pricePerGpuHr: 1.55, totalNodePriceHr: 1.55, availability: "available", providerLink: "https://www.fluidstack.io/resources/pricing", observedAt: NOW, freshnessMinutes: 30 },
  { id: "fs-a100-p-1", providerId: "fluidstack", gpuModelId: "a100-pcie", gpuCount: 1, vramPerGpuGb: 40, vcpus: 8, ramGb: 64, storageTb: 0.5, region: "EU", billingModel: "on-demand", pricePerGpuHr: 1.10, totalNodePriceHr: 1.10, availability: "limited", providerLink: "https://www.fluidstack.io/resources/pricing", observedAt: NOW, freshnessMinutes: 30 },
  { id: "fs-a6000-1", providerId: "fluidstack", gpuModelId: "rtx-a6000", gpuCount: 1, vramPerGpuGb: 48, vcpus: 8, ramGb: 64, storageTb: 0.5, region: "US", billingModel: "on-demand", pricePerGpuHr: 0.45, totalNodePriceHr: 0.45, availability: "available", providerLink: "https://www.fluidstack.io/resources/pricing", observedAt: NOW, freshnessMinutes: 30 },

  // Paperspace
  { id: "ps-h100-1", providerId: "paperspace", gpuModelId: "h100-sxm", gpuCount: 1, vramPerGpuGb: 80, vcpus: 24, ramGb: 240, storageTb: 1, region: "US-East", billingModel: "on-demand", pricePerGpuHr: 10.00, totalNodePriceHr: 10.00, availability: "limited", providerLink: "https://www.paperspace.com/pricing", observedAt: NOW, freshnessMinutes: 60 },
  { id: "ps-a100-1", providerId: "paperspace", gpuModelId: "a100-sxm-80", gpuCount: 1, vramPerGpuGb: 80, vcpus: 12, ramGb: 90, storageTb: 0.5, region: "US-East", billingModel: "on-demand", pricePerGpuHr: 3.09, totalNodePriceHr: 3.09, availability: "available", providerLink: "https://www.paperspace.com/pricing", observedAt: NOW, freshnessMinutes: 60 },
  { id: "ps-a6000-1", providerId: "paperspace", gpuModelId: "rtx-a6000", gpuCount: 1, vramPerGpuGb: 48, vcpus: 8, ramGb: 45, storageTb: 0.25, region: "US-West", billingModel: "on-demand", pricePerGpuHr: 1.89, totalNodePriceHr: 1.89, availability: "available", providerLink: "https://www.paperspace.com/pricing", observedAt: NOW, freshnessMinutes: 60 },
];

// ─── Synthetic Historical Price Data (7-day sparklines) ──────────────────────

function generateSparkline(basePrice: number, volatility: number = 0.05): number[] {
  const points: number[] = [];
  let price = basePrice * (1 + (Math.random() - 0.5) * volatility * 2);
  for (let i = 0; i < 14; i++) {
    const change = (Math.random() - 0.48) * volatility * basePrice;
    price = Math.max(basePrice * 0.85, Math.min(basePrice * 1.15, price + change));
    points.push(Math.round(price * 100) / 100);
  }
  return points;
}

// Pre-generate sparklines keyed by offer ID
const sparklineCache: Record<string, number[]> = {};

export function getSparkline(offerId: string, basePrice: number, volatility?: number): number[] {
  if (!sparklineCache[offerId]) {
    const v = volatility ?? (OFFERS.find(o => o.id === offerId)?.providerId === "tensordock" ? 0.12 : 0.05);
    sparklineCache[offerId] = generateSparkline(basePrice, v);
  }
  return sparklineCache[offerId];
}

// ─── Utility Functions ───────────────────────────────────────────────────────

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find(p => p.id === id);
}

export function getGpuModel(id: string): GpuModel | undefined {
  return GPU_MODELS.find(g => g.id === id);
}

export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

export function formatPriceCompact(price: number): string {
  if (price >= 10) return `$${price.toFixed(1)}`;
  return `$${price.toFixed(2)}`;
}

export function categoryLabel(cat: ProviderCategory): string {
  switch (cat) {
    case "stable": return "Stable";
    case "marketplace": return "Marketplace";
    case "shifting_pool": return "Shifting Pool";
  }
}

export function categoryColor(cat: ProviderCategory): string {
  switch (cat) {
    case "stable": return "bg-teal/15 text-teal";
    case "marketplace": return "bg-coral/15 text-coral";
    case "shifting_pool": return "bg-limited/15 text-limited";
  }
}

export function availabilityLabel(state: AvailabilityState): string {
  switch (state) {
    case "available": return "Available";
    case "limited": return "Limited";
    case "unavailable": return "Unavailable";
  }
}

export function availabilityColor(state: AvailabilityState): string {
  switch (state) {
    case "available": return "text-available";
    case "limited": return "text-limited";
    case "unavailable": return "text-unavailable";
  }
}

export function reliabilityDots(score: number): boolean[] {
  const filled = Math.round(score * 5);
  return Array.from({ length: 5 }, (_, i) => i < filled);
}

// ─── Best-Value Score ────────────────────────────────────────────────────────

export function bestValueScore(offer: Offer): number {
  const provider = getProvider(offer.providerId);
  if (!provider) return 0;
  const priceNorm = 1 / (1 + offer.pricePerGpuHr);
  const reliabilityNorm = provider.reliabilityScore;
  const availNorm = offer.availability === "available" ? 1 : offer.availability === "limited" ? 0.5 : 0;
  return (priceNorm * 0.5) + (reliabilityNorm * 0.3) + (availNorm * 0.2);
}

// ─── Comparison Builder ──────────────────────────────────────────────────────

export function buildComparisons(gpuModelIds?: string[]): ComparisonRow[] {
  const targetModels = gpuModelIds
    ? GPU_MODELS.filter(g => gpuModelIds.includes(g.id))
    : GPU_MODELS;

  return targetModels.map(gpu => {
    const gpuOffers = OFFERS.filter(o => o.gpuModelId === gpu.id);
    const providerMap = new Map<string, Offer>();

    // Keep lowest price per provider
    for (const offer of gpuOffers) {
      const existing = providerMap.get(offer.providerId);
      if (!existing || offer.pricePerGpuHr < existing.pricePerGpuHr) {
        providerMap.set(offer.providerId, offer);
      }
    }

    const providers = Array.from(providerMap.values()).map(offer => {
      const provider = getProvider(offer.providerId)!;
      return {
        providerId: offer.providerId,
        providerName: provider.name,
        lowestPrice: offer.pricePerGpuHr,
        availability: offer.availability,
        reliabilityScore: provider.reliabilityScore,
        link: offer.providerLink,
      };
    }).sort((a, b) => a.lowestPrice - b.lowestPrice);

    const lowestOverall = providers.length > 0 ? providers[0].lowestPrice : 0;

    // Best value considers reliability + availability
    let bestValue: { providerId: string; score: number } | null = null;
    for (const p of providers) {
      const offer = providerMap.get(p.providerId)!;
      const score = bestValueScore(offer);
      if (!bestValue || score > bestValue.score) {
        bestValue = { providerId: p.providerId, score };
      }
    }

    return {
      gpuModelId: gpu.id,
      gpuModelName: gpu.name,
      vramGb: gpu.vramGb,
      providers,
      lowestOverall,
      bestValue,
    };
  }).filter(row => row.providers.length > 0);
}

// ─── Provider Summary Builder ────────────────────────────────────────────────

export function buildProviderSummaries(): ProviderSummary[] {
  return PROVIDERS.map(provider => {
    const providerOffers = OFFERS.filter(o => o.providerId === provider.id);
    const gpuIds = Array.from(new Set(providerOffers.map(o => o.gpuModelId)));
    const gpuInventory = gpuIds.map(id => getGpuModel(id)?.name ?? id);
    const lowestPrices: Record<string, number> = {};
    for (const offer of providerOffers) {
      const gpuName = getGpuModel(offer.gpuModelId)?.name ?? offer.gpuModelId;
      if (!lowestPrices[gpuName] || offer.pricePerGpuHr < lowestPrices[gpuName]) {
        lowestPrices[gpuName] = offer.pricePerGpuHr;
      }
    }
    const regionCoverage = Array.from(new Set(providerOffers.map(o => o.region)));

    return {
      provider,
      gpuInventory,
      lowestPrices,
      regionCoverage,
      offerCount: providerOffers.length,
    };
  });
}
