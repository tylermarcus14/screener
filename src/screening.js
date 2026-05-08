const SERIOUS_TERMS = [
  "armed robbery",
  "robbery",
  "assault",
  "battery",
  "arson",
  "felony",
  "weapon",
  "firearm",
  "bank robbery",
  "fraud",
  "theft",
  "burglary",
  "charged",
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
  "bank robbery",
  "fraud",
  "theft",
  "burglary",
  "charged",
  "convicted",
  "sentenced"
];

const DEFAULT_SEARCH_LOCATION = {
  city: "Fort Lauderdale",
  state: "FL",
  source: "default",
  aliases: ["broward", "broward county", "south florida"]
};

const AREA_CODE_LOCATIONS = {
  "239": { city: "Fort Myers", state: "FL" },
  "305": { city: "Miami", state: "FL" },
  "321": { city: "Orlando", state: "FL" },
  "352": { city: "Gainesville", state: "FL" },
  "386": { city: "Daytona Beach", state: "FL" },
  "407": { city: "Orlando", state: "FL" },
  "448": { city: "Tallahassee", state: "FL" },
  "561": { city: "West Palm Beach", state: "FL" },
  "656": { city: "Tampa", state: "FL" },
  "689": { city: "Orlando", state: "FL" },
  "727": { city: "St. Petersburg", state: "FL" },
  "754": { city: "Fort Lauderdale", state: "FL" },
  "772": { city: "Port St. Lucie", state: "FL" },
  "786": { city: "Miami", state: "FL" },
  "813": { city: "Tampa", state: "FL" },
  "850": { city: "Tallahassee", state: "FL" },
  "863": { city: "Lakeland", state: "FL" },
  "904": { city: "Jacksonville", state: "FL" },
  "941": { city: "Sarasota", state: "FL" },
  "954": { city: "Fort Lauderdale", state: "FL" }
};

const US_STATES = [
  ["AL", "alabama"],
  ["AK", "alaska"],
  ["AZ", "arizona"],
  ["AR", "arkansas"],
  ["CA", "california"],
  ["CO", "colorado"],
  ["CT", "connecticut"],
  ["DE", "delaware"],
  ["FL", "florida"],
  ["GA", "georgia"],
  ["HI", "hawaii"],
  ["ID", "idaho"],
  ["IL", "illinois"],
  ["IN", "indiana"],
  ["IA", "iowa"],
  ["KS", "kansas"],
  ["KY", "kentucky"],
  ["LA", "louisiana"],
  ["ME", "maine"],
  ["MD", "maryland"],
  ["MA", "massachusetts"],
  ["MI", "michigan"],
  ["MN", "minnesota"],
  ["MS", "mississippi"],
  ["MO", "missouri"],
  ["MT", "montana"],
  ["NE", "nebraska"],
  ["NV", "nevada"],
  ["NH", "new hampshire"],
  ["NJ", "new jersey"],
  ["NM", "new mexico"],
  ["NY", "new york"],
  ["NC", "north carolina"],
  ["ND", "north dakota"],
  ["OH", "ohio"],
  ["OK", "oklahoma"],
  ["OR", "oregon"],
  ["PA", "pennsylvania"],
  ["RI", "rhode island"],
  ["SC", "south carolina"],
  ["SD", "south dakota"],
  ["TN", "tennessee"],
  ["TX", "texas"],
  ["UT", "utah"],
  ["VT", "vermont"],
  ["VA", "virginia"],
  ["WA", "washington"],
  ["WV", "west virginia"],
  ["WI", "wisconsin"],
  ["WY", "wyoming"]
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
    "phone",
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
  normalized.normalizedPhone = normalizePhone(normalized.phone);
  normalized.phoneAreaCode = extractNanpAreaCode(normalized.normalizedPhone);
  normalized.phoneAreaCodeLocation = normalized.phoneAreaCode
    ? AREA_CODE_LOCATIONS[normalized.phoneAreaCode] || null
    : null;

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
  const exactName = `"${candidate.firstName} ${candidate.lastName}"`;
  const flexibleName = `${candidate.firstName} ${candidate.lastName}`;
  const locations = buildSearchLocations(candidate);
  const queries = [];

  for (const location of locations) {
    const locationText = `"${[location.city, location.state].filter(Boolean).join(" ")}"`;
    queries.push(
      `${exactName} ${locationText} arrest OR convicted OR felony OR court`,
      `${exactName} ${locationText} "armed robbery" OR robbery OR assault OR battery OR arson`,
      `${exactName} ${locationText} fraud OR theft OR burglary OR sentencing OR mugshot`,
      `${exactName} ${locationText} criminal OR charges OR police OR sheriff`,
      `${flexibleName} ${locationText} "bank robbery" OR robbery OR FBI OR charged OR police`
    );
  }

  return queries
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function buildSearchLocations(candidate) {
  const locations = [];
  addSearchLocation(locations, DEFAULT_SEARCH_LOCATION);

  if (candidate.phoneAreaCodeLocation) {
    addSearchLocation(locations, {
      ...candidate.phoneAreaCodeLocation,
      source: "phone_area_code",
      areaCode: candidate.phoneAreaCode
    });
  }

  if (candidate.city || candidate.state) {
    addSearchLocation(locations, {
      city: candidate.city,
      state: candidate.state,
      source: "candidate_location"
    });
  }

  if (candidate.jobCity || candidate.jobState) {
    addSearchLocation(locations, {
      city: candidate.jobCity,
      state: candidate.jobState,
      source: "job_location"
    });
  }

  return locations;
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
  const searchLocations = buildSearchLocations(candidate);
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
    searchLocations,
    normalizedPhone: candidate.normalizedPhone || null,
    phoneAreaCode: candidate.phoneAreaCode || null,
    phoneAreaCodeCity: candidate.phoneAreaCodeLocation
      ? `${candidate.phoneAreaCodeLocation.city}, ${candidate.phoneAreaCodeLocation.state}`
      : null,
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
  const firstName = candidate.firstName.toLowerCase();
  const lastName = candidate.lastName.toLowerCase();
  const searchLocations = buildSearchLocations(candidate);
  const locationTokens = [
    candidate.city,
    candidate.state,
    candidate.jobCity,
    candidate.jobState,
    ...searchLocations.flatMap((location) => [location.city, location.state, ...(location.aliases || [])])
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  const flags = [];
  for (const result of searchResults) {
    const contentHaystack = `${result.title} ${result.snippet} ${result.link}`.toLowerCase();
    const hasName =
      contentHaystack.includes(fullName) ||
      (contentHaystack.includes(firstName) && contentHaystack.includes(lastName));
    const hasLocation = locationTokens.some((token) => containsToken(contentHaystack, token));
    const isAllowedState = isAllowedStateResult(contentHaystack, candidate);
    const matchedTerms = HIGH_RISK_TERMS.filter((term) => contentHaystack.includes(term));
    if (hasName && isAllowedState && matchedTerms.length > 0) {
      flags.push({
        type: contentHaystack.includes("arrest") && !contentHaystack.includes("convicted") ? "unverified_arrest_or_charge" : "potential_job_related_record",
        severity: matchedTerms.some((term) => ["armed robbery", "bank robbery", "arson", "weapon", "firearm", "assault"].includes(term))
          ? "high"
          : "medium",
        evidence: result.title,
        url: result.link,
        locationMatched: hasLocation,
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
      : flags.some((flag) => flag.locationMatched) ? "medium" : "low",
    summary: firstLastOnly
      ? "Potentially job-related name-only search results were found. Treat these as low-confidence unverified leads for human review only, not as proof or a hiring decision."
      : "Potentially job-related search results were found. Treat these as unverified leads for human review only, not as proof or a hiring decision.",
    flags
  };
}

function mergeReviews(heuristic, aiReview) {
  if (!aiReview || typeof aiReview !== "object") return heuristic;

  if (
    heuristic.status === STATUSES.CLEAR &&
    aiReview.status !== STATUSES.CLEAR &&
    !hasCredibleAiFlags(aiReview.flags)
  ) {
    return heuristic;
  }

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

function hasCredibleAiFlags(flags) {
  if (!Array.isArray(flags)) return false;
  return flags.some((flag) => {
    const severity = normalizeEnum(flag.severity, ["low", "medium", "high"], "low");
    if (severity === "low") return false;
    const url = String(flag.url || "");
    return !isSocialUrl(url);
  });
}

function isAllowedStateResult(contentHaystack, candidate) {
  const mentionedStates = detectMentionedStates(contentHaystack);
  if (mentionedStates.length === 0) return true;

  const allowedStates = new Set(["FL"]);
  if (candidate.phoneAreaCodeLocation?.state) {
    allowedStates.add(candidate.phoneAreaCodeLocation.state.toUpperCase());
  }

  return mentionedStates.some((state) => allowedStates.has(state));
}

function detectMentionedStates(contentHaystack) {
  const mentioned = new Set();
  for (const [abbr, name] of US_STATES) {
    const escapedName = name.replace(/\s+/g, "\\s+");
    const namePattern = new RegExp(`\\b${escapedName}\\b`, "i");
    const addressAbbrPattern = new RegExp(`,\\s*${abbr}\\s+\\d{5}\\b`, "i");
    if (namePattern.test(contentHaystack) || addressAbbrPattern.test(contentHaystack)) {
      mentioned.add(abbr);
    }
  }
  return [...mentioned];
}

function containsToken(haystack, token) {
  const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

function isSocialUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return [
      "facebook.com",
      "instagram.com",
      "tiktok.com",
      "linkedin.com",
      "youtube.com",
      "x.com",
      "twitter.com"
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
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
    locationMatched: flag.locationMatched === true,
    matchedTerms: Array.isArray(flag.matchedTerms)
      ? flag.matchedTerms.map((term) => String(term).slice(0, 80)).slice(0, 12)
      : []
  }));
}

function hasOnlyFirstAndLastName(candidate) {
  return !candidate.email && !candidate.phone && !candidate.city && !candidate.state && !candidate.jobCity && !candidate.jobState;
}

export function normalizePhone(phone) {
  let value = String(phone || "").trim();
  if (!value) return "";

  value = value.replace(/\s*(?:ext\.?|x|extension)\s*\d+$/i, "");
  const digits = value.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return digits ? `+${digits}` : "";
}

function extractNanpAreaCode(normalizedPhone) {
  const digits = String(normalizedPhone || "").replace(/\D/g, "");
  if (digits.length === 10) return digits.slice(0, 3);
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1, 4);
  return "";
}

function addSearchLocation(locations, location) {
  const city = String(location.city || "").trim();
  const state = String(location.state || "").trim();
  if (!city && !state) return;

  const key = `${city.toLowerCase()}|${state.toLowerCase()}`;
  if (locations.some((existing) => `${existing.city.toLowerCase()}|${existing.state.toLowerCase()}` === key)) {
    return;
  }

  locations.push({
    city,
    state,
    source: location.source,
    aliases: Array.isArray(location.aliases) ? location.aliases : [],
    ...(location.areaCode ? { areaCode: location.areaCode } : {})
  });
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
