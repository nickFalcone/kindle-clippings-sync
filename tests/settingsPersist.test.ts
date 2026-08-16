import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import {
	persistSettings,
	resolveSettings,
	type PersistedSettings,
} from '../src/settingsPersist';

const MAC_LEGACY: PersistedSettings = {
	clippingsPath: '/Users/nfalcone/Kindle/My Clippings.txt',
	targetFolder: 'Reference/Books',
	includeNotes: true,
	includeBookmarks: false,
	includeTruncated: true,
	preSyncCommand: '/opt/homebrew/bin/kindle-sync --pull-only',
	approvedPreSyncCommand: '/opt/homebrew/bin/kindle-sync --pull-only',
	bookAsinsPath: '',
};

describe('resolveSettings', () => {
	it('returns defaults when nothing is persisted', () => {
		expect(resolveSettings(undefined, 'win32')).toEqual(DEFAULT_SETTINGS);
		expect(resolveSettings({}, 'darwin')).toEqual(DEFAULT_SETTINGS);
	});

	it('uses legacy top-level paths on macOS', () => {
		const settings = resolveSettings(MAC_LEGACY, 'darwin');
		expect(settings.clippingsPath).toBe(MAC_LEGACY.clippingsPath);
		expect(settings.preSyncCommand).toBe(MAC_LEGACY.preSyncCommand);
		expect(settings.approvedPreSyncCommand).toBe(
			MAC_LEGACY.approvedPreSyncCommand,
		);
		expect(settings.targetFolder).toBe('Reference/Books');
		expect(settings.includeNotes).toBe(true);
	});

	it('does not apply macOS legacy paths on Windows — shared toggles still apply', () => {
		const settings = resolveSettings(MAC_LEGACY, 'win32');
		expect(settings.clippingsPath).toBe('');
		expect(settings.preSyncCommand).toBe('');
		expect(settings.approvedPreSyncCommand).toBe('');
		expect(settings.targetFolder).toBe('Reference/Books');
		expect(settings.includeNotes).toBe(true);
		expect(settings.includeBookmarks).toBe(false);
		expect(settings.includeTruncated).toBe(true);
	});

	it('does not treat /Users/... legacy paths as Linux', () => {
		const settings = resolveSettings(MAC_LEGACY, 'linux');
		expect(settings.clippingsPath).toBe('');
		expect(settings.preSyncCommand).toBe('');
		expect(settings.targetFolder).toBe('Reference/Books');
	});

	it('prefers platforms.win32 over leftover macOS top-level paths', () => {
		const settings = resolveSettings(
			{
				...MAC_LEGACY,
				platforms: {
					win32: {
						clippingsPath: 'C:\\Users\\nicho\\Kindle\\My Clippings.txt',
						preSyncCommand: '%USERPROFILE%\\Kindle\\kindle-sync.cmd',
						approvedPreSyncCommand: '%USERPROFILE%\\Kindle\\kindle-sync.cmd',
						bookAsinsPath: '',
					},
				},
			},
			'win32',
		);
		expect(settings.clippingsPath).toBe(
			'C:\\Users\\nicho\\Kindle\\My Clippings.txt',
		);
		expect(settings.preSyncCommand).toBe(
			'%USERPROFILE%\\Kindle\\kindle-sync.cmd',
		);
	});
});

describe('persistSettings', () => {
	it('migrates macOS legacy into platforms.darwin and writes Windows beside it', () => {
		const windows = {
			...DEFAULT_SETTINGS,
			targetFolder: 'Reference/Books',
			includeNotes: false,
			clippingsPath: 'C:\\Users\\nicho\\Kindle\\My Clippings.txt',
			preSyncCommand: '%USERPROFILE%\\Kindle\\kindle-sync.cmd',
			approvedPreSyncCommand: '%USERPROFILE%\\Kindle\\kindle-sync.cmd',
		};
		const persisted = persistSettings(windows, 'win32', MAC_LEGACY);

		expect(persisted.platforms?.darwin?.clippingsPath).toBe(
			MAC_LEGACY.clippingsPath,
		);
		expect(persisted.platforms?.darwin?.preSyncCommand).toBe(
			MAC_LEGACY.preSyncCommand,
		);
		expect(persisted.platforms?.win32?.clippingsPath).toBe(
			windows.clippingsPath,
		);
		expect(persisted.platforms?.win32?.preSyncCommand).toBe(
			windows.preSyncCommand,
		);
		// Old macOS plugin versions read top-level machine paths.
		expect(persisted.clippingsPath).toBe(MAC_LEGACY.clippingsPath);
		expect(persisted.preSyncCommand).toBe(MAC_LEGACY.preSyncCommand);
		// Shared fields come from the machine that just saved.
		expect(persisted.includeNotes).toBe(false);
		expect(persisted.targetFolder).toBe('Reference/Books');
	});

	it('a later macOS save updates darwin without wiping Windows', () => {
		const afterWindows = persistSettings(
			{
				...DEFAULT_SETTINGS,
				clippingsPath: 'C:\\Users\\nicho\\Kindle\\My Clippings.txt',
				preSyncCommand: '%USERPROFILE%\\Kindle\\kindle-sync.cmd',
			},
			'win32',
			MAC_LEGACY,
		);
		const afterMac = persistSettings(
			{
				...DEFAULT_SETTINGS,
				clippingsPath: '/Users/nfalcone/Kindle/My Clippings.txt',
				preSyncCommand: '/opt/homebrew/bin/kindle-sync',
				approvedPreSyncCommand: '/opt/homebrew/bin/kindle-sync',
				includeBookmarks: true,
			},
			'darwin',
			afterWindows,
		);

		expect(afterMac.platforms?.win32?.clippingsPath).toBe(
			'C:\\Users\\nicho\\Kindle\\My Clippings.txt',
		);
		expect(afterMac.platforms?.darwin?.preSyncCommand).toBe(
			'/opt/homebrew/bin/kindle-sync',
		);
		expect(afterMac.clippingsPath).toBe(
			'/Users/nfalcone/Kindle/My Clippings.txt',
		);
		expect(afterMac.includeBookmarks).toBe(true);
	});
});
