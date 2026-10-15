import streamDeck, {
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { parseRepo } from "../branches";
import type { GlobalSettings } from "../data";
import { focus, isPrivate, onFocus, owner, repoList, token } from "../focus";
import type { Result } from "../github";
import type { Face } from "../key-art";
import { drawGithubKey } from "../key-art";
import type { Lesson } from "../learn";
import { whichRepo } from "../picking";

// A key's one setting: the repo it's pinned to. Empty means it follows the
// Repo key, and every new key starts that way.
export type KeySettings = {
	repo?: string;
};

// What a key knows about one repo. data stays after a failed refresh, so
// the last good number stays up when the wifi drops for a minute.
type Known<T> = {
	data?: T;
	message?: string;
	short?: string;
	at: number;
	busy: boolean;
};

const DEFAULT_MINUTES = 30;

// Each kind of key waits a few seconds longer than the last before its
// first refresh, so a page of nine keys doesn't ask GitHub nine things in
// the same second. GitHub has a separate limit for bursts like that.
let nextStagger = 0;

// Everything the GitHub keys have in common. Each key only says how to
// load its numbers, how to draw them, what its settings page teaches, and
// where a press goes.
export abstract class GitHubKey<T> extends SingletonAction<KeySettings> {
	protected abstract load(token: string | undefined, owner: string, name: string): Promise<Result<T>>;
	protected abstract face(data: T, repo: string): Face;
	protected abstract lesson(repo: string | undefined, data: T | undefined, message: string | undefined): Lesson;
	protected abstract link(data: T | undefined, repo: string, url: string): string;

	// The drawing and color this key uses while loading or when it's stuck.
	protected abstract readonly look: Pick<Face, "icon" | "color">;

	private settings = new Map<string, KeySettings>();
	private known = new Map<string, Known<T>>();
	private timer?: NodeJS.Timeout;
	private stagger = (nextStagger++ % 9) * 4000;
	private lastGlobal = "";

	constructor() {
		super();
		onFocus(() => void this.refreshAll());

		// Same rule as the Branch Map: only a real change to the token or
		// the timer counts, or an echo of the same settings would set off a
		// refresh that reads them, which echoes them again.
		streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
			const now = `${ev.settings.token ?? ""}|${ev.settings.refreshMinutes ?? ""}`;
			if (now === this.lastGlobal) return;
			const first = this.lastGlobal === "";
			this.lastGlobal = now;
			if (!first) {
				this.known.clear();
				void this.refreshAll();
			}
		});
	}

	override async onWillAppear(ev: WillAppearEvent<KeySettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		this.settings.set(ev.action.id, ev.payload.settings);
		await this.show(ev.action);

		if (!this.timer) this.timer = setTimeout(() => this.refreshAll(), this.stagger);
		else await this.refresh(this.repoOf(ev.action.id));
	}

	override onWillDisappear(ev: WillDisappearEvent<KeySettings>): void {
		this.settings.delete(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<KeySettings>): Promise<void> {
		this.settings.set(ev.action.id, ev.payload.settings);
		if (ev.action.isKey()) await this.show(ev.action);
		await this.refresh(this.repoOf(ev.action.id));
		await this.explain(ev.action.id);
	}

	// A press opens the page on GitHub that the key is about.
	override async onKeyDown(ev: KeyDownEvent<KeySettings>): Promise<void> {
		const repo = this.repoOf(ev.action.id);
		if (!repo) return;
		const known = this.known.get(repo);
		const login = await owner();
		const parsed = parseRepo(repo);
		const url = `https://github.com/${parsed?.owner ?? (login.ok ? login.data : "")}/${parsed?.name ?? repo}`;
		await streamDeck.system.openUrl(this.link(known?.data, repo, url));
	}

	// The settings page asks for two things: its learning rows, and the repo
	// list for the picker.
	override async onSendToPlugin(ev: SendToPluginEvent<{ event?: string }, KeySettings>): Promise<void> {
		if (ev.payload?.event === "explain") await this.explain(ev.action.id);
		if (ev.payload?.event === "getRepos") await sendRepos(this.settings.get(ev.action.id)?.repo ?? "", true);
	}

	private repoOf(id: string): string | undefined {
		return whichRepo(this.settings.get(id)?.repo, focus.repo);
	}

	// Refreshes every repo a key of this kind is showing, then sets the
	// timer for the next round.
	private async refreshAll(): Promise<void> {
		const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		const minutes = Number(settings.refreshMinutes) || DEFAULT_MINUTES;
		clearTimeout(this.timer);
		this.timer = setTimeout(() => this.refreshAll(), minutes * 60 * 1000);

		const repos = new Set([...this.settings.keys()].map((id) => this.repoOf(id)));
		await this.showAll();
		for (const repo of repos) await this.refresh(repo, true);
	}

	// Asks GitHub about one repo, unless it was asked in the last minute
	// (several keys of the same kind on one repo, or switching back and
	// forth on the Repo key). force is for the timer.
	private async refresh(repo: string | undefined, force = false): Promise<void> {
		if (!repo) return;
		const known = this.known.get(repo) ?? { at: 0, busy: false };
		this.known.set(repo, known);
		if (known.busy || (!force && Date.now() - known.at < 60 * 1000)) return this.showAll();

		known.busy = true;
		const parsed = parseRepo(repo);
		const login = parsed?.owner ? { ok: true as const, data: parsed.owner } : await owner();
		const result: Result<T> = !parsed
			? { ok: false, message: "That isn't a repo name", short: "Bad name" }
			: !login.ok
				? login
				: await this.load(await token(), login.data, parsed.name);

		known.busy = false;
		known.at = Date.now();
		if (result.ok) {
			known.data = result.data;
			known.message = known.short = undefined;
		} else {
			known.message = result.message;
			known.short = result.short;
			streamDeck.logger.warn(`${this.manifestId} for ${repo} failed: ${result.message}${result.detail ? ` (GitHub: ${result.detail})` : ""}`);
		}

		await this.showAll();
		const open = streamDeck.ui.action;
		if (open && this.settings.has(open.id)) await this.explain(open.id);
	}

	private async showAll(): Promise<void> {
		for (const key of this.actions) {
			if (key.isKey()) await this.show(key);
		}
	}

	private sent = new Map<string, string>();

	private async show(key: KeyAction<KeySettings>): Promise<void> {
		const repo = this.repoOf(key.id);
		const known = repo ? this.known.get(repo) : undefined;

		// The last good numbers win over a failure, so a short wifi drop
		// doesn't blank the key. The reason is still on the settings page.
		let face: Face;
		if (!repo) face = { ...this.look, big: "–", small: "pick a repo", quiet: true };
		else if (known?.data) face = { ...this.face(known.data, repo), lock: isPrivate(repo) };
		else if (known?.message) face = { ...this.look, big: "–", small: known.short ?? "can't check", quiet: true, alarm: true };
		else face = { ...this.look, big: "–", small: "loading", quiet: true };

		const image = drawGithubKey(face);
		if (this.sent.get(key.id) === image) return;
		this.sent.set(key.id, image);
		await key.setImage(image);
	}

	// Sends the open settings page its rows. Stream Deck drops a message to
	// a page that isn't showing, so this only goes out when it's this key's.
	private async explain(id: string): Promise<void> {
		if (streamDeck.ui.action?.id !== id) return;
		const repo = this.repoOf(id);
		const known = repo ? this.known.get(repo) : undefined;
		const message = known?.data ? undefined : known?.message;
		await streamDeck.ui.sendToPropertyInspector({ event: "explain", lesson: this.lesson(repo, known?.data, message) });
	}
}

// The repo list for a settings page's picker. withFollow adds "Follow the
// Repo key" at the top, for every key except the Repo key itself.
export async function sendRepos(current: string, withFollow: boolean): Promise<void> {
	const result = await repoList();
	await streamDeck.ui.sendToPropertyInspector({
		event: "getRepos",
		follow: withFollow,
		current,
		repos: result.ok ? result.data : [],
		message: result.ok ? undefined : result.message,
	});
}
