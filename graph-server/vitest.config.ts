import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["../tests/graph-server/**/*.test.ts"],
        fileParallelism: false,
    },
});
