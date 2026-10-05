import streamDeck from "@elgato/streamdeck";

import { type Day, fetchRecent, fetchYear } from "./github";

// These are the plugin's global settings, filled in from the settings page.
// The token lives here and not in an action's own settings because those
// are saved as plain text and travel along when a profile is exported.
type GlobalSettings = {
	token?: string;
	refreshMinutes?: string;
};

const DEFAULT_MINUTES = 30;

// Everything the plugin knows about my contributions, in one place. Every
// action reads from this, so GitHub gets asked once no matter how many
// dials are showing a graph. Think of it as one shared whiteboard: one
// person writes on it, everyone else just looks.
export const store = {
	// Every day we've been sent, looked up by its date.
	days: new Map<string, Day>(),

	// The first and last day of the "last 12 months" window. today comes
	// from GitHub and not from the Mac's clock, because GitHub decides when
	// my day rolls over.
	windowStart: "",
	today: "",

	total: 0,
	year: 0,
	joined: 0,

	// Set when the last request failed, cleared when one works. days is
	// left alone on a failure, so the last good graph stays up.
	message: undefined as string | undefined,
	shortMessage: undefined as string | undefined,
};

// Past years never change, so once one is loaded it's kept until Stream
// Deck quits. busyYears stops a fast spin of the dial from asking for the
// same year several times while the first answer is still on its way.
const loadedYears = new Set<number>();
const busyYears = new Set<number>();

const listeners: (() => void)[] = [];
let started = false;
let nextRefresh: NodeJS.Timeout | undefined;
let settingsSettled: NodeJS.Timeout | undefined;

// Actions call this once to say "run this whenever the whiteboard changes".
export function onChange(redraw: () => void): void {
	listeners.push(redraw);
}

// Called by every action when it shows up. Only the first call does anything.
export function start(): void {
	if (started) return;
	started = true;

	// Fires when something changes on the settings page. The token field
	// saves while you're still typing or pasting, so wait a second for it
	// to settle before trying the new token on GitHub.
	streamDeck.settings.onDidReceiveGlobalSettings(() => {
		clearTimeout(settingsSettled);
		settingsSettled = setTimeout(refresh, 1000);
	});

	void refresh();
}

async function token(): Promise<string | undefined> {
	const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
	return settings.token?.trim();
}

function failed(message: string, short: string): void {
	store.message = message;
	store.shortMessage = short;
	// Only the short message gets logged. The token never goes near the log.
	streamDeck.logger.warn(`GitHub request failed: ${message}`);
}

function changed(): void {
	for (const redraw of listeners) redraw();
}

// Downloads the last 12 months again and tells every action to redraw.
export async function refresh(): Promise<void> {
	const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();

	// Restart the countdown on every refresh, whether it came from the
	// timer, a dial press, or a settings change. That way a manual refresh
	// doesn't get followed by an automatic one a minute later.
	const minutes = Number(settings.refreshMinutes) || DEFAULT_MINUTES;
	clearTimeout(nextRefresh);
	nextRefresh = setTimeout(refresh, minutes * 60 * 1000);

	const result = await fetchRecent(settings.token?.trim());
	if (result.ok) {
		const { days, total, year, joined } = result.data;
		for (const day of days) store.days.set(day.date, day);

		store.windowStart = days[0]?.date ?? "";
		store.today = days[days.length - 1]?.date ?? "";
		store.total = total;
		store.year = year;
		store.joined = joined;
		store.message = undefined;
		store.shortMessage = undefined;
	} else {
		failed(result.message, result.short);
	}

	changed();
}

// The current year is always covered by the regular refresh. Older years
// have to be asked for.
export function hasYear(year: number): boolean {
	return year === store.year || loadedYears.has(year);
}

export async function loadYear(year: number): Promise<void> {
	if (hasYear(year) || busyYears.has(year)) return;
	busyYears.add(year);

	const result = await fetchYear(await token(), year);
	if (result.ok) {
		for (const day of result.data) store.days.set(day.date, day);
		loadedYears.add(year);
	} else {
		failed(result.message, result.short);
	}

	busyYears.delete(year);
	changed();
}
