# Architecture

Skeleton. Sections marked "planned" describe work that is not built yet.

## Pipeline

```
upload → text extraction → clause segmentation                                       built
  → batches of up to 6 clauses → model, tool call → zod validation → obligations (pending)   built
  → human review (confirmed / edited / rejected, with a revision row)                         planned
  → register, events, deadlines, calendar                                                     planned
correspondence entry → suggested links → user confirms → deadline status                      planned
```

## Upload and storage

The browser writes each file straight to a private Vercel Blob store, using a short-lived presigned URL from `/api/blob/upload`, so files are not limited by the 4.5 MB cap on function requests. The app sets its own 50 MB cap. The browser then posts the file's path to `/api/contracts/[id]/documents`, which reads the file back, extracts its text, splits it and saves the clauses in one transaction.

Paths are checked against one strict pattern, so a client cannot name any other file. With no Blob store set, as in local development, a gitignored folder stands in for the store.

## Text extraction

- Digital PDF: `pdf-parse`, page by page.
- DOCX: `mammoth`. Word's automatic numbers are not in the extracted text, so the app warns when a file uses them.
- Plain text: for offline OCR output and anonymised files, with form feeds marking page breaks.
- Scanned PDF: detected by near-zero text and marked `NEEDS_OCR`. The browser then renders each page with `pdfjs-dist`, reads it with `tesseract.js` (`fra+eng`) and posts the text to `/api/contracts/[id]/documents/[documentId]/ocr`, which splits it like any other source and sets `isScanned`. The uploader can also force this route for a scan with a garbled text layer. If OCR does not finish, the document stays `NEEDS_OCR` until the file is uploaded again.
- OCR offline: `scripts/ocr.py` writes a text file with the same page breaks, uploaded as an `OCR_TEXT` document.

## Clause segmentation

The base is one regular expression over each line:

```
^(Article|Art\.|Clause|Sub-Clause)?\s*(\d+(\.\d+)*)[\s.:—-]+(.+)$
```

On its own it also matches wrapped sentences, amounts, dates and contents pages, and it misses common French forms. `lib/text/split-clauses.ts` therefore adds:

- capitals (`ARTICLE 14`), `1er`, `premier`, `bis`, `ter`, `quater`, the en dash, and a heading on the next line;
- rejection of cross-references, numbers inside sentences, dates, contents lines and running page furniture;
- a numbering check: the accepted clauses are the heaviest chain of strictly increasing clause numbers, so one stray match cannot derail the rest.

The numbering check expects one numbered sequence per file. A source that bundles several sets of conditions, or a tender dossier with several parts, is cut to the relevant page range before upload, keeping the page numbers where possible.

Text before the first clause is kept as a `preamble` row, so nothing is lost silently. References are stored as `Art. 14.3` for articles and `20.1` for clauses.

An LLM fallback is specified for documents with fewer than 10 clauses or a clause over 3,000 words. It is planned; for now the app flags those conditions.

## Data model

`prisma/schema.prisma` is the single source of truth, and migrations are generated from it.

| Model | Holds |
|---|---|
| `Contract` | Name, form of contract, language, parties, dates |
| `Document` | One uploaded file, its type, storage path and text status |
| `Clause` | Reference, heading, body, pages and order within a document |
| `ExtractionRun` | One model call: model, prompt version, tokens, raw output, error |
| `Obligation` | Obligor, category, trigger, period, time-bar flag, verbatim source quote, review status |
| `ObligationRevision` | Before and after values for every review change |
| `Event`, `Deadline`, `Holiday` | Dated events, the due dates they generate, and non-working days |
| `Correspondence`, `CorrespondenceObligation` | Letters and their links to obligations and deadlines |

## Obligation extraction

The project is built to cost nothing to run, so it uses no paid model service. `lib/llm/client.ts` calls any OpenAI-compatible endpoint, such as a model on the owner's computer or a free tier, and three environment variables choose the service and model. Extraction runs on the owner's computer through `scripts/extract.ts`, and the results are copied to the site. The public site has no model service set, so its route answers 503 and visitors cannot start a run.

Each batch holds up to six clauses and 12,000 characters, and a longer clause goes alone rather than being cut. Each batch is one `ExtractionRun`, recording model, prompt version, tokens and raw output, so a run can stop and resume. If the service stops answering, as when a daily quota runs out, the run stops and those clauses are tried again next time. A batch the model answered badly stays out until `--retry-failed`, so it cannot use up a quota by repeating.

Every response passes a zod schema before any write, and a failure is recorded in `ExtractionRun.error`. Three further checks add a review note instead of rejecting the item: the quote is not verbatim from the clause, the clause reference is not in the batch, or a period has no basis.

## Deadline rules (planned)

| Rule | Approach |
|---|---|
| Day of receipt not counted | Add the period to the event date; the rule text says so |
| Working days | Skip Saturdays, Sundays and the contract's holidays |
| Months | Add months, clamping to the month end |
| Before a date | Count backwards for submissions due before an event |
| Periodic | Generate occurrences to the end of the time for completion, capped at 60 |
| Recomputation | Regenerate deadlines in one transaction, keeping `MET` where the linked letter still precedes the new date |

## Evaluation method

`scripts/eval.ts` runs extraction for the current prompt version and compares the result with a hand-labelled gold set. It reports recall and precision (matching on clause reference, obligor and category), exact period match, and time-bar flag accuracy. Only labelled clauses that were actually extracted are scored, and the script says how many that is.

Labelled clauses split into development and held-out sets, and prompt work uses only the development set, because a score on clauses a prompt was tuned against flatters it. The README will quote only what this script measures, naming the model. `test/gold/README.md` sets out the format.

## Security posture

Database and model access happen only in server code. Every model response passes a zod schema before any write. During development the deployment sits behind Vercel Authentication; a small app-level demo gate is planned for the shared link. It is a demo gate, not production authentication.
