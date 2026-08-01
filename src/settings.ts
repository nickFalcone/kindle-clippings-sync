import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import KindleClippingsSyncPlugin from './main';

export interface KindleClippingsSettings {
	/** Absolute path to My Clippings.txt on the mounted Kindle (or a copy). */
	clippingsPath: string;
	/** Vault folder that book notes are written into. */
	targetFolder: string;
	includeNotes: boolean;
	includeBookmarks: boolean;
	includeTruncated: boolean;
	/**
	 * Optional shell command run before each sync, e.g. a script that pulls
	 * My Clippings.txt off an MTP-only Kindle. Sync aborts if it fails.
	 */
	preSyncCommand: string;
	/**
	 * The exact pre-sync command string the user has confirmed via the
	 * consent modal. A command only runs when it matches this; any change
	 * to the setting re-prompts before the next sync.
	 */
	approvedPreSyncCommand: string;
}

/** Shared label for the ribbon icon, command palette entry, and settings cross-references. */
export const SYNC_COMMAND_LABEL = 'Sync Kindle highlights';

export const DEFAULT_SETTINGS: KindleClippingsSettings = {
	clippingsPath: '',
	targetFolder: 'Reference/Books',
	includeNotes: true,
	includeBookmarks: false,
	includeTruncated: true,
	preSyncCommand: '',
	approvedPreSyncCommand: '',
};

/**
 * The native file dialog comes from Electron. Obsidian exposes it via
 * `window.electron.remote` on desktop, but the exact surface has shifted
 * across Obsidian/Electron versions — so probe defensively and fall back to
 * "type the path" if it's unavailable.
 */
function getElectronDialog(): {
	showOpenDialog(options: unknown): Promise<{
		canceled: boolean;
		filePaths: string[];
	}>;
} | null {
	try {
		const w = window as unknown as {
			electron?: { remote?: { dialog?: unknown } };
			require?: (module: string) => { remote?: { dialog?: unknown } };
		};
		const dialog =
			w.electron?.remote?.dialog ?? w.require?.('electron')?.remote?.dialog;
		return (dialog as ReturnType<typeof getElectronDialog>) ?? null;
	} catch {
		return null;
	}
}

/*
 * This tab renders through `display()`, which Obsidian deprecated in 1.13.0 in
 * favour of the declarative `getSettingDefinitions()` API. That costs two
 * accepted standing lint warnings — `obsidianmd/settings-tab/
 * prefer-setting-definitions` and `@typescript-eslint/no-deprecated` — and one
 * real thing: these settings don't appear in settings search on 1.13.0+.
 *
 * We stay here because `minAppVersion` is 1.4.0. Migrating fully means
 * dropping `display()`, which only works from 1.13.0 and abandons everyone
 * below it. The middle path — implementing `getSettingDefinitions()` while
 * keeping `display()` — is viable and would restore search (nothing calls the
 * new method before 1.13, so old versions are unaffected), at the cost of
 * describing every setting twice with the two able to drift. Worth revisiting
 * when `minAppVersion` moves up for other reasons, or if search matters more
 * than the duplication.
 *
 * Don't add a stub returning `[]`. That rule only checks whether a member of
 * that name exists, so a stub silences it and leaves search just as broken.
 */
export class KindleClippingsSettingTab extends PluginSettingTab {
	plugin: KindleClippingsSyncPlugin;

	constructor(app: App, plugin: KindleClippingsSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Path to My Clippings.txt')
			.setDesc(
				'Found in the "documents" folder when the Kindle is connected over USB.',
			)
			.addText((text) =>
				text
					.setPlaceholder('/Volumes/Kindle/documents/My Clippings.txt')
					.setValue(this.plugin.settings.clippingsPath)
					.onChange(async (value) => {
						this.plugin.settings.clippingsPath = value;
						await this.plugin.saveSettings();
					}),
			)
			.addButton((button) =>
				button.setButtonText('Browse').onClick(async () => {
					const dialog = getElectronDialog();
					if (!dialog) {
						new Notice(
							'Native file dialog unavailable — paste the path into the text field instead.',
						);
						return;
					}
					const result = await dialog.showOpenDialog({
						properties: ['openFile'],
						filters: [{ name: 'Text files', extensions: ['txt'] }],
					});
					const path = result.filePaths?.[0];
					if (!result.canceled && path) {
						this.plugin.settings.clippingsPath = path;
						await this.plugin.saveSettings();
						this.display();
					}
				}),
			);

		new Setting(containerEl)
			.setName('Book notes folder')
			.setDesc('Vault folder where per-book notes are created.')
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.targetFolder)
					.setValue(this.plugin.settings.targetFolder)
					.onChange(async (value) => {
						this.plugin.settings.targetFolder =
							value.trim() || DEFAULT_SETTINGS.targetFolder;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Include notes')
			.setDesc('Import your own annotations (Kindle "notes").')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeNotes)
					.onChange(async (value) => {
						this.plugin.settings.includeNotes = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Include bookmarks')
			.setDesc('Bookmarks have no text — off by default.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeBookmarks)
					.onChange(async (value) => {
						this.plugin.settings.includeBookmarks = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Include clipping-limit stubs')
			.setDesc(
				'When Kindle refuses to save a highlight (DRM clipping limit), write a placeholder bullet so you know content is missing.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeTruncated)
					.onChange(async (value) => {
						this.plugin.settings.includeTruncated = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Pre-sync command')
			.setDesc(
				'Optional shell command run before each sync — e.g. a script that copies My Clippings.txt off an MTP-only Kindle. Leave empty to skip. Sync aborts if the command fails. The command runs with your user privileges; the first sync after it changes asks for confirmation.',
			)
			.addText((text) =>
				text
					.setPlaceholder('/opt/homebrew/bin/kindle-sync')
					.setValue(this.plugin.settings.preSyncCommand)
					.onChange(async (value) => {
						this.plugin.settings.preSyncCommand = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Sync now')
			.setDesc(`Run the same sync as the "${SYNC_COMMAND_LABEL}" command.`)
			.addButton((button) =>
				button
					.setButtonText('Sync now')
					.setCta()
					.onClick(() => void this.plugin.syncClippings()),
			);
	}
}
