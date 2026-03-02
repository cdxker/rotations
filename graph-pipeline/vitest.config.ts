import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["../tests/graph-pipeline/**/*.test.ts"],
    },
});
