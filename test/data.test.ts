import assert from "node:assert";
import { test } from "node:test";

import { status } from "../src/data.ts";

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
