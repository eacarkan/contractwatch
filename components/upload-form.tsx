"use client";

import { upload } from "@vercel/blob/client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { DocKind } from "@/lib/generated/prisma/enums";
import type { IngestResult } from "@/lib/ingest";
import {
  blobPathFor,
  CONTENT_TYPES,
  extensionOf,
  MAX_UPLOAD_BYTES,
  type UploadExtension,
} from "@/lib/upload-rules";

type Step = "idle" | "uploading" | "processing";
type Outcome =
  | { type: "error"; code: string }
  | {
      type: "done";
      filename: string;
      result: Extract<IngestResult, { ok: true }>;
    };

async function writeToStorage(
  storage: "blob" | "local",
  pathname: string,
  file: File,
  extension: UploadExtension,
) {
  if (storage === "blob") {
    await upload(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/blob/upload",
      contentType: CONTENT_TYPES[extension],
    });
    return;
  }

  const response = await fetch(
    `/api/blob/local?pathname=${encodeURIComponent(pathname)}`,
    { method: "PUT", body: file },
  );
  if (!response.ok) throw new Error("Local storage rejected the file.");
}

export function UploadForm({
  contractId,
  storage,
}: {
  contractId: string;
  storage: "blob" | "local";
}) {
  const t = useTranslations("Documents");
  const kinds = useTranslations("DocKind");
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    setOutcome(null);

    if (!(file instanceof File) || file.size === 0) {
      setOutcome({ type: "error", code: "chooseFile" });
      return;
    }
    const extension = extensionOf(file.name);
    if (!extension) {
      setOutcome({ type: "error", code: "fileType" });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setOutcome({ type: "error", code: "fileSize" });
      return;
    }

    const pathname = blobPathFor(contractId, crypto.randomUUID(), extension);

    try {
      setStep("uploading");
      await writeToStorage(storage, pathname, file, extension);
    } catch (error) {
      console.error(error);
      setStep("idle");
      setOutcome({ type: "error", code: "uploadFailed" });
      return;
    }

    setStep("processing");
    const response = await fetch(`/api/contracts/${contractId}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pathname,
        filename: file.name,
        kind: data.get("kind"),
      }),
    });
    const result = await response.json().catch(() => null);
    setStep("idle");

    if (!response.ok) {
      setOutcome({ type: "error", code: result?.error ?? "extractionFailed" });
    } else {
      setOutcome({ type: "done", filename: file.name, result });
      form.reset();
    }
    router.refresh();
  }

  const busy = step !== "idle";

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border grid gap-4 rounded-lg border bg-white p-4"
    >
      <h2 className="font-heading text-xl font-semibold">
        {t("upload.title")}
      </h2>

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="kind">{t("upload.kind")}</Label>
          <NativeSelect
            id="kind"
            name="kind"
            defaultValue={DocKind.GENERAL_CONDITIONS}
          >
            {Object.values(DocKind).map((kind) => (
              <NativeSelectOption key={kind} value={kind}>
                {kinds(kind)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <div className="grid min-w-64 flex-1 gap-1.5">
          <Label htmlFor="file">{t("upload.file")}</Label>
          <Input
            id="file"
            name="file"
            type="file"
            accept={Object.keys(CONTENT_TYPES)
              .map((extension) => `.${extension}`)
              .join(",")}
            aria-describedby="file-hint"
          />
        </div>

        <Button type="submit" disabled={busy}>
          {t(`upload.${busy ? step : "submit"}`)}
        </Button>
      </div>

      <p id="file-hint" className="text-muted-foreground text-sm">
        {t("upload.hint")}
      </p>

      <div aria-live="polite" className="empty:hidden">
        {outcome?.type === "error" && (
          <p role="alert" className="text-destructive text-sm">
            {t.has(`errors.${outcome.code}`)
              ? t(`errors.${outcome.code}`)
              : t("errors.extractionFailed")}
          </p>
        )}
        {outcome?.type === "done" && (
          <div className="grid gap-1 text-sm">
            <p>
              {outcome.result.status === "NEEDS_OCR"
                ? t("upload.doneNeedsOcr", { filename: outcome.filename })
                : t("upload.done", {
                    filename: outcome.filename,
                    clauses: outcome.result.clauses,
                  })}
            </p>
            {outcome.result.warnings.map((warning) => (
              <p key={warning.code} className="border-signal border-l-4 pl-2">
                {warning.code === "pages-without-text"
                  ? t("warnings.pagesWithoutText", {
                      pages: warning.pages.join(", "),
                    })
                  : t("warnings.docxAutoNumbering", {
                      paragraphs: warning.paragraphs,
                    })}
              </p>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}
