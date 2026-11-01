import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  parseBlobPath,
} from "@/lib/upload-rules";

const TOKEN_LIFETIME_MS = 10 * 60 * 1000;

/**
 * Issues the short-lived token that lets the browser write straight to Vercel
 * Blob, so files bypass the 4.5 MB limit on function requests. The browser then
 * calls the documents route itself, so no upload webhook is needed.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const blob = parseBlobPath(pathname);
        if (!blob) throw new Error("Invalid upload path.");

        const contract = await prisma.contract.findUnique({
          where: { id: blob.contractId },
          select: { id: true },
        });
        if (!contract) throw new Error("Unknown contract.");

        return {
          allowedContentTypes: Object.values(CONTENT_TYPES),
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          validUntil: Date.now() + TOKEN_LIFETIME_MS,
          addRandomSuffix: false,
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
