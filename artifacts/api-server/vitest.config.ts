import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { LOG_LEVEL: "silent" },
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
