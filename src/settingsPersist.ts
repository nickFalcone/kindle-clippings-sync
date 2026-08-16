import {
	DEFAULT_SETTINGS,
	type KindleClippingsSettings,
} from './settings';

export const MACHINE_SETTING_KEYS = [
	'clippingsPath',
	'preSyncCommand',
	'approvedPreSyncCommand',
	'bookAsinsPath',
] as const;

export type MachineSettingKey = (typeof MACHINE_SETTING_KEYS)[number];

export type MachineSettings = Pick<KindleClippingsSettings, MachineSettingKey>;

export interface PersistedSettings
	extends Partial<KindleClippingsSettings> {
	platforms?: Partial<Record<string, Partial<MachineSettings>>>;
}

const EMPTY_MACHINE: MachineSettings = {
	clippingsPath: '',
	preSyncCommand: '',
	approvedPreSyncCommand: '',
	bookAsinsPath: '',
};

function pickMachine(
	source: Partial<KindleClippingsSettings> | Partial<MachineSettings> | undefined,
): MachineSettings {
	const out = { ...EMPTY_MACHINE };
	if (!source) return out;
	for (const key of MACHINE_SETTING_KEYS) {
		const value = source[key];
		if (typeof value === 'string') out[key] = value;
	}
	return out;
}

function pickShared(
	source: Partial<KindleClippingsSettings> | undefined,
): Pick<
	KindleClippingsSettings,
	'targetFolder' | 'includeNotes' | 'includeBookmarks' | 'includeTruncated'
> {
	const out: Pick<
		KindleClippingsSettings,
		'targetFolder' | 'includeNotes' | 'includeBookmarks' | 'includeTruncated'
	> = {
		targetFolder: DEFAULT_SETTINGS.targetFolder,
		includeNotes: DEFAULT_SETTINGS.includeNotes,
		includeBookmarks: DEFAULT_SETTINGS.includeBookmarks,
		includeTruncated: DEFAULT_SETTINGS.includeTruncated,
	};
	if (!source) return out;
	if (typeof source.targetFolder === 'string' && source.targetFolder.trim()) {
		out.targetFolder = source.targetFolder;
	}
	if (typeof source.includeNotes === 'boolean') {
		out.includeNotes = source.includeNotes;
	}
	if (typeof source.includeBookmarks === 'boolean') {
		out.includeBookmarks = source.includeBookmarks;
	}
	if (typeof source.includeTruncated === 'boolean') {
		out.includeTruncated = source.includeTruncated;
	}
	return out;
}

/**
 * Guess which OS wrote the pre-platform-split top-level paths.
 * `/Users/...` and Homebrew are macOS; drive letters are Windows; `/home/` is Linux.
 * Unrecognized POSIX paths default to darwin — this plugin was macOS-only until now.
 */
export function inferLegacyPlatform(
	source: Partial<KindleClippingsSettings> | undefined,
): string | null {
	if (!source) return null;
	const sample =
		source.preSyncCommand?.trim() ||
		source.clippingsPath?.trim() ||
		source.bookAsinsPath?.trim() ||
		'';
	if (!sample) return null;
	if (/^[a-zA-Z]:[\\/]/.test(sample) || sample.startsWith('\\\\')) return 'win32';
	if (
		sample.startsWith('/Users/') ||
		sample.startsWith('/Volumes/') ||
		sample.includes('/opt/homebrew')
	) {
		return 'darwin';
	}
	if (sample.startsWith('/home/')) return 'linux';
	if (sample.startsWith('/')) return 'darwin';
	return null;
}

export function resolveSettings(
	persisted: PersistedSettings | undefined,
	platform: string,
): KindleClippingsSettings {
	const { platforms, ...rest } = persisted ?? {};
	const fromPlatform = platforms?.[platform];
	const machine = fromPlatform
		? pickMachine(fromPlatform)
		: inferLegacyPlatform(rest) === platform
			? pickMachine(rest)
			: { ...EMPTY_MACHINE };
	return {
		...DEFAULT_SETTINGS,
		...pickShared(rest),
		...machine,
	};
}

export function persistSettings(
	current: KindleClippingsSettings,
	platform: string,
	previous?: PersistedSettings,
): PersistedSettings {
	const previousPlatforms = { ...(previous?.platforms ?? {}) };
	const previousTopLevel: Partial<KindleClippingsSettings> = {
		...(previous ?? {}),
	};
	delete (previousTopLevel as PersistedSettings).platforms;

	const legacyPlatform = inferLegacyPlatform(previousTopLevel);
	if (
		legacyPlatform &&
		legacyPlatform !== platform &&
		previousPlatforms[legacyPlatform] === undefined
	) {
		previousPlatforms[legacyPlatform] = pickMachine(previousTopLevel);
	}

	const platforms: NonNullable<PersistedSettings['platforms']> = {
		...previousPlatforms,
		[platform]: pickMachine(current),
	};

	const darwinMachine = platforms.darwin
		? pickMachine(platforms.darwin)
		: platform === 'darwin'
			? pickMachine(current)
			: pickMachine(previousTopLevel);

	return {
		...pickShared(current),
		...darwinMachine,
		platforms,
	};
}
