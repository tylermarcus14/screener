import assert from "node:assert/strict";
import test from "node:test";
import { serviceErrorResponse, simplifyScreeningResponse } from "../src/simplifiedResponse.js";

test("simplifyScreeningResponse returns only zapierAction and unique flag urls", () => {
  const simplified = simplifyScreeningResponse({
    body: {
      candidateId: "test-123",
      zapierAction: "hold_for_hr_review",
      summary: "Do not return me.",
      flags: [
        { url: "https://example.com/one", evidence: "Article one" },
        { url: "https://example.com/two", evidence: "Article two" },
        { url: "https://example.com/one", evidence: "Duplicate" },
        { evidence: "No URL" }
      ]
    }
  });

  assert.deepEqual(simplified, {
    zapierAction: "hold_for_hr_review",
    urls: ["https://example.com/one", "https://example.com/two"]
  });
});

test("serviceErrorResponse holds for review without extra details", () => {
  assert.deepEqual(serviceErrorResponse(), {
    zapierAction: "hold_for_hr_review",
    urls: []
  });
});
