import { expect, it } from "vitest";
import { evaluateWatches } from "../alerts/evaluate";
import {
  isPushEndpoint,
  type Evaluation,
  type Watch,
} from "../shared/watchlist";
import type { Snapshot } from "../shared/catalog";
import { parseRunpod } from "./providers";
import fixture from "./fixtures/runpod.json";

const at = "2026-11-11T17:00:00.000Z";
const offer = parseRunpod(fixture, at)[0];
const watch: Watch = {
  offerId: offer.offerId,
  label: "Test",
  price: 2,
  restock: true,
};
const empty: Evaluation = { observed: [], pending: [] };

function snapshot(
  minute: number,
  price: number,
  availability: typeof offer.availability,
  status: "ok" | "error" = "ok"
): Snapshot {
  const observedAt = new Date(Date.parse(at) + minute * 60_000).toISOString();
  return {
    version: 1,
    generatedAt: observedAt,
    offers: [{ ...offer, observedAt, pricePerGpuHr: price, availability }],
    history: [],
    sources: [
      {
        id: offer.providerId,
        name: offer.providerName,
        status,
        checkedAt: observedAt,
        lastSuccessAt: at,
        message: "",
      },
    ],
  };
}
const evaluate = (
  previous: Evaluation,
  minute: number,
  price: number,
  availability: typeof offer.availability,
  status: "ok" | "error" = "ok"
) => {
  const next = snapshot(minute, price, availability, status);
  return evaluateWatches([watch], previous, next, Date.parse(next.generatedAt));
};

it("alerts on a new target crossing and an explicit stock report, preserving the pending event across retries", () => {
  const baseline = evaluate(empty, 0, 3, "unavailable");
  expect(baseline.pending).toEqual([]);
  const unknown = evaluate(baseline, 15, 3, "unknown");
  expect(unknown.observed[0].stock).toBe("unavailable");
  const failed = evaluate(unknown, 30, 1.9, "available", "error");
  expect(failed).toEqual(unknown);
  const crossed = evaluate(failed, 45, 2, "available");
  expect(crossed.pending).toHaveLength(1);
  expect(crossed.pending[0].body).toContain("reached your target");
  expect(crossed.pending[0].body).toContain("reports available stock");
  expect(evaluate(crossed, 45, 2, "available")).toEqual(crossed);

  const delivered = { ...crossed, pending: [] };
  expect(evaluate(delivered, 60, 1.9, "available").pending).toHaveLength(0);
  expect(evaluate(delivered, 40, 3, "unavailable")).toEqual(delivered);
  const raised = evaluate(delivered, 75, 3, "limited");
  expect(evaluate(raised, 90, 1.9, "available").pending).toHaveLength(1);
});

it("accepts push services and refuses unrelated or deceptive endpoint URLs", () => {
  expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/device")).toBe(
    true
  );
  expect(
    isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/device")
  ).toBe(true);
  expect(isPushEndpoint("https://web.push.apple.com/device")).toBe(true);
  for (const url of [
    "https://127.0.0.1/device",
    "https://fcm.googleapis.com.evil.test/device",
    "https://user@web.push.apple.com/device",
    "https://web.push.apple.com:444/device",
    "http://fcm.googleapis.com/device",
  ])
    expect(isPushEndpoint(url)).toBe(false);
});
