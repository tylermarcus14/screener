const ALWAYS_EXCLUDED_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "linkedin.com",
  "youtube.com",
  "x.com",
  "twitter.com"
];

export async function tavilySearchProvider(queries, _candidate, config = process.env) {
  const apiKey = config.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is required for live search.");
  }

  const requests = buildTavilyRequests(queries, config);
  const responses = await Promise.allSettled(
    requests.map((request) => runTavilySearch(request, apiKey))
  );

  const allResults = [];
  const errors = [];
  for (let index = 0; index < responses.length; index += 1) {
    const response = responses[index];
    if (response.status === "rejected") {
      errors.push(`${requests[index].query}: ${response.reason.message}`);
      continue;
    }
    allResults.push(...response.value);
  }

  if (allResults.length === 0 && errors.length > 0) {
    throw new Error(`All Tavily searches failed: ${errors.join(" | ").slice(0, 700)}`);
  }

  return dedupeAndRank(allResults, config);
}

export function buildTavilyRequests(queries, config = process.env) {
  const maxResults = clampInteger(config.TAVILY_MAX_RESULTS_PER_QUERY, 5, 1, 10);
  const searchDepth = normalizeSearchDepth(config.TAVILY_SEARCH_DEPTH || "basic");
  const includeDomains = parseDomainList(config.TAVILY_INCLUDE_DOMAINS);
  const excludeDomains = parseDomainList(
    config.TAVILY_EXCLUDE_DOMAINS ||
      "facebook.com,instagram.com,tiktok.com,linkedin.com,youtube.com,x.com,twitter.com"
  );
  const effectiveExcludeDomains = [...new Set([...excludeDomains, ...ALWAYS_EXCLUDED_DOMAINS])];

  return queries.map((query) => ({
    query: trimQuery(query),
    topic: shouldUseNewsTopic(query) ? "news" : "general",
    search_depth: searchDepth,
    max_results: maxResults,
    chunks_per_source: searchDepth === "advanced" ? 3 : undefined,
    include_answer: false,
    include_raw_content: false,
    include_images: false,
    include_usage: true,
    country: shouldUseNewsTopic(query) ? undefined : "united states",
    exact_match: false,
    include_domains: includeDomains.length > 0 ? includeDomains : undefined,
    exclude_domains: effectiveExcludeDomains.length > 0 ? effectiveExcludeDomains : undefined
  }));
}

async function runTavilySearch(request, apiKey) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(removeUndefined(request))
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Tavily search failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const items = Array.isArray(data.results) ? data.results : [];
  return items.map((item) => ({
    query: request.query,
    topic: request.topic,
    title: item.title || "",
    link: item.url || "",
    snippet: item.content || "",
    score: typeof item.score === "number" ? item.score : null,
    publishedDate: item.published_date || null
  }));
}

function dedupeAndRank(results, config) {
  const minimumScore = clampNumber(config.TAVILY_MIN_SCORE, 0.45, 0, 1);
  const excludeDomains = parseDomainList(
    config.TAVILY_EXCLUDE_DOMAINS ||
      "facebook.com,instagram.com,tiktok.com,linkedin.com,youtube.com,x.com,twitter.com"
  );
  const effectiveExcludeDomains = [...new Set([...excludeDomains, ...ALWAYS_EXCLUDED_DOMAINS])];
  const seen = new Set();
  return results
    .filter((result) => result.score == null || result.score >= minimumScore)
    .filter((result) => !isExcludedDomain(result.link, effectiveExcludeDomains))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .filter((result) => {
      if (!result.link || seen.has(result.link)) return false;
      seen.add(result.link);
      return true;
    });
}

function isExcludedDomain(link, excludeDomains) {
  if (excludeDomains.length === 0) return false;
  let hostname;
  try {
    hostname = new URL(link).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }

  return excludeDomains.some((domain) => {
    const normalized = domain.toLowerCase().replace(/^www\./, "");
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
}

function shouldUseNewsTopic(query) {
  return /\b(arrest|arrested|charges|charged|police|sheriff|sentenced|sentencing)\b/i.test(query);
}

function trimQuery(query) {
  return String(query || "").replace(/\s+/g, " ").trim().slice(0, 400);
}

function normalizeSearchDepth(value) {
  return ["advanced", "basic", "fast", "ultra-fast"].includes(value) ? value : "basic";
}

function parseDomainList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean)
    .slice(0, 150);
}

function clampInteger(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampNumber(value, fallback, min, max) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function removeUndefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}
