import { expect, it } from "vitest";

import { gradeMark, standingsHref } from "./results";

it("marks only right and wrong picks", () => {
  expect(["right", "wrong", "tie", "void", "pending", undefined].map((g) => gradeMark(g as never))).toEqual([
    "correct",
    "wrong",
    null,
    null,
    null,
    null,
  ]);
});

it("links the standings page by group id", () => {
  expect(standingsHref("a b")).toBe("/group/standings/?id=a%20b");
});
