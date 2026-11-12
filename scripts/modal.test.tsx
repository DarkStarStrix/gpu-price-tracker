// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, it, expect, vi } from "vitest";
import { ComparisonDrawer } from "../client/src/components/ComparisonDrawer";
import { PriceAlertModal } from "../client/src/components/PriceAlertModal";
import { AvailabilityBadge } from "../client/src/components/AvailabilityBadge";
import { parseRunpod } from "./providers";
import fixture from "./fixtures/runpod.json";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => {
  if (root) await act(() => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
});
function mount() {
  const trigger = document.createElement("button");
  trigger.textContent = "Compare";
  document.body.append(trigger);
  trigger.focus();
  const animated = document.createElement("section");
  animated.style.transform = "translateY(0)";
  document.body.append(animated);
  root = createRoot(animated);
  return { animated, trigger };
}
const offers = parseRunpod(fixture, "2026-11-05T18:00:00Z").slice(0, 2);
describe("dialogs escape dashboard transforms", () => {
  it("mounts comparison at body level, traps keyboard focus, closes once and restores focus/scroll", async () => {
    const { animated, trigger } = mount();
    const close = vi.fn();
    await act(() =>
      root.render(
        <ComparisonDrawer
          offers={offers}
          onClose={close}
          hours={168}
          through={Date.now()}
          anchored={false}
          onHoursChange={() => {}}
          shareUrl="https://example.test/?view=offers"
          missingSharedCount={0}
        />
      )
    );
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(animated.contains(dialog)).toBe(false);
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(dialog);
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(
      (document.activeElement as HTMLElement).getAttribute("aria-label")
    ).toBe("Close comparison");
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(dialog.textContent).toContain("USD / GPU-hour");
    expect(dialog.textContent).not.toContain("Multi-Dimensional Analysis");
    await act(() => root.render(null));
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });
  it("mounts alerts outside the same transformed section", async () => {
    const { animated } = mount();
    await act(() =>
      root.render(
        <PriceAlertModal
          gpuModelId="h100-sxm"
          gpuModelName="H100"
          currentPrice={3}
          onSave={() => {}}
          onClear={() => {}}
          onClose={() => {}}
          existingAlert={undefined}
        />
      )
    );
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(animated.contains(dialog)).toBe(false);
    expect(dialog.getAttribute("aria-labelledby")).toBe("price-alert-title");
  });
  it("turns missing stock into a provider action without inventing availability", async () => {
    mount();
    await act(() =>
      root.render(
        <AvailabilityBadge
          state="unknown"
          providerLink="https://example.com/gpu"
        />
      )
    );
    expect(document.querySelector("a")?.textContent).toBe("Check stock ↗");
    expect(document.body.textContent).not.toContain("Unknown");
    await act(() =>
      root.render(
        <AvailabilityBadge
          state="limited"
          providerLink="https://example.com/gpu"
        />
      )
    );
    expect(document.body.textContent).toBe("CompareLimited");
    expect(document.querySelector("a")).toBeNull();
  });
});

it("cancels saved-alert dismissal after the modal unmounts", async () => {
  vi.useFakeTimers();
  mount();
  const close = vi.fn();
  const save = vi.fn();
  await act(() =>
    root.render(
      <PriceAlertModal
        gpuModelId="h100"
        gpuModelName="H100"
        currentPrice={3}
        existingAlert={undefined}
        onSave={save}
        onClear={() => {}}
        onClose={close}
      />
    )
  );
  const button = Array.from(document.querySelectorAll("button")).find(b =>
    b.textContent?.includes("Set Alert")
  )!;
  await act(() => button.click());
  expect(save).toHaveBeenCalledWith("h100", 2.7);
  await act(() => root.render(null));
  await act(() => vi.advanceTimersByTime(1000));
  expect(close).not.toHaveBeenCalled();
});
it("keeps the alert dialog open and reports an unsuccessful save", async () => {
  mount();
  const close = vi.fn();
  await act(() =>
    root.render(
      <PriceAlertModal
        gpuModelId="h100"
        gpuModelName="H100"
        currentPrice={3}
        existingAlert={undefined}
        onSave={() => false}
        onClear={() => {}}
        onClose={close}
      />
    )
  );
  const button = Array.from(document.querySelectorAll("button")).find(b =>
    b.textContent?.includes("Set Alert")
  )!;
  await act(() => button.click());
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not save"
  );
  expect(close).not.toHaveBeenCalled();
});
