import { describe, expect, it } from "vitest";

import { emailTypesFor } from "./email";

const types = { results: "R", reminders: "Rm", death: "D", gowAdmin: "G" };

describe("emailTypesFor", () => {
  it("hides the GOW selection toggle from members", () => {
    expect(emailTypesFor(types, "member")).toEqual(["results", "reminders", "death"]);
  });

  it("shows it to owners and admins", () => {
    expect(emailTypesFor(types, "owner")).toEqual(["results", "reminders", "death", "gowAdmin"]);
    expect(emailTypesFor(types, "admin")).toContain("gowAdmin");
  });
});
