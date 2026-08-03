import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App as ObsidianApp, PluginManifest } from 'obsidian';
import {
	App,
	buttons,
	clickButton,
	elementText,
	notices,
	openModals,
	resetObsidianMock,
} from './mocks/obsidian';

/**
 * Covers the pre-sync command hook in src/main.ts — the plugin's only arbitrary
 * shell execution, and so its most security-sensitive path.
 *
 * Two things make this need its own file and its own mocks:
 *
 * 1. `promisify(exec)` only exposes `.child` because child_process defines a
 *    `util.promisify.custom` implementation. A plain callback-style stub leaves
 *    `pending.child` undefined, `onunload()`'s `?.kill()` silently no-ops, and a
 *    kill test would pass while proving nothing. The mock below defines that
 *    symbol and hands back a deferred promise so a command can be held open.
 * 2. The consent modal's promise settles only when a button handler fires, so
 *    each test starts the sync, clicks, then awaits.
 */

type ExecMode = 'resolve' | 'reject' | 'hang';

interface ExecChild {
	killed: boolean;
	kill: (signal?: string) => void;
}

interface ExecController {
	/** Commands passed to exec, in order. */
	commands: string[];
	/** Interleaved side effects ("exec"/"read") so ordering is assertable. */
	log: string[];
	/** How the next command behaves. "hang" never settles on its own. */
	mode: ExecMode;
	stderr: string;
	options: unknown;
	lastChild: ExecChild | null;
	reset(mode?: ExecMode): void;
}

const exec = vi.hoisted(
	(): ExecController => ({
		commands: [],
		log: [],
		mode: 'resolve',
		stderr: '',
		options: null,
		lastChild: null,
		reset(mode: ExecMode = 'resolve') {
			this.commands.length = 0;
			this.log.length = 0;
			this.mode = mode;
			this.stderr = '';
			this.options = null;
			this.lastChild = null;
		},
	}),
);

vi.mock('child_process', async () => {
	const { promisify } = await import('node:util');
	type Result = { stdout: string; stderr: string };

	const custom = (command: string, options?: unknown) => {
		exec.commands.push(command);
		exec.log.push('exec');
		exec.options = options;

		let settle!: {
			resolve: (value: Result) => void;
			reject: (reason: unknown) => void;
		};
		const promise = new Promise<Result>((resolve, reject) => {
			settle = { resolve, reject };
		});

		const child = {
			killed: false,
			kill(_signal?: string) {
				child.killed = true;
				// Killing a child makes the awaited exec promise reject, exactly
				// as Node does — that rejection is what main.ts must not report.
				settle.reject(new Error('Command was killed'));
			},
		};
		exec.lastChild = child;

		if (exec.mode === 'resolve') {
			settle.resolve({ stdout: 'pulled\n', stderr: '' });
		} else if (exec.mode === 'reject') {
			settle.reject(
				Object.assign(new Error('Command failed with exit code 1'), {
					stderr: exec.stderr,
				}),
			);
		}

		return Object.assign(promise, { child });
	};

	const execFn = Object.assign(
		() => {
			throw new Error('main.ts must use the promisified exec, not callbacks');
		},
		{ [promisify.custom]: custom },
	);

	return { exec: execFn };
});

vi.mock('fs/promises', () => ({ readFile: vi.fn() }));

import { readFile } from 'fs/promises';
import KindleClippingsSyncPlugin from '../src/main';

const CLIPPINGS_PATH = '/tmp/My Clippings.txt';
const COMMAND = '/opt/homebrew/bin/kindle-sync';
const NOTE = 'Reference/Books/Fahrenheit 451 (Ray Bradbury).md';

const FIXTURE = `Fahrenheit 451 (Ray Bradbury)
- Your Highlight on page 45 | location 810-812 | Added on Saturday, 26 March 2016 16:01:50

It was a pleasure to burn.
==========
`;

function makePlugin(app: App): KindleClippingsSyncPlugin {
	return new KindleClippingsSyncPlugin(app as unknown as ObsidianApp, {
		id: 'kindle-clippings-sync',
		version: '0.0.0',
	} as unknown as PluginManifest);
}

async function setup(options: { preApproved?: boolean } = {}) {
	const app = new App();
	const plugin = makePlugin(app);
	await plugin.loadPersisted();
	plugin.settings.clippingsPath = CLIPPINGS_PATH;
	plugin.settings.preSyncCommand = COMMAND;
	if (options.preApproved) plugin.settings.approvedPreSyncCommand = COMMAND;
	return { app, plugin };
}

/**
 * Let doSync advance to its next await. Microtasks are enough — nothing in the
 * path under test uses a real timer, and a macrotask hop would only make the
 * ordering assertions less precise.
 */
async function flush(ticks = 3): Promise<void> {
	for (let i = 0; i < ticks; i++) await Promise.resolve();
}

beforeEach(() => {
	resetObsidianMock();
	exec.reset();
	vi.mocked(readFile).mockReset();
	vi.mocked(readFile).mockImplementation(async () => {
		exec.log.push('read');
		return FIXTURE;
	});
});

describe('pre-sync command — consent gate', () => {
	it('shows the exact command and waits for approval before running it', async () => {
		const { plugin } = await setup();

		const pending = plugin.syncClippings();
		await flush();

		// Nothing has run yet — the user has not answered.
		expect(exec.commands).toEqual([]);
		expect(openModals).toHaveLength(1);
		expect(openModals[0]!.titleEl.text).toBe('Run pre-sync command?');
		// The user must be shown the literal string that will execute.
		expect(elementText(openModals[0]!.contentEl)).toContain(COMMAND);

		clickButton('Run command');
		await pending;

		expect(exec.commands).toEqual([COMMAND]);
	});

	it('does not prompt again for a command already approved', async () => {
		const { plugin } = await setup();
		const first = plugin.syncClippings();
		await flush();
		clickButton('Run command');
		await first;
		expect(openModals).toHaveLength(1);

		buttons.length = 0;
		openModals.length = 0;
		await plugin.syncClippings();

		expect(openModals).toHaveLength(0);
		expect(exec.commands).toEqual([COMMAND, COMMAND]);
	});

	it('persists the approval so a restart does not re-prompt', async () => {
		const { app, plugin } = await setup();
		const pending = plugin.syncClippings();
		await flush();
		clickButton('Run command');
		await pending;

		const persisted = (await plugin.loadData()) as {
			settings: { approvedPreSyncCommand: string };
		};
		expect(persisted.settings.approvedPreSyncCommand).toBe(COMMAND);

		// A fresh instance rehydrating from that data must run without asking.
		const revived = makePlugin(app);
		await revived.saveData(persisted);
		await revived.loadPersisted();
		openModals.length = 0;
		await revived.syncClippings();

		expect(openModals).toHaveLength(0);
	});

	it('re-prompts when the approved command string changes at all', async () => {
		const { plugin } = await setup({ preApproved: true });
		plugin.settings.preSyncCommand = `${COMMAND} --verbose`;

		const pending = plugin.syncClippings();
		await flush();
		expect(openModals).toHaveLength(1);

		clickButton('Run command');
		await pending;

		expect(exec.commands).toEqual([`${COMMAND} --verbose`]);
	});

	it('cancelling aborts before the command runs or the file is read', async () => {
		const { app, plugin } = await setup();

		const pending = plugin.syncClippings();
		await flush();
		clickButton('Cancel');
		await pending;

		expect(exec.commands).toEqual([]);
		expect(vi.mocked(readFile)).not.toHaveBeenCalled();
		expect(app.vault.files.size).toBe(0);
		expect(notices.at(-1)).toBe('Pre-sync command not approved — sync cancelled.');
		// A refusal must not be remembered as an approval.
		expect(plugin.settings.approvedPreSyncCommand).toBe('');
	});

	it('dismissing the modal without choosing counts as a refusal', async () => {
		const { app, plugin } = await setup();

		const pending = plugin.syncClippings();
		await flush();
		openModals[0]!.close();
		await pending;

		expect(exec.commands).toEqual([]);
		expect(app.vault.files.size).toBe(0);
		expect(notices.at(-1)).toBe('Pre-sync command not approved — sync cancelled.');
	});
});

describe('pre-sync command — execution', () => {
	it('runs the command before reading the clippings file', async () => {
		const { app, plugin } = await setup({ preApproved: true });

		await plugin.syncClippings();

		// The whole point of the hook: fetch the file, then read it. Reading
		// first would sync a stale copy on every run. A second read for the
		// optional device-asins sidecar may follow — still after the command.
		expect(exec.log[0]).toBe('exec');
		expect(exec.log[1]).toBe('read');
		expect(exec.log.length).toBeGreaterThanOrEqual(2);
		expect(app.vault.files.has(NOTE)).toBe(true);
	});

	it('applies a timeout so a wedged command cannot hang the sync forever', async () => {
		const { plugin } = await setup({ preApproved: true });
		await plugin.syncClippings();

		expect(exec.options).toMatchObject({ timeout: 120_000 });
	});

	it('aborts the sync and surfaces stderr when the command fails', async () => {
		const { app, plugin } = await setup({ preApproved: true });
		exec.mode = 'reject';
		exec.stderr = 'no MTP device found';

		await plugin.syncClippings();

		// A stale on-disk copy must not be synced as if it were fresh.
		expect(vi.mocked(readFile)).not.toHaveBeenCalled();
		expect(app.vault.files.size).toBe(0);
		expect(notices.at(-1)).toBe(
			'Pre-sync command failed — sync aborted.\nno MTP device found',
		);
	});

	it('falls back to the error message when the failure has no stderr', async () => {
		const { plugin } = await setup({ preApproved: true });
		exec.mode = 'reject';
		exec.stderr = '   ';

		await plugin.syncClippings();

		expect(notices.at(-1)).toBe(
			'Pre-sync command failed — sync aborted.\nCommand failed with exit code 1',
		);
	});

	it('kills a running command on unload and stays quiet about it', async () => {
		const { app, plugin } = await setup({ preApproved: true });
		exec.mode = 'hang';

		const pending = plugin.syncClippings();
		await flush();
		expect(exec.lastChild?.killed).toBe(false);

		plugin.onunload();
		await pending;

		expect(exec.lastChild?.killed).toBe(true);
		// The kill is ours, so it is not a failure worth reporting, and a dead
		// plugin instance must not carry on writing notes.
		expect(notices.some((n) => n.includes('Pre-sync command failed'))).toBe(
			false,
		);
		expect(vi.mocked(readFile)).not.toHaveBeenCalled();
		expect(app.vault.files.size).toBe(0);
	});
});
