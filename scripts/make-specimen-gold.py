#!/usr/bin/env python3
"""Writes the specimen contract's answer key. Run once after changing the contract."""
import json
import re

TEXT = open("data/specimen-epc-contract.txt", encoding="utf-8").read()
C, E, R, EI = "CONTRACTOR", "EMPLOYER", "ENGINEER", "EITHER"
D, W = "CALENDAR_DAYS", "WORKING_DAYS"

# ref, obligor, category, title, period, basis, direction, time bar, quote, trigger type, recurrence
ROWS = [
    ("1.2", EI, "NOTICE", "Tell the other Party of a new address", 7, D, "AFTER", False, "within 7 days of the change"),
    ("2.1", E, "OTHER", "Give access to the Site", 30, D, "AFTER", False, "within 30 days after the Commencement Date"),
    ("2.2", E, "SUBMISSION", "Provide evidence of funding", 21, D, "AFTER", False, "Within 21 days after a written request"),
    ("3.1", E, "NOTICE", "Name the Employer's Representative", 10, D, "AFTER", False, "within 10 days after the date of this Contract"),
    ("3.2", E, "NOTICE", "Give notice before replacing the Representative", 14, D, "BEFORE", False, "at least 14 days' notice"),
    ("3.3", R, "APPROVAL", "Answer a request for a decision", 14, D, "AFTER", False, "within 14 days of receiving it"),
    ("4.1", C, "SECURITY", "Deliver the Performance Security", 28, D, "AFTER", False, "within 28 days after the Commencement Date"),
    ("4.2", C, "SECURITY", "Extend the Performance Security before expiry", 30, D, "BEFORE", False, "not later than 30 days before its expiry date"),
    ("4.3", C, "SUBMISSION", "Submit Key Personnel", 15, D, "AFTER", False, "within 15 days after the Commencement Date"),
    ("4.4", C, "NOTICE", "Notify each proposed Subcontractor", 21, D, "BEFORE", False, "at least 21 days before"),
    ("5.1", C, "PROGRAMME", "Submit a design delivery schedule", 20, D, "AFTER", False, "within 20 days after the Commencement Date"),
    ("5.2", C, "NOTICE", "Notify an error in the Employer's Requirements", 10, D, "AFTER", True, "within 10 days of finding it"),
    ("5.3", C, "SUBMISSION", "Hand over as-built documents", 45, D, "BEFORE", False, "no later than 45 days before"),
    ("6.2", C, "NOTICE", "Report a serious accident", 2, W, "AFTER", False, "within 2 working days after it happens"),
    ("7.1", C, "NOTICE", "Give notice before covering work", 5, W, "BEFORE", False, "at least 5 working days' notice"),
    ("7.2", C, "DEFECTS", "Replace or repair rejected Plant", 30, D, "AFTER", False, "within 30 days of being told of the rejection"),
    ("8.1", C, "COMPLETION", "Begin the Works", 14, D, "AFTER", False, "within 14 days after the Commencement Date"),
    ("8.2", C, "PROGRAMME", "Submit a detailed programme", 28, D, "AFTER", False, "within 28 days after the Commencement Date"),
    ("8.5", C, "NOTICE", "Warn of a likely delay", 7, D, "AFTER", False, "within 7 days of learning of any event"),
    ("8.6", C, "NOTICE", "Give notice before suspending work", 21, D, "BEFORE", False, "at least 21 days' notice"),
    ("9.1", C, "TESTING", "Give notice of readiness for tests", 21, D, "BEFORE", False, "at least 21 days' notice"),
    ("9.2", C, "TESTING", "Repeat a failed test", 14, D, "AFTER", False, "within 14 days of that request"),
    ("10.1", R, "COMPLETION", "Issue or refuse the Taking-Over Certificate", 21, D, "AFTER", False, "within 21 days of receiving"),
    ("11.1", C, "DEFECTS", "Remedy a notified defect", 14, D, "AFTER", False, "within 14 days of the notice"),
    ("11.2", R, "DEFECTS", "Issue the Performance Certificate", 28, D, "AFTER", False, "within 28 days after the end"),
    ("12.1", C, "VARIATION", "Submit a Variation proposal", 14, D, "AFTER", False, "Within 14 days of receiving a Variation request"),
    ("12.2", C, "VARIATION", "Object to an instruction", 10, D, "AFTER", True, "within 10 days of receiving it"),
    ("13.1", E, "PAYMENT", "Pay the advance payment", 30, D, "AFTER", False, "within 30 days after receiving"),
    ("13.3", R, "PAYMENT", "Certify a payment application", 21, D, "AFTER", False, "within 21 days of receiving it"),
    ("13.4", E, "PAYMENT", "Pay each certified amount", 45, D, "AFTER", False, "within 45 days of the date of the certificate"),
    ("13.5", C, "PAYMENT", "Submit a draft final statement", 56, D, "AFTER", False, "within 56 days after receiving"),
    ("14.1", C, "OTHER", "Correct a material breach", 30, D, "AFTER", False, "within 30 days of a notice to correct"),
    ("14.2", C, "NOTICE", "Give notice of termination", 28, D, "BEFORE", False, "giving 28 days' notice"),
    ("15.1", C, "INSURANCE", "Deliver evidence of insurance", 21, D, "AFTER", False, "within 21 days after the Commencement Date"),
    ("15.2", C, "INSURANCE", "Deliver evidence of renewal", 7, D, "BEFORE", False, "at least 7 days before"),
    ("16.1", EI, "NOTICE", "Notify Force Majeure", 14, D, "AFTER", True, "within 14 days of becoming aware of the event"),
    ("17.1", C, "CLAIM", "Notify a claim", 28, D, "AFTER", True, "within 28 days of becoming aware of the event"),
    ("17.2", C, "CLAIM", "Send particulars of a claim", 42, D, "AFTER", False, "Within 42 days of becoming aware of the event"),
    ("17.3", R, "CLAIM", "Respond to particulars", 42, D, "AFTER", False, "within 42 days of receiving them"),
    ("17.4", EI, "DISPUTE", "Give notice of dissatisfaction", 28, D, "AFTER", True, "within 28 days of receiving it"),
    ("17.5", EI, "DISPUTE", "Attempt amicable settlement", 30, D, "AFTER", False, "for 30 days after a notice of dissatisfaction"),
]
PERIODIC = [
    ("6.1", C, "SUBMISSION", "Send a site safety report", 30, "every 30 days"),
    ("8.3", C, "PROGRAMME", "Deliver a progress report", 30, "every 30 days"),
    ("13.2", C, "PAYMENT", "Submit a payment application", 30, "at the end of every 30 days"),
]

refs = re.findall(r"^(\d+\.\d+) ", TEXT, re.M)
items = [
    {
        "clause_ref": ref, "obligor": who, "category": cat, "title": title,
        "trigger_type": "EVENT", "period_value": value, "period_basis": basis,
        "period_direction": direction, "is_time_bar": bar, "source_quote": quote,
    }
    for ref, who, cat, title, value, basis, direction, bar, quote in ROWS
] + [
    {
        "clause_ref": ref, "obligor": who, "category": cat, "title": title,
        "trigger_type": "PERIODIC", "recurrence_days": days,
        "is_time_bar": False, "source_quote": quote,
    }
    for ref, who, cat, title, days, quote in PERIODIC
]
for item in items:
    assert item["source_quote"] in TEXT, item
    assert item["clause_ref"] in refs, item
items.sort(key=lambda i: [int(n) for n in i["clause_ref"].split(".")])

json.dump(
    {"labelledClauseRefs": refs, "holdoutClauseRefs": [], "obligations": items},
    open("test/gold/specimen-epc.json", "w", encoding="utf-8"),
    ensure_ascii=False, indent=2,
)
print(len(refs), "clauses", len(items), "obligations")
