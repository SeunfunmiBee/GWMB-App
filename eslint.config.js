// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // api/ (Cloudflare Worker) and supabase/ (Deno, reference only) have their own toolchains.
    ignores: ["dist/*", "dist-web/*", "api/*", "supabase/*"],
  }
]);
