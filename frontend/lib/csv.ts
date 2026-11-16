export type Cell = string | number | null;

// A name like "=HYPERLINK(...)" would run as a formula when the organizer opens the file.
const FORMULA = /^[=+\-@\t\r]/;

function cell(value: Cell): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const text = FORMULA.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const toCsv = (rows: Cell[][]) => rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";

export function downloadCsv(filename: string, csv: string) {
  // The BOM tells Excel the file is UTF-8, or accented names come out garbled.
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
