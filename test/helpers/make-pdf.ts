/** Builds a small text PDF in memory, so the tests carry no binary PDF fixtures. */

const WIN_ANSI_EXTRAS: Record<string, number> = {
  "€": 0x80,
  "…": 0x85,
  Œ: 0x8c,
  "’": 0x92,
  "–": 0x96,
  "—": 0x97,
  œ: 0x9c,
};

function toPdfString(text: string): string {
  let out = "";
  for (const character of text) {
    const code = WIN_ANSI_EXTRAS[character] ?? character.codePointAt(0)!;
    if (code > 0xff) throw new Error(`Not in WinAnsi: ${character}`);
    const byte = String.fromCharCode(code);
    out += "\\()".includes(byte) ? `\\${byte}` : byte;
  }
  return out;
}

export function makeTextPdf(pages: string[][]): Buffer {
  const objects: string[] = [];
  const fontId = 3 + pages.length * 2;
  const pageIds = pages.map((_, index) => 3 + index * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] =
    `<< /Type /Pages /Count ${pages.length} ` +
    `/Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  pages.forEach((lines, index) => {
    const pageId = pageIds[index];
    const body = lines.map((line) => `(${toPdfString(line)}) Tj T*`).join("\n");
    const stream = lines.length
      ? `BT /F1 11 Tf 50 790 Td 14 TL\n${body}\nET`
      : "";
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Contents ${pageId + 1} 0 R ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
    objects[pageId + 1] =
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  objects[fontId] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xrefAt}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}
