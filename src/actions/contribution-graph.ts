import {
	action,
	type DialAction,
	type DialDownEvent,
	type DialRotateEvent,
	SingletonAction,
	type TouchTapEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { weekColumns } from "../calendar";
import { onChange, refresh, start, store } from "../data";
import { drawGraph, WEEKS_SHOWN } from "../draw";

@action({ UUID: "com.malikacodes.github-graph.graph" })
export class ContributionGraph extends SingletonAction {
	// Stream Deck makes one of these objects for the whole plugin, even if the
	// graph is on several dials. The data is in the shared store, so the only
	// thing each dial keeps for itself is how far back it's scrolled.
	private weeksBack = new Map<string, number>();

	constructor() {
		super();
		onChange(() => this.showAll());
	}

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		if (!ev.action.isDial()) return;

		this.weeksBack.set(ev.action.id, 0);
		await this.show(ev.action);
		start();
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.weeksBack.delete(ev.action.id);
	}

	// Pressing the dial refreshes. The dots are there so a press visibly does
	// something even when the numbers come back the same.
	override async onDialDown(ev: DialDownEvent): Promise<void> {
		await ev.action.setFeedback({ range: "..." });
		await refresh();
	}

	// Turning left goes back in time, turning right comes forward again.
	// ticks is negative for a left turn, which is why it's subtracted.
	override async onDialRotate(ev: DialRotateEvent): Promise<void> {
		const oldest = Math.max(0, this.columns().length - WEEKS_SHOWN);
		const current = this.weeksBack.get(ev.action.id) ?? 0;
		const moved = Math.min(oldest, Math.max(0, current - ev.payload.ticks));

		this.weeksBack.set(ev.action.id, moved);
		await this.show(ev.action);
	}

	override async onTouchTap(ev: TouchTapEvent): Promise<void> {
		this.weeksBack.set(ev.action.id, 0);
		await this.show(ev.action);
	}

	// The last 12 months, as week columns.
	private columns(): (string | undefined)[][] {
		return weekColumns(store.windowStart, store.today);
	}

	private async showAll(): Promise<void> {
		for (const dial of this.actions) {
			if (dial.isDial()) await this.show(dial);
		}
	}

	// Sends one dial its picture and text. The keys (graph, total, range)
	// match the item names in layouts/graph.json. The {} is the dial's own
	// settings, which are empty because everything is in global settings.
	private async show(dial: DialAction<{}>): Promise<void> {
		const back = this.weeksBack.get(dial.id) ?? 0;

		let total = "Loading...";
		if (store.message) {
			total = store.message;
		} else if (store.today) {
			total = `${store.total.toLocaleString("en-US")} in ${store.year}`;
		}

		await dial.setFeedback({
			graph: drawGraph(this.columns(), store.days, back),
			total,
			range: back === 0 ? "" : `${back} wk back`,
		});
	}
}
