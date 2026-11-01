/**
 * Writes page text in the form the plain text extractor reads, with a form feed
 * after each page, so page numbers survive even when a page is blank.
 */
export function joinOcrPages(pages: string[]): string {
  return pages.map((page) => page.replaceAll("\f", "")).join("\f") + "\f";
}
