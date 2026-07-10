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
}

export const DEFAULT_SETTINGS: KindleClippingsSettings = {
	clippingsPath: '',
	targetFolder: 'Reference/Books',
	includeNotes: true,
	includeBookmarks: false,
	includeTruncated: true,
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
			.setDesc('Import your own annotations (Kindle "Notes").')
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
			.setName('Sync now')
			.setDesc('Run the same sync as the "Sync Kindle highlights" command.')
			.addButton((button) =>
				button
					.setButtonText('Sync now')
					.setCta()
					.onClick(() => this.plugin.syncClippings()),
			);
	}
}
