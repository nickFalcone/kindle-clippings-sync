import { describe, expect, it } from 'vitest';
import {
	appendToNote,
	buildNewNote,
	renderClipping,
	sanitizeFilename,
} from '../src/bookNoteWriter';
import { hashClipping } from '../src/parser';
import { Book, Clipping, ClippingType } from '../src/types';

function makeClipping(overrides: Partial<Clipping> = {}): Clipping {
	const base = {
		bookKey: 'Fahrenheit 451 (Ray Bradbury)',
		title: 'Fahrenheit 451',
		authors: ['Ray Bradbury'],
		authorRaw: 'Ray Bradbury',
		type: 'highlight' as ClippingType,
		page: '92' as string | null,
		location: '1406-1407' as string | null,
		addedAt: '2016-03-26T14:59:39' as string | null,
		addedAtRaw: 'Saturday, 26 March 2016 14:59:39' as string | null,
		text: 'It was a pleasure to burn.',
		truncated: false,
		...overrides,
	};
	return {
		...base,
		hash: hashClipping(base.bookKey, base.location, base.type, base.text),
	};
}

const BOOK: Book = {
	key: 'Fahrenheit 451 (Ray Bradbury)',
	title: 'Fahrenheit 451',
	authors: ['Ray Bradbury'],
	clippings: [],
};

describe('sanitizeFilename', () => {
	it('strips characters illegal on macOS/Windows and special in Obsidian', () => {
		expect(sanitizeFilename('What If? (Randall Munroe)')).toBe(
			'What If (Randall Munroe)',
		);
		expect(sanitizeFilename('C:\\path/to|file*"<>#^[]')).toBe('C path to file');
	});

	it('trims trailing dots and spaces (Windows)', () => {
		expect(sanitizeFilename('Title... ')).toBe('Title');
	});

	it('suffixes Windows reserved device names', () => {
		expect(sanitizeFilename('CON')).toBe('CON_');
		expect(sanitizeFilename('aux')).toBe('aux_');
		expect(sanitizeFilename('Com3')).toBe('Com3_');
		// Not a reserved name on its own — must not be mangled.
		expect(sanitizeFilename('Console Wars')).toBe('Console Wars');
	});

	it('suffixes reserved device names with a dotted remainder, preserving it', () => {
		expect(sanitizeFilename('CON.txt')).toBe('CON_.txt');
		expect(sanitizeFilename('lpt1.backup')).toBe('lpt1_.backup');
	});

	it('does not treat COM0/LPT0 as reserved (only COM1-9/LPT1-9 are)', () => {
		expect(sanitizeFilename('COM0')).toBe('COM0');
		expect(sanitizeFilename('LPT0')).toBe('LPT0');
	});
});

describe('renderClipping', () => {
	it('renders text with page and location', () => {
		expect(renderClipping(makeClipping())).toBe(
			'- It was a pleasure to burn. (Page 92, Location 1406-1407)',
		);
	});

	it('renders location-only when page is absent', () => {
		expect(renderClipping(makeClipping({ page: null }))).toBe(
			'- It was a pleasure to burn. (Location 1406-1407)',
		);
	});

	it('indents multi-line text to stay within one bullet', () => {
		const rendered = renderClipping(
			makeClipping({ text: 'First line.\n\nSecond line.' }),
		);
		expect(rendered).toBe(
			'- First line.\n  \n  Second line. (Page 92, Location 1406-1407)',
		);
	});

	it('renders a visible stub for truncated clippings', () => {
		const rendered = renderClipping(makeClipping({ text: '', truncated: true }));
		expect(rendered).toContain('Clipping limit reached');
		expect(rendered).toContain('(Page 92, Location 1406-1407)');
	});

	it('renders bookmarks as a labeled bullet', () => {
		const rendered = renderClipping(
			makeClipping({ type: 'bookmark', text: '', page: null, location: '346' }),
		);
		expect(rendered).toBe('- Bookmark (Location 346)');
	});
});

describe('buildNewNote', () => {
	it('produces frontmatter plus per-type sections', () => {
		const note = buildNewNote(BOOK, [
			makeClipping(),
			makeClipping({
				type: 'note',
				text: 'remember this for the essay',
				page: '45',
				location: '812',
			}),
		]);
		expect(note).toBe(
			[
				'---',
				'title: "Fahrenheit 451"',
				'author:',
				'  - "Ray Bradbury"',
				'source: kindle',
				'tags: [books]',
				'---',
				'',
				'## Highlights',
				'',
				'- It was a pleasure to burn. (Page 92, Location 1406-1407)',
				'',
				'## Notes',
				'',
				'- remember this for the essay (Page 45, Location 812)',
				'',
			].join('\n'),
		);
	});

	it('escapes quotes in YAML values', () => {
		const note = buildNewNote(
			{ ...BOOK, title: 'The "Best" Book' },
			[makeClipping()],
		);
		expect(note).toContain('title: "The \\"Best\\" Book"');
	});

	it('omits empty sections', () => {
		const note = buildNewNote(BOOK, [makeClipping()]);
		expect(note).not.toContain('## Notes');
		expect(note).not.toContain('## Bookmarks');
	});
});

describe('appendToNote — idempotent append-only semantics', () => {
	const existing = [
		'---',
		'title: "Fahrenheit 451"',
		'source: kindle',
		'---',
		'',
		'## Highlights',
		'',
		'- It was a pleasure to burn. (Page 92, Location 1406-1407)',
		'',
		'My own commentary paragraph that must survive syncs.',
		'',
		'## Notes',
		'',
		'- remember this for the essay (Page 45, Location 812)',
		'',
	].join('\n');

	it('appends a new highlight at the end of the Highlights section', () => {
		const added = makeClipping({
			text: 'New highlight.',
			page: '100',
			location: '1500',
		});
		const result = appendToNote(existing, [added]);
		const lines = result.split('\n');
		const idx = lines.indexOf('- New highlight. (Page 100, Location 1500)');
		expect(idx).toBeGreaterThan(
			lines.indexOf('My own commentary paragraph that must survive syncs.'),
		);
		expect(idx).toBeLessThan(lines.indexOf('## Notes'));
	});

	it('leaves all existing content untouched', () => {
		const added = makeClipping({ text: 'New highlight.', location: '1500' });
		const result = appendToNote(existing, [added]);
		for (const line of existing.split('\n')) {
			expect(result).toContain(line);
		}
		expect(result).toContain('My own commentary paragraph that must survive syncs.');
	});

	it('appends a missing section at the end of the note', () => {
		const noNotesSection = existing.replace(
			/## Notes[\s\S]*$/,
			'',
		);
		const added = makeClipping({
			type: 'note',
			text: 'a new note',
			page: null,
			location: '900',
		});
		const result = appendToNote(noNotesSection, [added]);
		expect(result).toMatch(/## Notes\n\n- a new note \(Location 900\)\n$/);
	});

	it('handles appending into an empty section', () => {
		const emptySection = '# Book\n\n## Highlights\n';
		const added = makeClipping({ text: 'First!', page: null, location: '1' });
		const result = appendToNote(emptySection, [added]);
		expect(result).toContain('## Highlights\n\n- First! (Location 1)');
	});

	it('is a no-op transformation when there is nothing to add', () => {
		expect(appendToNote(existing, [])).toBe(existing);
	});
});
