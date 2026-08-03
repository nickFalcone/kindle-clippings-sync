/*
 * mtp-pull — fetch one file by name from the first MTP device, in a single
 * MTP session.
 *
 * Kindles (firmware 5.16.2+) expose storage over MTP only, and tolerate a
 * limited number of MTP sessions per USB connection — libmtp's stock CLI
 * tools need one session to list files (mtp-files) and another to fetch
 * (mtp-getfile), which intermittently fails on device. Doing the
 * lookup + fetch in one session avoids that, and unlike mtp-getfile this
 * exits non-zero on failure.
 *
 * Kindles also wedge: after a session closes they often refuse new ones
 * until the cable is replugged. A USB device reset (libusb) is the software
 * equivalent of a replug, so when no MTP device is found we reset any
 * Amazon (VID 0x1949) device and try again.
 *
 * When a third argument is given, also writes a JSON array of {label, asin}
 * pairs scraped from .sdr sidecar folder names in the same listing pass —
 * no second MTP session.
 *
 * Build: cc -o mtp-pull mtp-pull.c -I/opt/homebrew/include -I/opt/homebrew/include/libusb-1.0 -L/opt/homebrew/lib -lmtp -lusb-1.0
 * Usage: mtp-pull "My Clippings.txt" /path/to/dest [/path/to/device-asins.raw.json]
 */
#include <libmtp.h>
#include <libusb.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

#define AMAZON_VID 0x1949
#define MAX_ASIN_ENTRIES 4096

typedef struct {
	char label[512];
	char asin[11];
} AsinEntry;

static AsinEntry asin_entries[MAX_ASIN_ENTRIES];
static int asin_count = 0;

static int is_asin_char(char c) {
	return (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
}

/* Basename of a path-like MTP filename. */
static const char *base_name(const char *path) {
	const char *base = path;
	for (const char *p = path; *p; p++) {
		if (*p == '/' || *p == '\\') base = p + 1;
	}
	return base;
}

/*
 * Purchased books on modern Kindles often appear in the MTP listing as
 * Title_B0XXXXXXXXXX.kfx (or .azw3). Older layouts use Title_ASIN.sdr.
 * Sideloaded books omit the ASIN suffix — skip those.
 */
static int extract_asin_from_filename(const char *filename, char *label_out, size_t label_size, char *asin_out) {
	const char *base = base_name(filename);
	/* Ignore sidecar innards — only the book/sidecar container name carries ASIN. */
	if (strstr(base, ".azw3f") || strstr(base, ".azw3r") || strstr(base, ".apnx")) {
		return 0;
	}
	const char *best = NULL;
	for (const char *p = base; *p; p++) {
		if (*p != '_') continue;
		const char *asin = p + 1;
		if (strlen(asin) < 10) continue;
		int ok = 1;
		for (int i = 0; i < 10; i++) {
			if (!is_asin_char(asin[i])) {
				ok = 0;
				break;
			}
		}
		if (!ok) continue;
		char after = asin[10];
		if (after != '\0' && after != '.') continue;
		best = p;
	}
	if (!best) return 0;
	const char *asin_start = best + 1;
	memcpy(asin_out, asin_start, 10);
	asin_out[10] = '\0';
	size_t label_len = (size_t)(best - base);
	if (label_len == 0 || label_len >= label_size) return 0;
	memcpy(label_out, base, label_len);
	label_out[label_len] = '\0';
	return 1;
}

static void remember_asin(const char *label, const char *asin) {
	for (int i = 0; i < asin_count; i++) {
		if (strcmp(asin_entries[i].asin, asin) == 0) {
			if (strlen(label) > strlen(asin_entries[i].label)) {
				strncpy(asin_entries[i].label, label, sizeof(asin_entries[i].label) - 1);
				asin_entries[i].label[sizeof(asin_entries[i].label) - 1] = '\0';
			}
			return;
		}
	}
	if (asin_count >= MAX_ASIN_ENTRIES) return;
	strncpy(asin_entries[asin_count].label, label, sizeof(asin_entries[asin_count].label) - 1);
	asin_entries[asin_count].label[sizeof(asin_entries[asin_count].label) - 1] = '\0';
	strncpy(asin_entries[asin_count].asin, asin, sizeof(asin_entries[asin_count].asin) - 1);
	asin_count++;
}

static void json_escape_string(FILE *out, const char *s) {
	fputc('"', out);
	for (; *s; s++) {
		if (*s == '\\' || *s == '"') {
			fputc('\\', out);
			fputc(*s, out);
		} else if (*s == '\n') {
			fputs("\\n", out);
		} else if (*s == '\r') {
			fputs("\\r", out);
		} else if (*s == '\t') {
			fputs("\\t", out);
		} else {
			fputc(*s, out);
		}
	}
	fputc('"', out);
}

static int write_asins_json(const char *path) {
	FILE *out = fopen(path, "w");
	if (!out) {
		fprintf(stderr, "could not write device asins to '%s'\n", path);
		return 0;
	}
	fputc('[', out);
	for (int i = 0; i < asin_count; i++) {
		if (i > 0) fputc(',', out);
		fputs("\n  {\"label\":", out);
		json_escape_string(out, asin_entries[i].label);
		fputs(", \"asin\":", out);
		json_escape_string(out, asin_entries[i].asin);
		fputc('}', out);
	}
	if (asin_count > 0) fputc('\n', out);
	fputs("]\n", out);
	fclose(out);
	return 1;
}

static void collect_asins(LIBMTP_file_t *files) {
	for (LIBMTP_file_t *f = files; f; f = f->next) {
		if (!f->filename) continue;
		char label[512];
		char asin[11];
		if (extract_asin_from_filename(f->filename, label, sizeof(label), asin)) {
			remember_asin(label, asin);
		}
	}
}

/* Reset every Amazon USB device; returns how many were reset. */
static int reset_kindle_usb(void) {
	libusb_context *ctx = NULL;
	if (libusb_init(&ctx) != 0) return 0;
	libusb_device **list = NULL;
	ssize_t n = libusb_get_device_list(ctx, &list);
	int resets = 0;
	for (ssize_t i = 0; i < n; i++) {
		struct libusb_device_descriptor desc;
		if (libusb_get_device_descriptor(list[i], &desc) != 0) continue;
		if (desc.idVendor != AMAZON_VID) continue;
		libusb_device_handle *handle = NULL;
		if (libusb_open(list[i], &handle) == 0) {
			if (libusb_reset_device(handle) == 0) resets++;
			libusb_close(handle);
		}
	}
	if (list) libusb_free_device_list(list, 1);
	libusb_exit(ctx);
	return resets;
}

static LIBMTP_mtpdevice_t *open_device_with_reset(void) {
	LIBMTP_mtpdevice_t *device = LIBMTP_Get_First_Device();
	if (device) return device;
	fprintf(stderr, "no MTP session available — resetting the Kindle's USB connection...\n");
	if (reset_kindle_usb() == 0) {
		fprintf(stderr, "no Amazon USB device to reset\n");
		return NULL;
	}
	for (int attempt = 0; attempt < 5; attempt++) {
		sleep(3);
		device = LIBMTP_Get_First_Device();
		if (device) return device;
	}
	return NULL;
}

int main(int argc, char **argv) {
	if (argc != 3 && argc != 4) {
		fprintf(stderr, "usage: %s <filename-on-device> <dest-path> [device-asins-out]\n", argv[0]);
		return 2;
	}
	const char *wanted = argv[1];
	const char *dest = argv[2];
	const char *asins_out = argc == 4 ? argv[3] : NULL;

	LIBMTP_Init();
	LIBMTP_mtpdevice_t *device = open_device_with_reset();
	if (!device) {
		fprintf(stderr,
			"no MTP device found — is the Kindle plugged in, awake, and its "
			"connect prompt accepted?\n");
		return 1;
	}

	int rc = 1;
	LIBMTP_file_t *files = LIBMTP_Get_Filelisting_With_Callback(device, NULL, NULL);
	if (!files) {
		fprintf(stderr, "could not list files on device\n");
		LIBMTP_Dump_Errorstack(device);
	}
	if (files && asins_out) {
		collect_asins(files);
		if (!write_asins_json(asins_out)) {
			LIBMTP_file_t *f = files;
			while (f) {
				LIBMTP_file_t *next = f->next;
				LIBMTP_destroy_file_t(f);
				f = next;
			}
			LIBMTP_Release_Device(device);
			return 1;
		}
	}
	int found = 0;
	for (LIBMTP_file_t *f = files; f; f = f->next) {
		if (f->filename && strcmp(f->filename, wanted) == 0) {
			found = 1;
			if (LIBMTP_Get_File_To_File(device, f->item_id, dest, NULL, NULL) == 0) {
				rc = 0;
			} else {
				fprintf(stderr, "fetch of '%s' (id %u) failed\n", wanted, f->item_id);
				LIBMTP_Dump_Errorstack(device);
			}
			break;
		}
	}
	if (files && !found) {
		fprintf(stderr, "'%s' not found on device\n", wanted);
	}

	LIBMTP_file_t *f = files;
	while (f) {
		LIBMTP_file_t *next = f->next;
		LIBMTP_destroy_file_t(f);
		f = next;
	}
	LIBMTP_Release_Device(device);
	return rc;
}
