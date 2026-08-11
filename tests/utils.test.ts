import assert from "node:assert/strict";
import test from "node:test";

import { cn } from "../lib/utils.js";

test("cn merges conditional classes and keeps the latest Tailwind utility", () => {
  assert.equal(cn("px-2", false && "hidden", "font-medium", "px-4"), "font-medium px-4");
});

test("cn ignores nullish values", () => {
  assert.equal(cn("text-sm", undefined, null, "leading-6"), "text-sm leading-6");
});
