import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("frontend exposes all candidate fields and marks first and last name required", () => {
  const html = fs.readFileSync("public/index.html", "utf8");

  for (const field of [
    "candidateId",
    "firstName",
    "lastName",
    "email",
    "city",
    "state",
    "roleTitle",
    "jobCity",
    "jobState",
    "hubspotUrl",
    "conditionalOfferMade"
  ]) {
    assert.match(html, new RegExp(`name="${field}"`));
  }

  assert.match(html, /name="firstName"[^>]*required/);
  assert.match(html, /name="lastName"[^>]*required/);
  assert.match(html, /All other fields are optional and can be blank/);
});
