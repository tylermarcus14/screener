import assert from "node:assert/strict";
import test from "node:test";
import { buildTavilyRequests, tavilySearchProvider } from "../src/tavilySearch.js";

test("buildTavilyRequests uses flexible matching, topic selection, score-friendly settings, and exclusions", () => {
  const requests = buildTavilyRequests([
    "\"Jane Smith\" Miami court",
    "\"Jane Smith\" Miami arrested police"
  ], {
    TAVILY_SEARCH_DEPTH: "advanced",
    TAVILY_MAX_RESULTS_PER_QUERY: "3",
    TAVILY_MIN_SCORE: "0.4"
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].topic, "general");
  assert.equal(requests[0].country, "united states");
  assert.equal(requests[0].exact_match, false);
  assert.equal(requests[0].search_depth, "advanced");
  assert.equal(requests[0].chunks_per_source, 3);
  assert.equal(requests[0].include_usage, true);
  assert.equal(requests[0].exclude_domains.includes("facebook.com"), false);

  assert.equal(requests[1].topic, "news");
  assert.equal(requests[1].country, undefined);
});

test("buildTavilyRequests keeps flexible matching and hard social exclusions even when env disagrees", () => {
  const requests = buildTavilyRequests(["Tommy Dennis bank robbery"], {
    TAVILY_EXACT_MATCH: "true",
    TAVILY_EXCLUDE_DOMAINS: "facebook.com,instagram.com"
  });

  assert.equal(requests[0].exact_match, false);
  assert.equal(requests[0].exclude_domains.includes("facebook.com"), false);
  assert.ok(requests[0].exclude_domains.includes("instagram.com"));
});

test("tavilySearchProvider posts queries concurrently and normalizes ranked results", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          results: [
            {
              title: "Jane Smith court record",
              url: "https://example.com/court",
              content: "Jane Smith appeared in Miami court.",
              score: 0.91,
              published_date: "2025-01-05"
            }
          ]
        };
      }
    };
  };

  try {
    const results = await tavilySearchProvider(["\"Jane Smith\" Miami court"], {}, {
      TAVILY_API_KEY: "tvly-test",
      TAVILY_SEARCH_DEPTH: "basic",
      TAVILY_MAX_RESULTS_PER_QUERY: "3",
      TAVILY_MIN_SCORE: "0.5"
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.tavily.com/search");
    assert.equal(calls[0].options.headers.Authorization, "Bearer tvly-test");

    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.query, "\"Jane Smith\" Miami court");
    assert.equal(body.country, "united states");
    assert.equal(body.exact_match, false);
    assert.equal(body.include_usage, true);
    assert.equal(body.max_results, 3);
    assert.deepEqual(results, [
      {
        query: "\"Jane Smith\" Miami court",
        topic: "general",
        title: "Jane Smith court record",
        link: "https://example.com/court",
        snippet: "Jane Smith appeared in Miami court.",
        score: 0.91,
        publishedDate: "2025-01-05"
      }
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tavilySearchProvider filters social noise but keeps Facebook mugshot pages", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        results: [
          {
            title: "Unrelated social result",
            url: "https://www.facebook.com/groups/1477976129168842/posts/3906568636309567/",
            content: "Networking event.",
            score: 0.99
          },
          {
            title: "Broward - Dennis, Jason AGGRAVATED BATTERY",
            url: "https://www.facebook.com/photo.php?fbid=122180362376534473&set=a.122104390688534473&id=61566034211716",
            content: "Facebook post by Broward County Mugshots. Dennis, Jason aggravated battery.",
            score: 0.95
          },
          {
            title: "News result",
            url: "https://news.example.com/article",
            content: "Relevant news.",
            score: 0.7
          }
        ]
      };
    }
  });

  try {
    const results = await tavilySearchProvider(["Andres Jimenez"], {}, {
      TAVILY_API_KEY: "tvly-test",
      TAVILY_MIN_SCORE: "0.5",
      TAVILY_EXCLUDE_DOMAINS: "instagram.com"
    });

    assert.deepEqual(results.map((result) => result.link), [
      "https://www.facebook.com/photo.php?fbid=122180362376534473&set=a.122104390688534473&id=61566034211716",
      "https://news.example.com/article"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tavilySearchProvider filters low scores and deduplicates by URL", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        results: [
          {
            title: "Strong result",
            url: "https://example.com/strong",
            content: "High relevance.",
            score: 0.8
          },
          {
            title: "Duplicate strong result",
            url: "https://example.com/strong",
            content: "Same URL.",
            score: 0.75
          },
          {
            title: "Weak result",
            url: "https://example.com/weak",
            content: "Low relevance.",
            score: 0.2
          }
        ]
      };
    }
  });

  try {
    const results = await tavilySearchProvider(["Jane Smith"], {}, {
      TAVILY_API_KEY: "tvly-test",
      TAVILY_MIN_SCORE: "0.5"
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].link, "https://example.com/strong");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tavilySearchProvider requires an API key", async () => {
  await assert.rejects(
    () => tavilySearchProvider(["Jane Smith"], {}, {}),
    /TAVILY_API_KEY/
  );
});
