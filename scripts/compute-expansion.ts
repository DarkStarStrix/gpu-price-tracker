import { load } from "cheerio";
import { z } from "zod";
import type { ComputeFeed, ComputeKind, ComputeRate } from "../shared/compute";
import { fetchPublicText } from "./http";
import { readVultrPlans, VULTR_PLANS_URL } from "./expanded-sources";
import { PAPERSPACE_URL } from "./pricing-pages";

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

function tableRows(html: string, headers: string[], selector = "table") {
  const $ = load(html);
  $("script,style").remove();
  const matches = $(selector)
    .toArray()
    .flatMap(table => {
      const rows = $(table)
        .find("tr")
        .toArray()
        .map(row =>
          $(row)
            .children()
            .map((_, cell) => clean($(cell).text()))
            .get()
        );
      if (rows[0]?.join("|") !== headers.join("|")) return [];
      if (
        rows.length < 2 ||
        rows.slice(1).some(row => row.length !== headers.length)
      )
        throw new Error("Incomplete pricing table");
      return [rows.slice(1)];
    });
  if (!matches.length) throw new Error("Pricing table missing");
  return matches.flat();
}

function value(text: string, pattern: RegExp) {
  const match = pattern.exec(text);
  const amount = Number(match?.[1]);
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Invalid pricing field");
  return amount;
}

function gb(text: string) {
  if (text.endsWith(" MiB")) return value(text, /^(\d+) MiB$/) / 1024;
  return value(text, /^(\d+(?:\.\d+)?)\s*Gi?B(?: (?:SSD|NVMe))?$/);
}

const dollars = (text: string) => value(text, /^\$(\d+(?:\.\d+)?)$/);
const rate = (kind: ComputeKind, id: string, price: number): ComputeRate => ({
  id,
  kind,
  model: id,
  price,
  availability: "unknown",
  billing: "on-demand",
});
const cpu = (id: string, price: number) => rate("cpu", id, price);
const sandbox = (id: string, price: number) =>
  rate("sandbox", id, Number(price.toFixed(8)));

export function parseVultrCpu(payload: unknown): ComputeRate[] {
  const cpuPlans = new Set(["vc2", "vhf", "vhp", "voc", "vdm", "vx1"]);
  return readVultrPlans(payload)
    .filter(plan => cpuPlans.has(plan.type) && !plan.gpu_count)
    .flatMap(plan => {
      const regions = plan.locations ?? [];
      const overrides = plan.location_cost ?? {};
      const sharedRegions = regions.filter(
        region => !Object.hasOwn(overrides, region)
      );
      const locations = [
        ...(sharedRegions.length
          ? [["base", sharedRegions, plan] as const]
          : []),
        ...regions
          .filter(region => Object.hasOwn(overrides, region))
          .map(region => [region, [region], overrides[region]] as const),
      ];
      return locations.flatMap(([key, markets, prices]) => {
        const specs = {
          model: plan.id,
          vcpus: plan.vcpu_count,
          memoryGb: plan.ram / 1024,
          storageGb:
            plan.disk && plan.disk_count
              ? plan.disk * plan.disk_count
              : undefined,
          region: [...markets].sort().join(" · "),
        };
        const rows: ComputeRate[] = [];
        if (plan.deploy_ondemand && prices.hourly_cost > 0)
          rows.push({
            ...cpu(`${plan.id}:${key}:on-demand`, prices.hourly_cost),
            ...specs,
          });
        if (
          plan.deploy_preemptible &&
          prices.hourly_cost_preemptible &&
          prices.hourly_cost_preemptible > 0
        )
          rows.push({
            ...cpu(`${plan.id}:${key}:spot`, prices.hourly_cost_preemptible),
            ...specs,
            billing: "spot",
          });
        return rows;
      });
    });
}

const hetznerPrices =
  "https://www.hetzner.com/_resources/app/data/app/live_data_prices.json";
const hetznerCloud = "https://www.hetzner.com/cloud/";
const hetznerPricingSchema = z.object({
  products: z.record(
    z.string(),
    z
      .object({
        locations: z.array(
          z.object({
            active: z.boolean(),
            datacenter: z.string().min(1),
            countryCode: z.string().optional(),
            prices: z.object({
              hourly: z.object({ USD: z.string().optional() }).optional(),
            }),
          })
        ),
      })
      .nullable()
  ),
});

export function parseHetzner(
  payload: unknown,
  pages: { url: string; html: string }[]
): ComputeRate[] {
  const { products } = hetznerPricingSchema.parse(payload);
  return pages.flatMap(({ url, html }) => {
    const $ = load(html);
    const plans = $(".cloud-matrix-product").not(".not-available").toArray();
    if (!plans.length) throw new Error("Hetzner cloud plans missing");
    return plans.flatMap(row => {
      const field = (selector: string) =>
        clean($(row).find(selector).first().text());
      const model = field(".name-cell .no-wrap");
      const pricing = $(row).find(
        '.hour-price-cell ho-price-container[price-type="hourly"]'
      );
      const key = pricing
        .attr("product-key")
        ?.match(/^(CLOUD_\d+)\+CLOUD_21$/)?.[1];
      const countries = pricing.attr("country")?.split(",");
      const product = key ? products[key] : undefined;
      if (
        !/^(?:CPX|CCX)\d+$/.test(model) ||
        !product ||
        !countries ||
        pricing.length !== 1
      )
        throw new Error("Unrecognized Hetzner cloud plan");
      const vcpus = value(field(".cpu-cell"), /^(\d+)(?:\s+\w+)?$/);
      const memoryGb = gb(field(".ram-cell"));
      const storageGb = gb(field(".drive-cell"));
      return product.locations
        .filter(
          location =>
            location.active && countries.includes(location.countryCode ?? "")
        )
        .map(location => ({
          ...cpu(
            `${model}:${location.datacenter}`,
            dollars(`$${location.prices.hourly?.USD ?? ""}`)
          ),
          model,
          vcpus,
          memoryGb,
          storageGb,
          region: location.datacenter,
          providerLink: url,
          terms:
            "USD cloud server rate excluding VAT and optional public IPv4.",
        }));
    });
  });
}

export function parseCivoCpu(html: string): ComputeRate[] {
  const families = [
    ["compute-standard", "Standard"],
    ["compute-cpu", "CPU optimized"],
    ["compute-performance", "Performance"],
    ["compute-ram-optimized", "RAM optimized"],
  ];
  return families.flatMap(([id, family]) =>
    tableRows(
      html,
      ["Size", "RAM", "CPU", "Storage", "Data Transfer", "Price"],
      `#${id} table`
    ).map(([size, memory, cores, storage, , price]) => ({
      ...cpu(`${id}:${size}`, value(price, /^\$(\d+(?:\.\d+)?)\s*per hour\b/)),
      model: `${family} · ${size}`,
      memoryGb: gb(memory),
      storageGb: gb(storage),
      vcpus: value(cores, /^(\d+) cores?$/),
    }))
  );
}

export function parseOvhCpu(html: string): ComputeRate[] {
  return tableRows(html, [
    "Name",
    "Memory",
    "vCore",
    "Storage",
    "Public network",
    "Private network",
    "Price(excl. taxes/hour)",
    "Price(excl. taxes/month)",
  ])
    .filter(([id]) => /^[bcrd][23]-\d+$/.test(id))
    .map(([id, memory, cores, disk, , , price]) => ({
      ...cpu(id, dollars(price)),
      memoryGb: gb(memory),
      vcpus: value(cores, /^(\d+)$/),
      storageGb: /^\d+ GB/.test(disk) ? gb(disk) : undefined,
      terms:
        "US catalog price before tax. Check location and storage options with OVHcloud.",
    }));
}

const paperspaceSpecs =
  "https://docs.digitalocean.com/products/paperspace/machines/details/machine-types/";
export function parsePaperspaceCpu(html: string, specs: string): ComputeRate[] {
  const hardware = new Map(
    tableRows(specs, ["Name", "vCPUs", "RAM (GB)", "Operating System"])
      .filter(([id, , , os]) => /^C\d+$/.test(id) && os === "Linux")
      .map(([id, cores, ram]) => [
        id,
        {
          vcpus: value(cores, /^(\d+)$/),
          memoryGb: value(ram, /^(\d+(?:\.\d+)?)$/),
        },
      ])
  );
  return tableRows(html, [
    "CPU Machine",
    "Hourly Price",
    "Subscription Plan",
  ]).map(([id, price]) => {
    const machine = hardware.get(id);
    if (!machine) throw new Error("Paperspace CPU specs missing");
    return {
      ...cpu(id, value(price, /^\$(\d+(?:\.\d+)?)\/hr$/)),
      ...machine,
      storageGb: 50,
      terms: "Linux machine compute. Persistent storage is billed separately.",
    };
  });
}

export function parseBoat(html: string): ComputeRate[] {
  return tableRows(html, ["Size", "Per hour", "CPU", "RAM", "Disk"]).map(
    ([size, price, cores, memory, disk]) => ({
      ...sandbox(size.replace(/ \*$/, ""), dollars(price)),
      model: `boat ${size.replace(/ \*$/, "")}`,
      vcpus: value(cores, /^(\d+) vCPU$/),
      memoryGb: gb(memory),
      storageGb: gb(disk),
      terms: size.startsWith("xlarge")
        ? "Requires the $100/month plan. Hourly VM usage draws from included time."
        : "Paid plan required. Hourly VM usage draws from included time, then the wallet.",
    })
  );
}

export function parseVercel(html: string): ComputeRate[] {
  const rows = new Map(
    tableRows(html, ["Resource", "Price"]).map(
      ([resource, price]) => [resource, price] as const
    )
  );
  const cpu = value(rows.get("Active CPU") ?? "", /^\$(\d+\.\d+) per hour$/);
  const ram = value(
    rows.get("Provisioned Memory") ?? "",
    /^\$(\d+\.\d+) per GB-hr$/
  );
  const plan = tableRows(html, [
    "Plan",
    "Maximum vCPUs",
    "Maximum memory",
    "Maximum open ports",
    "Disk size",
  ]).find(row => row[0] === "Pro");
  if (!plan || gb(plan[2]) !== 2 * Number(plan[1]))
    throw new Error("Vercel Pro size changed");
  return [1, 2, 4, 8]
    .filter(cores => cores <= Number(plan[1]))
    .map(vcpus => ({
      ...sandbox(`${vcpus}vcpu`, vcpus * (cpu + 2 * ram)),
      model: `${vcpus} vCPU / ${vcpus * 2} GB sandbox`,
      vcpus,
      memoryGb: vcpus * 2,
      storageGb: gb(plan[4]),
      terms:
        "Pro usage estimate at 100% CPU activity. CPU bills active time, RAM bills wall time. Plan fees, allowances and transfer excluded.",
    }));
}

export function parseCloudflareSandbox(html: string): ComputeRate[] {
  const plan = tableRows(html, ["", "Memory", "CPU", "Disk"]).find(
    row => row[0] === "Workers Paid"
  );
  if (!plan) throw new Error("Cloudflare paid rates missing");
  const mem = value(plan[1], /\$(\d+\.\d+) per additional GiB-second$/);
  const cpu = value(plan[2], /\$(\d+\.\d+) per additional vCPU-second$/);
  const disk = value(plan[3], /\$(\d+\.\d+) per additional GB-second$/);
  return tableRows(html, ["Instance Type", "vCPU", "Memory", "Disk"]).map(
    ([id, cores, memory, storage]) => {
      const [num, den = "1"] = cores.split("/");
      const vcpus = value(num, /^(\d+)$/) / value(den, /^(\d+)$/);
      const memoryGb = gb(memory);
      const storageGb = gb(storage);
      return {
        ...sandbox(
          id,
          3600 * (cpu * vcpus + mem * memoryGb + disk * storageGb)
        ),
        model: `Cloudflare ${id}`,
        vcpus,
        memoryGb,
        storageGb,
        terms:
          "Container usage estimate at 100% CPU activity. RAM and disk bill while running. Workers Paid, allowances and other services excluded.",
      };
    }
  );
}

export function parseFreestyle(html: string): ComputeRate[] {
  const rows = new Map(
    tableRows(html, ["Resource", "Price", "Included"]).map(
      ([resource, price]) => [resource, price] as const
    )
  );
  const cpu = dollars(rows.get("Hour of vCPU") ?? "");
  const ram = dollars(rows.get("Hour of GiB Memory") ?? "");
  const disk = dollars(rows.get("Hour of GiB Storage") ?? "");
  const sizes = [
    ["BusyBox", 1, 0.125, 1],
    ["Default VM", 4, 8, 32],
    ["Custom VM", 8, 16, 64],
  ] as const;
  return sizes.map(([model, vcpus, memoryGb, storageGb]) => ({
    ...sandbox(model, vcpus * cpu + memoryGb * ram + storageGb * disk),
    vcpus,
    memoryGb,
    storageGb,
    terms:
      "Allocated CPU, RAM and disk usage. Monthly allowances and plan fees excluded. Custom sizes require a paid plan.",
  }));
}

export function parseBlaxel(html: string): ComputeRate[] {
  const rows = tableRows(html, ["Resource / Item", "Description", "Rate"]);
  const active = rows.find(row => row[0] === "Active CPU");
  if (!active || !active[1].includes("allocated memory"))
    throw new Error("Blaxel active pricing missing");
  const gbSecond = value(active[2], /^\$(\d+\.\d+) \/ GB RAM · second$/);
  return [2, 4].map(memoryGb => ({
    ...sandbox(`${memoryGb}gb`, memoryGb * gbSecond * 3600),
    model: `${memoryGb} GB active sandbox`,
    memoryGb,
    terms:
      "Billed per second of active runtime by allocated RAM. CPU scales automatically. Snapshot storage is separate.",
  }));
}

export function parseNorthflank(html: string): ComputeRate[] {
  return tableRows(html, [
    "Plan",
    "vCPU",
    "Memory",
    "Per hour",
    "Per month",
  ]).map(([name, cores, memory, price]) => {
    const id = /^(nf-compute-[\d-]+)/.exec(name)?.[1];
    if (!id) throw new Error("Northflank compute plan changed");
    return {
      ...sandbox(id, dollars(price)),
      vcpus: value(cores, /^(\d+(?:\.\d+)?) vCPU$/),
      memoryGb: gb(memory),
      terms:
        "Northflank Cloud compute plan billed by the second. Persistent storage and network usage are separate.",
    };
  });
}

type ComputeSource = Omit<ComputeFeed, "observedAt" | "rates" | "status"> & {
  collect: (at: string) => Promise<ComputeRate[]>;
};
const html = (url: string) => fetchPublicText(url, "text/html", {}, 4_000_000);
const json = async (url: string): Promise<unknown> =>
  JSON.parse(await fetchPublicText(url, "application/json"));
function page(
  providerId: string,
  providerName: string,
  kind: ComputeKind,
  url: string,
  parse: (body: string) => ComputeRate[],
  providerLink = url
): ComputeSource {
  return {
    providerId,
    providerName,
    kinds: [kind],
    url,
    providerLink,
    dataSource: "pricing_page",
    collect: async () => parse(await html(url)),
  };
}

export const computeExpansion: ComputeSource[] = [
  {
    providerId: "vultr",
    providerName: "Vultr",
    kinds: ["cpu"],
    url: VULTR_PLANS_URL,
    providerLink: "https://docs.vultr.com/product-overviews/cloud-compute",
    dataSource: "api",
    collect: async () => parseVultrCpu(await json(VULTR_PLANS_URL)),
  },
  {
    providerId: "hetzner",
    providerName: "Hetzner",
    kinds: ["cpu"],
    url: hetznerPrices,
    providerLink: hetznerCloud,
    dataSource: "pricing_page",
    collect: async () => {
      const urls = ["regular-performance/", "general-purpose/"].map(
        path => hetznerCloud + path
      );
      const [prices, pages] = await Promise.all([
        json(hetznerPrices),
        Promise.all(urls.map(async url => ({ url, html: await html(url) }))),
      ]);
      return parseHetzner(prices, pages);
    },
  },
  page("civo", "Civo", "cpu", "https://www.civo.com/pricing", parseCivoCpu),
  page(
    "ovhcloud",
    "OVHcloud",
    "cpu",
    "https://us.ovhcloud.com/public-cloud/prices/",
    parseOvhCpu
  ),
  {
    providerId: "paperspace",
    providerName: "Paperspace",
    kinds: ["cpu"],
    url: PAPERSPACE_URL,
    providerLink: PAPERSPACE_URL,
    dataSource: "pricing_page",
    collect: async () => {
      const [pricing, specs] = await Promise.all([
        html(PAPERSPACE_URL),
        html(paperspaceSpecs),
      ]);
      return parsePaperspaceCpu(pricing, specs);
    },
  },
  page("boat", "boat", "sandbox", "https://docs.boat.dev/pricing", parseBoat),
  page(
    "vercel",
    "Vercel",
    "sandbox",
    "https://vercel.com/docs/sandbox/pricing",
    parseVercel
  ),
  page(
    "cloudflare",
    "Cloudflare",
    "sandbox",
    "https://developers.cloudflare.com/containers/platform/pricing/",
    parseCloudflareSandbox
  ),
  page(
    "freestyle",
    "Freestyle",
    "sandbox",
    "https://www.freestyle.sh/pricing",
    parseFreestyle
  ),
  page("blaxel", "Blaxel", "sandbox", "https://blaxel.ai/pricing", parseBlaxel),
  page(
    "northflank",
    "Northflank",
    "sandbox",
    "https://northflank.com/pricing",
    parseNorthflank
  ),
];
