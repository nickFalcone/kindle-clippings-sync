import { describe, expect, it } from 'vitest';
import { SyncStateStore } from '../src/syncState';

describe('SyncStateStore', () => {
	it('tracks hashes per book', () => {
		const store = new SyncStateStore();
		expect(store.has('Book A', 'h1')).toBe(false);
		store.add('Book A', 'h1');
		expect(store.has('Book A', 'h1')).toBe(true);
		expect(store.has('Book B', 'h1')).toBe(false);
	});

	it('round-trips through JSON persistence', () => {
		const store = new SyncStateStore();
		store.add('Book A', 'h1');
		store.add('Book A', 'h2');
		store.add('Book B', 'h3');
		const revived = SyncStateStore.fromData(
			JSON.parse(JSON.stringify(store.toJSON())),
		);
		expect(revived.has('Book A', 'h1')).toBe(true);
		expect(revived.has('Book A', 'h2')).toBe(true);
		expect(revived.has('Book B', 'h3')).toBe(true);
		expect(revived.has('Book B', 'h1')).toBe(false);
	});

	it('tolerates missing or malformed persisted data', () => {
		expect(SyncStateStore.fromData(undefined).has('x', 'y')).toBe(false);
		expect(SyncStateStore.fromData(null).has('x', 'y')).toBe(false);
		expect(SyncStateStore.fromData({ garbage: true }).has('x', 'y')).toBe(false);
		expect(
			SyncStateStore.fromData({ syncedHashes: { a: 'not-an-array' } }).has(
				'a',
				'n',
			),
		).toBe(false);
	});

	it('deduplicates repeated adds', () => {
		const store = new SyncStateStore();
		store.add('Book A', 'h1');
		store.add('Book A', 'h1');
		expect(store.toJSON().syncedHashes['Book A']).toEqual(['h1']);
	});
});
