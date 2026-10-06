import type { Day } from "./github";

// Works out my current streak and my longest one. Nothing in this file
// reads the store or talks to Stream Deck. Days go in, two numbers come
// out, which is what lets the tests run it with made-up days.
//
// The tests run in plain Node, and plain Node can't follow this project's
// imports that leave off the file ending. So this file imports nothing that
// exists when it runs (the Day import above is only a type, and types are
// erased). That's also why it does its own bit of date math and doesn't
// use calendar.ts.

export type Mode = "daily" | "weekdays" | "weekly";

const DAY_MS = 24 * 60 * 60 * 1000;

// Turns "2026-10-05" into a plain count of days since January 1, 1970.
// Counting in whole numbers means the next day is always just +1, with no
// months, leap years or clock changes to think about. It's done in UTC for
// the same reason as calendar.ts: no day can come out 23 or 25 hours long.
function dayNumber(date: string): number {
	return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

// The rules:
//
// daily: a day with at least one contribution is a hit, and the streak is
//   how many hit days are in the run.
// weekdays: the same, but Saturdays and Sundays don't exist. They can't
//   break a streak and they can't add to one, even if I did contribute.
// weekly: a week (Sunday to Saturday) with at least one contribution is a
//   hit, and the streak is counted in weeks.
//
// Grace days are how many missed days in a row a streak can survive. The
// missed days never add to the count. In weekdays mode only weekdays count
// as missed, and weekly mode has no grace at all.
//
// Today (or this week) isn't over yet, so having nothing on it can't break
// a streak. It just doesn't count until there's something there.
export function streaks(days: Map<string, Day>, today: string, mode: Mode, graceDays: number): { current: number; longest: number } {
	if (!today) return { current: 0, longest: 0 };

	// A slot is one step of the streak: a day, or a whole week in weekly
	// mode. Day number 0 was a Thursday, so adding 4 lines the numbers up
	// with Sundays, and dividing by 7 gives every day of one Sunday to
	// Saturday week the same week number.
	const weekly = mode === "weekly";
	const slot = (date: string) => (weekly ? Math.floor((dayNumber(date) + 4) / 7) : dayNumber(date));
	const grace = weekly ? 0 : graceDays;
	const last = slot(today);

	// Every slot with a contribution in it, and the earliest one, which is
	// where the walk below starts. Days after today are left out. A date
	// that isn't in the map never makes it in here, which makes it a miss.
	const hits = new Set<number>();
	let first = last + 1;
	for (const [date, day] of days) {
		if (day.count === 0 || date > today) continue;
		hits.add(slot(date));
		first = Math.min(first, slot(date));
	}

	// Walk from the first hit to today, one slot at a time. run is the
	// streak being built and gap is how many misses there have been since
	// its last hit. A hit after a gap that grace can cover carries the run
	// on. A hit after a longer gap starts a new run at 1.
	let run = 0;
	let gap = 0;
	let longest = 0;
	for (let n = first; n <= last; n++) {
		// The same +4 trick: 0 is a Sunday and 6 is a Saturday.
		const weekend = (n + 4) % 7 === 0 || (n + 4) % 7 === 6;
		if (mode === "weekdays" && weekend) continue;

		if (hits.has(n)) {
			run = run > 0 && gap <= grace ? run + 1 : 1;
			gap = 0;
			longest = Math.max(longest, run);
		} else if (n !== last) {
			// The last slot is today, which is the one miss that's forgiven.
			gap++;
		}
	}

	// The run that's left at the end is the current streak, unless the gap
	// since its last hit is already more than grace covers. Then it's over,
	// even though no later hit has come along to restart it.
	return { current: gap <= grace ? run : 0, longest };
}
