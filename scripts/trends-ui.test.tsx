// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PriceTrends } from "../client/src/components/PriceTrends";
import { collect } from "./collect";
import { parseRunpod } from "./providers";
import fixture from "./fixtures/runpod.json";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("keeps provider replay and distinguishes flat prices from a return to the starting price", async () => {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const offer = parseRunpod(fixture, at)[0];
  const snapshot = await collect(
    null,
    [
      {
        id: "runpod",
        name: "RunPod",
        configured: true,
        connected: true,
        fetch: async () => ({ offers: [offer] }),
      },
    ],
    at
  );
  const [sample] = snapshot.history;
  const first = {
    ...sample,
    observedAt: new Date(now - 120_000).toISOString(),
  };
  const host = document.createElement("div");
  const root = createRoot(host);
  const render = (history: typeof snapshot.history) =>
    act(() => root.render(<PriceTrends snapshot={{ ...snapshot, history }} />));

  try {
    await render([first, sample]);
    expect(host.textContent).toContain("Unchanged in this range");
    expect(host.textContent).toContain("Provider movement timeline");
    expect(
      host.querySelector('[aria-label="Observation timeline"]')
    ).not.toBeNull();
    expect(host.textContent).not.toContain("Current pool inventory");

    const between = {
      ...sample,
      pricePerGpuHr: sample.pricePerGpuHr + 0.25,
      observedAt: new Date(now - 60_000).toISOString(),
    };
    await render([first, between, sample]);
    expect(host.textContent).toContain("0.00% net · varied in this range");
    expect(host.textContent).not.toContain("Unchanged in this range");
  } finally {
    await act(() => root.unmount());
  }
});
