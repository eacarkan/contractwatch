import type { PromptContract } from "@/lib/llm/prompts/obl-v1";
import { oblV2 } from "@/lib/llm/prompts/obl-v2";

// obl-v2 ended the left-out fields but its categories drifted, so these say what
// each of the commonly confused categories means.
const CATEGORY_RULES = `How to choose a category:
- NOTICE: telling another party something, such as notifying a decision, a change, an address or a reservation.
- SUBMISSION: handing over a document or a named person's details for the other party to hold or act on, such as a programme, a designation or a signed copy.
- APPROVAL: accepting, refusing or objecting to something the other party has put forward.
- OTHER: only when no category above or in the list fits.`;

export const oblV3 = {
  version: "obl-v3",
  system: (contract: PromptContract) =>
    `${oblV2.system(contract)}\n\n${CATEGORY_RULES}`,
  user: oblV2.user,
};
