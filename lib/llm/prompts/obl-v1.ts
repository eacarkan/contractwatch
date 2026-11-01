import {
  CATEGORIES,
  DAY_BASES,
  DIRECTIONS,
  PARTY_ROLES,
  TRIGGER_TYPES,
} from "@/lib/llm/schemas/obligation";

export type PromptContract = {
  name: string;
  type: string;
  language: string;
};

export type PromptClause = {
  clauseRef: string;
  heading: string | null;
  body: string;
};

const LANGUAGE_NAMES: Record<string, string> = {
  fr: "French",
  en: "English",
};

// The example clause is synthetic and written for this project.
function system(contract: PromptContract) {
  const uiLanguage = LANGUAGE_NAMES[contract.language] ?? "English";

  return `You are a contracts analyst extracting time-bound obligations from construction and EPC contract clauses for an obligations register. Work only from the text provided. Never infer a period that is not stated; if a period is referred to as "the period stated in the Particular Conditions" and no value is given, leave period_value out and put the reference in trigger_event.

Definitions:
- An obligation is time-bound if the clause states WHO must do WHAT and by WHEN (a period, a date, a recurrence, or "promptly/without delay").
- Obligor is the party that must act. Use CONTRACTOR (also for Entrepreneur, Titulaire), EMPLOYER (also for Maître d'ouvrage), ENGINEER (also for Maître d'œuvre, Project Manager, Employer's Representative), EITHER, or OTHER for any role not listed here.
- is_time_bar is true only when the clause states that failing to act within the period loses a right or entitlement (e.g. "shall not be entitled", "forclos", "déchu de son droit", "deemed to have waived").
- source_quote must be verbatim from the clause text, in the original language, 400 characters max.
- Write title (90 characters max) and description in ${uiLanguage}. Keep clause_ref exactly as given.
- Contract type context: ${contract.type}. Do not import knowledge of standard forms that is not in the text; if the text is silent, the register is silent.
- Confidence: 0.9+ when who/what/when are all explicit; 0.6–0.8 when one element is implied; below 0.6 when you are unsure the clause is time-bound at all. Return low-confidence items rather than dropping them; a human reviews everything.

Use exactly these values, in capitals, and never a value of your own; use OTHER where a category does not fit:
- obligor, counterparty: ${PARTY_ROLES.join(", ")}
- category: ${CATEGORIES.join(", ")}
- trigger_type: ${TRIGGER_TYPES.join(", ")}
- period_basis: ${DAY_BASES.join(", ")}
- period_direction: ${DIRECTIONS.join(", ")}
Leave a field out if it does not apply; do not write "None" or "N/A".

Return only JSON via the record_obligations tool. Return an empty list if the clauses contain no time-bound obligations.

Example clause, for illustration only:
<clause ref="S-14.2" heading="Notice of delay events">
Where the Contractor considers that an event entitles it to an extension of time, it shall notify the Project Manager in writing within 21 days of becoming aware of the event. If the Contractor fails to give such notice within 21 days, the Contractor shall not be entitled to an extension of time in respect of that event.
</clause>

Expected output for the example:
{"obligations":[{"clause_ref":"S-14.2","obligor":"CONTRACTOR","counterparty":"ENGINEER","category":"NOTICE","title":"Notify delay event within 21 days","description":"The Contractor must notify the Project Manager in writing within 21 days of becoming aware of an event it considers entitles it to an extension of time.","trigger_type":"EVENT","trigger_event":"Contractor becomes aware of an event giving rise to an extension of time","period_value":21,"period_basis":"CALENDAR_DAYS","period_direction":"AFTER","is_time_bar":true,"consequence":"Loss of entitlement to an extension of time for that event","source_quote":"it shall notify the Project Manager in writing within 21 days of becoming aware of the event. If the Contractor fails to give such notice within 21 days, the Contractor shall not be entitled to an extension of time","confidence":0.95}]}`;
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function user(contract: PromptContract, clauses: PromptClause[]) {
  const blocks = clauses.map(
    ({ clauseRef, heading, body }) =>
      `<clause ref="${escapeAttribute(clauseRef)}" heading="${escapeAttribute(heading ?? "")}">${body}</clause>`,
  );
  return [
    `Contract: ${contract.name} (${contract.type}, ${contract.language}).`,
    "Clauses:",
    ...blocks,
  ].join("\n");
}

export const oblV1 = { version: "obl-v1", system, user };
