import {
	action,
	type KeyAction,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { onChange, refreshNow, start, store } from "../data";
import { drawStatsKey } from "../keys";

const GREEN = "#39d353";
const AMBER = "#d29922";
const RED = "#f85149";

// A key with my total for the year, and a dot that says how fresh that
// number is. Pressing it refreshes.
@action({ UUID: "com.malikacodes.github-graph.stats" })
export class ContributionStats extends SingletonAction {
	private clock?: NodeJS.Timeout;

	// The last picture each key was sent, looked up by the key's id. Most
	// redraws come out exactly the same as the one before, and this is how
	// I know not to send those again.
	private sent = new Map<string, string>();

	constructor() {
		super();
		onChange(() => this.showAll());
	}

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		if (!ev.action.isKey()) return;

		await this.show(ev.action);
		start();

		// "5 min ago" goes stale on its own, even when nothing new arrives,
		// so the key redraws itself twice a minute to keep the age honest.
		this.clock ??= setInterval(() => this.showAll(), 30 * 1000);
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		// Forget what this key was showing. When it comes back (switching
		// pages does this) Stream Deck has reset it to the plain icon, so it
		// needs its picture again even if nothing changed in between.
		this.sent.delete(ev.action.id);

		// Stream Deck has already taken this key off the list by now. If
		// another stats key is still showing, the clock has to keep going.
		for (const key of this.actions) {
			if (key.isKey()) return;
		}

		// That was the last one, so stop the clock. Left running, it would
		// wake up twice a minute forever to redraw nothing. Setting it back
		// to undefined is what lets onWillAppear start a new one.
		clearInterval(this.clock);
		this.clock = undefined;
	}

	override async onKeyDown(): Promise<void> {
		await refreshNow();
	}

	private async showAll(): Promise<void> {
		for (const key of this.actions) {
			if (key.isKey()) await this.show(key);
		}
	}

	private async show(key: KeyAction<{}>): Promise<void> {
		const image = this.draw();

		// The clock ticks every 30 seconds but the words only change about
		// once a minute, so half the time this is the same picture again.
		// It's remembered before sending, not after, so a key that goes
		// away while the picture is on its way can't sneak back into the map.
		if (this.sent.get(key.id) === image) return;
		this.sent.set(key.id, image);
		await key.setImage(image);
	}

	private draw(): string {
		// Before the first download there's no number to show, only a dash
		// and whatever is going on (loading, or what went wrong).
		if (!store.fetchedAt) {
			return drawStatsKey("", "–", store.message ? RED : AMBER, store.shortMessage ?? "loading");
		}

		const minutes = Math.floor((Date.now() - store.fetchedAt) / 60000);
		let age = "just now";
		if (minutes >= 60 * 24) age = `${Math.floor(minutes / 60 / 24)} d ago`;
		else if (minutes >= 60) age = `${Math.floor(minutes / 60)} hr ago`;
		else if (minutes >= 1) age = `${minutes} min ago`;

		// Green means the timer is keeping up. Amber means the data is more
		// than two refreshes old, which usually means the Mac was asleep.
		// Red means the last try failed, and the words say why. The number
		// stays either way, because an old total beats an empty key.
		let dot = minutes > store.refreshMinutes * 2 ? AMBER : GREEN;
		if (store.message) {
			dot = RED;
			age = store.shortMessage ?? age;
		}
		if (store.updating) age = "updating";

		return drawStatsKey(String(store.year), store.total.toLocaleString("en-US"), dot, age);
	}
}
