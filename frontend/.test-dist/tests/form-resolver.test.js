"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const zod_1 = require("zod");
const form_resolver_js_1 = require("../lib/form-resolver.js");
const resolverOptions = {
    criteriaMode: "firstError",
    fields: {},
    names: [],
    shouldUseNativeValidation: false,
};
(0, node_test_1.default)("createFormResolver returns parsed values for valid input", async () => {
    const schema = zod_1.z.object({
        email: zod_1.z.string().email(),
        password: zod_1.z.string().min(8),
    });
    const resolver = (0, form_resolver_js_1.createFormResolver)(schema);
    const result = await resolver({ email: "hello@example.com", password: "password123" }, undefined, resolverOptions);
    strict_1.default.deepEqual(result.values, {
        email: "hello@example.com",
        password: "password123",
    });
    strict_1.default.deepEqual(result.errors, {});
});
(0, node_test_1.default)("createFormResolver returns field errors for invalid input", async () => {
    const schema = zod_1.z.object({
        name: zod_1.z.string().min(2, "Name is too short"),
    });
    const resolver = (0, form_resolver_js_1.createFormResolver)(schema);
    const result = await resolver({ name: "A" }, undefined, resolverOptions);
    strict_1.default.deepEqual(result.values, {});
    strict_1.default.equal(result.errors.name?.message, "Name is too short");
});
