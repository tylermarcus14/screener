export function logScreeningResult(result) {
  const body = result?.body || {};
  console.log(JSON.stringify({
    event: "candidate_screen_result",
    candidateId: body.candidateId || null,
    auditId: body.auditId || null,
    candidateName: body.candidateName || null,
    status: body.status || "unknown",
    zapierAction: body.zapierAction || "unknown",
    confidence: body.confidence || "unknown",
    candidateMatchConfidence: body.candidateMatchConfidence || "unknown",
    summary: body.summary || "",
    flags: sanitizeFlags(body.flags),
    queries: Array.isArray(body.queries) ? body.queries : [],
    searchLocations: Array.isArray(body.searchLocations) ? body.searchLocations : [],
    searchResults: sanitizeSearchResults(body.searchResults),
    phoneAreaCode: body.phoneAreaCode || null,
    phoneAreaCodeCity: body.phoneAreaCodeCity || null,
    resultCount: typeof body.resultCount === "number" ? body.resultCount : 0,
    reviewedAt: body.reviewedAt || null
  }));
}

function sanitizeFlags(flags) {
  if (!Array.isArray(flags)) return [];
  return flags.map((flag) => ({
    type: flag.type || "flag",
    severity: flag.severity || "medium",
    evidence: flag.evidence || "",
    url: flag.url || "",
    locationMatched: flag.locationMatched === true,
    matchedTerms: Array.isArray(flag.matchedTerms) ? flag.matchedTerms : []
  }));
}

function sanitizeSearchResults(searchResults) {
  if (!Array.isArray(searchResults)) return [];
  return searchResults.slice(0, 30).map((result) => ({
    title: String(result.title || "").slice(0, 300),
    url: String(result.url || result.link || "").slice(0, 700),
    snippet: String(result.snippet || "").slice(0, 700),
    query: String(result.query || "").slice(0, 500),
    topic: String(result.topic || ""),
    score: typeof result.score === "number" ? result.score : null,
    publishedDate: result.publishedDate || null
  }));
}
