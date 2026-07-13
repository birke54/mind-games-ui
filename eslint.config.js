import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "dev-dist", "coverage", "playwright-report", "test-results"] },

  // Application code. Type-aware linting, because the rules worth having here — no floating
  // promises, no unsafe `any` — cannot be decided from syntax alone, and this codebase is full of
  // async calls whose failure would be silent.
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        // The one tsconfig covers src/ and vite.config.ts. e2e/ is deliberately outside it, which is
        // why the Playwright specs are linted without type information below — pointing the project
        // at them would fail with "file not included in project", not lint them better.
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // The game reducer switches exhaustively on the action type; an unused `_` binding in a
      // destructure is how it drops a field on purpose.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Test files. Same rules, but the assertion helpers in Testing Library and the mocks in Vitest
  // legitimately traffic in `any`, and failing a lint run over a test double is noise.
  {
    files: ["src/**/*.{test,spec}.{ts,tsx}", "src/test/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",

      // A fake Response has to give back `json(): Promise<T>` to be a Response at all, and the
      // honest way to write that is `async json() { return body; }` with nothing to await. The rule
      // is right about production code and wrong about mocks of async interfaces.
      "@typescript-eslint/require-await": "off",
    },
  },

  // AuthProvider exports the provider component alongside `useAuth` and `RequireAuth`, which costs
  // it fast-refresh. Splitting the hook into its own module to satisfy the rule would scatter one
  // coherent thing across three files to buy a slightly better dev-server experience — a bad trade,
  // and a context provider exporting its own hook is the ordinary React idiom.
  {
    files: ["src/auth/AuthProvider.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },

  // Playwright specs. Node globals, not browser ones — the code inside page.evaluate() runs in the
  // browser but is typed and linted as the argument to a Node-side call.
  {
    files: ["e2e/**/*.ts", "playwright.config.ts", "vite.config.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.browser },
    },
  },
);
