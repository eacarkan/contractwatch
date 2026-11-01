# Architecture

## Pipeline

```
upload → text extraction → clause segmentation                                       built
  → batches of up to 6 clauses → model, tool call → zod validation → obligations (pending)   built
  → review on screen or by an outside reviewer's file (confirmed / edited / rejected, revision row)  built
  → register with filters and CSV/XLSX export                                                 built
  → events, deadlines, calendar                                                               built
correspondence entry → suggested links → user confirms → deadline status                      built
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

## Review and register

The review screen shows one waiting obligation at a time beside its source clause, with the quote highlighted however the line breaks fall. If the quote is not word for word in the clause, nothing is highlighted and the screen says so. Each decision and its revision row, holding the values before and after, are saved in one transaction. Items from older prompts are left out of the queue, so a rerun does not ask for the same obligation twice.

The register lists confirmed and edited obligations. Exports carry the demonstration wording and neutralise spreadsheet formulas, because their text comes from uploaded documents and a model.

## Outside review

The review screen can hand the waiting obligations to an outside reviewer, such as ChatGPT, as one JSON file holding the instructions, each item and its clause text. The file the reviewer returns passes a zod schema, then each decision goes through the same code as the review screen, with its revision row and the reviewer's name on the obligation. A reviewer cannot change a clause reference or a source quote. Unknown ids, items already decided and edits that do not validate are skipped and counted. The file holds clause text, so it is for public or anonymised sources only.

The specimen contract is synthetic, so its author wrote an answer key, and `pnpm review:key` reviews it from that key.

## Deadline rules

`lib/deadline.ts` holds the rules as pure functions over UTC dates, with no database access.

| Rule | Approach |
|---|---|
| Day of the event not counted | Add the period to the event date, so 21 days from the 1st falls on the 22nd |
| Working days | Skip Saturdays, Sundays and the contract's holidays |
| Months | Day to same day, ending on the last day of a shorter month |
| Before a date | Count backwards; never moved later |
| Non-working last day | For CCAG-Travaux (art. 38.3), a period counted forwards runs on to the next working day. Other forms stay as computed |
| Periodic | Occurrences to the end of the time for completion, capped at 60 |
| Recomputation | In one transaction, rows are matched by occurrence and updated, so links survive. `MET` stands only while its letter still precedes the new date, and a status set by hand is kept |

The rule is stored as a code, such as `after:21:CALENDAR_DAYS:rolled`, and each screen words it in its own language. Overdue is worked out when shown, so it cannot go stale. An event lists the obligations it triggers, chosen by the user. Holidays are entered by hand for each contract, with no import.

## Correspondence

A letter is logged by hand and linked to an obligation or one of its due dates. An outgoing letter from the bound party, sent by the due date and linked as satisfying it, marks the deadline `MET`; removing the link or the letter reopens it. Where a model service is set, the screen can ask for suggested links (`corr-v1`). Each call is an `ExtractionRun`, the code holds the sender rule whatever the model says, and nothing is linked until the user confirms. The public site has no model service, so links are made by hand there.

## Seed and demonstration gate

`pnpm snapshot` copies local results for public or synthetic sources to `data/seed`, and `pnpm db:seed` loads them. Deployment runs the seed, which is how results made on the owner's computer reach the site. It replaces only the demonstration contracts, and dates its events from the day it runs, so the calendar always has something due.

When `DEMO_PASSWORD` is set, `proxy.ts` sends visitors to `/enter` until they hold a signed cookie, and answers API requests with 401. It is a demonstration gate, not production authentication.

## Evaluation method

`scripts/eval.ts` runs extraction for the current prompt version and compares the result with a labelled gold set. It reports recall and precision (matching on clause reference, obligor and category), exact period match, and time-bar flag accuracy. Only labelled clauses that were actually extracted are scored, and the script says how many that is.

Labelled clauses split into development and held-out sets, and prompt work uses only the development set, because a score on clauses a prompt was tuned against flatters it. The README will quote only what this script measures, naming the model. `test/gold/README.md` sets out the format.

## Security posture

Database and model access happen only in server code. Every model response passes a zod schema before any write. The shared link can sit behind the demonstration gate above.
