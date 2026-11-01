import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { get } from "@vercel/blob";

import { getEnv } from "@/lib/env";

const LOCAL_ROOT = join(process.cwd(), ".local-blob");

/**
 * Local development runs offline: with no Blob store, uploads go to a gitignored
 * folder. lib/env.ts requires the store on Vercel, so the folder is never used there.
 */
export function usesVercelBlob(): boolean {
  return Boolean(getEnv().BLOB_STORE_ID);
}

/** Callers must pass a path already checked by parseBlobPath. */
export async function writeLocalBlob(
  pathname: string,
  data: Buffer,
): Promise<void> {
  const file = join(LOCAL_ROOT, pathname);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
}

/** Returns null when no file exists at this path. */
export async function readBlob(pathname: string): Promise<Buffer | null> {
  if (usesVercelBlob()) {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }

  try {
    return await readFile(join(LOCAL_ROOT, pathname));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
