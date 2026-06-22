"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const admin_auth_js_1 = require("../lib/admin-auth.js");
(0, node_test_1.default)("buildBasicAuthHeader trims email and encodes credentials", () => {
    strict_1.default.equal((0, admin_auth_js_1.buildBasicAuthHeader)(" admin@example.com ", "secret"), "Basic YWRtaW5AZXhhbXBsZS5jb206c2VjcmV0");
});
(0, node_test_1.default)("buildBasicAuthHeader encodes utf-8 credentials without Node Buffer globals", () => {
    strict_1.default.equal((0, admin_auth_js_1.buildBasicAuthHeader)("jose@example.com", "café"), "Basic am9zZUBleGFtcGxlLmNvbTpjYWbDqQ==");
});
