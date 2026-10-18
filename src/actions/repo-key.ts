import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";

import { focus, isPrivate, onFocus, repoList, setFocus } from "../focus.ts";
import { COLORS, drawGithubKey } from "../key-art.ts";
import { repoLesson } from "../learn.ts";
import { stepRepo } from "../picking.ts";
import { onSettingsChange, safely } from "../refresh.ts";
import { type KeySettings, sendRepos } from "./github-key.ts";

// The Repo key: it shows the repo every GitHub key follows, and a press
// steps to the next one, newest push first. It's the one key where a press
// doesn't open GitHub, so stepping through repos never sends me off to a
// browser by accident.
//
// The pick lives in memory (focus.ts) and also in each Repo key's own
// settings, so it's still there after Stream Deck restarts.
@action({ UUID: "com.malikacodes.github-graph.repo" })
export class RepoKey extends SingletonAction<KeySettings> {
	// Why the repo list couldn't load, in the key's short words, so a
	// missing token says so instead of "loading" forever.
	private problem?: string;

	constructor() {
		super();
		onFocus(() => safely(this.saveAndShow(), "repo key"));

		// A new token can see repos the old one couldn't (or any at all, the
		// first time), so the list is asked for again. The clock has already
		// waited for the token box to settle and made focus.ts forget the
		// old list by the time this runs.
		onSettingsChange(() => safely(this.load(), "repo key"));
	}

	override async onWillAppear(ev: WillAppearEvent<KeySettings>): Promise<void> {
		if (!ev.action.isKey()) return;

		// The first Repo key to show up after a restart brings back the
		// saved pick. With nothing saved, it's the repo I pushed to last.
		if (!focus.repo && ev.payload.settings.repo) setFocus(ev.payload.settings.repo);
		await this.show(ev.action);
		await this.load();
	}

	// Gets the repo list, and picks the newest repo if nothing is picked yet.
	private async load(): Promise<void> {
		const list = await repoList();
		this.problem = list.ok ? undefined : list.short;
		if (!focus.repo && list.ok && list.data[0]) setFocus(list.data[0].name);
		else await this.showAll();
	}

	override async onKeyDown(): Promise<void> {
		const list = await repoList();
		this.problem = list.ok ? undefined : list.short;
		if (!list.ok) return this.showAll();
		const next = stepRepo(
			list.data.map((repo) => repo.name),
			focus.repo,
			1,
		);
		if (next) setFocus(next);
	}

	// Picking a repo on the settings page picks it for everyone.
	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<KeySettings>): void {
		if (ev.payload.settings.repo) setFocus(ev.payload.settings.repo);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<{ event?: string }, KeySettings>): Promise<void> {
		if (ev.payload?.event === "getRepos") await sendRepos(focus.repo, false);
		if (ev.payload?.event === "explain") await this.explain();
	}

	// Every Repo key saves the new pick and redraws, and an open settings
	// page gets its new "Right now".
	private async saveAndShow(): Promise<void> {
		for (const key of this.actions) {
			if (!key.isKey()) continue;
			await key.setSettings({ repo: focus.repo });
			await this.show(key);
		}
		await this.explain();
	}

	private async showAll(): Promise<void> {
		for (const key of this.actions) {
			if (key.isKey()) await this.show(key);
		}
	}

	private place(): { at: number; total: number } {
		const at = focus.repos.findIndex((repo) => repo.name === focus.repo);
		return { at: at + 1, total: focus.repos.length };
	}

	private async show(key: KeyAction<KeySettings>): Promise<void> {
		const { at, total } = this.place();
		await key.setImage(
			drawGithubKey({
				icon: "repo",
				color: COLORS.pink,
				big: focus.repo || "–",
				small: !focus.repo ? (this.problem ?? "loading") : at ? `${at} of ${total}` : "repo",
				lock: focus.repo ? isPrivate(focus.repo) : false,
				quiet: !focus.repo,
				alarm: !focus.repo && !!this.problem,
			}),
		);
	}

	private async explain(): Promise<void> {
		const open = streamDeck.ui.action;
		if (!open || !this.actions.some((key) => key.id === open.id)) return;
		const { at, total } = this.place();
		await streamDeck.ui.sendToPropertyInspector({
			event: "explain",
			lesson: repoLesson(focus.repo || undefined, at, total, isPrivate(focus.repo)),
		});
	}
}
