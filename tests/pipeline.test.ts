import { describe, expect, it } from 'vitest';
import { groupByBook, parseClippings } from '../src/parser';
import {
	appendToNote,
	buildNewNote,
	sanitizeFilename,
} from '../src/bookNoteWriter';
import { SyncStateStore } from '../src/syncState';
import { Clipping } from '../src/types';

/**
 * Drives the same pipeline main.ts runs, against an in-memory "vault"
 * (filename -> content map), so the acceptance criteria around idempotency
 * and manual-edit preservation are covered without Obsidian.
 */
function sync(
	raw: string,
	vault: Map<string, string>,
	state: SyncStateStore,
	include: (c: Clipping) => boolean = (c) => c.type !== 'bookmark',
): void {
	for (const book of groupByBook(parseClippings(raw))) {
		const fresh = book.clippings.filter(
			(c) => include(c) && !state.has(book.key, c.hash),
		);
		if (fresh.length === 0) continue;
		const file = sanitizeFilename(book.key) + '.md';
		const existing = vault.get(file);
		vault.set(
			file,
			existing === undefined
				? buildNewNote(book, fresh)
				: appendToNote(existing, fresh),
		);
		for (const c of fresh) state.add(book.key, c.hash);
	}
}

const FIXTURE = `The Selfish Gene: 30th Anniversary Edition (Richard Dawkins)
- Your Highlight on page 92 | location 1406-1407 | Added on Saturday, 26 March 2016 14:59:39

Perhaps consciousness arises when the brain's simulation of the world becomes so complete that it must include a model of itself.
==========
Fahrenheit 451 (Ray Bradbury)
- Your Bookmark at location 346 | Added on Saturday, 26 March 2016 15:46:21
==========
Fahrenheit 451 (Ray Bradbury)
- Your Note on page 45 | location 812 | Added on Saturday, 26 March 2016 16:02:11

remember this for the essay
==========
Fahrenheit 451 (Ray Bradbury)
- Your Highlight on page 45 | location 810-812 | Added on Saturday, 26 March 2016 16:01:50

It was a pleasure to burn.
==========
Thinking, Fast and Slow (Kahneman, Daniel)
- Your Highlight at location 100-105 | Added on Wednesday, December 30, 2015 7:31:41 PM

Nothing in life is as important as you think it is, while you are thinking about it.
==========
Locked Down Book (Some Publisher)
- Your Highlight on page 10 | location 150-151 | Added on Saturday, 26 March 2016 17:00:00

<You have reached the clipping limit for this item>
==========
`;

describe('sync pipeline', () => {
	it('produces one correct file per book from a mixed fixture', () => {
		const vault = new Map<string, string>();
		sync(FIXTURE, vault, new SyncStateStore());

		expect([...vault.keys()].sort()).toEqual([
			'Fahrenheit 451 (Ray Bradbury).md',
			'Locked Down Book (Some Publisher).md',
			'The Selfish Gene 30th Anniversary Edition (Richard Dawkins).md',
			'Thinking, Fast and Slow (Kahneman, Daniel).md',
		]);

		const fahrenheit = vault.get('Fahrenheit 451 (Ray Bradbury).md')!;
		expect(fahrenheit).toContain('title: "Fahrenheit 451"');
		expect(fahrenheit).toContain('- It was a pleasure to burn. (Page 45, Location 810-812)');
		expect(fahrenheit).toContain('- remember this for the essay (Page 45, Location 812)');
		expect(fahrenheit).not.toContain('Bookmark'); // excluded by default

		const kahneman = vault.get('Thinking, Fast and Slow (Kahneman, Daniel).md')!;
		expect(kahneman).toContain('- "Daniel Kahneman"');

		const locked = vault.get('Locked Down Book (Some Publisher).md')!;
		expect(locked).toContain('Clipping limit reached');
	});

	it('second run with no new content changes nothing', () => {
		const vault = new Map<string, string>();
		const state = new SyncStateStore();
		sync(FIXTURE, vault, state);
		const snapshot = new Map(vault);
		sync(FIXTURE, vault, state);
		expect(vault).toEqual(snapshot);
	});

	it('idempotency survives state persistence round-trip', () => {
		const vault = new Map<string, string>();
		const state = new SyncStateStore();
		sync(FIXTURE, vault, state);
		const revived = SyncStateStore.fromData(
			JSON.parse(JSON.stringify(state.toJSON())),
		);
		const snapshot = new Map(vault);
		sync(FIXTURE, vault, revived);
		expect(vault).toEqual(snapshot);
	});

	it('preserves manual edits and appends only the delta', () => {
		const vault = new Map<string, string>();
		const state = new SyncStateStore();
		sync(FIXTURE, vault, state);

		// User adds commentary and deletes a bullet they don't want.
		const file = 'Fahrenheit 451 (Ray Bradbury).md';
		let edited = vault.get(file)!;
		edited = edited.replace(
			'## Notes',
			'My own commentary that must survive.\n\n## Notes',
		);
		edited = edited.replace(
			'- remember this for the essay (Page 45, Location 812)\n',
			'',
		);
		vault.set(file, edited);

		// New highlight appears on the Kindle side.
		const withNew =
			FIXTURE +
			`Fahrenheit 451 (Ray Bradbury)
- Your Highlight on page 60 | location 900-901 | Added on Sunday, 27 March 2016 10:00:00

Fresh new highlight.
==========
`;
		sync(withNew, vault, state);

		const result = vault.get(file)!;
		expect(result).toContain('My own commentary that must survive.');
		// Deleted bullet stays deleted — the plugin never reconciles.
		expect(result).not.toContain('- remember this for the essay');
		expect(result).toContain('- Fresh new highlight. (Page 60, Location 900-901)');
		// Only one copy of everything.
		expect(result.match(/It was a pleasure to burn/g)).toHaveLength(1);
		expect(result.match(/Fresh new highlight/g)).toHaveLength(1);
	});
});
