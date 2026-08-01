/**
 * Minimal in-memory stand-in for the `obsidian` module, aliased in place of the
 * real one by vitest.config.ts so tests can drive `src/main.ts` directly.
 *
 * Only the surface `main.ts` and `settings.ts` actually touch is implemented.
 * Vault state is a filename -> content map; folders are a separate set so the
 * "a folder exists at that path" branch is reachable.
 */

export class TAbstractFile {
	constructor(public path: string) {}
}

export class TFile extends TAbstractFile {}

export class TFolder extends TAbstractFile {}

/** Mirrors Obsidian's behavior: backslashes to slashes, collapse and trim them. */
export function normalizePath(path: string): string {
	return path
		.replace(/\\/g, '/')
		.replace(/\/{2,}/g, '/')
		.replace(/^\/+|\/+$/g, '')
		.trim();
}

/** Every Notice raised during a test, newest last. Cleared by resetObsidianMock(). */
export const notices: string[] = [];

export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

export class Vault {
	readonly files = new Map<string, string>();
	readonly folders = new Set<string>();
	/** Records each mutating call so tests can assert the write path taken. */
	readonly calls: string[] = [];

	getAbstractFileByPath(path: string): TAbstractFile | null {
		if (this.files.has(path)) return new TFile(path);
		if (this.folders.has(path)) return new TFolder(path);
		return null;
	}

	async process(file: TFile, fn: (data: string) => string): Promise<string> {
		const next = fn(this.files.get(file.path) ?? '');
		this.files.set(file.path, next);
		this.calls.push(`process:${file.path}`);
		return next;
	}

	async create(path: string, data: string): Promise<TFile> {
		this.files.set(path, data);
		this.calls.push(`create:${path}`);
		return new TFile(path);
	}

	async createFolder(path: string): Promise<TFolder> {
		this.folders.add(path);
		this.calls.push(`createFolder:${path}`);
		return new TFolder(path);
	}
}

export class App {
	readonly vault = new Vault();
	readonly workspace = {};
}

export class Plugin {
	private persisted: unknown = null;
	readonly commands: Array<{ id: string; name: string }> = [];

	constructor(
		public app: App,
		public manifest: unknown = { id: 'kindle-clippings-sync', version: '0.0.0' },
	) {}

	async loadData(): Promise<unknown> {
		return this.persisted;
	}

	async saveData(data: unknown): Promise<void> {
		// Round-trip through JSON so tests catch anything unserializable, the
		// same way the real data.json would.
		this.persisted = JSON.parse(JSON.stringify(data));
	}

	addRibbonIcon(_icon: string, _title: string, _cb: () => void): unknown {
		return {};
	}

	addCommand(command: { id: string; name: string }): unknown {
		this.commands.push(command);
		return command;
	}

	addSettingTab(_tab: unknown): void {}

	registerEvent(_event: unknown): void {}
}

export class PluginSettingTab {
	containerEl = createStubElement();

	constructor(
		public app: App,
		public plugin: unknown,
	) {}

	display(): void {}
}

/** Modals opened during a test, newest last. Cleared by resetObsidianMock(). */
export const openModals: Modal[] = [];

export class Modal {
	titleEl = createStubElement();
	contentEl = createStubElement();

	constructor(public app: App) {}

	open(): void {
		openModals.push(this);
		(this as unknown as { onOpen?: () => void }).onOpen?.();
	}

	close(): void {
		(this as unknown as { onClose?: () => void }).onClose?.();
	}
}

/**
 * Buttons registered by Setting.addButton during a test, in creation order.
 * A modal's promise only settles when one of these handlers fires, so tests
 * drive them through clickButton() rather than the real DOM.
 */
export const buttons: ButtonStub[] = [];

export class ButtonStub {
	text = '';
	cta = false;
	handler: (() => void) | null = null;

	setButtonText(text: string): this {
		this.text = text;
		return this;
	}
	setCta(): this {
		this.cta = true;
		return this;
	}
	setWarning(): this {
		return this;
	}
	onClick(handler: () => void): this {
		this.handler = handler;
		return this;
	}
}

/** Click a registered button by its exact label. Throws if it isn't there. */
export function clickButton(text: string): void {
	const button = buttons.find((candidate) => candidate.text === text);
	if (!button?.handler) {
		throw new Error(
			`No button labelled "${text}". Present: ${
				buttons.map((b) => b.text).join(', ') || '(none)'
			}`,
		);
	}
	button.handler();
}

export class Setting {
	constructor(_containerEl: unknown) {}
	setName(_name: string): this {
		return this;
	}
	setDesc(_desc: string): this {
		return this;
	}
	setHeading(): this {
		return this;
	}
	addText(_cb: (component: unknown) => unknown): this {
		return this;
	}
	addToggle(_cb: (component: unknown) => unknown): this {
		return this;
	}
	addButton(cb: (component: ButtonStub) => unknown): this {
		const button = new ButtonStub();
		cb(button);
		buttons.push(button);
		return this;
	}
}

/** Only the DOM helpers src/ actually calls: empty, setText, createEl. */
function createStubElement(): StubElement {
	const element: StubElement = {
		children: [],
		text: '',
		empty() {
			element.children.length = 0;
		},
		setText(value: string) {
			element.text = value;
		},
		createEl(_tag: string, options?: { text?: string }) {
			const child = createStubElement();
			if (options?.text) child.text = options.text;
			element.children.push(child);
			return child;
		},
	};
	return element;
}

export interface StubElement {
	children: StubElement[];
	text: string;
	empty(): void;
	setText(value: string): void;
	createEl(tag: string, options?: { text?: string }): StubElement;
}

/** All text in an element and its descendants — for asserting what a modal showed. */
export function elementText(element: StubElement): string {
	return [element.text, ...element.children.map(elementText)]
		.filter(Boolean)
		.join('\n');
}

/** Call in beforeEach — module state survives between tests otherwise. */
export function resetObsidianMock(): void {
	notices.length = 0;
	openModals.length = 0;
	buttons.length = 0;
}
