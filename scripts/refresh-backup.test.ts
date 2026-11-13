import { expect, it, vi } from "vitest";
import { checkRefresh } from "../refresh/worker";

const slot = Date.parse("2026-11-12T19:12:00Z");

function github(status: string, conclusion: string | null, createdAt: string) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        workflow_runs: [{ status, conclusion, created_at: createdAt }],
      })
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
}

it("dispatches a missed slot through the existing main workflow", async () => {
  const request = github("completed", "success", "2026-11-12T18:53:00Z");
  await expect(checkRefresh(slot, "fixture", request)).resolves.toBe(
    "dispatched"
  );
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1]).toEqual([
    expect.stringMatching(/\/pages\.yml\/dispatches$/),
    expect.objectContaining({
      method: "POST",
      body: '{"ref":"main"}',
      redirect: "error",
    }),
  ]);
});

it.each([
  ["queued", null, "2026-11-12T19:08:00Z", "already-running"],
  ["in_progress", null, "2026-11-12T18:53:00Z", "already-running"],
  ["completed", "success", "2026-11-12T19:08:00Z", "already-refreshed"],
  ["completed", "failure", "2026-11-12T19:08:00Z", "dispatched"],
])(
  "handles a %s workflow with conclusion %s",
  async (status, conclusion, at, result) => {
    const request = github(status, conclusion, at);
    await expect(checkRefresh(slot, "fixture", request)).resolves.toBe(result);
    expect(request).toHaveBeenCalledTimes(result === "dispatched" ? 2 : 1);
  }
);

it("does not dispatch when GitHub denies the status request", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  await expect(checkRefresh(slot, "fixture", request)).rejects.toThrow(
    "GitHub workflow status request failed (HTTP 403)"
  );
  expect(request).toHaveBeenCalledTimes(1);
});
