export function gpuId(name: string, vram: number | null): string {
  const n = name
    .toLowerCase()
    .replace(/nvidia|amd|geforce|tesla|instinct/g, "")
    .trim();
  if (/\ba100\b/.test(n))
    return /sxm/.test(n)
      ? `a100-sxm-${vram ?? n.match(/(\d+)\s*gb/)?.[1] ?? "unknown"}`
      : /pcie/.test(n)
        ? `a100-pcie-${vram ?? "unknown"}`
        : `a100-${vram ?? "unknown"}`;
  if (/\bh100\b/.test(n))
    return /pcie/.test(n)
      ? "h100-pcie"
      : /nvl/.test(n)
        ? "h100-nvl"
        : /sxm/.test(n)
          ? "h100-sxm"
          : "h100-unspecified";
  if (/\bh200\b/.test(n))
    return /nvl/.test(n)
      ? "h200-nvl"
      : /sxm/.test(n)
        ? "h200-sxm"
        : "h200-unspecified";
  if (/\bb200\b/.test(n)) return "b200-sxm";
  if (/^(?:rtx\s*)?a[456]000$/.test(n))
    return `rtx-${n.replace(/^rtx\s*/, "")}`;
  return n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
