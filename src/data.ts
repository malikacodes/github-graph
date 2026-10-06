import streamDeck from "@elgato/streamdeck";

import { type Day, fetchRecent, fetchYear, type Result } from "./github";

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
	login: "",

	// When the last successful download finished (0 means never), and how
	// often the timer is set to run. The stats key uses these to say how
	// fresh the numbers are.
	fetchedAt: 0,
	refreshMinutes: DEFAULT_MINUTES,

	// True for a moment after a press, so every view can say "updating".
	updating: false,

	// Set when the last request failed, cleared when one works. days is
	// left alone on a failure, so the last good graph stays up.
	message: undefined as string | undefined,
	shortMessage: undefined as string | undefined,

	// True once every year before this one is in days. Until then a streak
	// that runs back further than the last 12 months can come out short.
	historyReady: false,
};

// Past years never change, so once one is loaded it's kept until Stream
// Deck quits. busyYears stops a fast spin of the dial from asking for the
// same year several times while the first answer is still on its way.
const loadedYears = new Set<number>();
const busyYears = new Set<number>();

// Nobody needs every past year until a streak key is on the deck, so this
// stays false until one shows up.
let historyWanted = false;

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

	// A timer can be hours late after the Mac has been asleep, so waking up
	// triggers a refresh of its own. Wi-Fi usually takes a few seconds to
	// come back, which is why it waits first, and why it gets one more try
	// if the first one fails. Without that, the dials would say "No
	// internet" until the next timer came around.
	streamDeck.system.onSystemDidWakeUp(() => {
		setTimeout(async () => {
			await refresh();
			if (store.message) setTimeout(refresh, 20 * 1000);
		}, 5 * 1000);
	});

	void refresh();
	refreshAfterMidnight();
}

// store.today only moves when a refresh happens, so without this the daily
// goal key would keep showing yesterday's full ring until the regular
// timer came around, which can be hours. This is an alarm clock set for
// one minute past midnight on the Mac's clock. When it goes off it
// refreshes and then sets itself again for the next night. The extra
// minute is there so GitHub has rolled over too by the time it's asked.
function refreshAfterMidnight(): void {
	// Hour 24 doesn't exist, so the date rolls over to tomorrow at 00:01.
	const alarm = new Date();
	alarm.setHours(24, 1, 0, 0);

	setTimeout(() => {
		void refresh();
		refreshAfterMidnight();
	}, alarm.getTime() - Date.now());
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
	store.refreshMinutes = minutes;
	clearTimeout(nextRefresh);
	nextRefresh = setTimeout(refresh, minutes * 60 * 1000);

	const result = await fetchRecent(settings.token?.trim());
	if (result.ok) {
		const { days, total, year, joined, login } = result.data;

		// A different username means the token now belongs to another
		// account. Everything from the old one is thrown out first, or two
		// people's days would end up mixed on the same graph.
		if (store.login && login !== store.login) {
			store.days.clear();
			loadedYears.clear();
			store.historyReady = false;
		}
		for (const day of days) store.days.set(day.date, day);

		store.windowStart = days[0]?.date ?? "";
		store.today = days[days.length - 1]?.date ?? "";
		store.total = total;
		store.year = year;
		store.joined = joined;
		store.login = login;
		store.fetchedAt = Date.now();
		store.message = undefined;
		store.shortMessage = undefined;
	} else {
		failed(result.message, result.short);
	}

	changed();

	// Not waited for. The past years can take a few seconds the first time,
	// and a press shouldn't sit on "updating" for all of it.
	if (result.ok && historyWanted) void loadHistory();
}

// What a press does on every action. GitHub usually answers in well under
// a second and the numbers often come back identical, so "updating" stays
// up for at least a full second. Otherwise there's no way to tell the
// press did anything.
//
// A second press while the first is still going does nothing. Without that,
// whichever press finished first would turn "updating" off while the other
// one was still waiting on GitHub.
export async function refreshNow(): Promise<void> {
	if (store.updating) return;

	store.updating = true;
	changed();
	await Promise.all([refresh(), new Promise((done) => setTimeout(done, 1000))]);
	store.updating = false;
	changed();
}

// The current year is always covered by the regular refresh. Older years
// have to be asked for.
export function hasYear(year: number): boolean {
	return year === store.year || loadedYears.has(year);
}

// Asks GitHub for one past year and adds its days to the whiteboard. Both
// the full-width dial and the streak history get their years through here.
// What to do when it fails is left to whoever asked, because the two of
// them want different things.
async function pullYear(year: number): Promise<Result<Day[]>> {
	busyYears.add(year);
	const login = store.login;

	const result = await fetchYear(await token(), year);

	// If the token was switched to another account while this was on its
	// way, the answer belongs to an account that isn't on the whiteboard
	// any more (or isn't yet), so it's dropped.
	if (result.ok && login === store.login) {
		for (const day of result.data) store.days.set(day.date, day);
		loadedYears.add(year);
	}

	busyYears.delete(year);
	return result;
}

// Works out whether every past year is in. It's asked after anything that
// loads a year, because the last missing one can come from either side:
// the history loading, or the full-width dial being turned to that year.
function checkHistory(): void {
	store.historyReady = true;
	for (let year = store.joined; year < store.year; year++) {
		if (!loadedYears.has(year)) store.historyReady = false;
	}
}

export async function loadYear(year: number): Promise<void> {
	if (hasYear(year) || busyYears.has(year)) return;

	const result = await pullYear(year);
	if (!result.ok) failed(result.message, result.short);

	checkHistory();
	changed();
}

// The streak key calls this when it shows up. From then on every refresh
// also makes sure the past years are in.
export function wantHistory(): void {
	if (historyWanted) return;
	historyWanted = true;

	// If the first download hasn't happened yet there's no "year I joined"
	// to start from, and the refresh that brings it will start this itself.
	if (store.fetchedAt) void loadHistory();
}

// Loads every year from the one I joined GitHub up to last year, one
// request per year, skipping the ones already here. After the first time
// there's nothing left to ask for and this does nothing, except in January,
// when last year becomes a past year and gets picked up.
//
// A year that fails here doesn't touch store.message. The last 12 months
// are fine, so the graphs and the other keys have no reason to turn red.
// historyReady just stays false, and since this runs after every refresh
// that works, the missing years get another try then.
async function loadHistory(): Promise<void> {
	const wasReady = store.historyReady;
	let asked = false;
	for (let year = store.joined; year < store.year; year++) {
		if (hasYear(year) || busyYears.has(year)) continue;
		asked = true;

		const result = await pullYear(year);
		if (!result.ok) {
			// Whatever stopped this year (no internet, a bad token) would
			// stop the rest too, so there's no point asking for them now.
			streamDeck.logger.warn(`Couldn't load ${year} for the streak: ${result.message}`);
			break;
		}
	}

	// Everyone redraws once at the end, not once per year. Nothing on the
	// keys changes until the whole history is in anyway. An account made
	// this year has no past years to ask for, and still has to hear that
	// its history is ready.
	checkHistory();
	if (asked || store.historyReady !== wasReady) changed();
}
