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
    "phone",
    "hubspotUrl"
  ]) {
    assert.match(html, new RegExp(`name="${field}"`));
  }

  for (const removedField of ["city", "state", "roleTitle", "jobCity", "jobState", "conditionalOfferMade"]) {
    assert.doesNotMatch(html, new RegExp(`name="${removedField}"`));
  }

  assert.match(html, /name="firstName"[^>]*required/);
  assert.match(html, /name="lastName"[^>]*required/);
  assert.match(html, /All other fields are optional and can be blank/);
  assert.match(html, /JSON\.stringify\(data, null, 2\)/);
});
