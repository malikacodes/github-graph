import streamDeck, {
	action,
	type DialAction,
	type DialDownEvent,
	type DialRotateEvent,
	type DidReceiveSettingsEvent,
	type SendToPluginEvent,
	SingletonAction,
	type TouchTapEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { laneLink, lanesFrom, layout, type Local, parseRepo, pick, type Placed } from "../branches";
import { type GlobalSettings, store } from "../data";
import { drawBranches } from "../draw";
import { focus, onFocus } from "../focus";
import { readLocal } from "../git";
import { fetchLogin, fetchNetwork, type Network } from "../github";
import { whichRepo } from "../picking";
import { sendRepos } from "./github-key";

// The repo is the one thing each dial remembers: one of mine, picked in
// the repo picker, like "karaoke-maker". Blank means "follow the Repo key".
// parseRepo still takes "someone/their-repo" too, for a setting that came
// from anywhere else.
type Settings = {
	repo?: string;
};

// What I know about one repo. network stays after a failed refresh, so
// the last good map stays up when the wifi drops for a minute.
type Repo = {
	network?: Network;
	local?: Local; // from git on my Mac, when the repo is in ~/Projects
	message?: string;
	busy: boolean;
	updating: boolean;
};

const DEFAULT_MINUTES = 30;

// A metro map of one repo's branches: a loop for every merged pull request
// and an open lane for every branch that isn't merged yet. Put it on two
// or more dials next to each other, all set to the same repo, and they
// share one picture the way the full-width graph does.
@action({ UUID: "com.malikacodes.github-graph.branches" })
export class BranchNetwork extends SingletonAction<Settings> {
	// Which repo each dial is set to, by the dial's id.
	private repoOf = new Map<string, string>();
	private pinned = new Map<string, string>();

	// The picked lane's name for each repo. Dials showing the same repo are
	// one picture, so they share one pick, and turning any of them moves it.
	private picks = new Map<string, string>();

	// What's known about each repo, by the text in the box. Dials with the
	// same repo share one entry, so GitHub only gets asked once for them.
	private repos = new Map<string, Repo>();

	// Who owns the token, for repo names typed without an owner.
	private login = "";

	private nextRefresh: NodeJS.Timeout | undefined;
	private settingsSettled: NodeJS.Timeout | undefined;
	private lastSettings = "";

	constructor() {
		super();

		// A new repo on the Repo key moves every dial that follows it.
		onFocus(async () => {
			for (const [id, setting] of this.pinned) if (!setting) this.setRepo(id, "");
			await this.showAll();
			await this.refreshMissing();
		});

		// A new token or refresh time on the settings page. Same one second
		// wait as data.ts, since the token box saves while I'm still pasting.
		// It only counts if one of them really changed. Otherwise anything
		// that echoes the settings back without a change (my pretend deck
		// does) would set off a refresh, which reads the settings, which
		// echoes them again, once a second forever.
		streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
			const now = `${ev.settings.token ?? ""}|${ev.settings.refreshMinutes ?? ""}`;
			if (now === this.lastSettings) return;
			this.lastSettings = now;

			clearTimeout(this.settingsSettled);
			this.settingsSettled = setTimeout(() => {
				this.login = "";
				void this.refreshAll();
			}, 1000);
		});
	}

	override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		if (!ev.action.isDial()) return;

		this.setRepo(ev.action.id, ev.payload.settings.repo);
		await this.showAll();

		// The timer starts with the first dial, and every refresh sets the
		// next one, so there's only ever one timer going.
		if (!this.nextRefresh) void this.refreshAll();
		else void this.refreshMissing();
	}

	// A dial leaving changes how many share a picture, so everyone redraws.
	override async onWillDisappear(ev: WillDisappearEvent<Settings>): Promise<void> {
		this.repoOf.delete(ev.action.id);
		this.pinned.delete(ev.action.id);
		await this.showAll();
	}

	// A new repo picked in the dropdown.
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
		this.setRepo(ev.action.id, ev.payload.settings.repo);
		await this.showAll();
		await this.refreshMissing();
	}

	// A press refreshes the repo on that dial. "Checking GitHub" stays up
	// for at least a second so I can tell the press did something.
	override async onDialDown(ev: DialDownEvent<Settings>): Promise<void> {
		const text = this.repoOf.get(ev.action.id);
		const repo = text ? this.repos.get(text) : undefined;
		if (!text || !repo || repo.updating) return;

		repo.updating = true;
		await this.showAll();
		await Promise.all([this.refresh(text), new Promise((done) => setTimeout(done, 1000))]);
		repo.updating = false;
		await this.showAll();
	}

	// The settings page asks for the repo list when the dropdown opens
	// (sdpi-components calls this a "datasource"). A repo this dial is set
	// to that isn't in the list, like a private one the token can't see,
	// stays in it with a note. Otherwise the dropdown would go blank and
	// look like I never picked one.
	// The repo picker on the settings page, the same one the GitHub keys use,
	// with "Follow the Repo key" at the top.
	override async onSendToPlugin(ev: SendToPluginEvent<{ event?: string }, Settings>): Promise<void> {
		if (ev.payload?.event === "getRepos") await sendRepos(this.pinned.get(ev.action.id) ?? "", true);
	}


	// Turning steps the pick along the lanes, left to right, and wraps
	// around at the ends, so going past the last lane lands back on the
	// first without turning all the way back.
	override async onDialRotate(ev: DialRotateEvent<Settings>): Promise<void> {
		const map = this.mapFor(ev.action);
		if (!map || map.lanes.length === 0) return;

		// The extra "+ count" keeps it positive when turning left past the first lane.
		const count = map.lanes.length;
		const next = (((map.picked + ev.payload.ticks) % count) + count) % count;
		this.picks.set(map.text, map.lanes[next].name);
		await this.showAll();
	}

	// Tapping any of the map's dials opens the picked lane on GitHub: its
	// pull request if it merged, or the branch if it's still open. A branch
	// that's only on my Mac isn't on GitHub, so the dial shows its little
	// warning sign instead of opening a page that doesn't exist.
	override async onTouchTap(ev: TouchTapEvent<Settings>): Promise<void> {
		const map = this.mapFor(ev.action);
		const lane = map?.lanes[map.picked];
		const network = map && this.repos.get(map.text)?.network;
		if (!lane || !network) return;

		const link = laneLink(network.url, lane);
		if (link) await streamDeck.system.openUrl(link);
		else await ev.action.showAlert();
	}

	// A blank setting follows the Repo key, the same as the GitHub keys, so
	// the dials on my + switch repos along with the XL. repoOf holds the
	// repo each dial is really showing, and pinned holds what its setting
	// says, so a new pick on the Repo key can move only the followers.
	private setRepo(id: string, typed: string | undefined): void {
		this.pinned.set(id, typed?.trim() ?? "");
		const text = whichRepo(typed, focus.repo);
		if (text) this.repoOf.set(id, text);
		else this.repoOf.delete(id);
		if (text && !this.repos.has(text)) this.repos.set(text, { busy: false, updating: false });
	}

	// Refreshes every repo that's on a dial, then sets the timer for the
	// next round. Repos nobody shows any more are forgotten here.
	private async refreshAll(): Promise<void> {
		const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		const minutes = Number(settings.refreshMinutes) || DEFAULT_MINUTES;
		clearTimeout(this.nextRefresh);
		this.nextRefresh = setTimeout(() => this.refreshAll(), minutes * 60 * 1000);

		const shown = new Set(this.repoOf.values());
		for (const text of this.repos.keys()) if (!shown.has(text)) this.repos.delete(text);
		await Promise.all([...shown].map((text) => this.refresh(text)));
	}

	// Just the repos that haven't loaded yet, like one I just typed in.
	private async refreshMissing(): Promise<void> {
		const missing = [...this.repos].filter(([, repo]) => !repo.network && !repo.message);
		await Promise.all(missing.map(([text]) => this.refresh(text)));
	}

	private async refresh(text: string): Promise<void> {
		const repo = this.repos.get(text);
		if (!repo || repo.busy) return;

		const parsed = parseRepo(text);
		if (!parsed) {
			repo.message = "Pick a repo in settings";
			await this.showAll();
			return;
		}

		repo.busy = true;
		const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		const token = settings.token?.trim();

		// A name with no owner is one of mine. The contribution dials
		// already know my username if they've loaded, which saves asking.
		let owner = parsed.owner ?? (this.login || store.login);
		if (!owner) {
			const login = await fetchLogin(token);
			if (login.ok) owner = this.login = login.data;
			else return this.failed(text, repo, login.message, login.detail);
		}

		const result = await fetchNetwork(token, owner, parsed.name);
		if (!result.ok) return this.failed(text, repo, result.message, result.detail);

		// A repo picked from the dropdown is one of mine, so it might be in
		// ~/Projects too. One typed as "someone/their-repo" isn't, even if a
		// folder happens to have the same name.
		repo.local = parsed.owner ? undefined : await readLocal(parsed.name, result.data.main);

		repo.busy = false;
		repo.network = result.data;
		repo.message = undefined;
		await this.showAll();
	}

	private async failed(text: string, repo: Repo, message: string, detail?: string): Promise<void> {
		repo.busy = false;
		repo.message = message;
		streamDeck.logger.warn(`Branches for ${text} failed: ${message}${detail ? ` (GitHub: ${detail})` : ""}`);
		await this.showAll();
	}

	private async showAll(): Promise<void> {
		for (const dial of this.actions) {
			if (dial.isDial()) await this.show(dial);
		}
	}

	// Where a dial sits in its repo's picture: dials on the same deck set to
	// the same repo are one picture, in the order they sit left to right,
	// even with a gap or another dial between them.
	private spot(dial: DialAction<Settings>): { text: string; slot: number; width: number } | undefined {
		const text = this.repoOf.get(dial.id);
		if (!text) return undefined;

		const together = [...this.actions]
			.filter((other) => other.isDial() && other.device.id === dial.device.id && this.repoOf.get(other.id) === text)
			.sort((a, b) => (a.coordinates?.column ?? 0) - (b.coordinates?.column ?? 0));
		const slot = Math.max(0, together.findIndex((other) => other.id === dial.id));
		return { text, slot, width: together.length * 200 };
	}

	// The lanes a dial's picture has, and which one is picked. Undefined
	// until the repo has loaded.
	private mapFor(dial: DialAction<Settings>): { text: string; lanes: Placed[]; picked: number } | undefined {
		const spot = this.spot(dial);
		const network = spot && this.repos.get(spot.text)?.network;
		if (!spot || !network) return undefined;

		const lanes = layout(lanesFrom(network, this.repos.get(spot.text)?.local), spot.width);
		return { text: spot.text, lanes, picked: pick(lanes, this.picks.get(spot.text)) };
	}

	// Sends one dial its slice of the picture.
	private async show(dial: DialAction<Settings>): Promise<void> {
		const spot = this.spot(dial);
		if (!spot) {
			await dial.setFeedback({ graph: drawBranches([], "", 200, 0, -1, "Pick a repo, or press the Repo key") });
			return;
		}
		const { text, slot, width } = spot;

		// Words only show when there's no map to show. Once a map has loaded,
		// a failed refresh leaves it up, and the reason goes in the log.
		const repo = this.repos.get(text);
		const map = this.mapFor(dial);
		let message: string | undefined;
		if (repo?.updating) message = "Checking GitHub...";
		else if (!map) message = repo?.message ?? "Loading...";
		else if (map.lanes.length === 0) message = "No branches yet";

		// main has no lane of its own, so when it's the branch checked out
		// with uncommitted changes, its "*" goes on its label up top.
		const main = repo?.network?.main ?? "";
		const mainDirty = repo?.local?.dirty && repo.local.current === main;

		const picture =
			message || !map
				? drawBranches([], "", width, slot, -1, message)
				: drawBranches(map.lanes, mainDirty ? `${main}*` : main, width, slot, map.picked);

		// The key (graph) matches the item name in layouts/graph.json.
		await dial.setFeedback({ graph: picture });
	}
}
