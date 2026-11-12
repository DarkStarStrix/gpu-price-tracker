/** Bounded public-provider transport. Callers own parsing and evidence retention. */
export async function fetchPublicText(
  url: string,
  accept: string,
  options: RequestInit = {},
  maxBytes = 2_000_000
): Promise<string> {
  const headers = new Headers(options.headers);
  headers.set("Accept", accept);
  headers.set("User-Agent", "gpu-price-tracker/2.0 (public pricing collector)");
  const response = await fetch(url, {
    ...options,
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.toLowerCase().includes(accept)
  ) {
    await response.body?.cancel();
    throw new Error("Provider HTTP failure (status or content type)");
  }
  if (!response.body) throw new Error("Provider response has no body");
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body.cancel();
    throw new Error("Provider response exceeds limit");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Provider response exceeds limit");
      }
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks)
    );
  } finally {
    reader.releaseLock();
  }
}
