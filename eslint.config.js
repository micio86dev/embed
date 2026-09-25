// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    // `scripts/**` runs under Node (CI, local dev), never a browser — unlike `src/**`, which
    // must stay browser-only (this SDK's own runtime is a customer's page). No `globals`
    // dependency: just the two identifiers this repo's Node scripts actually use.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
  {
    // Type-aware linting applies only to project sources — not to this flat config file
    // itself, which the TS project service doesn't (and needn't) know about.
    files: ["src/**/*.ts", "tests/**/*.ts", "*.config.ts"],
    extends: [...tseslint.configs.strict, ...tseslint.configs.stylistic],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
