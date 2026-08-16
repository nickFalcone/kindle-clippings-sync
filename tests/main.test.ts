import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App as ObsidianApp, PluginManifest } from 'obsidian';
import { App, notices, resetObsidianMock } from './mocks/obsidian';

vi.mock('fs/promises', () => ({ readFile: vi.fn() }));

import { readFile } from 'fs/promises';
import KindleClippingsSyncPlugin from '../src/main';

/**
 * Drives the real sync loop in src/main.ts against the in-memory Obsidian mock.
 *
 * tests/pipeline.test.ts covers the same guarantees over the pure layer, but it
 * reimplements the loop — so it cannot catch drift in main.ts itself, nor reach
 * the branches that only exist there (folder collisions, unusable filenames,
 * unload mid-sync, per-book state persistence).
 */

const FIXTURE = `Fahrenheit 451 (Ray Bradbury)
- Your Highlight on page 45 | location 810-812 | Added on Saturday, 26 March 2016 16:01:50

It was a pleasure to burn.
==========
Fahrenheit 451 (Ray Bradbury)
- Your Note on page 45 | location 812 | Added on Saturday, 26 March 2016 16:02:11

remember this for the essay
==========
Fahrenheit 451 (Ray Bradbury)
- Your Bookmark at location 346 | Added on Saturday, 26 March 2016 15:46:21
==========
Thinking, Fast and Slow (Kahneman, Daniel)
- Your Highlight at location 100-105 | Added on Wednesday, December 30, 2015 7:31:41 PM

Nothing in life is as important as you think it is.
==========
`;

const FAHRENHEIT = 'Reference/Books/Fahrenheit 451 (Ray Bradbury).md';
const KAHNEMAN = 'Reference/Books/Thinking, Fast and Slow (Kahneman, Daniel).md';

const MANIFEST = {
	id: 'kindle-clippings-sync',
	version: '0.0.0',
} as unknown as PluginManifest;

function readPath(path: Parameters<typeof readFile>[0]): string {
	let p: string;
	if (typeof path === 'string') p = path;
	else if (Buffer.isBuffer(path)) p = path.toString('utf8');
	else throw new Error('unexpected readFile path type in test');
	// Node path.join uses backslashes on Windows; settings use forward slashes.
	return p.replace(/\\/g, '/');
}

function makePlugin(app: App): KindleClippingsSyncPlugin {
	return new KindleClippingsSyncPlugin(app as unknown as ObsidianApp, MANIFEST);
}

/** A loaded plugin pointed at the fixture, with the sync path configured. */
async function setup(clippings = FIXTURE): Promise<{
	app: App;
	plugin: KindleClippingsSyncPlugin;
}> {
	vi.mocked(readFile).mockResolvedValue(clippings);
	const app = new App();
	const plugin = makePlugin(app);
	await plugin.loadPersisted();
	plugin.settings.clippingsPath = '/tmp/My Clippings.txt';
	return { app, plugin };
}

beforeEach(() => {
	resetObsidianMock();
	vi.mocked(readFile).mockReset();
});

describe('main.ts sync loop', () => {
	it('creates one note per book in the configured folder', async () => {
		const { app, plugin } = await setup();
		await plugin.syncClippings();

		expect([...app.vault.files.keys()].sort()).toEqual([FAHRENHEIT, KAHNEMAN]);
		expect(app.vault.folders.has('Reference/Books')).toBe(true);

		const note = app.vault.files.get(FAHRENHEIT)!;
		expect(note).toContain('title: "Fahrenheit 451"');
		expect(note).toContain('- It was a pleasure to burn. (Page 45, Location 810-812)');
		expect(note).toContain('- remember this for the essay (Page 45, Location 812)');
		// Bookmarks are off by default.
		expect(note).not.toContain('Bookmark');
		expect(notices.at(-1)).toBe('Kindle sync: added 3 clippings across 2 books.');
	});

	it('writes new notes with create and later deltas with process', async () => {
		const { app, plugin } = await setup();
		await plugin.syncClippings();
		expect(app.vault.calls).toContain(`create:${FAHRENHEIT}`);

		vi.mocked(readFile).mockResolvedValue(
			FIXTURE +
				`Fahrenheit 451 (Ray Bradbury)
- Your Highlight on page 60 | location 900-901 | Added on Sunday, 27 March 2016 10:00:00

Fresh new highlight.
==========
`,
		);
		app.vault.calls.length = 0;
		await plugin.syncClippings();

		// The atomic read-modify-write path, not a blind overwrite.
		expect(app.vault.calls).toEqual([`process:${FAHRENHEIT}`]);
		expect(app.vault.files.get(FAHRENHEIT)).toContain('- Fresh new highlight.');
	});

	it('re-syncing identical input changes nothing', async () => {
		const { app, plugin } = await setup();
		await plugin.syncClippings();
		const snapshot = new Map(app.vault.files);

		app.vault.calls.length = 0;
		await plugin.syncClippings();

		expect(app.vault.files).toEqual(snapshot);
		expect(app.vault.calls).toEqual([]);
		expect(notices.at(-1)).toBe('Kindle sync: nothing new.');
	});

	it('carries sync state across a data.json round-trip', async () => {
		const { app, plugin } = await setup();
		await plugin.syncClippings();

		// A fresh instance rehydrating from what the first one persisted, which
		// is what a restart of Obsidian actually does.
		const revived = makePlugin(app);
		await revived.saveData(await plugin.loadData());
		await revived.loadPersisted();
		revived.settings.clippingsPath = '/tmp/My Clippings.txt';

		app.vault.calls.length = 0;
		await revived.syncClippings();

		expect(app.vault.calls).toEqual([]);
		expect(notices.at(-1)).toBe('Kindle sync: nothing new.');
	});

	it('keeps macOS machine paths when Windows saves, and vice versa', async () => {
		const macLegacy = {
			settings: {
				clippingsPath: '/Users/nfalcone/Kindle/My Clippings.txt',
				targetFolder: 'Reference/Books',
				includeNotes: true,
				includeBookmarks: false,
				includeTruncated: true,
				preSyncCommand: '/opt/homebrew/bin/kindle-sync --pull-only',
				approvedPreSyncCommand: '/opt/homebrew/bin/kindle-sync --pull-only',
				bookAsinsPath: '',
			},
			syncState: { syncedHashes: {} },
		};

		const app = new App();
		const windows = makePlugin(app);
		windows.hostPlatform = 'win32';
		await windows.saveData(macLegacy);
		await windows.loadPersisted();

		expect(windows.settings.clippingsPath).toBe('');
		expect(windows.settings.preSyncCommand).toBe('');
		expect(windows.settings.targetFolder).toBe('Reference/Books');

		windows.settings.clippingsPath = 'C:\\Users\\nicho\\Kindle\\My Clippings.txt';
		windows.settings.preSyncCommand = '%USERPROFILE%\\Kindle\\kindle-sync.cmd';
		windows.settings.includeNotes = false;
		await windows.saveSettings();

		const mac = makePlugin(app);
		mac.hostPlatform = 'darwin';
		await mac.saveData(await windows.loadData());
		await mac.loadPersisted();

		expect(mac.settings.clippingsPath).toBe(
			'/Users/nfalcone/Kindle/My Clippings.txt',
		);
		expect(mac.settings.preSyncCommand).toBe(
			'/opt/homebrew/bin/kindle-sync --pull-only',
		);
		expect(mac.settings.includeNotes).toBe(false);

		mac.settings.preSyncCommand = '/opt/homebrew/bin/kindle-sync';
		mac.settings.approvedPreSyncCommand = '/opt/homebrew/bin/kindle-sync';
		await mac.saveSettings();

		const windowsAgain = makePlugin(app);
		windowsAgain.hostPlatform = 'win32';
		await windowsAgain.saveData(await mac.loadData());
		await windowsAgain.loadPersisted();

		expect(windowsAgain.settings.clippingsPath).toBe(
			'C:\\Users\\nicho\\Kindle\\My Clippings.txt',
		);
		expect(windowsAgain.settings.preSyncCommand).toBe(
			'%USERPROFILE%\\Kindle\\kindle-sync.cmd',
		);
	});

	it('preserves manual edits and deletions, appending only the delta', async () => {
		const { app, plugin } = await setup();
		await plugin.syncClippings();

		const edited = app.vault.files
			.get(FAHRENHEIT)!
			.replace('## Notes', 'My own commentary.\n\n## Notes')
			.replace('- remember this for the essay (Page 45, Location 812)\n', '');
		app.vault.files.set(FAHRENHEIT, edited);

		vi.mocked(readFile).mockResolvedValue(
			FIXTURE +
				`Fahrenheit 451 (Ray Bradbury)
- Your Highlight on page 60 | location 900-901 | Added on Sunday, 27 March 2016 10:00:00

Fresh new highlight.
==========
`,
		);
		await plugin.syncClippings();

		const result = app.vault.files.get(FAHRENHEIT)!;
		expect(result).toContain('My own commentary.');
		// Deleted by hand, and the plugin never reconciles it back.
		expect(result).not.toContain('- remember this for the essay');
		expect(result).toContain('- Fresh new highlight. (Page 60, Location 900-901)');
		expect(result.match(/It was a pleasure to burn/g)).toHaveLength(1);
	});

	it('refuses to write when a folder occupies the note path', async () => {
		const { app, plugin } = await setup();
		app.vault.folders.add(FAHRENHEIT);

		await plugin.syncClippings();

		expect(app.vault.files.has(FAHRENHEIT)).toBe(false);
		expect(notices).toContain(
			`Skipping "${FAHRENHEIT}": a folder exists at that path.`,
		);
		// The other book still syncs — one bad path doesn't abort the run.
		expect(app.vault.files.has(KAHNEMAN)).toBe(true);
	});

	it('skips a book whose title cannot form a filename', async () => {
		const { app, plugin } = await setup(
			`...
- Your Highlight at location 1-2 | Added on Saturday, 26 March 2016 14:59:39

Title sanitizes to nothing.
==========
${FIXTURE}`,
		);

		await plugin.syncClippings();

		// Nothing written at the folder root from the empty name.
		expect([...app.vault.files.keys()].sort()).toEqual([FAHRENHEIT, KAHNEMAN]);
		expect([...app.vault.files.keys()]).not.toContain('Reference/Books/.md');
	});

	it('stops writing once the plugin is unloaded mid-sync', async () => {
		const { app, plugin } = await setup();
		const create = app.vault.create.bind(app.vault);
		let created = 0;
		app.vault.create = async (path: string, data: string) => {
			const file = await create(path, data);
			if (++created === 1) plugin.onunload();
			return file;
		};

		await plugin.syncClippings();

		expect(app.vault.files.size).toBe(1);
	});

	it('aborts with a notice when the clippings file cannot be read', async () => {
		const { app, plugin } = await setup();
		vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

		await plugin.syncClippings();

		expect(app.vault.files.size).toBe(0);
		expect(notices.at(-1)).toBe(
			'Could not read "/tmp/My Clippings.txt". Is the Kindle connected via USB?',
		);
	});

	it('does nothing until a clippings path is configured', async () => {
		const { app, plugin } = await setup();
		plugin.settings.clippingsPath = '   ';

		await plugin.syncClippings();

		expect(app.vault.files.size).toBe(0);
		expect(vi.mocked(readFile)).not.toHaveBeenCalled();
		expect(notices.at(-1)).toBe(
			'Set the path to My Clippings.txt in the Kindle Clippings Sync settings first.',
		);
	});

	it('writes no tracking markers into the notes it creates', async () => {
		const { app, plugin } = await setup();
		await plugin.syncClippings();

		for (const content of app.vault.files.values()) {
			expect(content).not.toContain('<!--');
			expect(content).not.toMatch(/kindle[- ]clippings[- ]sync/i);
		}
	});

	it('renders a cover image URL on a new note when bookAsinsPath maps the bookKey', async () => {
		const { app, plugin } = await setup();
		plugin.settings.bookAsinsPath = '/tmp/book-asins.json';
		vi.mocked(readFile).mockImplementation(async (path) => {
			const p = readPath(path);
			if (p === '/tmp/My Clippings.txt') return FIXTURE;
			if (p === '/tmp/book-asins.json') {
				return JSON.stringify({
					'Fahrenheit 451 (Ray Bradbury)': 'B003GXEW00',
				});
			}
			throw new Error(`unexpected read: ${p}`);
		});

		await plugin.syncClippings();

		expect(app.vault.files.get(FAHRENHEIT)).toContain(
			'![book-cover](https://m.media-amazon.com/images/P/B003GXEW00.01._SL500_.jpg)',
		);
		expect(app.vault.files.get(KAHNEMAN)).not.toContain('![book-cover]');
	});

	it('renders a cover from device-asins.raw.json beside the clippings file', async () => {
		const { app, plugin } = await setup();
		vi.mocked(readFile).mockImplementation(async (path) => {
			const p = readPath(path);
			if (p === '/tmp/My Clippings.txt') return FIXTURE;
			if (p === '/tmp/device-asins.raw.json') {
				return JSON.stringify([
					{ label: 'Fahrenheit 451', asin: 'B003GXEW00' },
				]);
			}
			throw new Error(`unexpected read: ${p}`);
		});

		await plugin.syncClippings();

		expect(app.vault.files.get(FAHRENHEIT)).toContain(
			'![book-cover](https://m.media-amazon.com/images/P/B003GXEW00.01._SL500_.jpg)',
		);
	});

	it('does not add a cover image when appending to an existing note', async () => {
		const { app, plugin } = await setup();
		plugin.settings.bookAsinsPath = '/tmp/book-asins.json';
		vi.mocked(readFile).mockImplementation(async (path) => {
			const p = readPath(path);
			if (p === '/tmp/My Clippings.txt') return FIXTURE;
			if (p === '/tmp/book-asins.json') {
				return JSON.stringify({
					'Fahrenheit 451 (Ray Bradbury)': 'B003GXEW00',
				});
			}
			throw new Error(`unexpected read: ${p}`);
		});
		await plugin.syncClippings();

		vi.mocked(readFile).mockImplementation(async (path) => {
			const p = readPath(path);
			if (p === '/tmp/My Clippings.txt') {
				return (
					FIXTURE +
					`Fahrenheit 451 (Ray Bradbury)
- Your Highlight on page 60 | location 900-901 | Added on Sunday, 27 March 2016 10:00:00

Fresh new highlight.
==========
`
				);
			}
			if (p === '/tmp/book-asins.json') {
				return JSON.stringify({
					'Fahrenheit 451 (Ray Bradbury)': 'B003GXEW00',
				});
			}
			throw new Error(`unexpected read: ${p}`);
		});
		await plugin.syncClippings();

		const note = app.vault.files.get(FAHRENHEIT)!;
		expect(note.match(/!\[book-cover\]/g)).toHaveLength(1);
		expect(note).toContain('- Fresh new highlight. (Page 60, Location 900-901)');
	});

	it('matches device-asins.raw.json beside the clippings file when bookAsinsPath is unset', async () => {
		const { app, plugin } = await setup();
		plugin.settings.clippingsPath = '/tmp/kindle/My Clippings.txt';
		vi.mocked(readFile).mockImplementation(async (path) => {
			const p = readPath(path);
			if (p === '/tmp/kindle/My Clippings.txt') return FIXTURE;
			if (p === '/tmp/kindle/device-asins.raw.json') {
				return JSON.stringify([
					{ label: 'Fahrenheit 451', asin: 'B003GXEW00' },
				]);
			}
			throw new Error(`unexpected read: ${p}`);
		});

		await plugin.syncClippings();

		expect(app.vault.files.get(FAHRENHEIT)).toContain(
			'![book-cover](https://m.media-amazon.com/images/P/B003GXEW00.01._SL500_.jpg',
		);
	});
});
