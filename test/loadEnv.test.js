import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadEnvFile } from "../src/loadEnv.js";

test("loadEnvFile loads dotenv-style values without overwriting existing env", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-screener-env-"));
  const file = path.join(dir, ".env");
  fs.writeFileSync(file, "TAVILY_API_KEY=tvly-test\nEXISTING=from-file\nQUOTED=\"hello world\"\n");

  const originalTavily = process.env.TAVILY_API_KEY;
  const originalExisting = process.env.EXISTING;
  const originalQuoted = process.env.QUOTED;

  try {
    delete process.env.TAVILY_API_KEY;
    process.env.EXISTING = "from-env";
    delete process.env.QUOTED;

    loadEnvFile(file);

    assert.equal(process.env.TAVILY_API_KEY, "tvly-test");
    assert.equal(process.env.EXISTING, "from-env");
    assert.equal(process.env.QUOTED, "hello world");
  } finally {
    restoreEnv("TAVILY_API_KEY", originalTavily);
    restoreEnv("EXISTING", originalExisting);
    restoreEnv("QUOTED", originalQuoted);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function restoreEnv(key, value) {
  if (value == null) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
