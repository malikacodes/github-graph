import streamDeck from "@elgato/streamdeck";

import { type Day, fetchRecent, fetchYear, type Result } from "./github.ts";
import { register, safely, unregister } from "./refresh.ts";

// These are the plugin's global settings, filled in from the settings page.
// The token lives here and not in an action's own settings because those
// are saved as plain text and travel along when a profile is exported.
export type GlobalSettings = {
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
	// often the clock ticks. The stats key uses these to say how fresh the
	// numbers are.
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

// How many graphs and keys are showing right now. The first one puts the
// contributions job on the clock and the last one to go takes it off, so
// GitHub isn't asked for my days while no graph is on screen.
let showing = 0;
let answering = false;

// Actions call this once to say "run this whenever the whiteboard changes".
export function onChange(redraw: () => void): void {
	listeners.push(redraw);
}

// Called by every graph and key when it shows up, and stop() when it goes.
// The clock runs the job right away for the first one, then on every beat
// (see refresh.ts). The job says whether it worked, which is what gets a
// second try after the Mac wakes up.
export function start(): void {
	showing++;
	if (showing > 1) return;

	// A settings page asks for the status when it opens (see ui/status.js).
	// After that, changed() keeps it up to date for as long as it's open.
	// Only that exact question gets an answer, since the repo pickers
	// send their own questions through the same door. Listened for once,
	// however many times the job comes and goes.
	if (!answering) {
		answering = true;
		streamDeck.ui.onSendToPlugin((ev) => {
			if (ev.payload !== "status") return;
			safely(streamDeck.ui.sendToPropertyInspector(status()), "status");
		});
	}

	register("contributions", async () => {
		await refresh();
		return !store.message;
	});
}

export function stop(): void {
	showing = Math.max(0, showing - 1);
	if (showing === 0) unregister("contributions");
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
	safely(streamDeck.ui.sendToPropertyInspector(status()), "status");
}

// What's going on, as one plain sentence for the Status line on the
// settings pages. The single dial has no words on it and just goes gray
// when something's off, so this is where the reason lives. It's words
// only. The token never goes in here. The cases are the messages that
// github.ts hands back, so a reworded message there needs rewording here.
// The whiteboard is passed in so the tests can hand over a made-up one.
export function status({ updating, message, fetchedAt }: Pick<typeof store, "updating" | "message" | "fetchedAt"> = store): string {
	if (updating) return "Checking GitHub...";

	switch (message) {
		case undefined:
			break;
		case "Add a token in settings":
			return "Add a token below.";
		case "No internet":
			return "No internet. Showing the last numbers I got.";
		case "Token didn't work":
			return "The token didn't work. It may have expired.";
		case "Token can't read this":
			return "The token isn't allowed to read my profile.";
		default:
			return `${message}. It usually clears up on its own.`;
	}

	if (!fetchedAt) return "Loading...";

	const time = new Date(fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
	return `Up to date. Last checked ${time}.`;
}

// The colors the contribution keys write their bottom line in.
const GREY = "#8b949e";
const RED = "#f85149";

// The few words along the bottom of the stats, goal and streak keys, and
// the color to write them in. small is empty when there's nothing to say,
// so each key can put its own everyday line there ("of 5", the age of the
// numbers). ready says whether there are numbers to show at all: before
// the first download the keys draw a dash instead. The whiteboard is
// passed in so the tests can hand over a made-up one.
export function bottomLine({
	updating,
	message,
	shortMessage,
	fetchedAt,
}: Pick<typeof store, "updating" | "message" | "shortMessage" | "fetchedAt"> = store): { small: string; color: string; ready: boolean } {
	// Before the first download a press has nothing to update yet, so the
	// line stays on loading (or on what went wrong) until numbers arrive.
	if (!fetchedAt) return { small: shortMessage ?? "loading", color: message ? RED : GREY, ready: false };
	if (updating) return { small: "updating", color: GREY, ready: true };
	if (message) return { small: shortMessage ?? message, color: RED, ready: true };
	return { small: "", color: GREY, ready: true };
}

// Downloads the last 12 months again and tells every action to redraw.
// A refresh that starts while one is still on its way joins it instead
// of asking GitHub twice: the clock's beat, a press, the settings page and
// waking up can all land in the same second.
let inFlight: Promise<void> | undefined;
export function refresh(): Promise<void> {
	inFlight ??= download().finally(() => {
		inFlight = undefined;
	});
	return inFlight;
}

async function download(): Promise<void> {
	const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();

	// The stats key uses this to say how fresh the numbers are. The clock
	// reads the same setting for its beat.
	store.refreshMinutes = Number(settings.refreshMinutes) || DEFAULT_MINUTES;

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
	if (result.ok && historyWanted) safely(loadHistory(), "history");
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
	if (store.fetchedAt) safely(loadHistory(), "history");
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
