import { expect, it, vi } from "vitest";
import worker, { checkRefresh } from "../refresh/worker";

const slot = Date.parse("2026-11-12T19:12:00Z");

it.each([
  [14, undefined],
  [46, "Public price snapshot is overdue"],
])(
  "reports a %s-minute-old snapshot even when dispatch fails",
  async (age, issue) => {
    const request = vi.fn<typeof fetch>().mockImplementation(async url => {
      if (String(url).includes("/data/current.json?health=")) {
        return Response.json({
          generatedAt: new Date(slot - age * 60_000).toISOString(),
          sources: [
            { id: "verda", status: "error" },
            { id: "runpod", status: "ok" },
            { id: "disabled-provider", status: "not_configured" },
          ],
          compute: [{ providerId: "vultr", status: "error" }],
        });
      }
      return new Response(null, { status: 403 });
    });
    vi.stubGlobal("fetch", request);
    const clock = vi.spyOn(Date, "now").mockReturnValue(slot);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = worker.scheduled(
        { scheduledTime: slot, cron: "", noRetry() {} },
        { GITHUB_ACTIONS_TOKEN: "fixture" }
      );
      await expect(result).rejects.toThrow("status request failed (HTTP 403)");
      expect(request.mock.calls[0][1]?.headers).toBeUndefined();
      expect(log).toHaveBeenCalledWith({
        event: "collector_snapshot",
        ageMinutes: age,
        failedSources: ["gpu:verda", "compute:vultr"],
        failedSourceCount: 2,
      });
      expect(error.mock.calls).toEqual(issue ? [[issue]] : []);
    } finally {
      vi.unstubAllGlobals();
      clock.mockRestore();
      log.mockRestore();
      error.mockRestore();
    }
  }
);

it("reports a broken snapshot while still dispatching a missed slot", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("<html>Unavailable</html>"))
    .mockResolvedValueOnce(Response.json({ workflow_runs: [] }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", request);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await worker.scheduled(
      { scheduledTime: slot, cron: "", noRetry() {} },
      { GITHUB_ACTIONS_TOKEN: "fixture" }
    );
    expect(error).toHaveBeenCalledWith(
      "Public price snapshot has invalid freshness metadata"
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"result":"dispatched"')
    );
  } finally {
    vi.unstubAllGlobals();
    log.mockRestore();
    error.mockRestore();
  }
});

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
