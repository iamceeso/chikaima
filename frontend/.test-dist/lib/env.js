"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
function requireEnv(value, name) {
    const normalized = value?.trim();
    if (!normalized) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return normalized;
}
exports.env = {
    appName: "Olanma",
    apiBaseUrl: requireEnv(process.env.NEXT_PUBLIC_API_BASE_URL, "NEXT_PUBLIC_API_BASE_URL"),
};
