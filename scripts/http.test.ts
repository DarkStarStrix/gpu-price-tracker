import { afterEach, it, expect, vi } from "vitest";
import { fetchPublicText } from "./http";
afterEach(() => vi.unstubAllGlobals());
function respond(
  body: BodyInit,
  headers: Record<string, string> = {},
  status = 200
) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(body, {
          status,
          headers: { "Content-Type": "application/json", ...headers },
        })
      )
  );
}
it("reads valid provider JSON with a bounded request and preserves POST options", async () => {
  respond('{"data":[]}');
  expect(
    await fetchPublicText("https://example.com", "application/json", {
      method: "POST",
      body: "query",
    })
  ).toBe('{"data":[]}');
  expect(fetch).toHaveBeenCalledWith(
    "https://example.com",
    expect.objectContaining({
      method: "POST",
      body: "query",
      signal: expect.any(AbortSignal),
    })
  );
});
it("rejects HTTP errors, mismatched content and malformed UTF-8", async () => {
  respond("no", {}, 503);
  await expect(
    fetchPublicText("https://example.com", "application/json")
  ).rejects.toThrow();
  respond("<html>", { "Content-Type": "text/html" });
  await expect(
    fetchPublicText("https://example.com", "application/json")
  ).rejects.toThrow();
  respond(new Uint8Array([255]));
  await expect(
    fetchPublicText("https://example.com", "application/json")
  ).rejects.toThrow();
});
it("enforces advertised and streamed size limits, including absent content-length", async () => {
  respond("small", { "Content-Length": "2000001" });
  await expect(
    fetchPublicText("https://example.com", "application/json")
  ).rejects.toThrow("limit");
  const cancel = vi.fn();
  let reads = 0;
  const body = new ReadableStream({
    pull(controller) {
      reads++;
      controller.enqueue(new Uint8Array(1_000_001));
    },
    cancel,
  });
  respond(body);
  await expect(
    fetchPublicText("https://example.com", "application/json")
  ).rejects.toThrow("limit");
  expect(cancel).toHaveBeenCalledOnce();
  expect(reads).toBeLessThanOrEqual(3);
});
