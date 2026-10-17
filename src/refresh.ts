// The one clock every refresh in the plugin runs on. Each kind of key or
// dial registers one job when its first key shows up and unregisters it
// when the last one goes, and the clock runs every job on the beat: every
// so many minutes (the refresh time on the settings page), a minute past
// midnight, after the Mac wakes up, and a second after the settings change.
// With nothing registered there's no timer at all, so a page with none of
// my keys on it costs nothing.
//
// This file never imports the Stream Deck SDK. Importing it makes a logs
// folder wherever the process runs, which the tests don't want, so
// plugin.ts hands the clock its log line and its two events instead.

export type Job = () => Promise<boolean | void>;

const DEFAULT_MINUTES = 30;

const jobs = new Map<string, Job>();
const resets: (() => void)[] = [];
let minutes = DEFAULT_MINUTES;
let tick: NodeJS.Timeout | undefined;
let midnight: NodeJS.Timeout | undefined;
let settled: NodeJS.Timeout | undefined;
let lastSettings: string | undefined;

// Jobs run one at a time, in the order they were asked for, so nine keys
// appearing together don't ask GitHub nine things in the same second.
// lane is the end of the line: each new piece of work waits for it.
let lane: Promise<unknown> = Promise.resolve();
let queued = false;

function inTurn<T>(work: () => Promise<T>): Promise<T> {
	const next = lane.then(work);
	lane = next.catch(() => {});
	return next;
}

let log = (line: string): void => console.error(line);

// Where errors go. plugin.ts points this at the Stream Deck log.
export function logWith(write: (line: string) => void): void {
	log = write;
}

// Runs something in the background and writes any error to the log.
// Without this, one unexpected error from a timer would stop the whole
// plugin, since Node quits on an error nobody catches.
export function safely(work: Promise<unknown>, what = "refresh"): void {
	work.catch((error) => log(`${what} failed: ${error}`));
}

// Adds a job and runs it right away, since a key that just appeared wants
// its numbers now. The first job starts the clock. Registering the same
// name again just swaps the job in.
export function register(name: string, job: Job): void {
	const first = jobs.size === 0;
	jobs.set(name, job);
	if (first) arm();
	safely(inTurn(() => runOne(name, job)), name);
}

// The last job to leave stops the clock, so nothing ticks for keys that
// aren't on screen. It forgets the settings it saw too: the next key to
// show up runs its job on arrival anyway, so there's nothing to compare
// against until the settings change again.
export function unregister(name: string): void {
	jobs.delete(name);
	if (jobs.size > 0) return;
	clearTimeout(tick);
	clearTimeout(midnight);
	clearTimeout(settled);
	tick = midnight = settled = undefined;
	lastSettings = undefined;
}

// Called before the jobs after a real settings change. A new token can
// belong to someone else, so whoever caches something about the token's
// owner (the username, the repo list, a key's numbers) forgets it here.
export function onSettingsChange(reset: () => void): void {
	resets.push(reset);
}

// Fires whenever the settings page saves, which the token box does after
// every keystroke, and whenever anything reads the settings (my pretend
// deck echoes them back). Only a real change to the token or the refresh
// time counts, and the very first arrival just says how often to tick.
// Then it waits a second for the typing to stop before trying the new
// token on GitHub.
export function settingsChanged(settings: { token?: string; refreshMinutes?: string }): void {
	const now = `${settings.token ?? ""}|${settings.refreshMinutes ?? ""}`;
	if (now === lastSettings) return;
	const first = lastSettings === undefined;
	lastSettings = now;
	minutes = Number(settings.refreshMinutes) || DEFAULT_MINUTES;
	if (first) return;

	clearTimeout(settled);
	settled = setTimeout(() => {
		for (const reset of resets) reset();
		safely(runAll());
	}, 1000);
}

// A timer can be hours late after the Mac has been asleep, so waking up
// gets a refresh of its own. Wi-Fi usually takes a few seconds to come
// back, which is why it waits first, and why a job that says it failed
// gets one more try. Without that the keys would say "No internet" until
// the next tick came around.
export function wokeUp(): void {
	setTimeout(() => {
		safely(
			runAll().then((allGood) => {
				if (!allGood) setTimeout(() => safely(runAll()), 20 * 1000);
			}),
		);
	}, 5 * 1000);
}

// Sets the next tick and the midnight alarm. Every run of the jobs resets
// the countdown, so a refresh from the settings page isn't followed by
// the timer's own a minute later.
function arm(): void {
	clearTimeout(tick);
	tick = setTimeout(() => safely(runAll()), minutes * 60 * 1000);

	// store.today in data.ts only moves when a refresh happens, so without
	// this the daily goal key would show yesterday's full ring until the
	// regular tick came around, which can be hours. The extra minute is so
	// GitHub has rolled over too by the time it's asked. Hour 24 doesn't
	// exist, so the date rolls over to tomorrow at 00:01.
	if (midnight) return;
	const alarm = new Date();
	alarm.setHours(24, 1, 0, 0);
	midnight = setTimeout(() => {
		midnight = undefined;
		safely(runAll());
	}, alarm.getTime() - Date.now());
}

// One job, with its failure (a false, or a throw) kept from the others.
async function runOne(name: string, job: Job): Promise<boolean> {
	try {
		return (await job()) !== false;
	} catch (error) {
		log(`${name} refresh failed: ${error}`);
		return false;
	}
}

// Every job in turn. A second round asked for while one is still waiting
// its turn is the same round: the beat, a settings change and waking up
// can all land in the same second, and one pass covers them.
function runAll(): Promise<boolean> {
	if (queued) return Promise.resolve(true);
	queued = true;
	return inTurn(async () => {
		queued = false;
		let allGood = true;
		for (const [name, job] of jobs) {
			if (!(await runOne(name, job))) allGood = false;
		}
		if (jobs.size > 0) arm();
		return allGood;
	});
}
