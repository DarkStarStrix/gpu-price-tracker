export const addedProviders = {
  lium: {
    name: "Lium",
    website: "https://lium.io",
    category: "marketplace",
    notes:
      "Public node feed with separate Secure and Spot rates. Stock reflects free GPUs on each node.",
  },
  "gpu-ai": {
    name: "GPU.ai",
    website: "https://gpu.ai",
    category: "marketplace",
    notes:
      "Public pricing board with instance rates, location, and reported availability.",
  },
  openrelay: {
    name: "OpenRelay",
    website: "https://openrelay.inc",
    category: "marketplace",
    notes:
      "Public per-GPU rates for Community and Verified compute. Check stock with the provider.",
  },
  linode: {
    name: "Akamai Cloud",
    website: "https://www.linode.com",
    category: "stable",
    notes:
      "Public GPU Linode plan prices. Regional capacity is not reported by the plan API.",
  },
  oracle: {
    name: "Oracle Cloud",
    website: "https://www.oracle.com/cloud/",
    category: "stable",
    notes:
      "USD pay-as-you-go GPU rates from the OCI catalog. Billing configurations vary by shape.",
  },
  azure: {
    name: "Microsoft Azure",
    website: "https://azure.microsoft.com",
    category: "stable",
    notes:
      "USD Linux VM retail prices for selected GPU SKUs and US regions, with Spot where published.",
  },
  thunder: {
    name: "Thunder Compute",
    website: "https://www.thundercompute.com",
    category: "stable",
    notes: "Published single-GPU instance rates, billed by the minute.",
  },
  ovhcloud: {
    name: "OVHcloud",
    website: "https://us.ovhcloud.com",
    category: "stable",
    notes: "GPU instance rates from the US public cloud price list.",
  },
  canopy: {
    name: "Canopy Wave",
    website: "https://www.canopywave.com",
    category: "stable",
    notes: "Public GPU cloud rates with the published instance GPU count.",
  },
  latitude: {
    name: "Latitude.sh",
    website: "https://www.latitude.sh",
    category: "stable",
    notes:
      "Published starting hourly rates for GPU bare-metal plans. Rates may vary by location.",
  },
  denvr: {
    name: "Denvr Dataworks",
    website: "https://www.denvr.com",
    category: "stable",
    notes:
      "Published on-demand GPU and accelerator configurations. Reserved-only configurations are excluded.",
  },
  oblivus: {
    name: "Oblivus",
    website: "https://oblivus.com",
    category: "stable",
    notes:
      "Published USD per-GPU on-demand rates and listed configurations. Check stock with the provider.",
  },
  gcp: {
    name: "Google Cloud",
    website: "https://cloud.google.com",
    category: "stable",
    notes:
      "Compute Engine reference USD rates for accelerator-optimized VM configurations.",
  },
} as const;

export type AddedProviderId = keyof typeof addedProviders;
