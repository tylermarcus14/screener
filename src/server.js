import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { logScreeningResult } from "./auditLog.js";
import { loadEnvFile } from "./loadEnv.js";
import { openAiReviewer } from "./openaiReview.js";
import { screenCandidate } from "./screening.js";
import { serviceErrorResponse, simplifyScreeningResponse } from "./simplifiedResponse.js";
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

    if (req.method === "GET" && (path === "/favicon.ico" || path === "/favicon.png")) {
      res.writeHead(204);
      return res.end();
    }

    if (req.method === "GET" && path === "/") {
      return sendHtml(res, 200, readPublicIndex());
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

    logScreeningResult(result);

    return sendJson(res, result.statusCode, simplifyScreeningResponse(result));
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, serviceErrorResponse());
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

function sendHtml(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8"
  });
  res.end(body);
}

function readPublicIndex() {
  return fs.readFileSync(path.resolve(process.cwd(), "public/index.html"), "utf8");
}
