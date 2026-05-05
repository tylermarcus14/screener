import assert from "node:assert/strict";
import test from "node:test";
import { screenCandidate, STATUSES, ZAPIER_ACTIONS } from "../src/screening.js";

const now = () => new Date("2026-05-05T17:00:00.000Z");

test("clean candidate returns clear_to_schedule with Zapier continue", async () => {
  const result = await screenCandidate(baseCandidate(), {
    now,
    searchProvider: async () => [
      {
        title: "Jane Smith sales profile",
        snippet: "Professional profile for Jane Smith in Miami.",
        link: "https://example.com/jane-smith"
      }
    ]
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.CLEAR);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.CONTINUE);
  assert.ok(Array.isArray(result.body.flags));
  assert.equal(result.body.flags.length, 0);
});

test("serious credible match returns review_required", async () => {
  const result = await screenCandidate(baseCandidate(), {
    now,
    searchProvider: async () => [
      {
        title: "Jane Smith convicted of armed robbery in Miami court",
        snippet: "Jane Smith of Miami, FL was sentenced after an armed robbery conviction.",
        link: "https://news.example.com/jane-smith-robbery"
      }
    ]
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.REVIEW);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.HOLD);
  assert.equal(result.body.flags[0].severity, "high");
});

test("arrest-only serious article is unverified and still human review only", async () => {
  const result = await screenCandidate(baseCandidate(), {
    now,
    searchProvider: async () => [
      {
        title: "Jane Smith arrested in Miami assault investigation",
        snippet: "Police arrested Jane Smith of Miami after an alleged assault. Charges remain pending.",
        link: "https://news.example.com/jane-smith-arrest"
      }
    ]
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.REVIEW);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.HOLD);
  assert.equal(result.body.flags[0].type, "unverified_arrest_or_charge");
});

test("Gainesville candidate is blocked before search at this stage", async () => {
  let searchCalled = false;
  const result = await screenCandidate(
    {
      ...baseCandidate(),
      city: "Gainesville",
      state: "FL",
      jobCity: "Gainesville",
      jobState: "FL"
    },
    {
      now,
      searchProvider: async () => {
        searchCalled = true;
        return [];
      }
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.NOT_ALLOWED);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.HOLD);
  assert.equal(searchCalled, false);
});

test("first and last name only can run search and returns low-confidence clear result", async () => {
  const result = await screenCandidate(
    {
      candidateId: "hubspot-123",
      firstName: "Jane",
      lastName: "Smith"
    },
    {
      now,
      searchProvider: async () => [
        {
          title: "Jane Smith professional profile",
          snippet: "Jane Smith is listed in a business directory.",
          link: "https://example.com/jane-smith"
        }
      ]
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.CLEAR);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.CONTINUE);
  assert.equal(result.body.candidateMatchConfidence, "low");
  assert.match(result.body.summary, /Name-only/);
});

test("first and last name only concerning results require low-confidence human review", async () => {
  const result = await screenCandidate(
    {
      candidateId: "hubspot-123",
      firstName: "Jane",
      lastName: "Smith"
    },
    {
      now,
      searchProvider: async () => [
        {
          title: "Jane Smith convicted of arson",
          snippet: "Jane Smith was convicted of arson, according to court records.",
          link: "https://example.com/jane-smith-arson"
        }
      ]
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.REVIEW);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.HOLD);
  assert.equal(result.body.candidateMatchConfidence, "low");
  assert.match(result.body.summary, /name-only/i);
});

test("missing first or last name returns 400 validation details", async () => {
  const result = await screenCandidate(
    {
      firstName: "Jane",
      state: "FL"
    },
    {
      now,
      searchProvider: async () => []
    }
  );

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.status, "validation_error");
  assert.match(result.body.errors[0], /lastName/);
});

test("AI review can strengthen a low-confidence name collision into insufficient_identity", async () => {
  const result = await screenCandidate(baseCandidate(), {
    now,
    searchProvider: async () => [
      {
        title: "Jane Smith robbery case in another state",
        snippet: "Jane Smith of Oregon was convicted in a robbery case.",
        link: "https://example.com/other-jane"
      }
    ],
    aiReviewer: async () => ({
      status: STATUSES.INSUFFICIENT,
      confidence: "high",
      candidateMatchConfidence: "low",
      summary: "The result appears to describe a different Jane Smith and needs more identity data.",
      flags: []
    })
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.INSUFFICIENT);
  assert.equal(result.body.candidateMatchConfidence, "low");
});

function baseCandidate() {
  return {
    candidateId: "hubspot-123",
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@example.com",
    city: "Miami",
    state: "FL",
    roleTitle: "Sales Representative",
    jobCity: "Miami",
    jobState: "FL",
    hubspotUrl: "https://app.hubspot.com/contacts/123"
  };
}
