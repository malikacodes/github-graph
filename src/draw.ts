import type { Day } from "./github";

// GitHub's dark theme greens. The empty color is a touch lighter than
// GitHub's, because theirs disappears against the strip's black background.
const COLORS = ["#21262d", "#0e4429", "#006d32", "#26a641", "#39d353"];

// For a day we have no data for, like the rest of this year that hasn't
// happened yet. Darker than an empty day, so the shape of the year still
// shows without looking like a row of days off.
const NO_DATA = "#14181d";

type Columns = (string | undefined)[][];

// Draws week columns as rounded squares, starting at (left, top). Each
// square is size wide, and step is the distance from one to the next.
function squares(
	columns: Columns,
	days: Map<string, Day>,
	at: { left: number; top: number; size: number; step: number },
): string {
	let out = "";
	columns.forEach((week, w) => {
		week.forEach((date, slot) => {
			if (!date) return;
			const day = days.get(date);
			const fill = day ? COLORS[day.level] : NO_DATA;
			const x = at.left + w * at.step;
			const y = at.top + slot * at.step;
			out += `<rect x="${x}" y="${y}" width="${at.size}" height="${at.size}" rx="2" fill="${fill}"/>`;
		});
	});
	return out;
}

// setFeedback takes an image as a base64 "data URI", which is the whole
// picture packed into one long string.
function asImage(svg: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// --- The single dial graph ---

// One dial's slice of the touch strip is 200x100. Squares are 8px with a 2px
// gap, so each week takes 10px. 19 weeks comes to 188px, which leaves an even
// 6px margin on both sides. 20 would technically fit but touches the edges.
// The width and height here have to match the "graph" rect in layouts/graph.json.
export const WEEKS_SHOWN = 19;
const STEP = 10;
const WIDTH = WEEKS_SHOWN * STEP - 2;
const HEIGHT = 7 * STEP - 2;

// weeksBack is how far the dial has been scrolled: 0 puts the current week
// in the last column.
export function drawGraph(columns: Columns, days: Map<string, Day>, weeksBack: number): string {
	const end = columns.length - weeksBack;
	const visible = columns.slice(Math.max(0, end - WEEKS_SHOWN), end);

	// If there are fewer weeks than columns (or none yet), keep them pushed
	// against the right side so the newest week is always in the same place.
	const left = (WEEKS_SHOWN - visible.length) * STEP;

	const content = squares(visible, days, { left, top: 0, size: 8, step: STEP });
	return asImage(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${content}</svg>`);
}

// --- The full-width graph ---

// The whole strip is 800x100 across four dials. Seven rows have to fit in
// 100px, so the biggest square that works is 12px with a 2px gap (96px
// tall). 53 weeks of those is 740px. That leaves a 52px column at the far
// right for the year label and the legend, which layouts/wide.json puts
// text into.
const LEGEND_LEFT = 748;
const LEGEND_TOP = 58;

// Every slot draws the same 800px picture and then looks at it through a
// 200px window. viewBox is that window: slot 0 shows pixels 0 to 200,
// slot 1 shows 200 to 400, and so on. Put side by side they make one image.
export function drawWide(columns: Columns, days: Map<string, Day>, slot: number): string {
	// A leap year that starts on a Saturday (2028 is the next one) spills
	// into a 54th week column, and at 12px that runs into the label. Those
	// years get 11px squares, which brings 54 weeks down to 700px.
	const size = columns.length > 53 ? 11 : 12;
	const step = size + 2;
	const top = Math.floor((100 - (7 * step - 2)) / 2);

	let content = squares(columns, days, { left: 2, top, size, step });

	// The Less to More legend: five 8px squares, lightest on the left.
	COLORS.forEach((color, i) => {
		content += `<rect x="${LEGEND_LEFT + i * 10}" y="${LEGEND_TOP}" width="8" height="8" rx="2" fill="${color}"/>`;
	});

	return asImage(
		`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="${slot * 200} 0 200 100">${content}</svg>`,
	);
}
