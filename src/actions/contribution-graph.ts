import streamDeck, {
	action,
	type DialAction,
	type DialDownEvent,
	type DialRotateEvent,
	SingletonAction,
	type TouchTapEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { drawGraph, WEEKS_SHOWN } from "../draw";
import { type Contributions, fetchContributions } from "../github";

// These are the plugin's global settings, filled in from the settings page.
// The token lives here and not in the dial's own settings because per-action
// settings are saved as plain text and travel along when a profile is exported.
type GlobalSettings = {
	token?: string;
	refreshMinutes?: string;
};

const DEFAULT_MINUTES = 30;

@action({ UUID: "com.malikacodes.github-graph.graph" })
export class ContributionGraph extends SingletonAction {
	// Stream Deck makes one of these objects for the whole plugin, even if the
	// graph is on several dials. So the data is shared, and the only thing
	// each dial keeps for itself is how far back it's scrolled.
	private data?: Contributions;
	private message?: string;
	private weeksBack = new Map<string, number>();

	private started = false;
	private nextRefresh?: NodeJS.Timeout;
	private settingsSettled?: NodeJS.Timeout;

	constructor() {
		super();

		// Fires when something changes on the settings page. The token field
		// saves while you're still typing or pasting, so wait a second for it
		// to settle before trying the new token on GitHub.
		streamDeck.settings.onDidReceiveGlobalSettings(() => {
			clearTimeout(this.settingsSettled);
			this.settingsSettled = setTimeout(() => this.refresh(), 1000);
		});
	}

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		if (!ev.action.isDial()) return;

		this.weeksBack.set(ev.action.id, 0);
		await this.show(ev.action);

		// The first dial to show up kicks off the first download. After that
		// the timer in refresh() keeps it going.
		if (!this.started) {
			this.started = true;
			await this.refresh();
		}
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.weeksBack.delete(ev.action.id);
	}

	// Pressing the dial refreshes. The dots are there so a press visibly does
	// something even when the numbers come back the same.
	override async onDialDown(ev: DialDownEvent): Promise<void> {
		await ev.action.setFeedback({ range: "..." });
		await this.refresh();
	}

	// Turning left goes back in time, turning right comes forward again.
	// ticks is negative for a left turn, which is why it's subtracted.
	override async onDialRotate(ev: DialRotateEvent): Promise<void> {
		const oldest = Math.max(0, (this.data?.weeks.length ?? 0) - WEEKS_SHOWN);
		const current = this.weeksBack.get(ev.action.id) ?? 0;
		const moved = Math.min(oldest, Math.max(0, current - ev.payload.ticks));

		this.weeksBack.set(ev.action.id, moved);
		await this.show(ev.action);
	}

	override async onTouchTap(ev: TouchTapEvent): Promise<void> {
		this.weeksBack.set(ev.action.id, 0);
		await this.show(ev.action);
	}

	// Downloads fresh data and redraws every dial. If the download fails,
	// this.data is left alone, so the last good graph stays up and only the
	// text line changes to say what went wrong.
	private async refresh(): Promise<void> {
		const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();

		// Restart the countdown on every refresh, whether it came from the
		// timer, a dial press, or a settings change. That way a manual refresh
		// doesn't get followed by an automatic one a minute later.
		const minutes = Number(settings.refreshMinutes) || DEFAULT_MINUTES;
		clearTimeout(this.nextRefresh);
		this.nextRefresh = setTimeout(() => this.refresh(), minutes * 60 * 1000);

		const result = await fetchContributions(settings.token?.trim());
		if (result.ok) {
			this.data = result.data;
			this.message = undefined;
		} else {
			this.message = result.message;
			// Only the short message gets logged. The token never goes near the log.
			streamDeck.logger.warn(`Refresh failed: ${result.message}`);
		}

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
		if (this.message) {
			total = this.message;
		} else if (this.data) {
			total = `${this.data.total.toLocaleString("en-US")} in ${this.data.year}`;
		}

		await dial.setFeedback({
			graph: drawGraph(this.data?.weeks ?? [], back),
			total,
			range: back === 0 ? "" : `${back} wk back`,
		});
	}
}
