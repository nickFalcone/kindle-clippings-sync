import { describe, expect, it } from 'vitest';
import {
	coverUrlFromAsin,
	isValidAsin,
	lookupCoverUrl,
	parseBookAsinsJson,
} from '../src/coverUrl';

describe('isValidAsin', () => {
	it('accepts a standard Kindle ebook ASIN', () => {
		expect(isValidAsin('B0DQLMS9VG')).toBe(true);
	});

	it('rejects strings that are not exactly ten alphanumeric characters', () => {
		expect(isValidAsin('B0DQLMS9V')).toBe(false);
		expect(isValidAsin('B0DQLMS9VGX')).toBe(false);
		expect(isValidAsin('')).toBe(false);
		expect(isValidAsin('not-an-asin')).toBe(false);
	});
});

describe('coverUrlFromAsin', () => {
	it('builds an absolute m.media-amazon.com URL for a valid ASIN', () => {
		expect(coverUrlFromAsin('B0DQLMS9VG')).toBe(
			'https://m.media-amazon.com/images/P/B0DQLMS9VG.01._SL500_.jpg',
		);
	});

	it('returns null when the ASIN is invalid', () => {
		expect(coverUrlFromAsin('bad')).toBeNull();
	});
});

describe('parseBookAsinsJson', () => {
	it('parses a flat bookKey-to-asin map', () => {
		const raw = JSON.stringify({
			'Fahrenheit 451 (Ray Bradbury)': 'B003GXEW00',
		});
		expect(parseBookAsinsJson(raw)).toEqual({
			'Fahrenheit 451 (Ray Bradbury)': 'B003GXEW00',
		});
	});

	it('skips entries with invalid ASINs rather than throwing', () => {
		const raw = JSON.stringify({
			'Good Book (Author)': 'B0DQLMS9VG',
			'Bad Book (Author)': 'nope',
		});
		expect(parseBookAsinsJson(raw)).toEqual({
			'Good Book (Author)': 'B0DQLMS9VG',
		});
	});

	it('returns an empty map for malformed JSON', () => {
		expect(parseBookAsinsJson('{')).toEqual({});
	});
});

describe('lookupCoverUrl', () => {
	it('returns a cover URL when the exact bookKey is mapped', () => {
		const asins = { 'Fahrenheit 451 (Ray Bradbury)': 'B003GXEW00' };
		expect(lookupCoverUrl('Fahrenheit 451 (Ray Bradbury)', asins)).toBe(
			'https://m.media-amazon.com/images/P/B003GXEW00.01._SL500_.jpg',
		);
	});

	it('returns null when the bookKey is absent', () => {
		expect(lookupCoverUrl('Unknown (Author)', {})).toBeNull();
	});
});
