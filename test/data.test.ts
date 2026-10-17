import assert from "node:assert";
import { test } from "node:test";

import { bottomLine, status } from "../src/data.ts";

// The Status line on the settings pages is the only place the single
// dial's reason shows, since the dial itself has no words. These protect
// each sentence, so a reworded message in github.ts can't leave the line
// saying something odd.

// Protects the happy case: the numbers are in and the line says when.
test("status: up to date says when it last checked", () => {
	const at = new Date(2026, 9, 17, 9, 5).getTime();
	assert.strictEqual(status({ updating: false, message: undefined, fetchedAt: at }), "Up to date. Last checked 9:05 AM.");
});

// Protects the moment before the first download, and a press in progress.
test("status: loading before the first download, checking during a refresh", () => {
	assert.strictEqual(status({ updating: false, message: undefined, fetchedAt: 0 }), "Loading...");
	assert.strictEqual(status({ updating: true, message: "No internet", fetchedAt: 0 }), "Checking GitHub...");
});

// Protects every message github.ts can hand back, each with its own
// plain sentence, and the catch-all for the rest.
test("status: each failure gets its own sentence", () => {
	const failed = (message: string) => status({ updating: false, message, fetchedAt: 1 });
	assert.strictEqual(failed("Add a token in settings"), "Add a token below.");
	assert.strictEqual(failed("No internet"), "No internet. Showing the last numbers I got.");
	assert.strictEqual(failed("Token didn't work"), "The token didn't work. It may have expired.");
	assert.strictEqual(failed("Token can't read this"), "The token isn't allowed to read my profile.");
	assert.strictEqual(failed("GitHub error 502"), "GitHub error 502. It usually clears up on its own.");
	assert.strictEqual(failed("GitHub's answer didn't make sense"), "GitHub's answer didn't make sense. It usually clears up on its own.");
});

// The bottom line of the three contribution keys (stats, goal, streak) is
// the same few words everywhere: nothing most of the time, "loading" before
// the first download, "updating" during a press, and what went wrong in
// red. These protect that one shared answer.

// Protects the quiet case: numbers in, nothing wrong, nothing to say.
test("bottomLine: nothing to say once the numbers are in", () => {
	assert.deepStrictEqual(bottomLine({ updating: false, message: undefined, shortMessage: undefined, fetchedAt: 1 }), {
		small: "",
		color: "#8b949e",
		ready: true,
	});
});

// Protects the moment before the first download and a press in progress:
// both are gray words, and only the first says the key isn't ready.
test("bottomLine: loading before the first download, updating during a press", () => {
	assert.deepStrictEqual(bottomLine({ updating: false, message: undefined, shortMessage: undefined, fetchedAt: 0 }), {
		small: "loading",
		color: "#8b949e",
		ready: false,
	});
	assert.deepStrictEqual(bottomLine({ updating: true, message: undefined, shortMessage: undefined, fetchedAt: 1 }), {
		small: "updating",
		color: "#8b949e",
		ready: true,
	});
	assert.deepStrictEqual(bottomLine({ updating: true, message: "No internet", shortMessage: "Offline", fetchedAt: 1 }), {
		small: "updating",
		color: "#8b949e",
		ready: true,
	});
});

// Protects a press before the first download: there's nothing to update
// yet, so the line keeps saying loading, or what went wrong.
test("bottomLine: a press before the first download doesn't say updating", () => {
	assert.deepStrictEqual(bottomLine({ updating: true, message: undefined, shortMessage: undefined, fetchedAt: 0 }), {
		small: "loading",
		color: "#8b949e",
		ready: false,
	});
	assert.deepStrictEqual(bottomLine({ updating: true, message: "No internet", shortMessage: "Offline", fetchedAt: 0 }), {
		small: "Offline",
		color: "#f85149",
		ready: false,
	});
});

// Protects the red words: the short message, whether or not there are
// numbers to show under it.
test("bottomLine: a failure shows its short message in red", () => {
	assert.deepStrictEqual(bottomLine({ updating: false, message: "Token didn't work", shortMessage: "Bad token", fetchedAt: 1 }), {
		small: "Bad token",
		color: "#f85149",
		ready: true,
	});
	assert.deepStrictEqual(bottomLine({ updating: false, message: "No internet", shortMessage: "Offline", fetchedAt: 0 }), {
		small: "Offline",
		color: "#f85149",
		ready: false,
	});
	// With no short version the long one goes up rather than nothing.
	assert.deepStrictEqual(bottomLine({ updating: false, message: "GitHub error 502", shortMessage: undefined, fetchedAt: 1 }), {
		small: "GitHub error 502",
		color: "#f85149",
		ready: true,
	});
});
