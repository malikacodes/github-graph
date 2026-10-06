import {
	action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type KeyAction,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { animate, stopAnimating } from "../animate";
import { onChange, refreshNow, start, store } from "../data";
import { drawGoalKey } from "../keys";

const GREY = "#8b949e";
const RED = "#f85149";

// How long the celebration lasts. The pictures that make it up are sent
// through animate.ts, which is what keeps the whole plugin inside Elgato's
// limit when more than one key is animating.
const CELEBRATION_MS = 2200;

// goal is picked on the key's settings page. celebrated is the date of the
// last day this key played its celebration on its own, and only the plugin
// writes it.
type Settings = {
	goal?: number;
	celebrated?: string;
};

// A key with a ring that fills up as today's contributions get closer to
// my goal for the day, and a celebration the first time it's met. Pressing
// it refreshes, and once the goal is met a press plays the celebration again.
@action({ UUID: "com.malikacodes.github-graph.goal" })
export class DailyGoal extends SingletonAction<Settings> {
	// Stream Deck makes one of these objects and shares it between every
	// goal key, so anything that belongs to a single key is kept in a map
	// and looked up by the key's id. settings holds each showing key's saved settings.
	private settings = new Map<string, Settings>();

	// The last picture each key was sent, so the same one isn't sent twice.
	private sent = new Map<string, string>();

	// The keys that are in the middle of celebrating, and the time on the
	// clock when each one started. How far along a key is gets worked out
	// from that every time it's drawn, like checking a stopwatch, so the
	// celebration takes the same 2.2 seconds however many pictures make it
	// to the key. A picture that goes out late just shows a later moment.
	private started = new Map<string, number>();

	constructor() {
		super();
		onChange(() => this.showAll());
	}

	override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		if (!ev.action.isKey()) return;

		this.settings.set(ev.action.id, ev.payload.settings);
		await this.show(ev.action);
		start();
	}

	// Fires when I pick a different goal on the settings page. Only the
	// goal is taken from it. The page keeps its own copy of the settings,
	// and if that copy is older than today's celebration, taking all of it
	// would make the key forget it already celebrated.
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
		if (!ev.action.isKey()) return;

		this.settings.set(ev.action.id, { ...this.settings.get(ev.action.id), goal: ev.payload.settings.goal });
		await this.show(ev.action);
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		// Forget everything about this key. When it comes back Stream Deck
		// has reset it to the plain icon, so it needs its picture again, and
		// onWillAppear hands over its settings again too. A celebration
		// that gets cut off isn't picked up later. It already counted as
		// today's, so the key comes back as the finished ring.
		this.settings.delete(ev.action.id);
		this.sent.delete(ev.action.id);
		this.started.delete(ev.action.id);
		stopAnimating(ev.action.id);
	}

	// A press always refreshes. If today's goal is already met it plays the
	// celebration again first, because that's fun to watch twice. This never
	// looks at or changes the saved celebrated date, which only tracks the
	// one that plays by itself. Pressing in the middle of a celebration
	// starts it over from the beginning.
	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const saved = this.settings.get(ev.action.id);
		const count = store.days.get(store.today)?.count ?? 0;

		// store.today is empty until the first download, so count is 0 then
		// and a key with nothing to show can't celebrate.
		if (saved && count >= this.goal(saved)) {
			this.celebrate(ev.action);
			await this.show(ev.action);
		}

		await refreshNow();
	}

	private async showAll(): Promise<void> {
		for (const key of this.actions) {
			if (key.isKey()) await this.show(key);
		}
	}

	// The one place a key gets its picture from, whether that's the normal
	// ring or a moment of the celebration. Everything that wants a redraw
	// comes through here (new data, a new goal, a turn to animate), so a
	// refresh that lands in the middle of a celebration draws the moment
	// the key is at and not a still ring that would make it flicker.
	private async show(key: KeyAction<Settings>): Promise<void> {
		// No settings means the key went away while a redraw was on its
		// way to it. Drawing it now would put it back in the maps for good.
		const saved = this.settings.get(key.id);
		if (!saved) return;

		const goal = this.goal(saved);
		const count = store.days.get(store.today)?.count ?? 0;

		// The goal was just met and this key hasn't celebrated today.
		// store.today is empty until the first download, which also keeps
		// a key with nothing to show from celebrating. The date is saved
		// right now and not when the animation ends, so switching pages or
		// restarting Stream Deck halfway through can't make it play again.
		const starting = store.today !== "" && count >= goal && saved.celebrated !== store.today;
		if (starting) {
			this.settings.set(key.id, { goal, celebrated: store.today });
			this.celebrate(key);
		}

		// Everything above and the two map lines below happen in one go,
		// before anything is sent. Sending means waiting, and a key can go
		// away during a wait. If the maps were touched after one, a key
		// that had just left could sneak back into them.
		const image = this.draw(goal, count, this.started.get(key.id));
		const same = this.sent.get(key.id) === image;
		this.sent.set(key.id, image);

		if (starting) await key.setSettings({ goal, celebrated: store.today });
		if (!same) await key.setImage(image);
	}

	// Starts a key's stopwatch and puts it in the queue for animation
	// turns. A key that's already celebrating just gets a new start time,
	// which is what makes a press in the middle play it again from the top.
	private celebrate(key: KeyAction<Settings>): void {
		this.started.set(key.id, Date.now());
		animate(key.id, () => this.turn(key));
	}

	// Runs each time it's this key's turn to send a picture. It doesn't
	// count anything. The picture comes from how long ago the key started,
	// so two keys that began at different moments each stay on their own
	// time.
	private turn(key: KeyAction<Settings>): void {
		// Time's up. The key comes out of the map and the queue before
		// it's drawn, so this same call is what puts the normal ring back.
		const began = this.started.get(key.id);
		if (began === undefined || Date.now() - began >= CELEBRATION_MS) {
			this.started.delete(key.id);
			stopAnimating(key.id);
		}
		void this.show(key);
	}

	// The settings page shows 1 before anything is picked, but it doesn't
	// save that until the menu is actually changed, so a new key arrives
	// here with no goal at all. Whatever does arrive is turned into a
	// whole number from 1 to 99, so a hand-edited or broken value can't
	// reach the drawing.
	private goal(saved: Settings): number {
		const goal = Math.round(Number(saved.goal ?? 1));
		return Math.min(99, Math.max(1, goal || 1));
	}

	private draw(goal: number, count: number, began: number | undefined): string {
		// Before the first download there's no count to show, only a dash
		// and whatever is going on (loading, or what went wrong).
		if (!store.fetchedAt) {
			return drawGoalKey("–", store.shortMessage ?? "loading", store.message ? RED : GREY, 0, false);
		}

		// If the last try failed, the words say why in red. The count and
		// the ring stay either way, because an old count beats an empty key.
		let small = `of ${goal}`;
		let color = GREY;
		if (store.shortMessage) {
			small = store.shortMessage;
			color = RED;
		}
		if (store.updating) {
			small = "updating";
			color = GREY;
		}

		// How far through the celebration this key is, from 0 at the start
		// to 1 at the end. It can come out a touch over 1 if a redraw
		// lands after time's up but before the key's next turn has taken
		// it out of the map. That's fine, because the end of the celebration is
		// already the normal picture.
		const burst = began === undefined ? undefined : (Date.now() - began) / CELEBRATION_MS;

		// Past the goal the ring just stays full, and the count keeps going.
		// The star is there for as long as today's count is at the goal.
		return drawGoalKey(String(count), small, color, Math.min(1, count / goal), count >= goal, burst);
	}
}
