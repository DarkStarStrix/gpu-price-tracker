// @vitest-environment happy-dom
import { Storage as BrowserStorage } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, it, expect, vi } from "vitest";
import { usePriceAlerts } from "../client/src/hooks/usePriceAlerts";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, "localStorage", {
  value: new BrowserStorage(),
  configurable: true,
});
let root: Root;
let alerts: ReturnType<typeof usePriceAlerts>;
function Probe() {
  alerts = usePriceAlerts();
  return <span>{alerts.alertCount}</span>;
}
async function mount(raw: string) {
  Object.defineProperty(globalThis, "localStorage", {
    value: new BrowserStorage(),
    configurable: true,
  });
  localStorage.setItem("gpu-price-alerts", raw);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(() => root.render(<Probe />));
}
afterEach(async () => {
  if (root) await act(() => root.unmount());
  localStorage.clear();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
it.each(["null", "[]", "bad json", '{"h100":{"targetPrice":"cheap"}}'])(
  "recovers malformed saved alerts: %s",
  async raw => {
    await mount(raw);
    expect(alerts.alertCount).toBe(0);
    expect(alerts.getAlert("constructor")).toBeUndefined();
  }
);
it("retains valid saved alerts and discards invalid neighbors", async () => {
  await mount(
    JSON.stringify({
      h100: { gpuModelId: "h100", targetPrice: 2, createdAt: 1 },
      bad: { gpuModelId: "other", targetPrice: -1, createdAt: 0 },
    })
  );
  expect(alerts.alertCount).toBe(1);
  expect(alerts.isAlertTriggered("h100", 1.9)).toBe(true);
  expect(alerts.isAlertTriggered("h100", 2.1)).toBe(false);
});
it("rejects nonfinite or nonpositive targets at the hook interface", async () => {
  await mount("{}");
  await act(() => {
    for (const price of [-1, 0, Infinity, NaN]) alerts.setAlert("h100", price);
  });
  expect(alerts.alertCount).toBe(0);
});
it("reports failed storage without claiming an alert was saved", async () => {
  await mount("{}");
  vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  let saved: unknown;
  await act(() => {
    saved = alerts.setAlert("h100", 2);
  });
  expect(saved).toBe(false);
  expect(alerts.alertCount).toBe(0);
});
it("persists multiple updates in one event and removes only the selected alert", async () => {
  await mount("{}");
  await act(() => {
    alerts.setAlert("h100", 2);
    alerts.setAlert("a100", 1);
  });
  expect(alerts.alertCount).toBe(2);
  expect(JSON.parse(localStorage.getItem("gpu-price-alerts")!)).toMatchObject({
    h100: { targetPrice: 2 },
    a100: { targetPrice: 1 },
  });
  await act(() => {
    alerts.clearAlert("h100");
  });
  expect(alerts.getAlert("h100")).toBeUndefined();
  expect(alerts.getAlert("a100")?.targetPrice).toBe(1);
});
