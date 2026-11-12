// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OffersTable } from "../client/src/components/OffersTable";
import { loadCatalog } from "../client/src/lib/catalog";
import { collect } from "./collect";
import { parseRunpod } from "./providers";
import fixture from "./fixtures/runpod.json";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("compares offers across pages and filters without plotting unreported specifications", async () => {
  const at = new Date().toISOString();
  const base = parseRunpod(fixture, at)[0];
  const offers = Array.from({ length: 28 }, (_, index) => ({
    ...base,
    offerId: `runpod:offer-${index + 1}`,
    gpuModelName: `Test GPU ${index + 1}`,
    pricePerGpuHr: index + 1,
    totalNodePriceHr: index + 1,
    configurationKnown: index > 0,
    vcpus: index > 0 ? 12 : null,
    ramGb: index > 0 ? 48 : null,
    billingModel: index > 0 ? ("on-demand" as const) : ("spot" as const),
  }));
  const snapshot = await collect(
    null,
    [
      {
        id: "runpod",
        name: "RunPod",
        configured: true,
        connected: true,
        fetch: async () => ({ offers }),
      },
    ],
    at
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot })
  );
  vi.stubGlobal("localStorage", { getItem: () => null });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const button = (label: string, parent: ParentNode = host) =>
    [...parent.querySelectorAll("button")].find(
      b => b.textContent?.trim() === label
    )!;
  const checkboxes = () => [
    ...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ];

  try {
    await loadCatalog();
    await act(() => root.render(<OffersTable />));
    expect(checkboxes()).toHaveLength(25);
    await act(() => checkboxes()[0].click());
    expect(host.textContent).toContain("1 of 3 selected");

    await act(() => button("Next").click());
    expect(checkboxes()).toHaveLength(3);
    expect(host.textContent).toContain("26–28 of 28");
    await act(() => checkboxes()[0].click());
    expect(host.textContent).toContain("2 of 3 selected");

    const billing = [...host.querySelectorAll("select")].find(s =>
      s.parentElement?.textContent?.startsWith("Billing")
    )!;
    await act(() => {
      billing.value = "spot";
      billing.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(checkboxes()).toHaveLength(1);
    expect(host.textContent).toContain("2 of 3 selected");

    const compare = button("Compare 2");
    compare.focus();
    await act(() => compare.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("mixes GPU models or billing types");
    expect(dialog.textContent).toContain("$26.000");
    const first = dialog.querySelector('[data-series="runpod:offer-1"]')!;
    expect(
      first.querySelector('[data-metric="USD / GPU-hour"]')
    ).not.toBeNull();
    expect(first.querySelector('[data-metric="GPUs / node"]')).toBeNull();
    expect(first.querySelector('[data-metric="USD / node-hour"]')).toBeNull();
    expect(first.querySelector('[data-metric="vCPUs"]')).toBeNull();
    const toggles = [
      ...dialog.querySelectorAll<HTMLButtonElement>("[aria-pressed]"),
    ];
    await act(() => toggles[0].click());
    expect(dialog.querySelectorAll("[data-series]")).toHaveLength(1);
    expect(toggles[1].disabled).toBe(true);
    expect(dialog.textContent).toContain("$1.000");

    await act(() =>
      dialog
        .querySelector<HTMLButtonElement>('[aria-label="Close comparison"]')!
        .click()
    );
    expect(document.activeElement).toBe(button("Compare 2"));
    await act(() => button("Clear selection").click());
    expect(host.querySelector('[aria-label="Selected offers"]')).toBeNull();
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
