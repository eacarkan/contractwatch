import { MAX_MATCHES, RELATIONS } from "@/lib/llm/schemas/match";

type Letter = {
  direction: string;
  fromParty: string;
  toParty: string;
  sentOn: string;
  referenceNo: string | null;
  subject: string;
  summary: string | null;
};

type RegisterRow = {
  id: string;
  clauseRef: string;
  obligor: string;
  category: string;
  title: string;
  triggerEvent: string | null;
};

export const corrV1 = {
  version: "corr-v1",
  system: (uiLanguage: string) =>
    `You match a piece of project correspondence to obligations in a contract register. Return JSON only through the suggest_links tool.

Suggest at most ${MAX_MATCHES} obligations, ranked, each with a relation from: ${RELATIONS.join(", ")}.
SATISFIES means this letter is the notice or submission the obligation requires. Never use SATISFIES unless the letter is outgoing and its sender matches the obligor.
Use only ids from the register. Suggest nothing when no obligation fits.
Add a one-sentence summary of the letter in ${uiLanguage}, and write each reason in ${uiLanguage}.`,
  user: (letter: Letter, register: RegisterRow[]) =>
    `Letter: direction=${letter.direction}, from=${letter.fromParty}, to=${letter.toParty}, date=${letter.sentOn}, reference=${letter.referenceNo ?? "none"}
Subject: ${letter.subject}
Body or summary: ${letter.summary ?? "none"}

Register:
${register
  .map((row) =>
    [
      row.id,
      row.clauseRef,
      row.obligor,
      row.category,
      row.title,
      row.triggerEvent ?? "",
    ].join(" | "),
  )
  .join("\n")}`,
};
