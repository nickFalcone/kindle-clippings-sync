export type ClippingType = 'highlight' | 'note' | 'bookmark';

export interface Clipping {
	/**
	 * The exact first line of the entry as written in My Clippings.txt,
	 * e.g. "Fahrenheit 451 (Ray Bradbury)". This is the v1 grouping key and
	 * the basis for the output filename — no fuzzy matching across syncs.
	 */
	bookKey: string;
	/** Title with the trailing author parenthetical removed. */
	title: string;
	/** Normalized author list; empty if no author parenthetical was found. */
	authors: string[];
	/** Raw author string as it appeared inside the parentheses, if any. */
	authorRaw: string | null;
	type: ClippingType;
	/** Page as written (usually a number, sometimes roman numerals); null when absent. */
	page: string | null;
	/** Location as written — a range ("1406-1407") or single number; null when absent. */
	location: string | null;
	/** ISO 8601 local datetime ("2016-03-26T14:59:39"); null if the date failed to parse. */
	addedAt: string | null;
	/** Raw "Added on ..." value, always kept so date-format drift never loses data. */
	addedAtRaw: string | null;
	/** Body text. Empty for bookmarks and clipping-limit stubs. */
	text: string;
	/** True when Kindle replaced the text with the clipping-limit message. */
	truncated: boolean;
	/** Dedupe hash of (bookKey, location, type, text). */
	hash: string;
}

export interface Book {
	key: string;
	title: string;
	authors: string[];
	clippings: Clipping[];
}

export interface SyncState {
	version: 1;
	/** bookKey -> hashes of clippings already written to that book's note. */
	syncedHashes: Record<string, string[]>;
}

export function emptySyncState(): SyncState {
	return { version: 1, syncedHashes: {} };
}
