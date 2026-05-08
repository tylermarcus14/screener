import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSearchLocations,
  buildSearchQueries,
  normalizePhone,
  screenCandidate,
  STATUSES,
  ZAPIER_ACTIONS
} from "../src/screening.js";

const now = () => new Date("2026-05-05T17:00:00.000Z");

test("normalizePhone accepts common US phone formats", () => {
  const expected = "+19545550100";
  assert.equal(normalizePhone("9545550100"), expected);
  assert.equal(normalizePhone("(954) 555-0100"), expected);
  assert.equal(normalizePhone("954-555-0100"), expected);
  assert.equal(normalizePhone("954.555.0100"), expected);
  assert.equal(normalizePhone("+1 954 555 0100"), expected);
  assert.equal(normalizePhone("1 (954) 555-0100 ext 123"), expected);
  assert.equal(normalizePhone("1-954-555-0100 x123"), expected);
});

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
      searchProvider: async (queries) => [
        {
          query: queries[1],
          title: "Jane Smith convicted of arson in Broward",
          snippet: "Jane Smith was convicted of arson in Broward County, according to court records.",
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

test("query-only crime and location words do not flag unrelated search results", async () => {
  const result = await screenCandidate(
    {
      candidateId: "hubspot-456",
      firstName: "Andres",
      lastName: "Jimenez"
    },
    {
      now,
      searchProvider: async (queries) => [
        {
          query: queries[1],
          title: "Networking Latino in Brisbane",
          snippet: "Calling all Latino business owners in Brisbane for a communication masterclass.",
          link: "https://www.facebook.com/groups/1477976129168842/posts/3906568636309567/"
        }
      ]
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.CLEAR);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.CONTINUE);
  assert.equal(result.body.flags.length, 0);
});

test("AI low-severity social media noise cannot override a clear heuristic result", async () => {
  const result = await screenCandidate(
    {
      candidateId: "hubspot-456",
      firstName: "Andres",
      lastName: "Jimenez"
    },
    {
      now,
      searchProvider: async () => [
        {
          title: "Networking Latino in Brisbane",
          snippet: "Calling all Latino business owners in Brisbane for a communication masterclass.",
          link: "https://example.com/networking"
        }
      ],
      aiReviewer: async () => ({
        status: STATUSES.INSUFFICIENT,
        confidence: "low",
        candidateMatchConfidence: "low",
        summary: "Low-confidence social result.",
        flags: [
          {
            type: "name_only_social_result",
            severity: "low",
            evidence: "Unrelated Facebook group result.",
            url: "https://www.facebook.com/groups/1477976129168842/posts/3906568636309567/",
            matchedTerms: ["battery"]
          }
        ]
      })
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.CLEAR);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.CONTINUE);
  assert.equal(result.body.flags.length, 0);
});

test("middle-name Broward robbery result is flagged for Fort Lauderdale search area", async () => {
  const result = await screenCandidate(
    {
      candidateId: "hubspot-789",
      firstName: "Tommy",
      lastName: "Dennis"
    },
    {
      now,
      searchProvider: async (queries) => {
        assert.ok(queries.some((query) => query.includes("Tommy Dennis") && query.includes("bank robbery")));
        return [
          {
            query: queries.at(-1),
            title: "Man said he smoked crack all day before bank robbery and chase in Broward, FBI says",
            snippet:
              "Tommy Duwayne Dennis, 56, is facing a federal bank robbery charge in the incident, according to an FBI arrest affidavit.",
            link: "https://www.nbcmiami.com/news/local/man-said-he-smoked-crack-all-day-before-bank-robbery-and-chase-in-broward-fbi-says/3793909/"
          }
        ];
      }
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.REVIEW);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.HOLD);
  assert.equal(result.body.flags[0].url, "https://www.nbcmiami.com/news/local/man-said-he-smoked-crack-all-day-before-bank-robbery-and-chase-in-broward-fbi-says/3793909/");
});

test("bad article without a location still flags when no conflicting state is present", async () => {
  const result = await screenCandidate(
    {
      candidateId: "hubspot-790",
      firstName: "Tommy",
      lastName: "Dennis"
    },
    {
      now,
      searchProvider: async () => [
        {
          title: "Tommy Duwayne Dennis facing federal bank robbery charge",
          snippet: "FBI says Tommy Duwayne Dennis is facing a federal bank robbery charge after a police chase.",
          link: "https://news.example.com/tommy-dennis-bank-robbery"
        }
      ]
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.REVIEW);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.HOLD);
  assert.equal(result.body.candidateMatchConfidence, "low");
  assert.equal(result.body.flags[0].locationMatched, false);
});

test("bad article from a conflicting non-Florida state is excluded", async () => {
  const result = await screenCandidate(
    {
      candidateId: "hubspot-791",
      firstName: "Tommy",
      lastName: "Dennis"
    },
    {
      now,
      searchProvider: async () => [
        {
          title: "Tommy Dennis charged with bank robbery in Oregon",
          snippet: "Police in Oregon said Tommy Dennis was charged after a bank robbery.",
          link: "https://news.example.com/oregon-tommy-dennis"
        }
      ]
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.CLEAR);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.CONTINUE);
  assert.equal(result.body.flags.length, 0);
});

test("bad article from Florida is allowed even without city match", async () => {
  const result = await screenCandidate(
    {
      candidateId: "hubspot-792",
      firstName: "Tommy",
      lastName: "Dennis"
    },
    {
      now,
      searchProvider: async () => [
        {
          title: "Tommy Dennis charged with bank robbery in Florida",
          snippet: "Police in Florida said Tommy Dennis was charged after a bank robbery.",
          link: "https://news.example.com/florida-tommy-dennis"
        }
      ]
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.REVIEW);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.HOLD);
  assert.equal(result.body.flags[0].locationMatched, false);
});

test("reversed-name Broward mugshot result is flagged", async () => {
  const result = await screenCandidate(
    {
      candidateId: "hubspot-793",
      firstName: "Jason",
      lastName: "Dennis"
    },
    {
      now,
      searchProvider: async (queries) => {
        assert.ok(queries.some((query) => query.includes("\"Dennis Jason\"")));
        return [
          {
            title: "DENNIS JASON 08/25/2025 - Broward County Mugshots Zone",
            snippet:
              "DENNIS JASON was arrested in Broward County Florida. Booked by MAIN JAIL.",
            link: "https://browardfl.mugshots.zone/dennis-jason-mugshot-08-25-2025/"
          }
        ];
      }
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.REVIEW);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.HOLD);
  assert.equal(result.body.flags[0].url, "https://browardfl.mugshots.zone/dennis-jason-mugshot-08-25-2025/");
  assert.equal(result.body.flags[0].locationMatched, true);
});

test("Florida court result for candidate name is flagged", async () => {
  const result = await screenCandidate(
    {
      candidateId: "hubspot-794",
      firstName: "Jason",
      lastName: "Dennis"
    },
    {
      now,
      searchProvider: async () => [
        {
          title: "JASON DENNIS vs STATE OF FLORIDA",
          snippet:
            "JASON DENNIS vs STATE OF FLORIDA. Docket Number: 19-1227. Date: October 10, 2019.",
          link: "https://law.justia.com/cases/florida/fourth-district-court-of-appeal/2019/19-1227.html"
        }
      ]
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.REVIEW);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.HOLD);
});

test("Palm Beach fraud article is found by Florida-wide query and boosted by alias", async () => {
  const result = await screenCandidate(
    {
      candidateId: "hubspot-795",
      firstName: "Jason",
      lastName: "Dennis"
    },
    {
      now,
      searchProvider: async (queries) => {
        assert.ok(queries.some((query) => query.includes("\"Jason Dennis\" Florida fraud")));
        return [
          {
            query: queries[1],
            title: "Delray Beach Car Dealer Charged With Multiple Counts Of Fraud",
            snippet:
              "Delray Beach resident Jason Dennis owns and manages Car City in West Palm Beach and is facing multiple fraud counts.",
            link: "https://bocanewsnow.com/2023/02/14/delray-beach-car-dealer-charged-with-multiple-counts-of-fraud/"
          }
        ];
      }
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.REVIEW);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.HOLD);
  assert.equal(result.body.flags[0].url, "https://bocanewsnow.com/2023/02/14/delray-beach-car-dealer-charged-with-multiple-counts-of-fraud/");
  assert.equal(result.body.flags[0].locationMatched, true);
});

test("Facebook mugshot page can be flagged when source content is clearly arrest-related", async () => {
  const result = await screenCandidate(
    {
      candidateId: "hubspot-797",
      firstName: "Jason",
      lastName: "Dennis"
    },
    {
      now,
      searchProvider: async () => [
        {
          title: "Broward - Dennis, Jason AGGRAVATED BATTERY",
          snippet:
            "Facebook post by Broward County Mugshots. Dennis, Jason aggravated battery cause bodily harm.",
          link: "https://www.facebook.com/photo.php?fbid=122180362376534473&set=a.122104390688534473&id=61566034211716"
        }
      ]
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.REVIEW);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.HOLD);
  assert.equal(result.body.flags[0].url, "https://www.facebook.com/photo.php?fbid=122180362376534473&set=a.122104390688534473&id=61566034211716");
});

test("default search coverage includes major South and Central Florida areas", async () => {
  const result = await screenCandidate(
    {
      candidateId: "hubspot-796",
      firstName: "Carlos",
      lastName: "Rivera"
    },
    {
      now,
      searchProvider: async (queries, candidate) => {
        const queryText = queries.join("\n").toLowerCase();
        assert.match(queryText, /broward county fl/);
        assert.match(queryText, /miami-dade county fl/);
        assert.match(queryText, /orange county fl/);
        assert.match(queryText, /palm beach county fl/);

        const searchText = JSON.stringify(buildSearchLocations(candidate)).toLowerCase();
        for (const location of [
          "fort lauderdale",
          "miami",
          "dade county",
          "orlando",
          "delray beach",
          "boca raton"
        ]) {
          assert.match(searchText, new RegExp(location));
        }

        return [];
      }
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, STATUSES.CLEAR);
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

test("AI cannot hold a clear heuristic result without credible flags", async () => {
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
  assert.equal(result.body.status, STATUSES.CLEAR);
  assert.equal(result.body.zapierAction, ZAPIER_ACTIONS.CONTINUE);
  assert.equal(result.body.flags.length, 0);
});

test("phone number adds area-code city search context plus default Florida coverage", async () => {
  const validationPayload = {
    candidateId: "hubspot-123",
    firstName: "Jane",
    lastName: "Smith",
    phone: "305-555-0100"
  };

  const result = await screenCandidate(validationPayload, {
    now,
    searchProvider: async (queries, candidate) => {
      assert.ok(queries.some((query) => query.includes("\"Broward County FL\"")));
      assert.ok(queries.some((query) => query.includes("\"Miami FL\"")));
      assert.equal(candidate.phoneAreaCode, "305");
      assert.deepEqual(candidate.phoneAreaCodeLocation, { city: "Miami", state: "FL" });
      return [];
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.normalizedPhone, "+13055550100");
  assert.equal(result.body.phoneAreaCode, "305");
  assert.equal(result.body.phoneAreaCodeCity, "Miami, FL");
  assert.deepEqual(result.body.searchLocations.map((location) => location.source), [
    "default",
    "default",
    "default",
    "default",
    "phone_area_code"
  ]);
});

test("buildSearchQueries deduplicates Broward phone area code location", async () => {
  const result = await screenCandidate(
    {
      candidateId: "hubspot-123",
      firstName: "Jane",
      lastName: "Smith",
      phone: "(954) 555-0100"
    },
    {
      now,
      searchProvider: async (queries) => {
        const browardQueries = queries.filter((query) => query.includes("\"Broward County FL\""));
        assert.equal(browardQueries.length, 6);
        assert.ok(queries.some((query) => query.includes("\"Jane Smith\" Florida")));
        return [];
      }
    }
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.phoneAreaCodeCity, "Fort Lauderdale, FL");
});

function baseCandidate() {
  return {
    candidateId: "hubspot-123",
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@example.com",
    phone: "305-555-0100",
    city: "Miami",
    state: "FL",
    roleTitle: "Sales Representative",
    jobCity: "Miami",
    jobState: "FL",
    hubspotUrl: "https://app.hubspot.com/contacts/123"
  };
}
