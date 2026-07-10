import { Book, Clipping, ClippingType } from './types';

/**
 * Pure parser for Kindle's My Clippings.txt. No Obsidian or Node API
 * dependencies — raw text in, structured Clipping[] out.
 */

const ENTRY_SEPARATOR = /^==========\s*$/m;

const CLIPPING_LIMIT_RE =
	/<You have reached the clipping limit for this item>/i;

/**
 * Dedupe hash over (bookKey, location, type, text).
 *
 * WARNING — unverified edge case (see README): editing a Note on the Kindle
 * device is believed to append a NEW entry at the same location with a new
 * timestamp rather than replacing the old one. Because text differs, the
 * edited note gets a different hash and will surface as a second bullet in
 * the output note. If that proves annoying in practice, the fix is to key
 * on (bookKey, location, type) and treat latest-by-timestamp as
 * authoritative — deliberately not done in v1 because replacing a prior
 * line in the note risks clobbering adjacent manual edits.
 */
export function hashClipping(
	bookKey: string,
	location: string | null,
	type: ClippingType,
	text: string,
): string {
	// cyrb53 — small, fast, non-cryptographic; plenty for deduping a
	// personal clippings file.
	const input = [bookKey, location ?? '', type, text].join(' ');
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < input.length; i++) {
		const ch = input.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 =
		Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
		Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 =
		Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
		Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
	return value.toString(16).padStart(14, '0');
}

const MONTHS: Record<string, number> = {
	january: 1,
	february: 2,
	march: 3,
	april: 4,
	may: 5,
	june: 6,
	july: 7,
	august: 8,
	september: 9,
	october: 10,
	november: 11,
	december: 12,
};

/**
 * Parse the "Added on ..." value into an ISO local datetime. Kindle firmware
 * has used at least two formats; anything unrecognized returns null and the
 * caller keeps the raw string (fail soft, never throw).
 */
export function parseKindleDate(raw: string): string | null {
	// EU/international: "Saturday, 26 March 2016 14:59:39"
	let m = raw.match(
		/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/,
	);
	if (m) {
		const month = MONTHS[m[2]!.toLowerCase()];
		if (month) return toIso(+m[3]!, month, +m[1]!, +m[4]!, +m[5]!, +m[6]!);
	}
	// US: "Wednesday, December 30, 2015 7:31:41 PM"
	m = raw.match(
		/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i,
	);
	if (m) {
		const month = MONTHS[m[1]!.toLowerCase()];
		if (month) {
			let hour = +m[4]! % 12;
			if (m[7]!.toUpperCase() === 'PM') hour += 12;
			return toIso(+m[3]!, month, +m[2]!, hour, +m[5]!, +m[6]!);
		}
	}
	return null;
}

function toIso(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	second: number,
): string | null {
	if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23) return null;
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

/**
 * Split "Title (Author String)" — the LAST parenthetical is the author, so
 * titles that themselves contain parentheses are handled.
 */
export function splitTitleAuthor(bookKey: string): {
	title: string;
	authorRaw: string | null;
} {
	const m = bookKey.match(/^(.*)\(([^()]*)\)\s*$/);
	if (m && m[1]!.trim()) {
		return { title: m[1]!.trim(), authorRaw: m[2]!.trim() || null };
	}
	return { title: bookKey.trim(), authorRaw: null };
}

/**
 * Normalize an author string into a list. Deliberately a loose heuristic
 * (see spec): split on ";" / "&" / " and ", flip a single "Last, First"
 * comma. The raw string is always preserved on the Clipping as a fallback.
 */
export function parseAuthors(raw: string | null): string[] {
	if (!raw) return [];
	return raw
		.split(/;|&|\band\b/i)
		.map((part) => flipLastFirst(part.trim()))
		.filter(Boolean);
}

function flipLastFirst(name: string): string {
	const pieces = name.split(',').map((p) => p.trim());
	if (pieces.length === 2 && pieces[0] && pieces[1]) {
		return `${pieces[1]} ${pieces[0]}`;
	}
	return name;
}

/**
 * Parse the full contents of My Clippings.txt. Strips a leading UTF-8 BOM,
 * normalizes line endings, and dedupes entries by hash (keeping the most
 * recent by timestamp when the same content appears more than once — the
 * file is append-only on-device, so re-edits produce duplicate entries).
 */
export function parseClippings(raw: string): Clipping[] {
	const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
	const byHash = new Map<string, Clipping>();
	for (const chunk of text.split(ENTRY_SEPARATOR)) {
		const clipping = parseEntry(chunk);
		if (!clipping) continue;
		const prev = byHash.get(clipping.hash);
		if (!prev || isNewer(clipping, prev)) byHash.set(clipping.hash, clipping);
	}
	return [...byHash.values()];
}

function isNewer(a: Clipping, b: Clipping): boolean {
	if (a.addedAt && b.addedAt) return a.addedAt > b.addedAt;
	return true; // unparseable dates: later file position wins
}

function parseEntry(chunk: string): Clipping | null {
	const lines = chunk.split('\n');
	// Skip leading blank lines (the separator leaves one behind).
	let i = 0;
	while (i < lines.length && lines[i]!.trim() === '') i++;
	if (i >= lines.length) return null;

	const bookKey = lines[i]!.trim();
	i++;
	while (i < lines.length && lines[i]!.trim() === '') i++;
	const metaLine = i < lines.length ? lines[i]!.trim() : '';
	const typeMatch = metaLine.match(/^-\s*Your\s+(Highlight|Note|Bookmark)\b/i);
	if (!bookKey || !typeMatch) return null; // malformed entry — skip, don't throw
	const type = typeMatch[1]!.toLowerCase() as ClippingType;
	i++;

	// Metadata segments are pipe-separated; page/location/date can each be
	// absent, and page may live inside the first segment ("on page 92").
	let page: string | null = null;
	let location: string | null = null;
	let addedAtRaw: string | null = null;
	for (const seg of metaLine.split('|')) {
		const trimmed = seg.trim();
		const added = trimmed.match(/^Added on\s+(.+)$/i);
		if (added) {
			addedAtRaw = added[1]!.trim();
			continue;
		}
		const pageMatch = trimmed.match(/\bpage\s+(.+)$/i);
		if (pageMatch && page === null) {
			page = pageMatch[1]!.trim();
			continue;
		}
		const locMatch = trimmed.match(/\blocation\s+(.+)$/i);
		if (locMatch && location === null) location = locMatch[1]!.trim();
	}

	// Body: everything after the metadata line, trimmed at the edges but
	// with internal newlines preserved (paragraph highlights are real).
	const body = lines.slice(i).join('\n').trim();
	const truncated = CLIPPING_LIMIT_RE.test(body);
	const text = truncated || type === 'bookmark' ? '' : body;

	const { title, authorRaw } = splitTitleAuthor(bookKey);
	return {
		bookKey,
		title,
		authors: parseAuthors(authorRaw),
		authorRaw,
		type,
		page,
		location,
		addedAt: addedAtRaw ? parseKindleDate(addedAtRaw) : null,
		addedAtRaw,
		text,
		truncated,
		hash: hashClipping(
			bookKey,
			location,
			type,
			truncated ? '<truncated>' : text,
		),
	};
}

/** Group parsed clippings by their exact bookKey, preserving file order. */
export function groupByBook(clippings: Clipping[]): Book[] {
	const books = new Map<string, Book>();
	for (const clipping of clippings) {
		let book = books.get(clipping.bookKey);
		if (!book) {
			book = {
				key: clipping.bookKey,
				title: clipping.title,
				authors: clipping.authors,
				clippings: [],
			};
			books.set(clipping.bookKey, book);
		}
		book.clippings.push(clipping);
	}
	return [...books.values()];
}
