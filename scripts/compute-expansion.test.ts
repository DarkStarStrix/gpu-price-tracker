import { expect, it } from "vitest";
import {
  parseCloudflareSandbox,
  parseHetzner,
  parseVultrCpu,
} from "./compute-expansion";

it("uses Vultr's exact regional and interruptible rates without claiming stock or including GPUs", () => {
  const plan = {
    id: "vc2-test",
    type: "vc2",
    hourly_cost: 0.1,
    hourly_cost_preemptible: 0.05,
    vcpu_count: 2,
    ram: 4096,
    disk: 20,
    disk_count: 1,
    deploy_ondemand: true,
    deploy_preemptible: true,
    locations: ["atl", "ewr", "sao"],
    location_cost: { sao: { hourly_cost: 0.2, hourly_cost_preemptible: 0.08 } },
  };
  const payload = {
    plans: [plan, { ...plan, id: "gpu", gpu_count: 1 }],
    meta: { total: 2, links: { next: "" } },
  };
  expect(parseVultrCpu(payload)).toMatchObject([
    {
      region: "atl · ewr",
      price: 0.1,
      billing: "on-demand",
      availability: "unknown",
    },
    { region: "atl · ewr", price: 0.05, billing: "spot" },
    { region: "sao", price: 0.2, billing: "on-demand" },
    { region: "sao", price: 0.08, billing: "spot" },
  ]);
  expect(() =>
    parseVultrCpu({ ...payload, meta: { total: 3, links: { next: "more" } } })
  ).toThrow("Incomplete");
});

it("joins Hetzner specs to USD for the matching datacenter and excludes inactive locations", () => {
  const html = `<div class="cloud-matrix-product">
    <div class="name-cell"><span class="no-wrap">CPX22</span></div>
    <div class="cpu-cell">2 AMD</div><div class="ram-cell">4 GB</div><div class="drive-cell">80 GB NVMe</div>
    <div class="hour-price-cell"><ho-price-container price-type="hourly" country="de,fi" product-key="CLOUD_142+CLOUD_21"></ho-price-container></div>
  </div>`;
  const location = {
    countryCode: "de",
    datacenter: "FSN1",
    active: true,
    prices: { hourly: { USD: "0.024", EUR: "0.019" } },
  };
  const products = {
    CLOUD_142: {
      locations: [
        location,
        { ...location, datacenter: "HEL1", countryCode: "fi", active: false },
        { ...location, datacenter: "ASH1", countryCode: "us" },
      ],
    },
  };
  const pages = [
    { url: "https://www.hetzner.com/cloud/regular-performance/", html },
  ];
  expect(parseHetzner({ products }, pages)).toMatchObject([
    {
      model: "CPX22",
      region: "FSN1",
      price: 0.024,
      vcpus: 2,
      memoryGb: 4,
      storageGb: 80,
      providerLink: pages[0].url,
    },
  ]);
  expect(() => parseHetzner({ products: {} }, pages)).toThrow(
    "Unrecognized Hetzner"
  );
});

it("includes Cloudflare provisioned disk and fractional vCPU in the full-activity estimate", () => {
  const html = `
    <table><tr><th></th><th>Memory</th><th>CPU</th><th>Disk</th></tr>
    <tr><td>Workers Paid</td><td>$0.0000025 per additional GiB-second</td><td>$0.000020 per additional vCPU-second</td><td>$0.00000007 per additional GB-second</td></tr></table>
    <table><tr><th>Instance Type</th><th>vCPU</th><th>Memory</th><th>Disk</th></tr>
    <tr><td>lite</td><td>1/16</td><td>256 MiB</td><td>2 GB</td></tr></table>`;
  expect(parseCloudflareSandbox(html)).toMatchObject([
    {
      id: "lite",
      price: 0.007254,
      vcpus: 0.0625,
      memoryGb: 0.25,
      storageGb: 2,
      availability: "unknown",
    },
  ]);
  expect(() =>
    parseCloudflareSandbox(html.replace("GB-second", "GB-month"))
  ).toThrow("Invalid pricing field");
});
