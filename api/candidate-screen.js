import { loadEnvFile } from "../src/loadEnv.js";
import { logScreeningResult } from "../src/auditLog.js";
import { openAiReviewer } from "../src/openaiReview.js";
import { screenCandidate } from "../src/screening.js";
import { serviceErrorResponse, simplifyScreeningResponse } from "../src/simplifiedResponse.js";
import { tavilySearchProvider } from "../src/tavilySearch.js";

loadEnvFile();

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    if (!isAuthorized(req)) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }

    const payload = await readRequestBody(req);
    const result = await screenCandidate(payload, {
      searchProvider: (queries, candidate) => tavilySearchProvider(queries, candidate),
      aiReviewer: (args) => openAiReviewer(args),
      config: {
        gainesvilleFairChanceCovered: process.env.GAINESVILLE_FAIR_CHANCE_COVERED !== "false"
      }
    });

    logScreeningResult(result);

    return sendJson(res, result.statusCode, simplifyScreeningResponse(result));
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, serviceErrorResponse());
  }
}

function isAuthorized(req) {
  const secret = process.env.WEBHOOK_SHARED_SECRET;
  if (!secret) return true;
  return req.headers.authorization === `Bearer ${secret}`;
}

async function readRequestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return parseJson(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return parseJson(raw);
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
