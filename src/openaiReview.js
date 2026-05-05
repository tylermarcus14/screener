import { STATUSES } from "./screening.js";

export async function openAiReviewer({ candidate, searchResults, heuristic }, config = process.env) {
  const apiKey = config.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = config.OPENAI_MODEL || "gpt-5-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions: buildInstructions(),
      input: JSON.stringify({
        candidate: {
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          city: candidate.city,
          state: candidate.state,
          roleTitle: candidate.roleTitle,
          jobCity: candidate.jobCity,
          jobState: candidate.jobState
        },
        searchResults,
        heuristic
      }),
      max_output_tokens: 900
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI review failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = extractOutputText(data);
  const parsed = parseJsonObject(text);
  if (!parsed) return null;

  if (![STATUSES.CLEAR, STATUSES.REVIEW, STATUSES.INSUFFICIENT].includes(parsed.status)) {
    return null;
  }

  return parsed;
}

function buildInstructions() {
  return [
    "You are reviewing search result snippets for a Florida sales-role candidate screening webhook.",
    "This is search-only triage, not a background check and not proof of criminal conduct.",
    "Use only title, snippet, URL, candidate name, and candidate/job location. Do not infer protected-class traits.",
    "Never recommend rejection and never output fail.",
    "Return JSON only with keys: status, confidence, candidateMatchConfidence, summary, flags.",
    "Allowed status values: clear_to_schedule, review_required, insufficient_identity.",
    "Use review_required only for credible, potentially same-person, job-related concerns such as violence, weapons, arson, robbery/theft/fraud, recent repeated serious offenses, or credible court/news records.",
    "Arrest-only results are unverified. If serious and plausibly same-person, flag for human review and say unverified.",
    "If the same-person match is weak, use insufficient_identity or review_required with low candidateMatchConfidence.",
    "flags must be an array of objects with type, severity, evidence, url, matchedTerms."
  ].join(" ");
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of Array.isArray(data.output) ? data.output : []) {
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function parseJsonObject(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
