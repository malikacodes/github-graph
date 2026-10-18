import assert from "node:assert";
import { afterEach, beforeEach, mock, test } from "node:test";

import { logWith, onSettingsChange, register, settingsChanged, unregister, wokeUp } from "../src/refresh.ts";

// The clock is all timers, so these tests run on a pretend clock: tick()
// moves it forward and nothing really waits. A job that resolves still
// needs a moment to land, which is what settle() gives it.
const MINUTE = 60 * 1000;
let logged: string[] = [];

beforeEach(() => {
	mock.timers.enable({ apis: ["setTimeout", "Date"], now: new Date(2026, 9, 17, 12, 0, 0).getTime() });
	logged = [];
	logWith((line) => logged.push(line));
});

afterEach(() => {
	mock.timers.reset();
	for (const name of ["a", "b", "c", "thrower"]) unregister(name);
});

async function settle(): Promise<void> {
	// setImmediate isn't on the pretend clock, so one real turn of it lets
	// every promise that's ready finish, however many awaits a job has.
	await new Promise((done) => setImmediate(done));
	await new Promise((done) => setImmediate(done));
}

// The settings arrive once at the start before anything has changed.
// That first arrival only tells the clock how often to tick.
function startWith(minutes: string): void {
	settingsChanged({ token: "t", refreshMinutes: minutes });
}

// Protects the basic beat: a job runs once when it registers, then once
// per interval, and not in between.
test("register runs the job now and then once per interval", async () => {
	let runs = 0;
	startWith("5");
	register("a", async () => void runs++);
	await settle();
	assert.strictEqual(runs, 1);

	mock.timers.tick(4 * MINUTE);
	await settle();
	assert.strictEqual(runs, 1);
	mock.timers.tick(1 * MINUTE);
	await settle();
	assert.strictEqual(runs, 2);
	mock.timers.tick(5 * MINUTE);
	await settle();
	assert.strictEqual(runs, 3);
});

// Protects GitHub from a burst: nine kinds of key appear in the same
// moment when a page opens, and their first refreshes go one after the
// other, not all at once.
test("jobs that register together run one at a time, in order", async () => {
	const order: string[] = [];
	const job = (name: string) => async () => {
		order.push(`${name} starts`);
		await Promise.resolve();
		order.push(`${name} ends`);
	};
	startWith("30");
	register("a", job("a"));
	register("b", job("b"));
	register("c", job("c"));
	await settle();
	assert.deepStrictEqual(order, ["a starts", "a ends", "b starts", "b ends", "c starts", "c ends"]);
});

// Protects the token box: it saves while I'm still pasting, so the clock
// waits a second after the last change before using the new settings, and
// then tells the listeners before running the jobs.
test("a settings change settles for a second, then resets and refreshes once", async () => {
	let runs = 0;
	const order: string[] = [];
	startWith("30");
	onSettingsChange(() => order.push("reset"));
	register("a", async () => {
		runs++;
		order.push("run");
	});
	await settle();
	runs = 0;
	order.length = 0;

	settingsChanged({ token: "ab", refreshMinutes: "30" });
	mock.timers.tick(600);
	settingsChanged({ token: "abc", refreshMinutes: "30" });
	mock.timers.tick(999);
	await settle();
	assert.strictEqual(runs, 0);
	mock.timers.tick(1);
	await settle();
	assert.strictEqual(runs, 1);
	assert.deepStrictEqual(order, ["reset", "run"]);
});

// Protects against the echo: my pretend deck sends the settings back
// unchanged after every read, and a refresh reads them, so reacting to an
// echo would loop once a second forever.
test("an echo of the same settings does nothing", async () => {
	let runs = 0;
	startWith("30");
	register("a", async () => void runs++);
	await settle();

	settingsChanged({ token: "t", refreshMinutes: "30" });
	settingsChanged({ token: "t", refreshMinutes: "30" });
	mock.timers.tick(5 * 1000);
	await settle();
	assert.strictEqual(runs, 1);
});

// Protects the "nothing on screen, nothing running" rule: once the last
// job is gone its countdown is really gone. A job that comes back starts
// a fresh one, and the old one must not fire early on top of it.
test("the last unregister stops the clock", async () => {
	let runs = 0;
	startWith("5");
	register("a", async () => void runs++);
	await settle();
	mock.timers.tick(3 * MINUTE);
	unregister("a");
	// Coming back is like starting over: the job's first refresh reads the
	// settings again, which is what sets its beat.
	register("a", async () => void runs++);
	startWith("5");
	await settle();
	assert.strictEqual(runs, 2);
	mock.timers.tick(3 * MINUTE);
	await settle();
	assert.strictEqual(runs, 2);
	mock.timers.tick(2 * MINUTE);
	await settle();
	assert.strictEqual(runs, 3);
});

// Protects the refresh time I picked: the settings arrive a moment after
// the first key registers (its first refresh reads them), and the first
// beat has to use them, not the default.
test("settings that arrive after the first job set its first beat", async () => {
	let runs = 0;
	register("a", async () => void runs++);
	await settle();
	startWith("5");
	mock.timers.tick(5 * MINUTE);
	await settle();
	assert.strictEqual(runs, 2);
});

// Protects a token pasted while a page with no keys is open: the clock
// has nothing to run, but whoever cached the old token's owner still has
// to forget it.
test("a settings change still resets when the last job left during the settle", async () => {
	let resets = 0;
	startWith("30");
	onSettingsChange(() => resets++);
	register("a", async () => {});
	await settle();
	settingsChanged({ token: "new", refreshMinutes: "30" });
	unregister("a");
	mock.timers.tick(1000);
	await settle();
	assert.strictEqual(resets, 1);
});

// Protects the other keys from one bad job: a job that throws is written
// to the log with its name, and the jobs after it still run.
test("a job that throws is logged and the others still run", async () => {
	let ran = "";
	startWith("5");
	register("thrower", async () => {
		throw new Error("boom");
	});
	register("b", async () => void (ran += "b"));
	await settle();
	mock.timers.tick(5 * MINUTE);
	await settle();
	assert.strictEqual(ran, "bb");
	assert.ok(logged.some((line) => line.includes("thrower") && line.includes("boom")));
});

// Protects the morning after: the Mac wakes up, waits for the wifi, then
// refreshes, and a job that says it failed gets one more try.
test("waking up refreshes after five seconds, and again if a job failed", async () => {
	let runs = 0;
	startWith("30");
	// The first run after waking says it failed (false), the ones after work.
	register("a", async () => {
		runs++;
		return runs !== 1;
	});
	await settle();
	runs = 0;

	wokeUp();
	mock.timers.tick(4 * 1000);
	await settle();
	assert.strictEqual(runs, 0);
	mock.timers.tick(1 * 1000);
	await settle();
	assert.strictEqual(runs, 1);
	mock.timers.tick(20 * 1000);
	await settle();
	assert.strictEqual(runs, 2);
	mock.timers.tick(20 * 1000);
	await settle();
	assert.strictEqual(runs, 2);
});

// Protects the daily goal key from showing yesterday's ring all morning:
// one minute past midnight everything refreshes, whatever the interval.
test("everything refreshes a minute past midnight", async () => {
	let runs = 0;
	mock.timers.setTime(new Date(2026, 9, 17, 23, 59, 0).getTime());
	startWith("30");
	register("a", async () => void runs++);
	await settle();
	mock.timers.tick(2 * MINUTE);
	await settle();
	assert.strictEqual(runs, 2);
});
