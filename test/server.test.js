import assert from "node:assert/strict";
import test from "node:test";
import handler from "../src/server.js";

test("default server handler supports Vercel-style health route", async () => {
  const req = {
    method: "GET",
    url: "/api/health"
  };
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
});

test("default server handler supports root route without crashing", async () => {
  const req = {
    method: "GET",
    url: "/"
  };
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Candidate Screener/);
});

function createMockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body;
    }
  };
}
