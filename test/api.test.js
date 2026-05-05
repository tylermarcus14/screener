import assert from "node:assert/strict";
import test from "node:test";
import healthHandler from "../api/health.js";

test("health API handler returns ok", async () => {
  const res = createMockResponse();
  healthHandler({}, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
});

function createMockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body;
    }
  };
}
