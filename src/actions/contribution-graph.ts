import streamDeck, {
	action,
	type DialAction,
	type DialRotateEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { addDays, weekColumns, weekday } from "../calendar";
import { onChange, refresh, start, store } from "../data";
import { drawGraph, drawRows, WEEKS_SHOWN } from "../draw";

// The time ranges the dial turns through, in order. words is what goes
// after the number in the text line ("23 in 7 days").
// The first one is drawn GitHub style, as week columns. The others are
// drawn as rows of days: perRow is how many days go on a line, and step is
// how many pixels each square takes up including its gap.
const RANGES = [
	{ id: "19w", words: "in 19 weeks" },
	{ id: "8w", words: "in 8 weeks", days: 56, perRow: 14, step: 13 },
	{ id: "4w", words: "in 4 weeks", days: 28, perRow: 7, step: 17 },
	{ id: "14d", words: "in 14 days", days: 14, perRow: 7, step: 26 },
	{ id: "7d", words: "in 7 days", days: 7, perRow: 7, step: 26 },
	{ id: "week", words: "this week", perRow: 7, step: 26 },
	{ id: "month", words: "", perRow: 7 },
];

// The one thing each dial remembers for itself. It's not secret, so it's
// fine in the dial's own settings, and it means the range is still there
// after Stream Deck restarts.
type Settings = {
	range?: string;
};

@action({ UUID: "com.malikacodes.github-graph.graph" })
export class ContributionGraph extends SingletonAction<Settings> {
	// Stream Deck makes one of these objects for the whole plugin, even if the
	// graph is on several dials. This keeps track of which range each dial
	// is on, as a position in RANGES.
	private range = new Map<string, number>();

	// True for a moment after a press, so the dial can say so.
	private updating = false;

	constructor() {
		super();
		onChange(() => this.showAll());
	}

	override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		if (!ev.action.isDial()) return;

		// A dial that's never been turned has no saved range, and findIndex
		// answers -1 for "not found". Both end up on the first range.
		const saved = RANGES.findIndex((range) => range.id === ev.payload.settings.range);
		this.range.set(ev.action.id, Math.max(0, saved));

		await this.show(ev.action);
		start();
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		this.range.delete(ev.action.id);
	}

	// Pressing the dial refreshes. GitHub usually answers in well under a
	// second and the graph often comes back identical, so "updating" stays
	// up for at least a full second. Otherwise there's no way to tell the
	// press did anything.
	override async onDialDown(): Promise<void> {
		this.updating = true;
		await this.showAll();
		await Promise.all([refresh(), new Promise((done) => setTimeout(done, 1000))]);
		this.updating = false;
		await this.showAll();
	}

	// Turning steps through the ranges and wraps around at either end, so
	// it never hits a wall. The odd looking math is because % can give a
	// negative answer when turning left past the first one.
	override async onDialRotate(ev: DialRotateEvent<Settings>): Promise<void> {
		const current = this.range.get(ev.action.id) ?? 0;
		const next = (((current + ev.payload.ticks) % RANGES.length) + RANGES.length) % RANGES.length;

		this.range.set(ev.action.id, next);
		await ev.action.setSettings({ range: RANGES[next].id });
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

	// Sends one dial its picture and text. The keys (graph, total, range)
	// match the item names in layouts/graph.json.
	private async show(dial: DialAction<Settings>): Promise<void> {
		const range = RANGES[this.range.get(dial.id) ?? 0];
		const today = store.today;

		// Work out which dates this range covers, and draw them.
		let dates: (string | undefined)[] = [];
		let graph: string;
		let words = range.words;
		let step = range.step ?? 10;

		if (range.id === "19w") {
			// Start on the Sunday 18 weeks before this week, GitHub style.
			const columns = today ? weekColumns(addDays(today, -(WEEKS_SHOWN - 1) * 7 - weekday(today)), today) : [];
			dates = columns.flat();
			graph = drawGraph(columns, store.days);
		} else {
			if (!today) {
				// Nothing loaded yet, so there's nothing to lay out.
			} else if (range.days) {
				// The last N days, ending today in the bottom right corner.
				for (let i = range.days - 1; i >= 0; i--) dates.push(addDays(today, -i));
			} else if (range.id === "week") {
				// Sunday to Saturday. The days still to come show as dark squares.
				const sunday = addDays(today, -weekday(today));
				for (let i = 0; i < 7; i++) dates.push(addDays(sunday, i));
			} else {
				// This month as a little calendar page: blanks first so the
				// 1st sits under its weekday, then every day of the month.
				const first = `${today.slice(0, 8)}01`;
				dates = new Array(weekday(first)).fill(undefined);
				for (let date = first; date.slice(0, 7) === first.slice(0, 7); date = addDays(date, 1)) dates.push(date);
				// Most months take 5 rows and fit 12px squares. A month that
				// spills into a 6th row has to shrink to fit the height.
				step = dates.length > 35 ? 11 : 14;
				words = `in ${new Date(`${first}T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" })}`;
			}
			graph = drawRows(dates, store.days, range.perRow ?? 7, step);
		}

		// Add up the range for the text line. Days with no data (the future
		// ones) just count as zero.
		let sum = 0;
		for (const date of dates) sum += (date && store.days.get(date)?.count) || 0;

		let total = "Loading...";
		if (store.message) {
			total = store.message;
		} else if (today) {
			total = `${sum.toLocaleString("en-US")} ${words}`;
		}

		await dial.setFeedback({
			graph,
			total,
			range: this.updating ? "updating" : "",
		});
	}
}
