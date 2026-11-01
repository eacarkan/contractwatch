/**
 * Anonymises contract text before it enters the database or the repository.
 *
 *   pnpm anonymise raw/conditions.pdf --names raw/client.namemap.json \
 *     --offset 412 --out anonymised/conditions.anon.txt
 *
 * Use --offset=-412 for a negative shift. The name map is a JSON object of real name
 * to replacement. List amounts and reference numbers in it as well, because they are
 * replaced as literal text. The map and the offset can reverse the anonymisation, so
 * neither is ever written to the output.
 *
 * Output is plain text with a form feed between pages, ready to upload. If anything
 * is left that the script could not handle, it lists it and writes nothing. After
 * reading the list, add those items to the map, or pass --accept-residual.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

import {
  anonymiseText,
  containsName,
  validateNameMap,
  type NameMap,
} from "@/lib/anonymise";
import { extractText } from "@/lib/text/extract";
import { extensionOf } from "@/lib/upload-rules";

function fail(message: string): never {
  console.error(`anonymise: ${message}`);
  process.exit(2);
}

async function readNameMap(file: string): Promise<NameMap> {
  const inRaw =
    relative(resolve("raw"), resolve(file)).startsWith("..") === false;
  if (!inRaw && !file.endsWith(".namemap.json")) {
    fail(
      "Keep the name map in raw/, or name it *.namemap.json, so git ignores it.",
    );
  }
  const parsed = z
    .record(z.string(), z.string())
    .safeParse(JSON.parse(await readFile(file, "utf8")));
  if (!parsed.success) fail("The name map must be a JSON object of strings.");
  const problem = validateNameMap(parsed.data);
  if (problem) fail(problem);
  return parsed.data;
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      names: { type: "string" },
      offset: { type: "string" },
      out: { type: "string" },
      "accept-residual": { type: "boolean", default: false },
    },
  });

  const [input] = positionals;
  const extension = input ? extensionOf(input) : null;
  if (!input || !extension || !values.names || !values.offset || !values.out) {
    fail(
      "Usage: pnpm anonymise <file.pdf|docx|txt> --names <map.json> --offset <days> --out <file.txt> [--accept-residual]",
    );
  }

  const offset = Number(values.offset);
  if (!Number.isInteger(offset) || offset === 0) {
    fail("--offset must be a whole number of days other than zero.");
  }
  if (!values.out.endsWith(".txt")) fail("--out must be a .txt file.");
  if (resolve(values.out) === resolve(input)) {
    fail("--out must not overwrite the input.");
  }

  const names = await readNameMap(values.names);
  // A file name like "<project>.anon.txt" would carry the real name into git.
  if (containsName(basename(values.out), names)) {
    fail(
      "--out contains a real name from the map. Choose a neutral file name.",
    );
  }

  const extracted = await extractText(await readFile(input), extension);
  if (extracted.isScanned) {
    fail("This PDF has no text layer. Run scripts/ocr.py on it first.");
  }

  const result = anonymiseText(
    extracted.pages.map((page) => page.text).join("\f"),
    names,
    offset,
  );

  console.error(`Names replaced: ${result.namesReplaced}`);
  console.error(`Dates shifted: ${result.datesShifted}`);
  for (const warning of extracted.warnings) {
    console.error(`Warning: ${JSON.stringify(warning)}`);
  }

  if (result.residuals.length > 0) {
    console.error(
      `\nLeft unchanged, ${result.residuals.length} distinct items:`,
    );
    for (const { kind, text, count } of result.residuals) {
      console.error(
        `  [${kind}] ${text}${count > 1 ? ` (${count} times)` : ""}`,
      );
    }
    if (!values["accept-residual"]) {
      fail(
        "\nNothing was written. Add these to the name map, or read them and pass --accept-residual.",
      );
    }
  }

  await mkdir(dirname(values.out), { recursive: true });
  await writeFile(values.out, result.text, "utf8");
  console.error(`\nWrote ${values.out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
