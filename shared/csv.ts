/** Quote every field and neutralize spreadsheet formulas, including hidden prefixes. */
export function toCSV(rows: readonly (readonly unknown[])[]): string {
  return rows
    .map(row =>
      row
        .map(value => {
          const text = String(value ?? "");
          const safe = /^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/u.test(text)
            ? `'${text}`
            : text;
          return `"${safe.replace(/"/g, '""')}"`;
        })
        .join(",")
    )
    .join("\r\n");
}
