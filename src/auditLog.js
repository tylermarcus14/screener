export function logScreeningResult(result) {
  const body = result?.body || {};
  console.log(JSON.stringify({
    event: "candidate_screen_result",
    candidateId: body.candidateId || null,
    auditId: body.auditId || null,
    status: body.status || "unknown",
    zapierAction: body.zapierAction || "unknown",
    confidence: body.confidence || "unknown",
    candidateMatchConfidence: body.candidateMatchConfidence || "unknown",
    summary: body.summary || "",
    flags: sanitizeFlags(body.flags),
    queries: Array.isArray(body.queries) ? body.queries : [],
    searchLocations: Array.isArray(body.searchLocations) ? body.searchLocations : [],
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
    matchedTerms: Array.isArray(flag.matchedTerms) ? flag.matchedTerms : []
  }));
}
