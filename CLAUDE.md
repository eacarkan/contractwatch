# ContractWatch

Demonstration tool that extracts time-bound obligations, notice requirements and payment deadlines from infrastructure and EPC contracts into a human-reviewed obligations register and notice calendar.

`docs/BUILD_PLAN.md` is the authoritative plan. It is gitignored, so it exists only on the owner's machine. Read it before starting work.

## Current build section and gate

Build Section 1. Work goes section by section with no schedule: where the plan says "Week N", read build Section N, and ignore its dates. Build only what the plan's section 8 lists for Section 1, then stop.

Gate, judged by the owner and never marked passed by Claude: CI green; CCAG general conditions upload, extract and split into referenced clauses on the deployed preview; OCR verdict recorded in the README.

## Hard rules

1. Do not start the next build section until the owner passes the gate.
2. No FIDIC clause text anywhere in the repository, seed data, tests or prompts.
3. Real contract files, name maps and `docs/BUILD_PLAN.md` never enter the repository. `raw/` is gitignored. `scripts/anonymise.ts` runs before anything derived from a real contract is committed. Public files carry no employer, project or job-search references.
4. Every screen carries the banner "Demonstration data — not a live contract."
5. Database and Anthropic access only in server code. Every LLM response passes zod before any write. Every LLM call is recorded as an `ExtractionRun` with model and `promptVersion`.
6. Small commits with sentence-style messages. CI (typecheck, lint, unit tests) stays green.
7. British English in UI strings and docs. Every UI string goes through next-intl, in both `messages/en.json` and `messages/fr.json`.
8. Do not propose a different architecture or add features outside section 1.1 without asking.

## Stack

Next.js 16 (App Router, TypeScript strict), Tailwind 4, shadcn/ui, next-intl with `/[locale]` routes, Prisma 7 with `@prisma/adapter-pg`, Vercel Blob (private store, client uploads, 50 MB cap), `pdf-parse`, `mammoth`, Vitest, pnpm, Node 24. Python and Tesseract for the offline `scripts/ocr.py`.

`prisma/schema.prisma` is the single source of truth. Migrations are generated, never hand-written. No pgvector and no database triggers.

Local development runs offline: Postgres in Docker, and the gitignored `.local-blob/` folder stands in for Vercel Blob when `BLOB_READ_WRITE_TOKEN` is unset. Deployed environments use Neon and Vercel Blob.

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
pnpm split:preview <file>    # print the clause list for a local file
pnpm anonymise <in> --names <map.json> --offset <days> --out <out.txt>
python3 scripts/ocr.py <scanned.pdf>   # writes <scanned>.ocr.txt beside the input
```

Seeding (`pnpm db:seed`, `scripts/seed.ts`) arrives in Section 6.
