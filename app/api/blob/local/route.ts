import { NextResponse } from "next/server";

import { usesVercelBlob, writeLocalBlob } from "@/lib/blob";
import { MAX_UPLOAD_BYTES, parseBlobPath } from "@/lib/upload-rules";

/** Stands in for Vercel Blob during local development. Absent once a token is set. */
export async function PUT(request: Request) {
  if (usesVercelBlob()) {
    return new NextResponse(null, { status: 404 });
  }

  const pathname = new URL(request.url).searchParams.get("pathname") ?? "";
  if (!parseBlobPath(pathname)) {
    return NextResponse.json({ error: "invalidRequest" }, { status: 400 });
  }

  const data = Buffer.from(await request.arrayBuffer());
  if (data.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "fileSize" }, { status: 413 });
  }

  await writeLocalBlob(pathname, data);
  return new NextResponse(null, { status: 201 });
}
