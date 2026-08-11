import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Chikaima Core must stay framework-independent: callable from Route
    // Handlers today, and from a future desktop runtime/CLI/tests without
    // modification. Importing Next.js APIs here would silently couple it.
    files: ["core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*"],
              message: "Chikaima Core must not depend on Next.js. Keep framework glue in app/**/route.ts.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
