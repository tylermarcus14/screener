const SERIOUS_TERMS = [
  "armed robbery",
  "robbery",
  "assault",
  "battery",
  "arson",
  "felony",
  "weapon",
  "firearm",
  "fraud",
  "theft",
  "burglary",
  "sentenced",
  "convicted",
  "court",
  "mugshot",
  "arrest"
];

const HIGH_RISK_TERMS = [
  "armed robbery",
  "robbery",
  "assault",
  "battery",
  "arson",
  "weapon",
  "firearm",
  "fraud",
  "theft",
  "burglary",
  "convicted",
  "sentenced"
];

export const STATUSES = {
  CLEAR: "clear_to_schedule",
  REVIEW: "review_required",
  INSUFFICIENT: "insufficient_identity",
  NOT_ALLOWED: "not_allowed_at_stage"
};

export const ZAPIER_ACTIONS = {
  CONTINUE: "continue",
  HOLD: "hold_for_hr_review"
};

export function validateCandidate(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, statusCode: 400, errors: ["Request body must be a JSON object."] };
  }

  const normalized = {};
  const stringFields = [
    "candidateId",
    "firstName",
    "lastName",
    "email",
    "city",
    "state",
    "roleTitle",
    "jobCity",
    "jobState",
    "hubspotUrl"
  ];

  for (const field of stringFields) {
    if (payload[field] == null) {
      normalized[field] = "";
    } else if (typeof payload[field] === "string" || typeof payload[field] === "number") {
      normalized[field] = String(payload[field]).trim();
    } else {
      return { ok: false, statusCode: 400, errors: [`${field} must be a string if provided.`] };
    }
  }

  normalized.conditionalOfferMade = payload.conditionalOfferMade === true;

  const missing = [];
  if (!normalized.firstName) missing.push("firstName");
  if (!normalized.lastName) missing.push("lastName");

  if (missing.length > 0) {
    return {
      ok: false,
      statusCode: 400,
      errors: [`Missing required field(s): ${missing.join(", ")}.`]
    };
  }

  return { ok: true, candidate: normalized };
}

export function buildSearchQueries(candidate) {
  const fullName = `"${candidate.firstName} ${candidate.lastName}"`;
  const locationParts = [candidate.city, candidate.state].filter(Boolean);
  const jobLocationParts = [candidate.jobCity, candidate.jobState].filter(Boolean);
  const location = locationParts.length > 0 ? `"${locationParts.join(" ")}"` : "";
  const jobLocation = jobLocationParts.length > 0 ? `"${jobLocationParts.join(" ")}"` : "";

  return [
    `${fullName} ${location} arrest OR convicted OR felony OR court`,
    `${fullName} ${location} "armed robbery" OR robbery OR assault OR battery OR arson`,
    `${fullName} ${location} fraud OR theft OR burglary OR sentencing OR mugshot`,
    `${fullName} ${jobLocation} criminal OR charges OR police OR sheriff`
  ]
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function isGainesvillePreOfferBlocked(candidate, config = {}) {
  const covered = config.gainesvilleFairChanceCovered !== false;
  if (!covered || candidate.conditionalOfferMade) return false;

  const candidateLocation = isGainesvilleFlorida(candidate.city, candidate.state);
  const jobLocation = isGainesvilleFlorida(candidate.jobCity, candidate.jobState);
  return candidateLocation || jobLocation;
}

export async function screenCandidate(payload, deps = {}) {
  const validation = validateCandidate(payload);
  if (!validation.ok) {
    return {
      statusCode: validation.statusCode,
      body: {
        status: "validation_error",
        zapierAction: ZAPIER_ACTIONS.HOLD,
        confidence: "high",
        candidateMatchConfidence: "low",
        summary: "The screening request was not processed because required fields were missing or invalid.",
        flags: [],
        errors: validation.errors
      }
    };
  }

  const candidate = validation.candidate;
  const auditId = createAuditId(candidate, deps.now?.() ?? new Date());
  const base = {
    candidateId: candidate.candidateId || null,
    auditId,
    reviewUrl: `audit://candidate-screen/${auditId}`,
    complianceNote:
      "Search-only triage is not a formal background check. Do not take adverse action without verified job-related records, individualized assessment, candidate response opportunity, and HR/legal approval."
  };

  if (isGainesvillePreOfferBlocked(candidate, deps.config)) {
    return okResponse({
      ...base,
      status: STATUSES.NOT_ALLOWED,
      zapierAction: ZAPIER_ACTIONS.HOLD,
      confidence: "high",
      candidateMatchConfidence: "low",
      summary:
        "Screening was not run because Gainesville, FL fair-chance rules may prohibit considering criminal history before a conditional offer.",
      flags: [
        {
          type: "compliance_guardrail",
          severity: "high",
          evidence: "Candidate or job location is Gainesville, FL and no conditional offer was marked."
        }
      ]
    });
  }

  const searchProvider = deps.searchProvider;
  if (typeof searchProvider !== "function") {
    return {
      statusCode: 500,
      body: {
        status: "configuration_error",
        zapierAction: ZAPIER_ACTIONS.HOLD,
        confidence: "high",
        candidateMatchConfidence: "low",
        summary: "No search provider is configured.",
        flags: []
      }
    };
  }

  const queries = buildSearchQueries(candidate);
  const searchResults = await searchProvider(queries, candidate);
  const sanitizedResults = normalizeSearchResults(searchResults).slice(0, 20);
  const heuristic = heuristicReview(candidate, sanitizedResults);

  const aiReviewer = deps.aiReviewer;
  const aiReview = typeof aiReviewer === "function"
    ? await aiReviewer({ candidate, searchResults: sanitizedResults, heuristic })
    : null;

  const finalReview = mergeReviews(heuristic, aiReview);
  return okResponse({
    ...base,
    status: finalReview.status,
    zapierAction:
      finalReview.status === STATUSES.CLEAR ? ZAPIER_ACTIONS.CONTINUE : ZAPIER_ACTIONS.HOLD,
    confidence: finalReview.confidence,
    candidateMatchConfidence: finalReview.candidateMatchConfidence,
    summary: finalReview.summary,
    flags: finalReview.flags,
    queries,
    resultCount: sanitizedResults.length,
    reviewedAt: (deps.now?.() ?? new Date()).toISOString()
  });
}

export function heuristicReview(candidate, searchResults) {
  const firstLastOnly = hasOnlyFirstAndLastName(candidate);
  if (searchResults.length === 0) {
    return {
      status: STATUSES.CLEAR,
      confidence: "medium",
      candidateMatchConfidence: "low",
      summary: firstLastOnly
        ? "No search results were returned for the targeted name-only triage queries."
        : "No search results were returned for the targeted triage queries.",
      flags: []
    };
  }

  const fullName = `${candidate.firstName} ${candidate.lastName}`.toLowerCase();
  const locationTokens = [candidate.city, candidate.state, candidate.jobCity, candidate.jobState]
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  const flags = [];
  for (const result of searchResults) {
    const haystack = `${result.title} ${result.snippet} ${result.link}`.toLowerCase();
    const hasName = haystack.includes(fullName);
    const hasLocation = locationTokens.length === 0 || locationTokens.some((token) => haystack.includes(token));
    const matchedTerms = HIGH_RISK_TERMS.filter((term) => haystack.includes(term));
    if (hasName && hasLocation && matchedTerms.length > 0) {
      flags.push({
        type: haystack.includes("arrest") && !haystack.includes("convicted") ? "unverified_arrest_or_charge" : "potential_job_related_record",
        severity: matchedTerms.some((term) => ["armed robbery", "arson", "weapon", "firearm", "assault"].includes(term))
          ? "high"
          : "medium",
        evidence: result.title,
        url: result.link,
        matchedTerms: [...new Set(matchedTerms)]
      });
    }
  }

  if (flags.length === 0) {
    return {
      status: STATUSES.CLEAR,
      confidence: "medium",
      candidateMatchConfidence: "low",
      summary: firstLastOnly
        ? "Name-only search results did not contain serious job-related criminal-history indicators. Same-person confidence is low because no location or email was provided."
        : "Search results did not contain a strong same-person match to serious job-related criminal-history indicators.",
      flags: []
    };
  }

  return {
    status: STATUSES.REVIEW,
    confidence: "medium",
    candidateMatchConfidence: firstLastOnly
      ? "low"
      : flags.some((flag) => flag.severity === "high") ? "medium" : "low",
    summary: firstLastOnly
      ? "Potentially job-related name-only search results were found. Treat these as low-confidence unverified leads for human review only, not as proof or a hiring decision."
      : "Potentially job-related search results were found. Treat these as unverified leads for human review only, not as proof or a hiring decision.",
    flags
  };
}

function mergeReviews(heuristic, aiReview) {
  if (!aiReview || typeof aiReview !== "object") return heuristic;

  const status = [STATUSES.CLEAR, STATUSES.REVIEW, STATUSES.INSUFFICIENT].includes(aiReview.status)
    ? aiReview.status
    : heuristic.status;

  if (heuristic.status === STATUSES.REVIEW && status === STATUSES.CLEAR) {
    return {
      ...heuristic,
      summary:
        "Keyword triage found possible concern terms, while AI did not confirm a strong same-person match. Human review is still required."
    };
  }

  return {
    status,
    confidence: normalizeEnum(aiReview.confidence, ["low", "medium", "high"], heuristic.confidence),
    candidateMatchConfidence: normalizeEnum(
      aiReview.candidateMatchConfidence,
      ["low", "medium", "high"],
      heuristic.candidateMatchConfidence
    ),
    summary: typeof aiReview.summary === "string" && aiReview.summary.trim()
      ? aiReview.summary.trim()
      : heuristic.summary,
    flags: Array.isArray(aiReview.flags) ? sanitizeFlags(aiReview.flags) : heuristic.flags
  };
}

function normalizeSearchResults(results) {
  if (!Array.isArray(results)) return [];
  const seen = new Set();
  const normalized = [];
  for (const result of results) {
    if (!result || typeof result !== "object") continue;
    const link = String(result.link || result.url || "").trim();
    const title = String(result.title || "").trim();
    const snippet = String(result.snippet || "").trim();
    if (!link || seen.has(link)) continue;
    seen.add(link);
    normalized.push({
      title,
      snippet,
      link,
      query: String(result.query || "").trim(),
      topic: String(result.topic || "").trim(),
      score: typeof result.score === "number" ? result.score : null,
      publishedDate: result.publishedDate || null
    });
  }
  return normalized;
}

function sanitizeFlags(flags) {
  return flags.slice(0, 10).map((flag) => ({
    type: String(flag.type || "potential_job_related_record").slice(0, 80),
    severity: normalizeEnum(flag.severity, ["low", "medium", "high"], "medium"),
    evidence: String(flag.evidence || "").slice(0, 500),
    url: String(flag.url || "").slice(0, 500),
    matchedTerms: Array.isArray(flag.matchedTerms)
      ? flag.matchedTerms.map((term) => String(term).slice(0, 80)).slice(0, 12)
      : []
  }));
}

function hasOnlyFirstAndLastName(candidate) {
  return !candidate.email && !candidate.city && !candidate.state && !candidate.jobCity && !candidate.jobState;
}

function isGainesvilleFlorida(city, state) {
  return city.trim().toLowerCase() === "gainesville" && ["fl", "florida"].includes(state.trim().toLowerCase());
}

function createAuditId(candidate, now) {
  const date = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const idPart = candidate.candidateId || `${candidate.firstName}-${candidate.lastName}`;
  const safeId = idPart.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `${date}-${safeId || "candidate"}`;
}

function okResponse(body) {
  return { statusCode: 200, body };
}

function normalizeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function seriousTerms() {
  return [...SERIOUS_TERMS];
}
