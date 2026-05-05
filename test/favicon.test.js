import assert from "node:assert/strict";
import test from "node:test";
import faviconIcoHandler from "../api/favicon.ico.js";
import faviconPngHandler from "../api/favicon.png.js";

test("favicon handlers return no content instead of 404", () => {
  for (const handler of [faviconIcoHandler, faviconPngHandler]) {
    const res = createMockResponse();
    handler({}, res);
    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
  }
});

function createMockResponse() {
  return {
    statusCode: 0,
    ended: false,
    end() {
      this.ended = true;
    }
  };
}
