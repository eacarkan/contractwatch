import { joinOcrPages } from "@/lib/ocr/join-pages";

/** Tesseract reads scans best at about 300 dpi; PDF units are 1/72 inch. */
const RENDER_DPI = 300;
const MAX_CANVAS_SIDE = 5000;

/**
 * Reads a scanned PDF in the browser, because Tesseract cannot run in a Vercel
 * function. Both libraries load only when a scan needs them. Tesseract fetches
 * its engine and language data on first use; the pages stay on this machine.
 */
export async function readScannedPdf(
  file: File,
  onPage: (page: number, pages: number) => void,
): Promise<string> {
  const [pdfjs, { createWorker }] = await Promise.all([
    import("pdfjs-dist"),
    import("tesseract.js"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() })
    .promise;
  const worker = await createWorker("fra+eng");

  try {
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      onPage(number, pdf.numPages);
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(
        RENDER_DPI / 72,
        MAX_CANVAS_SIDE / Math.max(base.width, base.height),
      );
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport }).promise;

      const { data } = await worker.recognize(canvas);
      pages.push(data.text);
      page.cleanup();
      canvas.width = 0;
    }
    return joinOcrPages(pages);
  } finally {
    await worker.terminate();
    await pdf.destroy();
  }
}
