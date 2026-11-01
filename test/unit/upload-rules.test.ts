import { describe, expect, it } from "vitest";

import { blobPathFor, extensionOf, parseBlobPath } from "@/lib/upload-rules";

const CONTRACT_ID = "11111111-1111-4111-8111-111111111111";
const UPLOAD_ID = "22222222-2222-4222-8222-222222222222";

describe("extensionOf", () => {
  it("accepts PDF, DOCX and text in any case", () => {
    expect(extensionOf("conditions.PDF")).toBe("pdf");
    expect(extensionOf("conditions.docx")).toBe("docx");
    expect(extensionOf("conditions.anon.txt")).toBe("txt");
  });

  it("rejects everything else", () => {
    expect(extensionOf("conditions.doc")).toBeNull();
    expect(extensionOf("conditions")).toBeNull();
  });
});

describe("parseBlobPath", () => {
  it("reads back a path built by blobPathFor", () => {
    const path = blobPathFor(CONTRACT_ID, UPLOAD_ID, "pdf");

    expect(parseBlobPath(path)).toEqual({
      contractId: CONTRACT_ID,
      uploadId: UPLOAD_ID,
      extension: "pdf",
    });
  });

  it.each([
    "../../etc/passwd",
    `contracts/${CONTRACT_ID}/../../secret/source.pdf`,
    `contracts/${CONTRACT_ID}/${UPLOAD_ID}/other.pdf`,
    `contracts/${CONTRACT_ID}/${UPLOAD_ID}/source.exe`,
    `other/${CONTRACT_ID}/${UPLOAD_ID}/source.pdf`,
  ])("rejects %s", (path) => {
    expect(parseBlobPath(path)).toBeNull();
  });
});
