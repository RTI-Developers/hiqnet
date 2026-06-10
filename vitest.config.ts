import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Integration tests talk to a real HiQnet device over TCP.
        testTimeout: 120_000,
        hookTimeout:  30_000
    },
});
