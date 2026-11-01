import { describe, expect, it } from "vitest";

import {
  anonymiseText,
  containsName,
  validateNameMap,
  type NameMap,
} from "@/lib/anonymise";

// All names here are invented for these tests.
const NAMES: NameMap = {
  "Compagnie Alpha": "Société Démo",
  Alpha: "Démo",
  "Société Générale des Ponts": "Entreprise Exemple",
  Aster: "Nova",
};

const shift = (text: string, days = 10) =>
  anonymiseText(text, { Inutile: "Exemple" }, days);

describe("name replacement", () => {
  const replace = (text: string) => anonymiseText(text, NAMES, 10).text;

  it("replaces the longest name first", () => {
    expect(replace("La Compagnie Alpha et Alpha.")).toBe(
      "La Société Démo et Démo.",
    );
  });

  it("matches whatever the capitals or accents", () => {
    expect(replace("SOCIETE GENERALE DES PONTS")).toBe("ENTREPRISE EXEMPLE");
    expect(replace("société générale des ponts")).toBe("Entreprise Exemple");
  });

  it("keeps capitals when the source is in capitals", () => {
    expect(replace("COMPAGNIE ALPHA")).toBe("SOCIÉTÉ DÉMO");
  });

  it("matches a name wrapped across lines", () => {
    expect(replace("la Compagnie\nAlpha signe")).toBe("la Société Démo signe");
  });

  it("does not match inside a longer word", () => {
    expect(replace("Astérix et les asters, Aster seul.")).toBe(
      "Astérix et les asters, Nova seul.",
    );
  });

  it("does not re-replace text inside a replacement", () => {
    const result = anonymiseText("Alpha", { Alpha: "Beta", Beta: "Gamma" }, 10);
    expect(result.text).toBe("Beta");
  });

  it("keeps the page break when a name spans two pages", () => {
    expect(replace("la Compagnie\fAlpha signe")).toBe(
      "la Société Démo\f signe",
    );
  });

  it("counts replacements", () => {
    expect(anonymiseText("Alpha et Alpha", NAMES, 10).namesReplaced).toBe(2);
  });
});

describe("date shifting", () => {
  it.each([
    ["3 mars 2024", "13 mars 2024"],
    ["28 février 2024", "9 mars 2024"],
    ["28 février 2023", "10 mars 2023"],
    ["25 décembre 2024", "4 janvier 2025"],
    ["03 MARS 2024", "13 MARS 2024"],
    ["15 Fevrier 2024", "25 Février 2024"],
    ["3 Mar. 2024", "13 Mar. 2024"],
    ["3 March 2024", "13 March 2024"],
    ["March 3, 2024", "March 13, 2024"],
    ["3rd March 2024", "13th March 2024"],
    ["03/03/2024", "13/03/2024"],
    ["3/3/2024", "13/3/2024"],
    ["03-03-2024", "13-03-2024"],
    ["03.03.2024", "13.03.2024"],
    ["03/03/24", "13/03/24"],
    ["2024-03-03", "2024-03-13"],
  ])("shifts %s to %s", (source, expected) => {
    const result = shift(source);
    expect(result.text).toBe(expected);
    expect(result.datesShifted).toBe(1);
  });

  it("writes the first of the month as 1er in French", () => {
    expect(shift("20 février 2023", 9).text).toBe("1er mars 2023");
    expect(shift("1er mars 2023", 2).text).toBe("3 mars 2023");
  });

  it("shifts backwards with a negative offset", () => {
    expect(shift("5 janvier 2024", -10).text).toBe("26 décembre 2023");
  });

  it("keeps a date wrapped across lines, and sentence punctuation", () => {
    expect(shift("Signé le 3\nmars 2024.").text).toBe(
      "Signé le 13\nmars 2024.",
    );
    expect(shift("le 03/03/2024, puis").text).toBe("le 13/03/2024, puis");
  });

  it("does not shift clause numbers", () => {
    expect(shift("Article 14.3.2 et 14.3.20").text).toBe(
      "Article 14.3.2 et 14.3.20",
    );
  });

  it("reports impossible dates instead of guessing", () => {
    const result = shift("le 03/25/2024 et le 31 février 2024");
    expect(result.text).toContain("03/25/2024");
    expect(result.residuals.map((r) => r.text)).toEqual(
      expect.arrayContaining(["03/25/2024", "31 février 2024"]),
    );
  });
});

describe("what it reports as left unchanged", () => {
  const kinds = (text: string) =>
    anonymiseText(text, { Inutile: "Exemple" }, 10).residuals.map(
      (r) => r.kind,
    );

  it.each([
    ["an amount with a currency", "pour 1 250 000 FCFA", "amount"],
    ["a currency before the amount", "pour EUR 12 500", "amount"],
    ["an amount in words", "un milliard de francs", "amount"],
    ["a large number", "soit 1 250 000 au total", "amount"],
    ["a month and year", "en mars 2024", "partial-date"],
    ["a bare year", "exercice 2023", "year"],
    ["a reference number", "marché n° 00123/M/2023", "reference"],
    ["an email address", "contact@exemple.cm", "contact"],
    ["a phone number", "+237 699 12 34 56", "contact"],
    ["a post box", "BP 1234 Yaoundé", "contact"],
  ])("reports %s", (_name, text, kind) => {
    expect(kinds(text)).toContain(kind);
  });

  it("reports the first day of a date range", () => {
    const result = shift("du 3 au 5 mars 2024");
    expect(result.residuals).toContainEqual({
      kind: "partial-date",
      text: "3 au",
      count: 1,
    });
  });

  it("does not report values the map replaced, or shifted dates", () => {
    const result = anonymiseText(
      "Le 3 mars 2024, 1 250 000 FCFA.",
      { "1 250 000 FCFA": "900 000 FCFA" },
      10,
    );
    expect(result.text).toBe("Le 13 mars 2024, 900 000 FCFA.");
    expect(result.residuals).toEqual([]);
  });

  it("does not report plain periods and percentages", () => {
    expect(kinds("sous 15 jours, soit 5 % du montant")).toEqual([]);
  });

  it("counts repeats once", () => {
    const result = shift("2023 puis 2023");
    expect(result.residuals).toEqual([
      { kind: "year", text: "2023", count: 2 },
    ]);
  });
});

describe("page breaks", () => {
  it("keeps form feeds so page numbers survive", () => {
    expect(shift("page un\fpage deux\f").text).toBe("page un\fpage deux\f");
  });
});

describe("validateNameMap and containsName", () => {
  it("rejects an empty map", () => {
    expect(validateNameMap({})).toMatch(/empty/);
  });

  it("rejects a replacement that still contains a real name", () => {
    expect(validateNameMap({ Alpha: "Alpha Démo" })).toMatch(/real name/);
  });

  it("accepts a clean map", () => {
    expect(validateNameMap({ Alpha: "Démo" })).toBeNull();
  });

  it("finds a real name in a file name", () => {
    expect(containsName("alpha-conditions.anon.txt", NAMES)).toBe(true);
    expect(containsName("conditions.anon.txt", NAMES)).toBe(false);
  });
});
