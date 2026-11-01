import { oblV1, type PromptContract } from "@/lib/llm/prompts/obl-v1";

// Each rule answers a fault seen in obl-v1's runs: left-out required fields,
// quotes with skipped words, and periods for a response that were missed.
const ADDITIONAL_RULES = `Additional rules, which override anything above:
- Every obligation must include every required field: clause_ref, obligor, category, title, description, trigger_type, is_time_bar, source_quote and confidence. is_time_bar is always true or false, never left out.
- source_quote is one continuous passage copied character for character. Do not use "..." and do not skip or change any word.
- Read every sentence: one clause can hold several obligations, each its own item.
- A period after which a party's silence counts as acceptance or approval is an obligation of that party to respond in time. Its is_time_bar is true.
- A power to ask for something, with no period for doing so (such as "peut exiger"), is not time-bound. Do not list it.
- An obligor such as the Chef de service du marché is not one of the named parties, so use OTHER.`;

export const oblV2 = {
  version: "obl-v2",
  system: (contract: PromptContract) =>
    `${oblV1.system(contract)}\n\n${ADDITIONAL_RULES}`,
  user: oblV1.user,
};
