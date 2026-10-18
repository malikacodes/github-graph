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
import { focus, forget, isPrivate, onFocus, owner, repoList, token } from "../focus";
import type { Result } from "../github";
import type { Face } from "../key-art";
import { drawGithubKey } from "../key-art";
import type { Lesson } from "../learn";
import { whichRepo } from "../picking";

// A key's settings. repo is the repo it's pinned to: empty means it
// follows the Repo key, and every new key starts that way. The rest belong
// to one kind of key each.
export type KeySettings = {
	repo?: string;
	stat?: string; // Repo Stats: which number to show
	base?: string; // Branch Comparison: the branch to compare against
	head?: string; // Branch Comparison: the branch being compared
	pre?: boolean; // Releases: count pre-releases too
	board?: string; // Projects: the board's number, blank for the newest
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

// Each kind of key waits two seconds longer than the last before its
// first refresh, so a page of nine keys doesn't ask GitHub nine things in
// the same second. GitHub has a separate limit for bursts like that.
let nextStagger = 0;

// Everything the GitHub keys have in common. Each key only says how to
// load its numbers, how to draw them, what its settings page teaches, and
// where a press goes.
export abstract class GitHubKey<T> extends SingletonAction<KeySettings> {
	protected abstract load(token: string | undefined, owner: string, name: string, settings: KeySettings): Promise<Result<T>>;
	protected abstract face(data: T, repo: string, settings: KeySettings): Face;
	protected abstract lesson(repo: string | undefined, data: T | undefined, message: string | undefined, settings: KeySettings): Lesson;
	protected abstract link(data: T | undefined, repo: string, url: string, settings: KeySettings): string;

	// Which of this key's settings change what it asks GitHub. Answers are
	// saved per repo plus these, so two keys on the same repo with different
	// branches never show each other's numbers.
	protected variant(_: KeySettings): string {
		return "";
	}

	// For a settings page question other than the two every key answers.
	protected async answer(_event: string, _id: string, _repo: string | undefined): Promise<void> {}

	// The drawing and color this key uses while loading or when it's stuck.
	protected abstract readonly look: Pick<Face, "icon" | "color">;

	// Whether this kind of key follows the Repo key. Projects doesn't: a
	// board belongs to me, not to a repo, so it never needs my username
	// either.
	protected readonly follows: boolean = true;

	private settings = new Map<string, KeySettings>();
	private known = new Map<string, Known<T>>();
	private timer?: NodeJS.Timeout;
	private stagger = (nextStagger++ % 9) * 2000;
	private lastGlobal = "";
	private settled?: NodeJS.Timeout;

	constructor() {
		super();
		onFocus(() => this.safely(this.followed()));

		// Same rules as the Branch Map. Only a real change to the token or
		// the timer counts, or an echo of the same settings would set off a
		// refresh that reads them, which echoes them again. And it waits a
		// second, because the token box saves while I'm still pasting.
		streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
			const now = `${ev.settings.token ?? ""}|${ev.settings.refreshMinutes ?? ""}`;
			if (now === this.lastGlobal) return;
			const first = this.lastGlobal === "";
			this.lastGlobal = now;
			if (first) return;

			clearTimeout(this.settled);
			this.settled = setTimeout(() => {
				forget();
				this.known.clear();
				this.safely(this.refreshAll());
			}, 1000);
		});
	}

	// Runs something in the background and writes any error to the log.
	// Without this, one unexpected error from a timer would stop the whole
	// plugin, since Node quits on an error nobody catches.
	private safely(work: Promise<void>): void {
		work.catch((error) => streamDeck.logger.error(`${this.manifestId}: ${error}`));
	}

	override async onWillAppear(ev: WillAppearEvent<KeySettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		this.settings.set(ev.action.id, ev.payload.settings);
		await this.show(ev.action);

		if (!this.timer) this.timer = setTimeout(() => this.safely(this.refreshAll()), this.stagger);
		else await this.refresh(ev.action.id);
	}

	// When the last key of this kind goes away (a page switch does this),
	// the timer stops, and everything it knew is forgotten. The next key to
	// show up starts both again.
	override onWillDisappear(ev: WillDisappearEvent<KeySettings>): void {
		this.settings.delete(ev.action.id);
		this.sent.delete(ev.action.id);
		if (this.settings.size > 0) return;
		clearTimeout(this.timer);
		this.timer = undefined;
		this.known.clear();
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<KeySettings>): Promise<void> {
		this.settings.set(ev.action.id, ev.payload.settings);
		if (ev.action.isKey()) await this.show(ev.action);
		await this.refresh(ev.action.id);
		await this.explain(ev.action.id);
	}

	// A press opens the page on GitHub that the key is about.
	override async onKeyDown(ev: KeyDownEvent<KeySettings>): Promise<void> {
		const repo = this.repoOf(ev.action.id);
		if (!repo) return;
		const known = this.known.get(this.keyOf(ev.action.id)!);
		const parsed = parseRepo(repo);
		const login = parsed?.owner || !this.follows ? undefined : await owner();
		const url = `https://github.com/${parsed?.owner ?? (login?.ok ? login.data : "")}/${parsed?.name ?? repo}`;
		await streamDeck.system.openUrl(this.link(known?.data, repo, url, this.settingsOf(ev.action.id)));
	}

	// The settings page asks for two things: its learning rows, and the repo
	// list for the picker.
	override async onSendToPlugin(ev: SendToPluginEvent<{ event?: string }, KeySettings>): Promise<void> {
		const event = ev.payload?.event ?? "";
		if (event === "explain") await this.explain(ev.action.id);
		else if (event === "getRepos") await sendRepos(this.settingsOf(ev.action.id).repo ?? "", true);
		else await this.answer(event, ev.action.id, this.repoOf(ev.action.id));
	}

	private settingsOf(id: string): KeySettings {
		return this.settings.get(id) ?? {};
	}

	protected repoOf(id: string): string | undefined {
		return whichRepo(this.settingsOf(id).repo, focus.repo);
	}

	// The name a key's answer is saved under: its repo plus its variant.
	private keyOf(id: string): string | undefined {
		const repo = this.repoOf(id);
		return repo && `${repo}|${this.variant(this.settingsOf(id))}`;
	}

	// Refreshes every repo a key of this kind is showing, then sets the
	// timer for the next round.
	private async refreshAll(): Promise<void> {
		const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		const minutes = Number(settings.refreshMinutes) || DEFAULT_MINUTES;
		clearTimeout(this.timer);
		this.timer = setTimeout(() => this.safely(this.refreshAll()), minutes * 60 * 1000);

		// One refresh per different answer, not per key: two keys showing
		// the same thing share it.
		const ids = new Map([...this.settings.keys()].map((id) => [this.keyOf(id), id]));
		await this.showAll();
		for (const id of ids.values()) await this.refresh(id, true);
	}

	// Asks GitHub what one key needs, unless the same thing was asked in the
	// last minute (several keys showing the same thing, or switching back
	// and forth on the Repo key). force is for the timer.
	private async refresh(id: string, force = false): Promise<void> {
		const repo = this.repoOf(id);
		const name = this.keyOf(id);
		if (!repo || !name) return this.showAll();
		const known = this.known.get(name) ?? { at: 0, busy: false };
		this.known.set(name, known);
		if (known.busy || (!force && Date.now() - known.at < 60 * 1000)) return this.showAll();

		known.busy = true;
		let result: Result<T>;
		try {
			result = await this.ask(repo, id);
		} catch (error) {
			// Anything unexpected (a reply that isn't what GitHub usually
			// sends) becomes a message on the key, not a stuck "loading".
			result = { ok: false, message: "Something unexpected came back", short: "Odd reply", detail: String(error) };
		} finally {
			known.busy = false;
		}
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

	// Works out whose repo it is, then asks the key's own question.
	private async ask(repo: string, id: string): Promise<Result<T>> {
		const parsed = parseRepo(repo);
		if (!parsed) return { ok: false, message: "That isn't a repo name", short: "Bad name" };
		const login = parsed.owner || !this.follows ? { ok: true as const, data: parsed.owner ?? "" } : await owner();
		if (!login.ok) return login;
		return this.load(await token(), login.data, parsed.name, this.settingsOf(id));
	}

	// A new repo on the Repo key: every key that follows it asks about the
	// new repo (unless it already did in the last minute).
	private async followed(): Promise<void> {
		if (!this.follows) return;
		await this.showAll();
		for (const id of this.settings.keys()) {
			if (!this.settingsOf(id).repo) await this.refresh(id);
		}
	}

	private async showAll(): Promise<void> {
		for (const key of this.actions) {
			if (key.isKey()) await this.show(key);
		}
	}

	private sent = new Map<string, string>();

	private async show(key: KeyAction<KeySettings>): Promise<void> {
		const repo = this.repoOf(key.id);
		const known = repo ? this.known.get(this.keyOf(key.id)!) : undefined;

		// The last good numbers win over a failure, so a short wifi drop
		// doesn't blank the key. The reason is still on the settings page.
		let face: Face;
		if (!repo) face = { ...this.look, big: "–", small: "pick a repo", quiet: true };
		else if (known?.data) face = { ...this.face(known.data, repo, this.settingsOf(key.id)), lock: isPrivate(repo) };
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
		const known = repo ? this.known.get(this.keyOf(id)!) : undefined;
		const message = known?.data ? undefined : known?.message;
		await streamDeck.ui.sendToPropertyInspector({ event: "explain", lesson: this.lesson(repo, known?.data, message, this.settingsOf(id)) });
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
