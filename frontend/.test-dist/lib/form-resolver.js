"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFormResolver = createFormResolver;
const zod_1 = require("@hookform/resolvers/zod");
function createFormResolver(schema) {
    return (0, zod_1.zodResolver)(schema);
}
