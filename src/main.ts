import {
	App,
	Modal,
	Notice,
	Plugin,
	Setting,
	TFile,
	TFolder,
	normalizePath,
} from 'obsidian';
import { readFile } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import {
	DEFAULT_SETTINGS,
	KindleClippingsSettings,
	KindleClippingsSettingTab,
} from './settings';
import { parseClippings, groupByBook } from './parser';
import { appendToNote, buildNewNote, sanitizeFilename } from './bookNoteWriter';
import { SyncStateStore } from './syncState';
import { Clipping } from './types';

interface PersistedData {
	settings?: Partial<KindleClippingsSettings>;
	syncState?: unknown;
}

export default class KindleClippingsSyncPlugin extends Plugin {
	settings!: KindleClippingsSettings;
	syncState!: SyncStateStore;
	private syncing = false;

	async onload() {
		await this.loadPersisted();

		this.addRibbonIcon('book-open', 'Sync Kindle highlights', () => {
			void this.syncClippings();
		});

		this.addCommand({
			id: 'sync-kindle-highlights',
			name: 'Sync Kindle highlights',
			callback: () => {
				void this.syncClippings();
			},
		});

		this.addSettingTab(new KindleClippingsSettingTab(this.app, this));
	}

	async loadPersisted() {
		const data = ((await this.loadData()) ?? {}) as PersistedData;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
		this.syncState = SyncStateStore.fromData(data.syncState);
	}

	async saveSettings() {
		const data: PersistedData = {
			settings: this.settings,
			syncState: this.syncState.toJSON(),
		};
		await this.saveData(data);
	}

	private includeClipping(clipping: Clipping): boolean {
		if (clipping.truncated) return this.settings.includeTruncated;
		switch (clipping.type) {
			case 'highlight':
				return true;
			case 'note':
				return this.settings.includeNotes;
			case 'bookmark':
				return this.settings.includeBookmarks;
		}
	}

	async syncClippings(): Promise<void> {
		if (this.syncing) {
			new Notice('Kindle sync already running.');
			return;
		}
		this.syncing = true;
		try {
			await this.doSync();
		} catch (error) {
			console.error('Kindle clippings sync failed', error);
			new Notice(
				`Kindle sync failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			this.syncing = false;
		}
	}

	private async doSync(): Promise<void> {
		const path = this.settings.clippingsPath.trim();
		if (!path) {
			new Notice(
				'Set the path to My Clippings.txt in the Kindle Clippings Sync settings first.',
			);
			return;
		}

		const preSync = this.settings.preSyncCommand.trim();
		if (preSync) {
			// Consent gate: the command string lives in data.json, so never run
			// a string the user hasn't explicitly approved. Approval is per
			// exact string — any change re-prompts.
			if (preSync !== this.settings.approvedPreSyncCommand) {
				const approved = await new Promise<boolean>((resolve) =>
					new PreSyncCommandModal(this.app, preSync, resolve).open(),
				);
				if (!approved) {
					new Notice('Pre-sync command not approved — sync cancelled.');
					return;
				}
				this.settings.approvedPreSyncCommand = preSync;
				await this.saveSettings();
			}
			new Notice('Kindle sync: running pre-sync command…');
			try {
				await execAsync(preSync, { timeout: 120_000 });
			} catch (error) {
				// A failed pull usually means the Kindle isn't connected; the
				// on-disk copy is stale, so syncing would only mask that.
				const message =
					error instanceof Error && 'stderr' in error
						? String((error as { stderr: unknown }).stderr).trim() ||
							error.message
						: String(error);
				new Notice(`Pre-sync command failed — sync aborted.\n${message}`);
				return;
			}
		}

		let raw: string;
		try {
			raw = await readFile(path, 'utf8');
		} catch {
			new Notice(
				`Could not read "${path}". Is the Kindle connected via USB?`,
			);
			return;
		}

		const books = groupByBook(parseClippings(raw));
		let newClippings = 0;
		let touchedBooks = 0;

		for (const book of books) {
			const fresh = book.clippings.filter(
				(c) =>
					this.includeClipping(c) && !this.syncState.has(book.key, c.hash),
			);
			if (fresh.length === 0) continue;

			const fileName = sanitizeFilename(book.key);
			if (!fileName) continue;
			const filePath = normalizePath(
				`${this.settings.targetFolder}/${fileName}.md`,
			);

			const existing = this.app.vault.getAbstractFileByPath(filePath);
			if (existing instanceof TFile) {
				// Vault.process is atomic — a read+modify pair could clobber a
				// write that lands in between (e.g. Obsidian Sync/iCloud).
				await this.app.vault.process(existing, (content) =>
					appendToNote(content, fresh),
				);
			} else if (existing) {
				// A folder with this name — refuse rather than overwrite anything.
				new Notice(`Skipping "${filePath}": a folder exists at that path.`);
				continue;
			} else {
				await this.ensureFolder(this.settings.targetFolder);
				await this.app.vault.create(filePath, buildNewNote(book, fresh));
			}

			for (const clipping of fresh) {
				this.syncState.add(book.key, clipping.hash);
			}
			// Persist per book so a mid-sync crash never re-appends what was
			// already written.
			await this.saveSettings();
			newClippings += fresh.length;
			touchedBooks++;
		}

		new Notice(
			newClippings === 0
				? 'Kindle sync: nothing new.'
				: `Kindle sync: added ${newClippings} clipping${newClippings === 1 ? '' : 's'} across ${touchedBooks} book${touchedBooks === 1 ? '' : 's'}.`,
		);
	}

	private async ensureFolder(folder: string): Promise<void> {
		const path = normalizePath(folder);
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFolder) return;
		if (!existing) {
			await this.app.vault.createFolder(path);
		}
	}
}

/**
 * One-time confirmation before a pre-sync command string is executed.
 * Closing the modal any way other than the confirm button counts as a "no".
 */
class PreSyncCommandModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private command: string,
		private onResult: (approved: boolean) => void,
	) {
		super(app);
	}

	private resolve(approved: boolean) {
		if (this.resolved) return;
		this.resolved = true;
		this.onResult(approved);
	}

	onOpen() {
		this.titleEl.setText('Run pre-sync command?');
		this.contentEl.createEl('p', {
			text: 'This sync is configured to run the following shell command first:',
		});
		this.contentEl.createEl('pre').createEl('code', { text: this.command });
		this.contentEl.createEl('p', {
			text: 'It runs with your user privileges. Only continue if you set this command yourself and trust it — it will then run without asking until it changes.',
		});
		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText('Run command')
					.setCta()
					.onClick(() => {
						this.resolve(true);
						this.close();
					}),
			)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => {
					this.resolve(false);
					this.close();
				}),
			);
	}

	onClose() {
		this.resolve(false);
		this.contentEl.empty();
	}
}
