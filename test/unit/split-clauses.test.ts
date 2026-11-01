import { describe, expect, it } from "vitest";

import {
  countWords,
  PREAMBLE_REF,
  splitClauses,
  type SourcePage,
} from "@/lib/text/split-clauses";

// Synthetic clause lists in our own wording. Nothing here is taken from a real
// contract or from any published conditions of contract.

const onePage = (...lines: string[]): SourcePage[] => [
  { page: null, text: lines.join("\n") },
];

function refs(pages: SourcePage[]): string[] {
  return splitClauses(pages)
    .clauses.map((clause) => clause.clauseRef)
    .filter((ref) => ref !== PREAMBLE_REF);
}

function clause(pages: SourcePage[], ref: string) {
  const found = splitClauses(pages).clauses.find((c) => c.clauseRef === ref);
  if (!found) throw new Error(`No clause ${ref}`);
  return found;
}

describe("clause references", () => {
  it("reads every article form the plan's pattern covers", () => {
    const pages = onePage(
      "Article 3 : Ordres de service",
      "Le titulaire accuse réception.",
      "Art. 4.2 - Délais d'exécution",
      "Le délai court à compter de la notification.",
      "Article 5 — Pénalités",
      "Les pénalités sont dues de plein droit.",
    );

    expect(refs(pages)).toEqual(["Art. 3", "Art. 4.2", "Art. 5"]);
    expect(clause(pages, "Art. 3").heading).toBe("Ordres de service");
    expect(clause(pages, "Art. 4.2").heading).toBe("Délais d'exécution");
  });

  it("reads French forms the plan's pattern misses", () => {
    const pages = onePage(
      "Article 1er : Objet du cahier",
      "Le présent cahier régit les travaux.",
      "ARTICLE 2 : DÉFINITIONS",
      "Les termes ci-après sont définis.",
      "Article 3 – Ordres de service",
      "Les ordres sont écrits.",
      "Article 3 bis : Ordres urgents",
      "Ils sont confirmés sous 48 heures.",
      "Article 4",
      "Sous-traitance",
      "Le titulaire déclare ses sous-traitants.",
    );

    expect(refs(pages)).toEqual([
      "Art. 1",
      "Art. 2",
      "Art. 3",
      "Art. 3 bis",
      "Art. 4",
    ]);
    expect(clause(pages, "Art. 3").heading).toBe("Ordres de service");
    expect(clause(pages, "Art. 4").heading).toBe("Sous-traitance");
    expect(clause(pages, "Art. 4").body).toBe(
      "Le titulaire déclare ses sous-traitants.",
    );
  });

  it("accepts 'Article premier'", () => {
    const pages = onePage("Article premier : Objet", "Texte de l'article.");

    expect(refs(pages)).toEqual(["Art. 1"]);
  });

  it("keeps dotted sub-clauses under their article", () => {
    const pages = onePage(
      "Article 14 : Ordres de service",
      "14.1 Notification",
      "Chaque ordre est notifié par écrit.",
      "14.2. Réserves",
      "Le titulaire présente ses réserves sous 15 jours.",
      "14.2.1 Forme des réserves",
      "Les réserves sont motivées.",
      "Article 15 : Pénalités",
      "Les pénalités sont dues de plein droit.",
    );

    expect(refs(pages)).toEqual([
      "Art. 14",
      "14.1",
      "14.2",
      "14.2.1",
      "Art. 15",
    ]);
    expect(clause(pages, "Art. 14").body).toBe("");
  });

  it("reads English clause forms, dropping the prefix from the reference", () => {
    const pages = onePage(
      "1 Interpretation",
      "1.1 Words in the singular include the plural.",
      "2 Site access",
      "Clause 2.2: Handover of the site",
      "The Employer gives access by the agreed date.",
      "Sub-Clause 2.3 — Security of the site",
      "The Contractor keeps the site secure.",
    );

    expect(refs(pages)).toEqual(["1", "1.1", "2", "2.2", "2.3"]);
    expect(clause(pages, "2.2").heading).toBe("Handover of the site");
  });
});

describe("lines that only look like clauses", () => {
  const article = (...body: string[]) =>
    onePage(
      "Article 1 : Délais",
      ...body,
      "Article 2 : Paiements",
      "Les paiements sont faits sous 60 jours.",
      "Article 3 : Réception",
      "La réception est prononcée par écrit.",
    );

  it.each([
    [
      "a period",
      "30 jours à compter de la notification de l'ordre de service.",
    ],
    ["a year", "2018 portant organisation des marchés, le titulaire peut"],
    ["an amount", "100 000 FCFA par jour de retard, sans mise en demeure."],
    [
      "a percentage",
      "15 % du montant du marché sont retenus à titre de garantie",
    ],
    ["a date", "13 février 2007 mettant en vigueur le présent cahier"],
    [
      "a capitalised date",
      "13 Février 2007 mettant en vigueur le présent cahier",
    ],
    [
      "a cross-reference",
      "Article 2 du présent cahier, le maître d'œuvre notifie",
    ],
    [
      "a numbered list item",
      "1. Le titulaire adresse sa demande au maître d'ouvrage",
    ],
    [
      "a list item in the next number's place",
      "2. Le maître d'œuvre répond à la demande",
    ],
    ["a page number", "12"],
    ["a decimal", "2.5 mètres de largeur utile"],
  ])("does not split on %s", (_name, line) => {
    expect(
      refs(article("Le titulaire respecte les délais suivants :", line)),
    ).toEqual(["Art. 1", "Art. 2", "Art. 3"]);
  });

  it("keeps those lines in the clause body and records why", () => {
    const pages = article("100 000 FCFA par jour de retard.");
    const result = splitClauses(pages);

    expect(result.clauses[0].body).toContain(
      "100 000 FCFA par jour de retard.",
    );
    expect(result.rejected).toContainEqual({
      page: null,
      line: "100 000 FCFA par jour de retard.",
      reason: "number-in-text",
    });
  });

  it("is not derailed by one number far out of sequence", () => {
    const pages = onePage(
      "1 Interpretation",
      "1.1 Words in the singular include the plural.",
      "98.5 Hectares of the site are fenced.",
      "2 Site access",
      "2.1 The Employer gives access.",
      "3 Payment",
      "3.1 The Employer pays within 60 days.",
    );

    expect(refs(pages)).toEqual(["1", "1.1", "2", "2.1", "3", "3.1"]);
  });
});

describe("contents pages", () => {
  const body = [
    "Article 1 : Objet",
    "Le présent cahier régit les travaux.",
    "Article 2 : Délais",
    "Le délai court à compter de la notification.",
    "Article 3 : Paiements",
    "Les paiements sont faits sous 60 jours.",
  ];

  it("skips contents lines with dot leaders", () => {
    const pages = onePage(
      "SOMMAIRE",
      "Article 1 : Objet ........................ 3",
      "Article 2 : Délais ........................ 4",
      "Article 3 : Paiements ..................... 5",
      ...body,
    );
    const result = splitClauses(pages);

    expect(refs(pages)).toEqual(["Art. 1", "Art. 2", "Art. 3"]);
    expect(result.clauses[0].clauseRef).toBe(PREAMBLE_REF);
    expect(result.clauses[0].body).toContain("SOMMAIRE");
    expect(clause(pages, "Art. 1").body).toBe(
      "Le présent cahier régit les travaux.",
    );
  });

  it("skips a block of contents lines ending in page numbers", () => {
    const pages = onePage(
      "Article 1 : Objet 3",
      "Article 2 : Délais 4",
      "Article 3 : Paiements 5",
      "Article 4 : Réception 6",
      "Article 5 : Litiges 7",
      ...body,
    );

    expect(refs(pages)).toEqual(["Art. 1", "Art. 2", "Art. 3"]);
  });

  it("skips a contents block with no markers when its articles come round again", () => {
    const pages = onePage(
      "Article 1 : Objet",
      "Article 2 : Délais",
      "Article 3 : Paiements",
      "Article 4 : Réception",
      "Article 5 : Litiges",
      "Article 1 : Objet",
      "Le présent cahier régit les travaux.",
      "Article 2 : Délais",
      "Le délai court à compter de la notification.",
      "Article 3 : Paiements",
      "Les paiements sont faits sous 60 jours.",
      "Article 4 : Réception",
      "La réception est prononcée par écrit.",
      "Article 5 : Litiges",
      "Les litiges sont réglés à l'amiable.",
    );
    const result = splitClauses(pages);

    expect(refs(pages)).toEqual([
      "Art. 1",
      "Art. 2",
      "Art. 3",
      "Art. 4",
      "Art. 5",
    ]);
    expect(clause(pages, "Art. 1").body).toBe(
      "Le présent cahier régit les travaux.",
    );
    expect(
      result.rejected.filter((line) => line.reason === "contents-line"),
    ).toHaveLength(5);
  });

  it("prefers the body over a contents page with no markers at all", () => {
    const pages = onePage(
      "Article 1 : Objet",
      "Article 2 : Délais",
      "Article 3 : Paiements",
      "Fin du sommaire",
      ...body,
    );

    expect(clause(pages, "Art. 1").body).toBe(
      "Le présent cahier régit les travaux.",
    );
  });
});

describe("headings and bodies", () => {
  it("treats a long first line as body text with no heading", () => {
    const sentence = `14.1 ${"Le titulaire notifie au maître d'œuvre tout événement ".repeat(3)}sous 15 jours.`;
    const pages = onePage("Article 14 : Ordres", sentence);
    const found = clause(pages, "14.1");

    expect(found.heading).toBeNull();
    expect(found.body).toContain("sous 15 jours.");
  });

  it("treats a wrapped sentence as body text, not a heading", () => {
    const pages = onePage(
      "Article 14 : Ordres",
      "14.1 Le titulaire notifie au maître d'œuvre, dans un délai de",
      "15 jours, tout événement ouvrant droit à prolongation.",
    );
    const found = clause(pages, "14.1");

    expect(found.heading).toBeNull();
    expect(found.body).toBe(
      "Le titulaire notifie au maître d'œuvre, dans un délai de\n15 jours, tout événement ouvrant droit à prolongation.",
    );
  });

  it("joins an article heading wrapped onto a second line", () => {
    const pages = onePage(
      "Article 14 : Variation dans la masse des travaux et dans la nature des",
      "ouvrages du marché",
      "14.1 Le titulaire est informé par écrit.",
    );
    const found = clause(pages, "Art. 14");

    expect(found.heading).toBe(
      "Variation dans la masse des travaux et dans la nature des ouvrages du marché",
    );
    expect(found.body).toBe("");
  });

  it("does not join a wrapped sentence into an article heading", () => {
    const pages = onePage(
      "Article 14 : Le titulaire notifie au maître d'œuvre",
      "tout événement ouvrant droit à prolongation.",
    );
    const found = clause(pages, "Art. 14");

    expect(found.heading).toBeNull();
    expect(found.body).toContain("Le titulaire notifie");
  });

  it("keeps a long first line of a sub-clause in the body", () => {
    const pages = onePage(
      "Article 14 : Ordres",
      "14.1 La décision prise en application du premier alinéa du présent",
      "Article peut être contestée par écrit.",
    );
    const found = clause(pages, "14.1");

    expect(found.heading).toBeNull();
    expect(found.body).toBe(
      "La décision prise en application du premier alinéa du présent\nArticle peut être contestée par écrit.",
    );
  });

  it("respects the 120-character heading cap", () => {
    const long = "Ordres ".repeat(20).trim();
    const pages = onePage(`Article 14 : ${long}`, "Texte de l'article.");

    expect(clause(pages, "Art. 14").heading).toBeNull();
    expect(clause(pages, "Art. 14").body).toContain(long);
  });

  it("loses no text: every input line appears in a heading or body", () => {
    const lines = [
      "CAHIER DE DÉMONSTRATION",
      "Article 1 : Objet",
      "Le présent cahier régit les travaux.",
      "30 jours à compter de la notification.",
      "Article 2 : Délais",
      "2.1 Notification",
      "Chaque ordre est notifié par écrit.",
    ];
    const { clauses } = splitClauses(onePage(...lines));
    const output = clauses
      .map((c) => `${c.heading ?? ""}\n${c.body}`)
      .join("\n");

    for (const line of lines) {
      const text = line.replace(/^(Article \d+ : |2\.1 )/u, "");
      expect(output).toContain(text);
    }
  });

  it("numbers clauses in order", () => {
    const { clauses } = splitClauses(
      onePage("Préambule", "Article 1 : Objet", "Article 2 : Délais"),
    );

    expect(clauses.map((c) => c.orderIndex)).toEqual([0, 1, 2]);
  });
});

describe("page tracking", () => {
  it("records the first and last page of each clause", () => {
    const pages: SourcePage[] = [
      { page: 1, text: "Article 1 : Objet\nLe cahier régit les travaux." },
      { page: 2, text: "Suite de l'article premier.\nArticle 2 : Délais" },
      { page: 3, text: "Le délai court à compter de la notification." },
    ];

    expect(clause(pages, "Art. 1")).toMatchObject({ pageFrom: 1, pageTo: 2 });
    expect(clause(pages, "Art. 2")).toMatchObject({ pageFrom: 2, pageTo: 3 });
  });

  it("removes running headers, footers and page numbers from bodies", () => {
    const page = (number: number, text: string): SourcePage => ({
      page: number,
      text: `Cahier de démonstration\n${text}\nPage ${number} sur 4`,
    });
    const pages = [
      page(1, "Article 1 : Objet\nLe cahier régit les travaux."),
      page(2, "Suite de l'article premier."),
      page(3, "Article 2 : Délais\nLe délai court dès la notification."),
      page(4, "Suite de l'article deux."),
    ];
    const result = splitClauses(pages);

    expect(clause(pages, "Art. 1").body).toBe(
      "Le cahier régit les travaux.\nSuite de l'article premier.",
    );
    expect(result.furniture).toContain("Cahier de démonstration");
    expect(result.furniture).toContain("Page 1 sur 4");
  });

  it("never removes a repeated clause heading as furniture", () => {
    const pages: SourcePage[] = [1, 2, 3, 4].map((number) => ({
      page: number,
      text: `Article ${number}\nDisposition de démonstration ${number}.`,
    }));

    expect(refs(pages)).toEqual(["Art. 1", "Art. 2", "Art. 3", "Art. 4"]);
  });
});

describe("LLM fallback conditions from section 4.2", () => {
  const articles = (count: number, body = "Texte de l'article.") =>
    Array.from({ length: count }, (_, index) => [
      `Article ${index + 1} : Disposition`,
      body,
    ]).flat();

  it("flags fewer than 10 clauses, not counting the preamble", () => {
    const pages = onePage("Préambule", ...articles(9));

    expect(splitClauses(pages).fallbackReasons).toEqual([
      { code: "too-few-clauses", clauses: 9 },
    ]);
  });

  it("does not flag 10 clauses of normal length", () => {
    expect(splitClauses(onePage(...articles(10))).fallbackReasons).toEqual([]);
  });

  it("flags a clause over 3,000 words", () => {
    const pages = onePage(
      ...articles(10),
      "Article 11 : Longue",
      "Mot ".repeat(3001),
    );

    expect(splitClauses(pages).fallbackReasons).toEqual([
      { code: "clause-too-long", clauseRef: "Art. 11", words: 3001 },
    ]);
  });
});

describe("countWords", () => {
  it("counts across any whitespace", () => {
    expect(countWords("  un deux\ntrois quatre  ")).toBe(4);
  });
});
