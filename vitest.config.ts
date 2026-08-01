import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			// src/main.ts and src/settings.ts import the real Obsidian API, which
			// only exists inside the app. Point them at the in-memory stand-in so
			// the actual sync loop is testable rather than mirrored in a fixture.
			obsidian: fileURLToPath(
				new URL('./tests/mocks/obsidian.ts', import.meta.url),
			),
		},
	},
});
