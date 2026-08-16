import { afterEach, describe, expect, it } from 'vitest';
import { expandUserPath } from '../src/expandPath';
import { homedir } from 'os';

describe('expandUserPath', () => {
	const previous = process.env.USERPROFILE;

	afterEach(() => {
		if (previous === undefined) delete process.env.USERPROFILE;
		else process.env.USERPROFILE = previous;
	});

	it('leaves ordinary paths unchanged', () => {
		expect(expandUserPath('/tmp/My Clippings.txt')).toBe(
			'/tmp/My Clippings.txt',
		);
		expect(expandUserPath('C:\\Users\\nicho\\Kindle\\My Clippings.txt')).toBe(
			'C:\\Users\\nicho\\Kindle\\My Clippings.txt',
		);
	});

	it('expands ~ to the home directory', () => {
		expect(expandUserPath('~/Kindle/My Clippings.txt')).toBe(
			`${homedir()}/Kindle/My Clippings.txt`,
		);
	});

	it('expands %USERPROFILE% for Windows settings', () => {
		process.env.USERPROFILE = 'C:\\Users\\nicho';
		expect(expandUserPath('%USERPROFILE%\\Kindle\\My Clippings.txt')).toBe(
			'C:\\Users\\nicho\\Kindle\\My Clippings.txt',
		);
	});
});
