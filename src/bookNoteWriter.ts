import { Book, Clipping, ClippingType } from './types';

/**
 * Produces note content from parsed clippings. Pure string-in/string-out —
 * no Obsidian API — so the append-only/idempotent logic is unit-testable.
 *
 * The plugin only ever APPENDS to existing notes: it never rewrites or
 * deletes lines it wrote earlier, so manual edits anywhere in the note are
 * safe. What has already been synced is tracked in SyncStateStore, not by
 * re-reading the note (see syncState.ts).
 */

/**
 * Template knobs live here in one place — tweak headings, ordering, or the
 * bullet renderers below to change the output format.
 */
export const TEMPLATE = {
	headings: {
		highlight: '## Highlights',
		note: '## Notes',
		bookmark: '## Bookmarks',
	} satisfies Record<ClippingType, string>,
	/** Section order in a fresh note and when appending missing sections. */
	sectionOrder: ['highlight', 'note', 'bookmark'] as ClippingType[],
	frontmatterTags: ['books'],
	truncatedLabel:
		'**[Clipping limit reached — Kindle did not save this highlight text]**',
	bookmarkLabel: 'Bookmark',
};

/** Windows reserved device names — invalid as a filename regardless of extension. */
const WINDOWS_RESERVED_NAMES =
	/^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i;

/** Strip characters illegal on macOS/Windows or special in Obsidian links. */
export function sanitizeFilename(name: string): string {
	const cleaned = name
		.replace(/[\\/:*?"<>|#^[\]]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\.+|[. ]+$/g, '');
	// A book titled exactly "Con" or "Aux" would otherwise fail to create a
	// file on Windows only — append a suffix that isn't visually intrusive.
	return WINDOWS_RESERVED_NAMES.test(cleaned) ? `${cleaned}_` : cleaned;
}

function yamlString(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function renderFrontmatter(book: Book): string {
	const lines = ['---', `title: ${yamlString(book.title)}`];
	if (book.authors.length > 0) {
		lines.push('author:');
		for (const author of book.authors) lines.push(`  - ${yamlString(author)}`);
	}
	lines.push('source: kindle');
	lines.push(`tags: [${TEMPLATE.frontmatterTags.join(', ')}]`);
	lines.push('---');
	return lines.join('\n');
}

function locationLabel(clipping: Clipping): string {
	const parts: string[] = [];
	if (clipping.page) parts.push(`Page ${clipping.page}`);
	if (clipping.location) parts.push(`Location ${clipping.location}`);
	return parts.join(', ');
}

/** Render one clipping as a Markdown bullet. */
export function renderClipping(clipping: Clipping): string {
	const label = locationLabel(clipping);
	const suffix = label ? ` (${label})` : '';
	if (clipping.truncated) {
		return `- ${TEMPLATE.truncatedLabel}${suffix}`;
	}
	if (clipping.type === 'bookmark') {
		return `- ${TEMPLATE.bookmarkLabel}${suffix}`;
	}
	// Multi-line (paragraph) highlights: indent continuation lines so the
	// whole text stays inside one bullet.
	const text = clipping.text.replace(/\n/g, '\n  ');
	return `- ${text}${suffix}`;
}

function groupByType(clippings: Clipping[]): Map<ClippingType, Clipping[]> {
	const groups = new Map<ClippingType, Clipping[]>();
	for (const type of TEMPLATE.sectionOrder) {
		const members = clippings.filter((c) => c.type === type);
		if (members.length > 0) groups.set(type, members);
	}
	return groups;
}

/** Build a brand-new note: frontmatter plus one section per clipping type. */
export function buildNewNote(book: Book, clippings: Clipping[]): string {
	const parts = [renderFrontmatter(book)];
	for (const [type, members] of groupByType(clippings)) {
		parts.push(
			`${TEMPLATE.headings[type]}\n\n${members.map(renderClipping).join('\n')}`,
		);
	}
	return parts.join('\n\n') + '\n';
}

/**
 * Append new clippings to an existing note, under their type's heading.
 * Everything already in the note is left byte-for-byte untouched except for
 * insertion points. If a section heading is missing (user deleted it, or the
 * book never had that type), the heading + bullets are appended at the end.
 */
export function appendToNote(existing: string, clippings: Clipping[]): string {
	let content = existing;
	for (const [type, members] of groupByType(clippings)) {
		const bullets = members.map(renderClipping).join('\n');
		content = insertIntoSection(content, TEMPLATE.headings[type], bullets);
	}
	return content;
}

function insertIntoSection(
	content: string,
	heading: string,
	bullets: string,
): string {
	const lines = content.split('\n');
	const headingIdx = lines.findIndex((line) => line.trim() === heading);
	if (headingIdx === -1) {
		// Section missing — append it at the end of the note.
		const base = content.replace(/\n*$/, '');
		return `${base}\n\n${heading}\n\n${bullets}\n`;
	}
	// Section ends at the next heading (any level) or EOF.
	let end = lines.length;
	for (let i = headingIdx + 1; i < lines.length; i++) {
		if (/^#{1,6}\s/.test(lines[i]!)) {
			end = i;
			break;
		}
	}
	// Insert after the last non-blank line of the section, preserving any
	// trailing blank lines that separate it from the next heading.
	let insertAt = end;
	while (insertAt > headingIdx + 1 && lines[insertAt - 1]!.trim() === '') {
		insertAt--;
	}
	const needsBlank = insertAt === headingIdx + 1; // empty section
	const insertion = needsBlank ? ['', ...bullets.split('\n')] : bullets.split('\n');
	lines.splice(insertAt, 0, ...insertion);
	return lines.join('\n');
}
