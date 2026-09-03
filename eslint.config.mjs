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
    rules: {
      // Card art comes from the publishers' own CDNs — five hosts we don't
      // control, already sized right, already cached at the edge. next/image
      // would route every one of them through the NAS to re-encode a picture
      // that is fine as it is, and the deck-image exporter needs the raw
      // same-origin proxy anyway (see api/card-image). Off centrally rather
      // than as a disable comment on each of the twenty <img> tags.
      "@next/next/no-img-element": "off",
      // A leading underscore is how this codebase says "required by the
      // signature, deliberately unused".
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
