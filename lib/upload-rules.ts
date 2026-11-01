/** Upload rules shared by the browser form and the server routes. */

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const CONTENT_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
} as const;

export type UploadExtension = keyof typeof CONTENT_TYPES;

export function extensionOf(filename: string): UploadExtension | null {
  const extension = filename.split(".").pop()?.toLowerCase();
  return extension && extension in CONTENT_TYPES
    ? (extension as UploadExtension)
    : null;
}

export function blobPathFor(
  contractId: string,
  uploadId: string,
  extension: UploadExtension,
): string {
  return `contracts/${contractId}/${uploadId}/source.${extension}`;
}

const BLOB_PATH =
  /^contracts\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/source\.(pdf|docx|txt)$/;

/** Accepts only paths built by blobPathFor, so a client cannot name any other file. */
export function parseBlobPath(pathname: string) {
  const match = BLOB_PATH.exec(pathname);
  if (!match) return null;
  return {
    contractId: match[1],
    uploadId: match[2],
    extension: match[3] as UploadExtension,
  };
}
