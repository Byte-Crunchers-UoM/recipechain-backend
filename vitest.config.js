import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/**/*.js"],
      exclude: [
        "src/index.js",
        "src/test/**",
        "src/**/*.test.js"
      ]
    }
  }
});