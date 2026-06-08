"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const utils_js_1 = require("../lib/utils.js");
(0, node_test_1.default)("cn merges conditional classes and keeps the latest Tailwind utility", () => {
    strict_1.default.equal((0, utils_js_1.cn)("px-2", false && "hidden", "font-medium", "px-4"), "font-medium px-4");
});
(0, node_test_1.default)("cn ignores nullish values", () => {
    strict_1.default.equal((0, utils_js_1.cn)("text-sm", undefined, null, "leading-6"), "text-sm leading-6");
});
