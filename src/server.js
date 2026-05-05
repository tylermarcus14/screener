import http from "node:http";
import { loadEnvFile } from "./loadEnv.js";
import { openAiReviewer } from "./openaiReview.js";
import { screenCandidate } from "./screening.js";
import { tavilySearchProvider } from "./tavilySearch.js";

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);

export function createServer() {
  return http.createServer(handler);
}

export default async function handler(req, res) {
  try {
    const path = new URL(req.url || "/", "http://localhost").pathname;

    if (req.method === "GET" && (path === "/health" || path === "/api/health")) {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && path === "/") {
      return sendJson(res, 200, {
        ok: true,
        service: "candidate-screener",
        endpoints: {
          health: "/api/health",
          candidateScreen: "/api/candidate-screen"
        }
      });
    }

    if (req.method !== "POST" || path !== "/api/candidate-screen") {
      return sendJson(res, 404, { error: "Not found" });
    }

    if (!isAuthorized(req)) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }

    const payload = await readJson(req);
    const result = await screenCandidate(payload, {
      searchProvider: (queries, candidate) => tavilySearchProvider(queries, candidate),
      aiReviewer: (args) => openAiReviewer(args),
      config: {
        gainesvilleFairChanceCovered: process.env.GAINESVILLE_FAIR_CHANCE_COVERED !== "false"
      }
    });

    console.log(JSON.stringify({
      event: "candidate_screen",
      status: result.body.status,
      zapierAction: result.body.zapierAction,
      candidateId: result.body.candidateId,
      auditId: result.body.auditId
    }));

    return sendJson(res, result.statusCode, result.body);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, {
      status: "service_error",
      zapierAction: "hold_for_hr_review",
      confidence: "high",
      candidateMatchConfidence: "low",
      summary: "The screening service hit an internal error. Hold for manual review instead of scheduling automatically.",
      flags: [],
      error: error.message
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().listen(PORT, () => {
    console.log(`Candidate screening webhook listening on http://localhost:${PORT}`);
  });
}

function isAuthorized(req) {
  const secret = process.env.WEBHOOK_SHARED_SECRET;
  if (!secret) return true;
  return req.headers.authorization === `Bearer ${secret}`;
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json"
  });
  res.end(JSON.stringify(body));
}
