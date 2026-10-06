import assert from "node:assert";
import { test } from "node:test";

import { streaks } from "../src/streak.ts";

// Builds the same kind of map the plugin keeps, with one contribution on
// each date given. Any date that's left out is a day with nothing on it.
function contributed(...dates: string[]) {
	return new Map(dates.map((date) => [date, { date, count: 1, level: 1 }]));
}

// The dates used most below, so the weekdays are easy to check:
//
//   Sun Sep 13   Sun Sep 20   Sun Sep 27   Mon Sep 28   Tue Sep 29
//   Wed Sep 30   Thu Oct 1    Fri Oct 2    Sat Oct 3    Sun Oct 4
//   Mon Oct 5    Tue Oct 6    (all 2026)

// Protects the basic count: days in a row, ending today.
test("daily: counts a plain run of days", () => {
	const days = contributed("2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06");
	assert.deepStrictEqual(streaks(days, "2026-10-06", "daily", 0), { current: 4, longest: 4 });
});

// Protects the streak from dropping to 0 every morning before I've done anything.
test("daily: nothing yet today doesn't break the streak", () => {
	const days = contributed("2026-10-03", "2026-10-04", "2026-10-05");
	assert.deepStrictEqual(streaks(days, "2026-10-06", "daily", 0), { current: 3, longest: 3 });
});

// Protects today being added as soon as there's something on it.
test("daily: a contribution today counts", () => {
	const days = contributed("2026-10-05", "2026-10-06");
	assert.strictEqual(streaks(days, "2026-10-06", "daily", 0).current, 2);
});

// Protects a day GitHub sent with a count of 0 being treated like a missing one.
test("daily: a day with a count of 0 is a miss", () => {
	const days = contributed("2026-10-03", "2026-10-05", "2026-10-06");
	days.set("2026-10-04", { date: "2026-10-04", count: 0, level: 0 });
	assert.deepStrictEqual(streaks(days, "2026-10-06", "daily", 0), { current: 2, longest: 2 });
});

// Protects what a grace day is: Sunday Oct 4 is missed, the streak carries
// on over it, and the missed day isn't counted.
test("grace 1: one missed day is bridged but not counted", () => {
	const days = contributed("2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06");
	assert.deepStrictEqual(streaks(days, "2026-10-06", "daily", 1), { current: 4, longest: 4 });
});

// Protects grace 0 meaning no forgiveness at all, using the same days as above.
test("grace 0: one missed day breaks the streak", () => {
	const days = contributed("2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06");
	assert.deepStrictEqual(streaks(days, "2026-10-06", "daily", 0), { current: 2, longest: 2 });
});

// Protects the limit: grace 1 covers one missed day, not two in a row.
test("grace 1: two missed days in a row break the streak", () => {
	const days = contributed("2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06");
	assert.deepStrictEqual(streaks(days, "2026-10-06", "daily", 1), { current: 2, longest: 2 });
});

// Protects today being left out of the gap: with nothing today, only the
// finished days before it are held against the grace allowance.
test("grace: missed days before an empty today are measured without today", () => {
	// Yesterday missed, today empty. Grace 1 keeps it, grace 0 doesn't.
	const one = contributed("2026-10-03", "2026-10-04");
	assert.strictEqual(streaks(one, "2026-10-06", "daily", 1).current, 2);
	assert.strictEqual(streaks(one, "2026-10-06", "daily", 0).current, 0);

	// Two finished days missed is one too many for grace 1, but fine for 2.
	const two = contributed("2026-10-02", "2026-10-03");
	assert.strictEqual(streaks(two, "2026-10-06", "daily", 1).current, 0);
	assert.strictEqual(streaks(two, "2026-10-06", "daily", 2).current, 2);
});

// Protects the longest streak following the same grace rule as the current
// one. The old run is Sep 14, 15, (16 missed), 17, 18, 19.
test("grace applies inside the longest streak too", () => {
	const days = contributed("2026-09-14", "2026-09-15", "2026-09-17", "2026-09-18", "2026-09-19", "2026-10-05", "2026-10-06");
	assert.deepStrictEqual(streaks(days, "2026-10-06", "daily", 1), { current: 2, longest: 5 });
	assert.deepStrictEqual(streaks(days, "2026-10-06", "daily", 0), { current: 2, longest: 3 });
});

// Protects the best streak being remembered after it has ended.
test("longest comes from an older run when it beats the current one", () => {
	const days = contributed("2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-10-05", "2026-10-06");
	assert.deepStrictEqual(streaks(days, "2026-10-06", "daily", 0), { current: 2, longest: 5 });
});

// Protects the weekend being skipped: Thu, Fri, (Sat, Sun), Mon, Tue is
// four days in a row with no grace needed.
test("weekdays: a weekend doesn't break the streak", () => {
	const days = contributed("2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06");
	assert.deepStrictEqual(streaks(days, "2026-10-06", "weekdays", 0), { current: 4, longest: 4 });
});

// Protects weekend work from padding the number: Fri, Sat, Sun, Mon is 2.
test("weekdays: contributions on a weekend aren't counted", () => {
	const days = contributed("2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05");
	assert.deepStrictEqual(streaks(days, "2026-10-05", "weekdays", 0), { current: 2, longest: 2 });

	// Only a Saturday and a Sunday, so there's no streak at all.
	const weekend = contributed("2026-10-03", "2026-10-04");
	assert.deepStrictEqual(streaks(weekend, "2026-10-05", "weekdays", 0), { current: 0, longest: 0 });
});

// Protects a Friday streak from dying over the weekend: on Saturday Oct 3
// the last weekday was a hit, so nothing has been missed.
test("weekdays: the streak is still alive when today is a Saturday", () => {
	const days = contributed("2026-10-01", "2026-10-02");
	assert.strictEqual(streaks(days, "2026-10-03", "weekdays", 0).current, 2);
});

// Protects how a gap is measured. Thu Oct 1 to Mon Oct 5 is three days on
// the calendar but only one missed weekday (Friday), so grace 1 covers it.
test("weekdays: a gap is counted in weekdays only", () => {
	const friday = contributed("2026-10-01", "2026-10-05");
	assert.strictEqual(streaks(friday, "2026-10-05", "weekdays", 1).current, 2);

	// Wed Sep 30 to Mon Oct 5 misses Thursday and Friday, which is two.
	const both = contributed("2026-09-30", "2026-10-05");
	assert.strictEqual(streaks(both, "2026-10-05", "weekdays", 1).current, 1);
});

// Protects weeks running Sunday to Saturday. Tue Sep 15, Sat Sep 26 and
// Sun Sep 27 are in three weeks in a row, and Sat Sep 26 to Sun Sep 27 is
// the week changing. Today, Tue Oct 6, is in a fourth week with nothing in
// it yet, which doesn't break anything.
test("weekly: counts weeks, and an empty current week doesn't break it", () => {
	const days = contributed("2026-09-15", "2026-09-26", "2026-09-27");
	assert.deepStrictEqual(streaks(days, "2026-10-06", "weekly", 0), { current: 3, longest: 3 });

	// Something on Sunday Oct 4 makes this week count too.
	days.set("2026-10-04", { date: "2026-10-04", count: 2, level: 1 });
	assert.deepStrictEqual(streaks(days, "2026-10-06", "weekly", 0), { current: 4, longest: 4 });
});

// Protects several contributions in one week from counting as more than one week.
test("weekly: a busy week is still one week", () => {
	const days = contributed("2026-10-04", "2026-10-05", "2026-10-06");
	assert.deepStrictEqual(streaks(days, "2026-10-06", "weekly", 0), { current: 1, longest: 1 });
});

// Protects weekly mode from using grace days: the week of Sep 20 is empty,
// and even 3 grace days don't join the weeks on either side of it.
test("weekly: grace days are ignored", () => {
	const days = contributed("2026-09-15", "2026-09-29");
	assert.deepStrictEqual(streaks(days, "2026-10-06", "weekly", 3), { current: 1, longest: 1 });
});

// Protects a finished empty week ending the streak: last week (Sep 27 to
// Oct 3) had nothing, so the current streak is 0.
test("weekly: a whole empty week ends the streak", () => {
	const days = contributed("2026-09-15", "2026-09-22");
	assert.deepStrictEqual(streaks(days, "2026-10-06", "weekly", 0), { current: 0, longest: 2 });
});

// Protects the date math where the year changes, which is also where two
// separately downloaded years meet in the store.
test("a streak carries on across New Year", () => {
	const days = contributed("2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02");
	assert.deepStrictEqual(streaks(days, "2026-01-02", "daily", 0), { current: 5, longest: 5 });

	// Wed Dec 31 and Thu Jan 1 are in the same week, Mon Jan 5 is in the next.
	const weeks = contributed("2025-12-31", "2026-01-01", "2026-01-05");
	assert.deepStrictEqual(streaks(weeks, "2026-01-05", "weekly", 0), { current: 2, longest: 2 });
});

// Protects against days after today sneaking into the count.
test("days after today are ignored", () => {
	const days = contributed("2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08");
	assert.deepStrictEqual(streaks(days, "2026-10-06", "daily", 0), { current: 2, longest: 2 });
});

// Protects the key before the first download, when there's nothing to count.
test("no days, or no today, gives 0 and 0", () => {
	assert.deepStrictEqual(streaks(new Map(), "2026-10-06", "daily", 1), { current: 0, longest: 0 });
	assert.deepStrictEqual(streaks(contributed("2026-10-06"), "", "daily", 1), { current: 0, longest: 0 });
	assert.deepStrictEqual(streaks(new Map(), "2026-10-06", "weekly", 1), { current: 0, longest: 0 });
});
