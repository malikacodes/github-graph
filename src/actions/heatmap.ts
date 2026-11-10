import streamDeck, {
	action,
	type KeyAction,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { addDays, weekColumns, weekday } from "../calendar.ts";
import { onChange, start, stop, store } from "../data.ts";
import { drawHeatmap, HEATMAP_WEEKS } from "../draw.ts";

// A key with my last 7 weeks as a grid of green squares on a rounded tile. It reads from
// the same download as the graph dials, so it costs GitHub nothing extra.
// Pressing it opens my profile, not a refresh: the key is a window onto
// the graph, and the real one is a press away.
@action({ UUID: "com.malikacodes.github-graph.heatmap" })
export class Heatmap extends SingletonAction {
	// The last picture each key was sent, so the same one isn't sent twice.
	private sent = new Map<string, string>();

	constructor() {
		super();
		onChange(() => this.showAll());
	}

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		if (!ev.action.isKey()) return;
		await this.show(ev.action);
		start();
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		// Stream Deck resets a key to its plain icon when it leaves, so when
		// it comes back it needs its picture again even if nothing changed.
		this.sent.delete(ev.action.id);
		if (ev.payload.controller === "Keypad") stop();
	}

	// The username comes from GitHub along with the data, so before the
	// first load there's nowhere to go yet.
	override async onKeyDown(): Promise<void> {
		if (store.login) {
			await streamDeck.system.openUrl(`https://github.com/${store.login}`);
		}
	}

	private async showAll(): Promise<void> {
		for (const key of this.actions) {
			if (key.isKey()) await this.show(key);
		}
	}

	// There are no words on this key, same as the graph dial. When
	// something's off it draws in gray, and the reason is on the Status
	// line in the Stream Deck app (see status() in data.ts).
	private async show(key: KeyAction<{}>): Promise<void> {
		const gray = !store.today || store.updating || store.message !== undefined;

		// Before the first download GitHub hasn't said what today is, so
		// the Mac's date stands in to lay out the empty grid. The weeks run
		// from the Sunday six weeks back to this Saturday, GitHub style, so
		// the top row is always a whole week.
		const today = store.today || new Date().toLocaleDateString("en-CA");
		const sunday = addDays(today, -weekday(today));
		const columns = weekColumns(addDays(sunday, -(HEATMAP_WEEKS - 1) * 7), addDays(sunday, 6));

		const image = drawHeatmap(columns, store.days, gray);
		if (this.sent.get(key.id) === image) return;
		this.sent.set(key.id, image);
		await key.setImage(image);
	}
}
