import assert from "node:assert/strict";
import test from "node:test";
import { logScreeningResult } from "../src/auditLog.js";

test("logScreeningResult logs safe audit fields without request PII", () => {
  const originalLog = console.log;
  const lines = [];
  console.log = (line) => lines.push(line);

  try {
    logScreeningResult({
      body: {
        candidateId: "hubspot-123",
        auditId: "audit-123",
        candidateName: "Jane Smith",
        status: "review_required",
        zapierAction: "hold_for_hr_review",
        confidence: "medium",
        candidateMatchConfidence: "low",
        summary: "Human review required.",
        email: "do-not-log@example.com",
        phone: "954-555-0100",
        normalizedPhone: "+19545550100",
        flags: [
          {
            type: "potential_job_related_record",
            severity: "high",
            evidence: "Example article",
            url: "https://example.com",
            matchedTerms: ["arson"]
          }
        ],
        queries: ["\"Jane Smith\" \"Fort Lauderdale FL\" arson"],
        searchLocations: [{ city: "Fort Lauderdale", state: "FL", source: "default" }],
        searchResults: [
          {
            title: "Jane Smith court record",
            url: "https://example.com/court",
            snippet: "Jane Smith appeared in court.",
            query: "\"Jane Smith\" court",
            topic: "general",
            score: 0.91,
            publishedDate: "2026-05-01"
          }
        ],
        phoneAreaCode: "954",
        phoneAreaCodeCity: "Fort Lauderdale, FL",
        resultCount: 1,
        reviewedAt: "2026-05-05T18:30:00.000Z"
      }
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.event, "candidate_screen_result");
  assert.equal(parsed.candidateId, "hubspot-123");
  assert.equal(parsed.candidateName, "Jane Smith");
  assert.equal(parsed.status, "review_required");
  assert.equal(parsed.flags[0].url, "https://example.com");
  assert.equal(parsed.flags[0].locationMatched, false);
  assert.equal(parsed.searchResults[0].url, "https://example.com/court");
  assert.equal(parsed.searchResults[0].score, 0.91);
  assert.equal(parsed.phoneAreaCode, "954");
  assert.equal(parsed.normalizedPhone, undefined);
  assert.equal(JSON.stringify(parsed).includes("do-not-log@example.com"), false);
  assert.equal(JSON.stringify(parsed).includes("954-555-0100"), false);
});
