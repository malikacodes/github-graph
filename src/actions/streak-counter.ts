import {
	action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type KeyAction,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { animate, idle, stopAnimating, stopIdling } from "../animate";
import { onChange, refreshNow, start, store, wantHistory } from "../data";
import { SWAY_MS, TIERS } from "../flames";
import { drawStreakKey } from "../keys";
import { type Mode, streaks } from "../streak";

const GREY = "#8b949e";
const RED = "#f85149";

// The burst is the fire flaring up and throwing sparks. The rest of the
// time a lit fire sways a little so the key doesn't look frozen. The pictures for
// both go through animate.ts, which keeps the whole plugin inside Elgato's
// limit and lets a burst on any key have the sway's turns while it plays.
const BURST_MS = 2000;

// Both are picked on the key's settings page.
type Settings = {
	mode?: string;
	graceDays?: number;
};

// A key with a fire that grows as my streak does, and the streak as a
// number. Pressing it refreshes and makes the fire flare up.
@action({ UUID: "com.malikacodes.github-graph.streak" })
export class StreakCounter extends SingletonAction<Settings> {
	// Stream Deck makes one of these objects and shares it between every
	// streak key, so anything that belongs to a single key is kept in a map
	// and looked up by the key's id. settings holds each showing key's
	// saved settings.
	private settings = new Map<string, Settings>();

	// The last picture each key was sent, so the same one isn't sent twice.
	private sent = new Map<string, string>();

	// The streak each key showed last. A different number is what sets off
	// a burst, and a key that isn't in here yet has only just appeared.
	private counts = new Map<string, number>();

	// The keys in the middle of a burst, and the time on the clock when
	// each one started. How far along a key is gets worked out from that
	// every time it's drawn, like checking a stopwatch, so the burst takes
	// the same 2 seconds however many pictures make it to the key. A
	// picture that goes out late just shows a later moment.
	private flared = new Map<string, number>();

	constructor() {
		super();
		onChange(() => this.showAll());
	}

	override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		if (!ev.action.isKey()) return;

		this.settings.set(ev.action.id, ev.payload.settings);
		await this.show(ev.action);

		// A streak can be longer than the 12 months the regular refresh
		// brings in, so counting it properly needs the older years too.
		// Nothing else in the plugin does, so those years only start
		// loading once a streak key is actually on the deck.
		wantHistory();
		start();
	}

	// Fires when I change the mode or the grace days on the settings page.
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
		if (!ev.action.isKey()) return;

		this.settings.set(ev.action.id, ev.payload.settings);
		await this.show(ev.action);
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		// Forget everything about this key. When it comes back Stream Deck
		// has reset it to the plain icon, so it needs its picture again, and
		// onWillAppear hands over its settings again too. Its streak is
		// forgotten as well, which is what makes the fire flare up when the
		// key comes back.
		this.settings.delete(ev.action.id);
		this.sent.delete(ev.action.id);
		this.counts.delete(ev.action.id);
		this.flared.delete(ev.action.id);
		stopAnimating(ev.action.id);
		stopIdling(ev.action.id);
	}

	// A press always refreshes. If there's a fire it flares up first, and
	// pressing in the middle of a burst starts it over. A cold coal has
	// nothing to flare, so there a press only refreshes.
	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		if (this.counts.get(ev.action.id)) {
			this.flare(ev.action);
			await this.show(ev.action);
		}

		await refreshNow();
	}

	private async showAll(): Promise<void> {
		for (const key of this.actions) {
			if (key.isKey()) await this.show(key);
		}
	}

	// The one place a key gets its picture from, whether the fire is cold,
	// swaying or flaring. Everything that wants a redraw
	// comes through here (new data, new settings, a turn to animate), so a
	// refresh that lands in the middle of a burst draws the moment the key
	// is at and not a still fire that would make it jump.
	private async show(key: KeyAction<Settings>): Promise<void> {
		// No settings means the key went away while a redraw was on its
		// way to it. Drawing it now would put it back in the maps for good.
		const saved = this.settings.get(key.id);
		if (!saved) return;

		const mode = this.mode(saved);
		const { current } = streaks(store.days, store.today, mode, this.grace(saved));

		// A new number gets a burst. That covers a key that has just
		// appeared too, because it has no last number yet. Before the first
		// download the streak is 0, and 0 never bursts.
		if (current > 0 && current !== this.counts.get(key.id)) this.flare(key);
		this.counts.set(key.id, current);

		// A lit fire that isn't in a burst sways, so it's in the idling
		// line for as long as it's showing. This is checked on every
		// redraw, which is what takes a key out when its streak drops to 0
		// or a burst starts, and puts it back when the burst is over. A
		// cold coal has nothing to sway.
		if (current > 0 && !this.flared.has(key.id)) idle(key.id, () => void this.show(key));
		else stopIdling(key.id);

		// Everything above and the two map lines below happen in one go,
		// before anything is sent. Sending means waiting, and a key can go
		// away during a wait. If the maps were touched after one, a key
		// that had just left could sneak back into them.
		const image = this.draw(mode, current, key.id);
		const same = this.sent.get(key.id) === image;
		this.sent.set(key.id, image);

		if (!same) await key.setImage(image);
	}

	// Starts a key's burst stopwatch and puts it in the queue for animation
	// turns. A key that's already in a burst just gets a new start time,
	// which is what makes a press in the middle play it again from the top.
	private flare(key: KeyAction<Settings>): void {
		this.flared.set(key.id, Date.now());
		animate(key.id, () => this.turn(key));
	}

	// Runs each time it's this key's turn to send a picture of its burst.
	// It doesn't count anything. The picture comes from how long ago the
	// key started, so two keys that began at different moments each stay on
	// their own time.
	private turn(key: KeyAction<Settings>): void {
		// Time's up. The key comes out of the map and the queue before
		// it's drawn, so this same call is what sends it back to swaying.
		if (Date.now() - (this.flared.get(key.id) ?? 0) >= BURST_MS) {
			this.flared.delete(key.id);
			stopAnimating(key.id);
		}
		void this.show(key);
	}

	// The settings page shows Daily and 1 before anything is picked, but it
	// doesn't save them until a field is actually changed, so a new key
	// arrives here with no settings at all. Whatever does arrive is checked,
	// so a hand-edited or broken value can't reach the streak math.
	private mode(saved: Settings): Mode {
		return saved.mode === "weekdays" || saved.mode === "weekly" ? saved.mode : "daily";
	}

	// 0 is a real choice here (no grace at all), so the default of 1 is
	// only for a value that's missing or isn't a number. Anything else is
	// turned into a whole number from 0 to 3.
	private grace(saved: Settings): number {
		const grace = Number(saved.graceDays ?? 1);
		return Number.isNaN(grace) ? 1 : Math.min(3, Math.max(0, Math.round(grace)));
	}

	private draw(mode: Mode, current: number, id: string): string {
		// Before the first download there's no streak to show, only a dash
		// over the cold coal and whatever is going on (loading, or what
		// went wrong).
		if (!store.fetchedAt) {
			return drawStreakKey("–", store.shortMessage ?? "loading", store.message ? RED : GREY, 0);
		}

		// The tier is how many rows of the table the streak has reached.
		const days = mode === "weekly" ? current * 7 : current;
		const tier = TIERS.filter((row) => days >= row.from).length;

		// The bottom line is empty most of the time. It's only there for
		// the moments something needs saying. If the last try failed, the
		// words say why in red. The streak and the fire stay either way,
		// because an old streak beats an empty key.
		let small = "";
		let color = GREY;
		if (store.shortMessage) {
			small = store.shortMessage;
			color = RED;
		}
		if (store.updating) small = "updating";

		// How far through its burst this key is, from 0 at the start to 1
		// at the end. It can come out a touch over 1 if a redraw lands after
		// time's up but before the key's next turn has taken it out of the
		// map. That's fine, because the end of a burst is already the plain
		// swaying fire.
		const now = Date.now();
		const flared = this.flared.get(id);
		const burst = flared === undefined ? undefined : (now - flared) / BURST_MS;

		// The sway has no start of its own. It's read straight off the
		// clock, like looking at where the second hand is, so every picture
		// lands on the right moment of the loop whenever it gets sent.
		const sway = (now % SWAY_MS) / SWAY_MS;

		return drawStreakKey(String(current), small, color, tier, burst, sway);
	}
}
