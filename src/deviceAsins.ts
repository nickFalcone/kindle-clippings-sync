import { splitTitleAuthor } from './parser';
import { isValidAsin } from './coverUrl';

export interface DeviceAsinEntry {
	label: string;
	asin: string;
}

/** Normalize a device-side title or clippings title for loose prefix matching. */
export function normalizeMatchKey(value: string): string {
	return value
		.toLowerCase()
		.replace(/_/g, ' ')
		.replace(/[^\p{L}\p{N}\s]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Parse the raw JSON array written by mtp-pull from the device file listing. */
export function parseDeviceAsinsJson(raw: string): DeviceAsinEntry[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const result: DeviceAsinEntry[] = [];
	for (const item of parsed) {
		if (item === null || typeof item !== 'object') continue;
		const label = (item as { label?: unknown }).label;
		const asin = (item as { asin?: unknown }).asin;
		if (typeof label !== 'string' || typeof asin !== 'string') continue;
		if (!label.trim() || !isValidAsin(asin)) continue;
		result.push({ label: label.trim(), asin });
	}
	return result;
}

function titleMatchesLabel(bookTitle: string, deviceLabel: string): boolean {
	const title = normalizeMatchKey(bookTitle);
	const label = normalizeMatchKey(deviceLabel);
	if (!title || !label) return false;
	if (title === label) return true;
	// Device folders often truncate the title before _ASIN.sdr — require a
	// substantive prefix so "The" does not match everything.
	const minPrefix = 8;
	if (label.length >= minPrefix && title.startsWith(label)) return true;
	if (title.length >= minPrefix && label.startsWith(title)) return true;
	return false;
}

/**
 * Map exact clippings book keys to ASINs using device-side .sdr folder labels.
 * Unmatched keys are omitted — sideloaded books degrade silently.
 */
export function matchBookKeysToAsins(
	bookKeys: string[],
	entries: DeviceAsinEntry[],
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const bookKey of bookKeys) {
		const { title } = splitTitleAuthor(bookKey);
		let best: DeviceAsinEntry | null = null;
		for (const entry of entries) {
			if (!titleMatchesLabel(title, entry.label)) continue;
			if (
				!best ||
				normalizeMatchKey(entry.label).length >
					normalizeMatchKey(best.label).length
			) {
				best = entry;
			}
		}
		if (best) result[bookKey] = best.asin;
	}
	return result;
}
