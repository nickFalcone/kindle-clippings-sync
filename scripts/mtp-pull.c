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
 * Build: cc -o mtp-pull mtp-pull.c -I/opt/homebrew/include -I/opt/homebrew/include/libusb-1.0 -L/opt/homebrew/lib -lmtp -lusb-1.0
 * Usage: mtp-pull "My Clippings.txt" /path/to/dest
 */
#include <libmtp.h>
#include <libusb.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

#define AMAZON_VID 0x1949

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
	/* Give the device time to re-enumerate after the reset. */
	for (int attempt = 0; attempt < 5; attempt++) {
		sleep(3);
		device = LIBMTP_Get_First_Device();
		if (device) return device;
	}
	return NULL;
}

int main(int argc, char **argv) {
	if (argc != 3) {
		fprintf(stderr, "usage: %s <filename-on-device> <dest-path>\n", argv[0]);
		return 2;
	}
	const char *wanted = argv[1];
	const char *dest = argv[2];

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
