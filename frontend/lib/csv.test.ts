import { expect, it } from "vitest";

import { toCsv } from "./csv";

it("joins cells with commas and rows with CRLF", () => {
  expect(toCsv([["Member", "KC @ DEN"], ["Pat", 14]])).toBe("Member,KC @ DEN\r\nPat,14\r\n");
});

it("quotes commas, quotes and newlines", () => {
  expect(toCsv([['Mike "Uncle", Sr.', "two\nlines"]])).toBe('"Mike ""Uncle"", Sr.","two\nlines"\r\n');
});

it("writes null as an empty cell and keeps negative numbers", () => {
  expect(toCsv([[null, -15, 0]])).toBe(",-15,0\r\n");
});

it("defuses text that a spreadsheet would run as a formula", () => {
  expect(toCsv([["=HYPERLINK(1)", "+1", "@x", "-2"]])).toBe("'=HYPERLINK(1),'+1,'@x,'-2\r\n");
});
