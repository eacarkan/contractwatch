/** Finds a quote in clause text, however the line breaks and spaces fall. */
export function locateQuote(
  body: string,
  quote: string,
): { start: number; end: number } | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const pattern = words
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(pattern).exec(body);
  return match
    ? { start: match.index, end: match.index + match[0].length }
    : null;
}
