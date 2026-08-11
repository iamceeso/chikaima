import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import { createFormResolver } from "../lib/form-resolver.js";

const resolverOptions = {
  criteriaMode: "firstError" as const,
  fields: {},
  names: [],
  shouldUseNativeValidation: false,
};

test("createFormResolver returns parsed values for valid input", async () => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
  });

  const resolver = createFormResolver<{ email: string; password: string }>(schema);
  const result = await resolver(
    { email: "hello@example.com", password: "password123" },
    undefined,
    resolverOptions,
  );

  assert.deepEqual(result.values, {
    email: "hello@example.com",
    password: "password123",
  });
  assert.deepEqual(result.errors, {});
});

test("createFormResolver returns field errors for invalid input", async () => {
  const schema = z.object({
    name: z.string().min(2, "Name is too short"),
  });

  const resolver = createFormResolver<{ name: string }>(schema);
  const result = await resolver({ name: "A" }, undefined, resolverOptions);

  assert.deepEqual(result.values, {});
  assert.equal(result.errors.name?.message, "Name is too short");
});
