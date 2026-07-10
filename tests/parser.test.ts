import { describe, expect, it } from 'vitest';
import {
	groupByBook,
	hashClipping,
	parseAuthors,
	parseClippings,
	parseKindleDate,
	splitTitleAuthor,
} from '../src/parser';

const SEP = '==========';

function entry(...lines: string[]): string {
	return lines.join('\n') + '\n' + SEP + '\n';
}

const HIGHLIGHT_WITH_PAGE = entry(
	'The Selfish Gene: 30th Anniversary Edition (Richard Dawkins)',
	'- Your Highlight on page 92 | location 1406-1407 | Added on Saturday, 26 March 2016 14:59:39',
	'',
	"Perhaps consciousness arises when the brain's simulation of the world becomes so complete that it must include a model of itself.",
);

const BOOKMARK = entry(
	'Fahrenheit 451 (Ray Bradbury)',
	'- Your Bookmark at location 346 | Added on Saturday, 26 March 2016 15:46:21',
	'',
);

const NOTE = entry(
	'Fahrenheit 451 (Ray Bradbury)',
	'- Your Note on page 45 | location 812 | Added on Saturday, 26 March 2016 16:02:11',
	'',
	'remember this for the essay',
);

describe('parseClippings — entry types', () => {
	it('parses a highlight with page, location range, and date', () => {
		const [c] = parseClippings(HIGHLIGHT_WITH_PAGE);
		expect(c).toBeDefined();
		expect(c!.type).toBe('highlight');
		expect(c!.bookKey).toBe(
			'The Selfish Gene: 30th Anniversary Edition (Richard Dawkins)',
		);
		expect(c!.title).toBe('The Selfish Gene: 30th Anniversary Edition');
		expect(c!.authors).toEqual(['Richard Dawkins']);
		expect(c!.page).toBe('92');
		expect(c!.location).toBe('1406-1407');
		expect(c!.addedAt).toBe('2016-03-26T14:59:39');
		expect(c!.addedAtRaw).toBe('Saturday, 26 March 2016 14:59:39');
		expect(c!.text).toContain('Perhaps consciousness arises');
		expect(c!.truncated).toBe(false);
	});

	it('parses a bookmark with no body text', () => {
		const [c] = parseClippings(BOOKMARK);
		expect(c!.type).toBe('bookmark');
		expect(c!.text).toBe('');
		expect(c!.page).toBeNull();
		expect(c!.location).toBe('346');
	});

	it('parses a note', () => {
		const [c] = parseClippings(NOTE);
		expect(c!.type).toBe('note');
		expect(c!.text).toBe('remember this for the essay');
		expect(c!.page).toBe('45');
		expect(c!.location).toBe('812');
	});
});

describe('parseClippings — metadata variants', () => {
	it('handles a highlight with no page segment', () => {
		const [c] = parseClippings(
			entry(
				'Some Ebook (Jane Doe)',
				'- Your Highlight at location 1406-1407 | Added on Saturday, 26 March 2016 14:59:39',
				'',
				'text here',
			),
		);
		expect(c!.page).toBeNull();
		expect(c!.location).toBe('1406-1407');
	});

	it('handles a single-number (non-range) location', () => {
		const [c] = parseClippings(
			entry(
				'Some Ebook (Jane Doe)',
				'- Your Highlight at location 512 | Added on Saturday, 26 March 2016 14:59:39',
				'',
				'text here',
			),
		);
		expect(c!.location).toBe('512');
	});

	it('stores the raw string when the date format is unrecognized', () => {
		const [c] = parseClippings(
			entry(
				'Some Ebook (Jane Doe)',
				'- Your Highlight at location 512 | Added on 2035年1月1日 12:00:00',
				'',
				'text here',
			),
		);
		expect(c!.addedAt).toBeNull();
		expect(c!.addedAtRaw).toBe('2035年1月1日 12:00:00');
	});

	it('parses the US AM/PM date format', () => {
		expect(parseKindleDate('Wednesday, December 30, 2015 7:31:41 PM')).toBe(
			'2015-12-30T19:31:41',
		);
		expect(parseKindleDate('Wednesday, December 30, 2015 12:05:00 AM')).toBe(
			'2015-12-30T00:05:00',
		);
	});
});

describe('parseClippings — text edge cases', () => {
	it('preserves multi-line (paragraph) highlight text', () => {
		const [c] = parseClippings(
			entry(
				'Some Ebook (Jane Doe)',
				'- Your Highlight at location 100-110 | Added on Saturday, 26 March 2016 14:59:39',
				'',
				'First paragraph of the highlight.',
				'',
				'Second paragraph of the same highlight.',
			),
		);
		expect(c!.text).toBe(
			'First paragraph of the highlight.\n\nSecond paragraph of the same highlight.',
		);
	});

	it('flags clipping-limit stubs as truncated instead of dropping them', () => {
		const [c] = parseClippings(
			entry(
				'DRM Book (Someone)',
				'- Your Highlight on page 10 | location 150-151 | Added on Saturday, 26 March 2016 14:59:39',
				'',
				'<You have reached the clipping limit for this item>',
			),
		);
		expect(c).toBeDefined();
		expect(c!.truncated).toBe(true);
		expect(c!.text).toBe('');
	});

	it('strips a leading UTF-8 BOM', () => {
		const clippings = parseClippings('\uFEFF' + HIGHLIGHT_WITH_PAGE);
		expect(clippings).toHaveLength(1);
		expect(clippings[0]!.bookKey).toBe(
			'The Selfish Gene: 30th Anniversary Edition (Richard Dawkins)',
		);
	});

	it('handles CRLF line endings', () => {
		const clippings = parseClippings(
			HIGHLIGHT_WITH_PAGE.replace(/\n/g, '\r\n'),
		);
		expect(clippings).toHaveLength(1);
		expect(clippings[0]!.location).toBe('1406-1407');
	});

	it('skips malformed entries without throwing', () => {
		const clippings = parseClippings(
			'garbage without a metadata line\n' + SEP + '\n' + HIGHLIGHT_WITH_PAGE,
		);
		expect(clippings).toHaveLength(1);
	});
});

describe('parseClippings — dedupe', () => {
	it('collapses duplicate entries, keeping the most recent timestamp', () => {
		const older = entry(
			'Fahrenheit 451 (Ray Bradbury)',
			'- Your Highlight on page 45 | location 812-813 | Added on Saturday, 26 March 2016 16:02:11',
			'',
			'It was a pleasure to burn.',
		);
		const newer = entry(
			'Fahrenheit 451 (Ray Bradbury)',
			'- Your Highlight on page 45 | location 812-813 | Added on Sunday, 27 March 2016 09:00:00',
			'',
			'It was a pleasure to burn.',
		);
		const clippings = parseClippings(older + newer);
		expect(clippings).toHaveLength(1);
		expect(clippings[0]!.addedAt).toBe('2016-03-27T09:00:00');
	});

	it('keeps an edited on-device note as a separate entry (documented v1 behavior)', () => {
		// Editing a note on the Kindle appends a new entry with different
		// text at the same location — different hash, so both survive.
		const original = entry(
			'Fahrenheit 451 (Ray Bradbury)',
			'- Your Note on page 45 | location 812 | Added on Saturday, 26 March 2016 16:02:11',
			'',
			'remember this',
		);
		const edited = entry(
			'Fahrenheit 451 (Ray Bradbury)',
			'- Your Note on page 45 | location 812 | Added on Sunday, 27 March 2016 09:00:00',
			'',
			'remember this for the essay',
		);
		expect(parseClippings(original + edited)).toHaveLength(2);
	});

	it('produces stable hashes', () => {
		expect(hashClipping('Book (A)', '1-2', 'highlight', 'text')).toBe(
			hashClipping('Book (A)', '1-2', 'highlight', 'text'),
		);
		expect(hashClipping('Book (A)', '1-2', 'highlight', 'text')).not.toBe(
			hashClipping('Book (A)', '1-3', 'highlight', 'text'),
		);
	});
});

describe('title/author parsing', () => {
	it('uses the last parenthetical as author when the title has parens', () => {
		expect(
			splitTitleAuthor('Thinking (Fast and Slow) Redux (Daniel Kahneman)'),
		).toEqual({
			title: 'Thinking (Fast and Slow) Redux',
			authorRaw: 'Daniel Kahneman',
		});
	});

	it('handles a title with no author parenthetical', () => {
		expect(splitTitleAuthor('Some Untitled Manuscript')).toEqual({
			title: 'Some Untitled Manuscript',
			authorRaw: null,
		});
	});

	it('normalizes "Last, First"', () => {
		expect(parseAuthors('Dawkins, Richard')).toEqual(['Richard Dawkins']);
	});

	it('splits multiple authors on ";", "&", and "and"', () => {
		expect(parseAuthors('Tversky, Amos; Kahneman, Daniel')).toEqual([
			'Amos Tversky',
			'Daniel Kahneman',
		]);
		expect(parseAuthors('Larry Gonick & Mark Wheelis')).toEqual([
			'Larry Gonick',
			'Mark Wheelis',
		]);
		expect(parseAuthors('Larry Gonick and Mark Wheelis')).toEqual([
			'Larry Gonick',
			'Mark Wheelis',
		]);
	});
});

describe('groupByBook', () => {
	it('groups by exact bookKey across mixed entry types', () => {
		const books = groupByBook(
			parseClippings(HIGHLIGHT_WITH_PAGE + BOOKMARK + NOTE),
		);
		expect(books).toHaveLength(2);
		const fahrenheit = books.find(
			(b) => b.key === 'Fahrenheit 451 (Ray Bradbury)',
		);
		expect(fahrenheit!.clippings).toHaveLength(2);
		expect(fahrenheit!.title).toBe('Fahrenheit 451');
		expect(fahrenheit!.authors).toEqual(['Ray Bradbury']);
	});
});
