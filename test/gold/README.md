# Gold set

`pnpm eval` scores the model against a gold set. Label from the clause text alone, without looking at the model's output.

## Files

| File | Who labelled it | What a score against it means |
|---|---|---|
| `ccag.json` | Reserved for labels a person makes from the clause text. Empty. | Accuracy on real conditions, once it holds any. |
| `ccag-chatgpt-reference.json` | ChatGPT, then reviewed by ChatGPT. No person has checked it. 30 clauses, 8 obligations. | How often two AI models agree. It tests the pipeline and is not a measure of accuracy. |
| `specimen-epc.json` | The author of the synthetic specimen contract, as its answer key, written by Claude with the contract. No person has checked it. | How well the model reads simple text whose answers are known. It says little about real contracts. |

Pass the second file with `pnpm eval <documentId> --gold test/gold/ccag-chatgpt-reference.json`.

## Format

```json
{
  "labelledClauseRefs": ["Art. 14.1", "Art. 14.2"],
  "holdoutClauseRefs": ["Art. 14.2"],
  "obligations": [
    {
      "clause_ref": "Art. 14.1",
      "obligor": "CONTRACTOR",
      "counterparty": "ENGINEER",
      "category": "NOTICE",
      "title": "Short title of 90 characters or fewer",
      "trigger_type": "EVENT",
      "trigger_event": "What starts the period",
      "period_value": 15,
      "period_basis": "CALENDAR_DAYS",
      "period_direction": "AFTER",
      "is_time_bar": false,
      "source_quote": "Verbatim words from the clause, 400 characters or fewer"
    }
  ]
}
```

- `labelledClauseRefs`: every clause you have read, including those with no obligation. Only these are scored, so the set can grow a little at a time. A model's item in a clause you have not read counts for nothing either way.
- `holdoutClauseRefs`: labelled clauses kept out of prompt work (see below).
- `obligations`: one entry per obligation. Use the clause reference exactly as the app shows it, such as `Art. 14.3`.

| Field | Values |
|---|---|
| `obligor`, `counterparty` | `CONTRACTOR`, `EMPLOYER`, `ENGINEER` (includes Maître d'œuvre), `EITHER`, `OTHER` |
| `category` | `NOTICE`, `SUBMISSION`, `PAYMENT`, `APPROVAL`, `PROGRAMME`, `INSURANCE`, `SECURITY`, `TESTING`, `COMPLETION`, `DEFECTS`, `VARIATION`, `CLAIM`, `DISPUTE`, `OTHER` |
| `trigger_type` | `FIXED_DATE`, `EVENT`, `PERIODIC`, `ON_DEMAND` |
| `period_basis` | `CALENDAR_DAYS`, `WORKING_DAYS`, `MONTHS` |
| `period_direction` | `AFTER`, `BEFORE` |

`counterparty`, `trigger_event`, `period_value`, `period_basis`, `period_direction`, `recurrence_days`, `consequence` and `description` can be left out. Set `is_time_bar` to true only when the clause says that missing the period loses a right.

## Development and held-out clauses

Keep roughly a quarter of the labelled clauses in `holdoutClauseRefs`, chosen before any prompt work. Improve prompts against `--set dev` only, and quote `--set holdout` or `--set all` in the README. A score on clauses a prompt was tuned against flatters that prompt, so the held-out clauses are the honest test.

## Scoring

A model's item matches a gold item when the clause reference, obligor and category are all the same.

| Metric | Meaning |
|---|---|
| Recall | Share of gold items the model found |
| Precision | Share of the model's items that match a gold item |
| Exact period match | Among matches where gold has a period, share with the same value and basis |
| Time-bar flag accuracy | Among matches, share with the same flag |
