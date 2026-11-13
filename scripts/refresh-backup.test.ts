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
      redirect: "manual",
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

it("rejects redirects without forwarding the GitHub credential", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.redirect("https://example.com/", 307));
  await expect(checkRefresh(slot, "fixture", request)).rejects.toThrow(
    "GitHub workflow status request failed (HTTP 307)"
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][1]?.redirect).toBe("manual");
});

it("warns before token expiry and still dispatches the collector", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json(
        { workflow_runs: [] },
        {
          headers: {
            "GitHub-Authentication-Token-Expiration": "2026-11-17 19:12:00 UTC",
          },
        }
      )
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  try {
    await expect(checkRefresh(slot, "fixture", request)).resolves.toBe(
      "dispatched"
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("2026-11-17T19:12:00.000Z")
    );
  } finally {
    warn.mockRestore();
  }
});

it.each([
  [401, {}, "credential rejected"],
  [403, {}, "check Actions write access"],
  [403, { "x-ratelimit-remaining": "0" }, "GitHub rate limit"],
])(
  "diagnoses a failed dispatch (HTTP %s) without logging its body",
  async (status, headers, hint) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ workflow_runs: [] }))
      .mockResolvedValueOnce(
        new Response("private response", {
          status,
          headers: headers as HeadersInit,
        })
      );
    await expect(checkRefresh(slot, "fixture", request)).rejects.toThrow(hint);
    expect(request).toHaveBeenCalledTimes(2);
  }
);
