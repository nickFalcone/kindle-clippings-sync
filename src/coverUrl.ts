/** Ten-character Amazon Standard Identification Number (ASIN). */
const ASIN = /^[A-Z0-9]{10}$/;

/** Amazon product-image CDN base used for cover art from an ASIN alone. */
const COVER_URL =
	'https://m.media-amazon.com/images/P/{asin}.01._SL500_.jpg';

export function isValidAsin(value: string): boolean {
	return ASIN.test(value);
}

/** Build an absolute cover URL, or null when the ASIN is not usable. */
export function coverUrlFromAsin(asin: string): string | null {
	if (!isValidAsin(asin)) return null;
	return COVER_URL.replace('{asin}', asin);
}

/**
 * Parse a flat JSON object mapping exact clippings book keys to ASINs.
 * Malformed JSON and invalid ASIN values are skipped — the parser never throws.
 */
export function parseBookAsinsJson(raw: string): Record<string, string> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return {};
	}
	const result: Record<string, string> = {};
	for (const [bookKey, asin] of Object.entries(parsed)) {
		if (typeof asin !== 'string' || !isValidAsin(asin)) continue;
		result[bookKey] = asin;
	}
	return result;
}
