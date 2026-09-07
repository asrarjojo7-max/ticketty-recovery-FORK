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
    // Playwright browser specs (not app code; fixtures use Playwright's
    // `use` API which the React hooks lint rule misreads).
    "e2e/**",
  ]),
  {
    // ── RTL guard (MASTER_PLAN golden rule #7) ─────────────────────────
    // Arabic-first RTL app: physical direction utilities are banned in
    // favor of logical properties (ms-/me-/ps-/pe-/start-/end-). Otherwise
    // icons land on the wrong side and drawers slide the wrong way.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/\\b(pl|pr|ml|mr)-\\d/], TemplateElement[value.raw=/\\b(pl|pr|ml|mr)-\\d/]",
          message:
            "RTL app: use logical spacing utilities (ps-/pe-/ms-/me-) instead of pl-/pr-/ml-/mr-.",
        },
        {
          selector:
            "Literal[value=/\\b(text|border|rounded)-(left|right)\\b/], TemplateElement[value.raw=/\\b(text|border|rounded)-(left|right)\\b/]",
          message:
            "RTL app: use logical utilities (text-start/text-end, border-s/border-e, rounded-s/rounded-e).",
        },
        {
          selector:
            "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression > Property[key.name=/^(left|right)$/]",
          message:
            "RTL app: use logical CSS properties (insetInlineStart/End, marginInlineStart/End, paddingInlineStart/End) instead of left/right.",
        },
      ],
    },
  },
]);

export default eslintConfig;
