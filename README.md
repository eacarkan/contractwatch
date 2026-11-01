# ContractWatch

[![CI](https://github.com/eacarkan/contractwatch/actions/workflows/ci.yml/badge.svg)](https://github.com/eacarkan/contractwatch/actions/workflows/ci.yml)

A demonstration tool that reads infrastructure and EPC contracts and turns their time-bound obligations into a human-reviewed register and notice calendar. It uses demonstration data only and is not deployed on any live contract.

## The problem

Construction and EPC contracts spread their notice periods, time bars and payment deadlines across hundreds of clauses, and a missed notice can lose a right. Those dates are usually tracked by hand, on paper and in email.

## Status

In development. Contract upload, text extraction, clause splitting, obligation extraction, review and the register with export work. No accuracy result has been measured yet. Deadlines and the calendar are still to come.

## Architecture

To be completed. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the pipeline and data model so far.

## How to run

You need Node 24, pnpm 10 and Docker.

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm dev
```

Then open http://localhost:3000. Local development runs offline: Postgres is in Docker, and a gitignored `.local-blob/` folder stands in for Vercel Blob.

To check the code:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

To see how a file splits into clauses without uploading it:

```bash
pnpm split:preview path/to/conditions.pdf --rejected
```

## Extraction

The project is built to cost nothing to run, so extraction uses a model on your own computer or a free tier, through any OpenAI-compatible endpoint. Set `LLM_BASE_URL` and `LLM_MODEL` in `.env`; `.env.example` has examples. A free tier may use what you send it for training, so send it only public or anonymised text.

```bash
pnpm extract <documentId>   # add --delay-ms 7000 for a rate-limited free tier
pnpm eval <documentId>      # prints recall, precision, period match and time-bar accuracy
```

Extraction resumes where it stopped. The public site has no model service set, so visitors see results but cannot start a run. `test/gold/README.md` explains the hand-labelled test set.

## OCR

Scanned PDFs are read inside the app. Upload one and the browser renders each page and reads it with Tesseract (French and English), then sends the text back to be split into clauses. It runs in the browser because Tesseract does not run in Vercel functions. PDFs with no text layer are detected automatically; for a scan with a garbled text layer, tick "Read this PDF with OCR".

Allow several seconds a page, and keep the page open until it finishes. The engine and language data download on first use, from a public CDN, so the first run needs an internet connection.

`scripts/ocr.py` does the same job offline, for example for a long scan, and writes a text file to upload as an OCR text document.

On three pages of a scanned French public procurement circular, the body text read cleanly, while letterheads and stamps were misread (one date lost a digit). OCR text therefore carries a warning on screen and goes through the same human review as any other source.

## Confidentiality

Real contract files never enter this repository. `scripts/anonymise.ts` replaces names and amounts from a private map, shifts every date by a fixed number of days, and refuses to write its output while anything it could not handle remains. The repository contains no FIDIC clause text.

## Limitations

To be completed. Known so far: OCR can misread stamps, letterheads and dates, and a DOCX that uses Word's automatic numbering should be exported to PDF first, because those numbers are not in its text.

## What this does not claim

To be completed.

## Licence

[MIT](LICENSE)
