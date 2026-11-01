"use client";

import { uploadPresigned } from "@vercel/blob/client";
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
import { readScannedPdf } from "@/lib/ocr/read-scanned-pdf";
import {
  blobPathFor,
  CONTENT_TYPES,
  extensionOf,
  MAX_UPLOAD_BYTES,
  type UploadExtension,
} from "@/lib/upload-rules";

type Step =
  | { name: "idle" | "uploading" | "processing" | "ocrLoading" | "ocrSaving" }
  | { name: "ocrPage"; page: number; pages: number };
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
    await uploadPresigned(pathname, file, {
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
  const [step, setStep] = useState<Step>({ name: "idle" });
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
      setStep({ name: "uploading" });
      await writeToStorage(storage, pathname, file, extension);
    } catch (error) {
      console.error(error);
      setStep({ name: "idle" });
      setOutcome({ type: "error", code: "uploadFailed" });
      return;
    }

    setStep({ name: "processing" });
    const response = await fetch(`/api/contracts/${contractId}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pathname,
        filename: file.name,
        kind: data.get("kind"),
        forceOcr: data.get("forceOcr") === "on",
      }),
    });
    let result = await response.json().catch(() => null);
    let ok = response.ok;

    if (ok && result?.status === "NEEDS_OCR") {
      try {
        setStep({ name: "ocrLoading" });
        const text = await readScannedPdf(file, (page, pages) =>
          setStep({ name: "ocrPage", page, pages }),
        );

        setStep({ name: "ocrSaving" });
        const ocrResponse = await fetch(
          `/api/contracts/${contractId}/documents/${result.documentId}/ocr`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text }),
          },
        );
        result = await ocrResponse.json().catch(() => null);
        ok = ocrResponse.ok;
      } catch (error) {
        console.error(error);
        ok = false;
        result = { error: "ocrFailed" };
      }
    }

    setStep({ name: "idle" });

    if (!ok) {
      setOutcome({ type: "error", code: result?.error ?? "extractionFailed" });
    } else {
      setOutcome({ type: "done", filename: file.name, result });
      form.reset();
    }
    router.refresh();
  }

  const busy = step.name !== "idle";

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border grid grid-cols-1 gap-4 rounded-lg border bg-white p-4"
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
          {busy ? t("upload.busy") : t("upload.submit")}
        </Button>
      </div>

      <p id="file-hint" className="text-muted-foreground text-sm">
        {t("upload.hint")}
      </p>

      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <input
            id="forceOcr"
            name="forceOcr"
            type="checkbox"
            aria-describedby="force-ocr-hint"
            className="size-4"
          />
          <Label htmlFor="forceOcr">{t("upload.forceOcr")}</Label>
        </div>
        <p id="force-ocr-hint" className="text-muted-foreground text-sm">
          {t("upload.forceOcrHint")}
        </p>
      </div>

      <div aria-live="polite" className="empty:hidden">
        {step.name === "ocrPage" ? (
          <p className="text-sm">
            {t("upload.ocrPage", { page: step.page, pages: step.pages })}
          </p>
        ) : (
          busy && <p className="text-sm">{t(`upload.${step.name}`)}</p>
        )}
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
              {t("upload.done", {
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
