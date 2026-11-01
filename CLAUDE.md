# ContractWatch

Demonstration tool that extracts time-bound obligations, notice requirements and payment deadlines from infrastructure and EPC contracts into a human-reviewed obligations register and notice calendar.

`docs/BUILD_PLAN.md` is the authoritative plan. It is gitignored, so it exists only on the owner's machine. Read it before starting work.

## Current build section and gate

Build Section 3. Work goes section by section with no schedule: where the plan says "Week N", read build Section N, and ignore its dates. Build only what the plan's section 8 lists for Section 3, then stop.

Gate, judged by the owner and never marked passed by Claude: the owner has personally reviewed every extracted obligation of the CCAG contract; recall is at least 0.85; the smoke test is green in CI.

The project must cost nothing to run. Extraction uses a local model or a free tier and runs on the owner's computer, and the results are copied to the site. No model service is set on the public site. Do not suggest paid services or the Anthropic SDK.

## Hard rules

1. Do not start the next build section until the owner passes the gate.
2. No FIDIC clause text anywhere in the repository, seed data, tests or prompts.
3. Real contract files, name maps and `docs/BUILD_PLAN.md` never enter the repository. `raw/` is gitignored. `scripts/anonymise.ts` runs before anything derived from a real contract is committed. Public files carry no employer, project or job-search references.
4. Every screen carries the banner "Demonstration data — not a live contract."
5. Database and model access only in server code. Every LLM response passes zod before any write. Every LLM call is recorded as an `ExtractionRun` with model and `promptVersion`.
6. Small commits with sentence-style messages. CI (typecheck, lint, unit tests) stays green.
7. British English in UI strings and docs. Every UI string goes through next-intl, in both `messages/en.json` and `messages/fr.json`.
8. Do not propose a different architecture or add features outside section 1.1 without asking.

## Stack

Next.js 16 (App Router, TypeScript strict), Tailwind 4, shadcn/ui, next-intl with `/[locale]` routes, Prisma 7 with `@prisma/adapter-pg`, Vercel Blob (private store, client uploads, 50 MB cap), `pdf-parse`, `mammoth`, Vitest, pnpm, Node 24. `pdfjs-dist` and `tesseract.js` for OCR in the browser. Python and Tesseract for the offline `scripts/ocr.py`. Any OpenAI-compatible model service through `lib/llm/client.ts`, with no SDK, set by `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`.

`prisma/schema.prisma` is the single source of truth. Migrations are generated, never hand-written. No pgvector and no database triggers.

Local development runs offline: Postgres in Docker, and the gitignored `.local-blob/` folder stands in for Vercel Blob when `BLOB_STORE_ID` is unset. Deployed environments use Neon and Vercel Blob.

`clause_ref` format: `Art. 14.3` for articles, `20.1` for clauses. Gold-set labels must use the same format.

## Commands

```bash
pnpm install                 # also generates the Prisma client
pnpm db:up                   # start local Postgres in Docker
pnpm db:migrate              # apply migrations; after a schema change, add --name <change>
pnpm dev                     # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e                # Playwright smoke test; needs `pnpm db:up` and no dev server running
pnpm split:preview <file>    # print the clause list for a local file
pnpm anonymise <in> --names <map.json> --offset <days> --out <out.txt>
python3 scripts/ocr.py <scanned.pdf>   # writes <scanned>.ocr.txt beside the input
pnpm extract <documentId> [--delay-ms 7000] [--limit 5] [--retry-failed]   # resumes where it stopped
pnpm eval <documentId> [--gold <file>] [--set all|dev|holdout] [--no-run]  # prints the four metrics
```

Seeding (`pnpm db:seed`, `scripts/seed.ts`) arrives in Section 6.
