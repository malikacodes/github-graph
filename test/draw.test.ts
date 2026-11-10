import assert from "node:assert";
import { test } from "node:test";

import { addDays, weekColumns, weekday } from "../src/calendar.ts";
import { drawHeatmap, HEATMAP_WEEKS, lens, LENS, LENS_CENTER_Y, TOP_REACH } from "../src/draw.ts";
import type { Day } from "../src/github.ts";

// The heatmap key is 49 squares on a black key, the outer ring bowed
// out a touch, so these read the SVG back out of the data URI and
// look at what's in it.

function svgOf(image: string): string {
	return Buffer.from(image.split(",")[1], "base64").toString();
}

// The same seven weeks the action lays out: Sunday six weeks back to this
// Saturday. 2026-10-27 is a Tuesday.
function weeks(today: string) {
	const sunday = addDays(today, -weekday(today));
	return weekColumns(addDays(sunday, -(HEATMAP_WEEKS - 1) * 7), addDays(sunday, 6));
}

// Protects the lens: its center, a little above the middle of the key,
// doesn't move; the middle of the left edge sits a touch past the rim;
// and the corners are pulled in a little.
test("lens: center stays, edge midpoints pass the rim, corners pull in", () => {
	assert.ok(LENS < 0);
	assert.ok(LENS_CENTER_Y < 72);
	assert.deepStrictEqual(lens(72, LENS_CENTER_Y), [72, LENS_CENTER_Y]);
	const [left] = lens(0, LENS_CENTER_Y);
	assert.ok(left < 0 && left > -3);
	const [x, y] = lens(0, 0);
	assert.ok(x > 0 && y > 0 && x < 6);
});

// Protects the pure black key and the square count.
test("heatmap: 49 squares on a pure black key", () => {
	const svg = svgOf(drawHeatmap(weeks("2026-10-27"), new Map(), false));
	assert.match(svg, /^<svg[^>]*><rect width="144" height="144" fill="#000000"\/>/);
	assert.strictEqual(svg.match(/<polygon /g)?.length, 49);
});

// Protects the layout: rows are weeks with the newest on top, Sunday on
// the left. So a Tuesday today is the third square of the top row, the
// Sunday six weeks back is the first square of the bottom row, and the
// Saturday still to come is the top right square in the "not yet" shade.
// Each square's first point is its top left corner through the lens,
// and the top row reaches a touch above the rim.
test("heatmap: newest week on top, Sunday on the left", () => {
	const days = new Map<string, Day>([
		["2026-10-27", { date: "2026-10-27", count: 9, level: 4 }],
		["2026-09-13", { date: "2026-09-13", count: 1, level: 1 }],
	]);
	const svg = svgOf(drawHeatmap(weeks("2026-10-27"), days, false));
	const starts = (slot: number, row: number) => {
		const [x, y] = lens(slot * 21, row * 21 - (row === 0 ? TOP_REACH : 0));
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	};
	assert.match(svg, new RegExp(`<polygon points="${starts(2, 0)} [^"]*" fill="#39d353"/>`));
	assert.match(svg, new RegExp(`<polygon points="${starts(0, 6)} [^"]*" fill="#0e4429"/>`));
	assert.match(svg, new RegExp(`<polygon points="${starts(6, 0)} [^"]*" fill="#1a1e24"/>`));
});

// Protects the gray mode: when the download failed or is in progress, no
// green is left on the key, so a gray key always means "go look at Status".
test("heatmap: gray when something is off", () => {
	const days = new Map<string, Day>([["2026-10-27", { date: "2026-10-27", count: 9, level: 4 }]]);
	const svg = svgOf(drawHeatmap(weeks("2026-10-27"), days, true));
	assert.doesNotMatch(svg, /#39d353|#26a641|#006d32|#0e4429/);
});
