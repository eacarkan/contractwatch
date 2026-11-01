/**
 * Prints the clause list for a local file, with no database or upload involved,
 * so a split can be checked by eye.
 *
 *   pnpm split:preview <file.pdf|docx|txt> [--rejected]
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";

import { extractText } from "@/lib/text/extract";
import {
  countNumberedClauses,
  countWords,
  splitClauses,
} from "@/lib/text/split-clauses";
import { extensionOf } from "@/lib/upload-rules";

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { rejected: { type: "boolean", default: false } },
  });

  const [file] = positionals;
  const extension = file ? extensionOf(file) : null;
  if (!file || !extension) {
    console.error("Usage: pnpm split:preview <file.pdf|docx|txt> [--rejected]");
    process.exit(1);
  }

  const extracted = await extractText(await readFile(file), extension);

  console.log(`# ${basename(file)}`);
  console.log(`Pages: ${extracted.pageCount ?? "not available"}`);
  for (const warning of extracted.warnings) {
    console.log(`Warning: ${JSON.stringify(warning)}`);
  }

  if (extracted.isScanned) {
    console.log("This PDF has no text layer. Run scripts/ocr.py on it first.");
    return;
  }

  const { clauses, rejected, furniture, fallbackReasons } = splitClauses(
    extracted.pages,
  );

  console.log(`Clauses: ${countNumberedClauses(clauses)}`);
  console.log(`Lines rejected as clause starts: ${rejected.length}`);
  console.log(`Page furniture removed: ${furniture.length} distinct lines`);
  console.log(
    fallbackReasons.length
      ? `LLM fallback would apply: ${JSON.stringify(fallbackReasons)}`
      : "LLM fallback would not apply.",
  );

  console.log("\n| Ref | Heading | Pages | Words |");
  console.log("|---|---|---|---|");
  for (const clause of clauses) {
    const pages =
      clause.pageFrom === clause.pageTo
        ? (clause.pageFrom ?? "")
        : `${clause.pageFrom}-${clause.pageTo}`;
    const heading = (clause.heading ?? "").replaceAll("|", "\\|");
    console.log(
      `| ${clause.clauseRef} | ${heading} | ${pages} | ${countWords(clause.body)} |`,
    );
  }

  if (values.rejected) {
    console.log("\n## Rejected lines\n");
    for (const { page, line, reason } of rejected) {
      console.log(`- p.${page ?? "?"} [${reason}] ${line.slice(0, 100)}`);
    }
    console.log("\n## Page furniture removed\n");
    furniture.forEach((line) => console.log(`- ${line}`));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
