export type ExportCell = string | number | null;

/**
 * Spreadsheet programs run a cell that starts with one of these as a formula, and
 * this text comes from uploaded documents and a model.
 */
function neutraliseFormula(value: string) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: ExportCell) {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const text = neutraliseFormula(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The byte order mark makes Excel read French accents correctly. */
export function toCsv(rows: ExportCell[][]) {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function formatIsoDate(date: Date | undefined) {
  return date ? date.toISOString().slice(0, 10) : null;
}
