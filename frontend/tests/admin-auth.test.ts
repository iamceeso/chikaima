import assert from "node:assert/strict";
import test from "node:test";

import { buildBasicAuthHeader } from "../lib/admin-auth.js";

test("buildBasicAuthHeader trims email and encodes credentials", () => {
  assert.equal(buildBasicAuthHeader(" admin@example.com ", "secret"), "Basic YWRtaW5AZXhhbXBsZS5jb206c2VjcmV0");
});

test("buildBasicAuthHeader encodes utf-8 credentials without Node Buffer globals", () => {
  assert.equal(buildBasicAuthHeader("jose@example.com", "café"), "Basic am9zZUBleGFtcGxlLmNvbTpjYWbDqQ==");
});
