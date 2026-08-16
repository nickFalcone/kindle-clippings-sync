import { homedir } from 'os';

/**
 * Expand `~` and `%VAR%` in a user-supplied OS path so the same setting can
 * be written as `%USERPROFILE%\Kindle\My Clippings.txt` on Windows or
 * `~/Kindle/My Clippings.txt` on Unix. Unknown `%VAR%` tokens are left intact.
 */
export function expandUserPath(p: string): string {
	let out = p.trim();
	if (out === '~') return homedir();
	if (out.startsWith('~/') || out.startsWith('~\\')) {
		out = homedir() + out.slice(1);
	}
	return out.replace(/%([^%]+)%/g, (whole, name: string) => {
		const value = process.env[name];
		return value !== undefined ? value : whole;
	});
}
