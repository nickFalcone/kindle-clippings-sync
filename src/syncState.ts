import { SyncState, emptySyncState } from './types';

/**
 * Tracks which clipping hashes have already been written to each book's
 * note. This record — not the note content — is the sole source of truth
 * for "already synced": the plugin never re-reads notes to reconcile, so
 * manual edits and deletions in Obsidian are always preserved.
 */
export class SyncStateStore {
	private state: SyncState;
	private sets: Map<string, Set<string>>;

	constructor(state?: SyncState) {
		this.state = state ?? emptySyncState();
		this.sets = new Map(
			Object.entries(this.state.syncedHashes).map(([key, hashes]) => [
				key,
				new Set(hashes),
			]),
		);
	}

	/** Rebuild from whatever was persisted in data.json; tolerate garbage. */
	static fromData(data: unknown): SyncStateStore {
		if (
			data &&
			typeof data === 'object' &&
			'syncedHashes' in data &&
			typeof (data as SyncState).syncedHashes === 'object'
		) {
			const raw = (data as SyncState).syncedHashes;
			const syncedHashes: Record<string, string[]> = {};
			for (const [key, value] of Object.entries(raw ?? {})) {
				if (Array.isArray(value)) {
					syncedHashes[key] = value.filter((h) => typeof h === 'string');
				}
			}
			return new SyncStateStore({ version: 1, syncedHashes });
		}
		return new SyncStateStore();
	}

	has(bookKey: string, hash: string): boolean {
		return this.sets.get(bookKey)?.has(hash) ?? false;
	}

	add(bookKey: string, hash: string): void {
		let set = this.sets.get(bookKey);
		if (!set) {
			set = new Set();
			this.sets.set(bookKey, set);
		}
		set.add(hash);
	}

	toJSON(): SyncState {
		const syncedHashes: Record<string, string[]> = {};
		for (const [key, set] of this.sets) {
			syncedHashes[key] = [...set];
		}
		return { version: 1, syncedHashes };
	}
}
