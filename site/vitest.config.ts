import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
    test: {
        environment: "jsdom",
        globals: true,
        include: ["src/**/*.test.ts", "../tests/site/**/*.test.ts"],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
    server: {
        fs: {
            allow: [path.resolve(__dirname, "..")],
        },
    },
})
