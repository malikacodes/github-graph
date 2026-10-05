import {
	action,
	type DialAction,
	type DialRotateEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";

import { weekColumns } from "../calendar";
import { hasYear, loadYear, onChange, refresh, start, store } from "../data";
import { drawWide } from "../draw";

// The graph stretched across all four dials. Each dial draws its own
// quarter of one 800px picture (see drawWide), so this action goes on
// every dial of a page.
@action({ UUID: "com.malikacodes.github-graph.wide" })
export class WideGraph extends SingletonAction {
	// Which stretch of time is showing, shared by all four slots.
	// 0 is the last 12 months, 1 is this calendar year, 2 is last year,
	// and so on back to the year I joined GitHub.
	private stepsBack = 0;

	// True for a moment after a press, so the label can say so.
	private updating = false;

	constructor() {
		super();
		onChange(() => this.showAll());
	}

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		if (!ev.action.isDial()) return;

		await this.show(ev.action);
		start();
	}

	// Pressing any dial refreshes. GitHub usually answers in well under a
	// second and the graph often comes back identical, so the label says
	// "updating" for at least a full second. Otherwise there's no way to
	// tell the press did anything.
	override async onDialDown(): Promise<void> {
		this.updating = true;
		await this.showAll();
		await Promise.all([refresh(), new Promise((done) => setTimeout(done, 1000))]);
		this.updating = false;
		await this.showAll();
	}

	// Only the first dial changes the year. The other three ignore turns, so
	// brushing one by accident doesn't move the whole strip.
	override async onDialRotate(ev: DialRotateEvent): Promise<void> {
		if (ev.action.coordinates.column !== 0 || !store.today) return;

		// Left (negative ticks) goes back in time, same as the single dial.
		const oldest = 1 + store.year - store.joined;
		this.stepsBack = Math.min(oldest, Math.max(0, this.stepsBack - ev.payload.ticks));
		await this.showAll();

		// A year that hasn't been downloaded yet shows as a dark grid first.
		// loadYear redraws everything when the real days arrive.
		const year = this.year();
		if (year && !hasYear(year)) await loadYear(year);
	}

	override async onTouchTap(): Promise<void> {
		this.stepsBack = 0;
		await this.showAll();
	}

	// The calendar year that's showing, or undefined for the last 12 months.
	private year(): number | undefined {
		return this.stepsBack === 0 ? undefined : store.year - (this.stepsBack - 1);
	}

	private async showAll(): Promise<void> {
		for (const dial of this.actions) {
			if (dial.isDial()) await this.show(dial);
		}
	}

	private async show(dial: DialAction<{}>): Promise<void> {
		const year = this.year();
		const columns = year
			? weekColumns(`${year}-01-01`, `${year}-12-31`)
			: weekColumns(store.windowStart, store.today);

		// The label and legend words live in the last slot's right-hand
		// column. All four slots share one layout, so the other three get
		// empty text. A failed request puts its message where the label goes.
		const slot = dial.coordinates.column;
		const last = slot === 3;
		let label = store.shortMessage ?? (year ? String(year) : "12 mo");
		if (this.updating) label = "updating";

		// "2026" fits the 52px column at the normal size. Longer words like
		// "updating" or "Bad token" need smaller letters to fit.
		const font = { size: label.length > 5 ? 10 : 14, weight: 600 };

		await dial.setFeedback({
			strip: drawWide(columns, store.days, slot),
			label: last ? { value: label, font } : "",
			less: last ? "Less" : "",
			more: last ? "More" : "",
		});
	}
}
