import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.svelte-kit/**", "**/node_modules/**", "var/**", "**/*.svelte"] },
  ...tseslint.configs.recommended,
);
