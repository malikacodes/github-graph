import streamDeck, {
	action,
	type DialAction,
	type DialRotateEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { addDays, weekColumns, weekday } from "../calendar";
import { onChange, refreshNow, start, store } from "../data";
import { drawGraph, drawWeek, WEEKS_SHOWN } from "../draw";

// Which of the two views a dial is on: the graph, or this week. It's the
// one thing each dial remembers for itself. It's not secret, so it's fine
// in the dial's own settings, and it means the view is still there after
// Stream Deck restarts.
type Settings = {
	view?: string;
};

@action({ UUID: "com.malikacodes.github-graph.graph" })
export class ContributionGraph extends SingletonAction<Settings> {
	// Stream Deck makes one of these objects for the whole plugin, even if the
	// graph is on several dials. This is the list of dials that are on the
	// this-week view. Any dial that isn't in it is showing the graph.
	private onWeek = new Set<string>();

	constructor() {
		super();
		onChange(() => this.showAll());
	}

	override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		if (!ev.action.isDial()) return;

		if (ev.payload.settings.view === "week") this.onWeek.add(ev.action.id);
		await this.show(ev.action);
		start();
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		this.onWeek.delete(ev.action.id);
	}

	// A press refreshes. The graph goes gray for a second while it does,
	// which is how I can tell the press did something.
	override async onDialDown(): Promise<void> {
		await refreshNow();
	}

	// Turning flips between the two views. There are only two, so it
	// doesn't matter which way or how far the dial went.
	override async onDialRotate(ev: DialRotateEvent<Settings>): Promise<void> {
		const week = !this.onWeek.has(ev.action.id);
		if (week) this.onWeek.add(ev.action.id);
		else this.onWeek.delete(ev.action.id);

		await ev.action.setSettings({ view: week ? "week" : "graph" });
		await this.show(ev.action);
	}

	// Tapping the strip opens my profile. The username comes from GitHub
	// along with the data, so before the first load there's nowhere to go.
	override async onTouchTap(): Promise<void> {
		if (store.login) {
			await streamDeck.system.openUrl(`https://github.com/${store.login}`);
		}
	}

	private async showAll(): Promise<void> {
		for (const dial of this.actions) {
			if (dial.isDial()) await this.show(dial);
		}
	}

	// Sends one dial its picture. There are no words on this dial at all.
	// When something's off the picture is drawn in gray, and the reason is
	// on the Status line in the Stream Deck app (see status() in data.ts).
	// That covers a refresh in progress, a failed one, and the moment
	// before the first download.
	private async show(dial: DialAction<Settings>): Promise<void> {
		const gray = !store.today || store.updating || store.message !== undefined;

		// Before the first download GitHub hasn't said what today is, so
		// the Mac's date stands in. It's only used to lay out the empty
		// squares, and "en-CA" is just a way to get it as 2026-10-08.
		const today = store.today || new Date().toLocaleDateString("en-CA");
		const sunday = addDays(today, -weekday(today));

		let graph: string;
		if (this.onWeek.has(dial.id)) {
			// Sunday to Saturday. The days still to come show as dark squares.
			const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(sunday, i));
			graph = drawWeek(dates, store.days, gray);
		} else {
			// Start on the Sunday 13 weeks before this week, GitHub style.
			const columns = weekColumns(addDays(sunday, -(WEEKS_SHOWN - 1) * 7), today);
			graph = drawGraph(columns, store.days, gray);
		}

		// The key (graph) matches the item name in layouts/graph.json.
		await dial.setFeedback({ graph });
	}
}
