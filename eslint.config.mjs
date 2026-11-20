import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.svelte-kit/**",
      "**/node_modules/**",
      "var/**",
      "**/*.svelte",
    ],
  },
  ...tseslint.configs.recommended,
);
