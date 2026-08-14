import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Express's error-handling middleware is recognized by its arity (err, req,
      // res, next) — `next` must stay in the signature even when unused, e.g.
      // server/src/index.ts's terminal error handler, which always responds
      // itself and never calls next().
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  }
);
