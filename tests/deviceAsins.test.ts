import { describe, expect, it } from 'vitest';
import {
	matchBookKeysToAsins,
	normalizeMatchKey,
	parseDeviceAsinsJson,
} from '../src/deviceAsins';

describe('normalizeMatchKey', () => {
	it('lowercases, turns underscores into spaces, and strips punctuation', () => {
		expect(normalizeMatchKey('Are_You Mad at Me?')).toBe('are you mad at me');
	});
});

describe('parseDeviceAsinsJson', () => {
	it('parses an array of label and asin pairs', () => {
		const raw = JSON.stringify([
			{ label: 'Are You Mad at Me', asin: 'B0DQLMS9VG' },
		]);
		expect(parseDeviceAsinsJson(raw)).toEqual([
			{ label: 'Are You Mad at Me', asin: 'B0DQLMS9VG' },
		]);
	});

	it('skips invalid entries without throwing', () => {
		const raw = JSON.stringify([
			{ label: 'Good', asin: 'B0DQLMS9VG' },
			{ label: '', asin: 'B0DQLMS9VG' },
			{ label: 'Bad', asin: 'nope' },
			'not-an-object',
		]);
		expect(parseDeviceAsinsJson(raw)).toEqual([
			{ label: 'Good', asin: 'B0DQLMS9VG' },
		]);
	});

	it('returns an empty array for malformed JSON', () => {
		expect(parseDeviceAsinsJson('[')).toEqual([]);
	});
});

describe('matchBookKeysToAsins', () => {
	const device = [{ label: 'Are You Mad at Me', asin: 'B0DQLMS9VG' }];

	it('maps a clippings bookKey when the device label matches the title prefix', () => {
		const bookKey =
			'Are You Mad at Me?: How to Stop Focusing on What Others Think and Start Living for You (Josephson, Meg)';
		expect(matchBookKeysToAsins([bookKey], device)).toEqual({
			[bookKey]: 'B0DQLMS9VG',
		});
	});

	it('maps when the device label uses underscores for spaces', () => {
		const bookKey = 'Fahrenheit 451 (Ray Bradbury)';
		const entries = [{ label: 'Fahrenheit_451', asin: 'B003GXEW00' }];
		expect(matchBookKeysToAsins([bookKey], entries)).toEqual({
			[bookKey]: 'B003GXEW00',
		});
	});

	it('omits sideloaded books with no matching device entry', () => {
		expect(
			matchBookKeysToAsins(['I Am a Strange Loop  '], device),
		).toEqual({});
	});

	it('prefers the longest matching device label when several could fit', () => {
		const bookKey = 'The Overstory (Richard Powers)';
		const entries = [
			{ label: 'The', asin: 'B000WRONG0' },
			{ label: 'The Overstory', asin: 'B072BYRLDD' },
		];
		expect(matchBookKeysToAsins([bookKey], entries)).toEqual({
			[bookKey]: 'B072BYRLDD',
		});
	});
});
