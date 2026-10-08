import type { Day } from "./github";

// GitHub's dark theme greens. The empty color is a touch lighter than
// GitHub's, because theirs disappears against the strip's black background.
const COLORS = ["#21262d", "#0e4429", "#006d32", "#26a641", "#39d353"];

// The same five steps with the color taken out. The single dial draws
// with these when something's off, so a gray graph means "go look at the
// Status line in the Stream Deck app". In gray, a day with no data gets
// the lightest gray and not the near-black, so the very first load shows
// as a faint empty grid and not a blank dial.
const GRAYS = ["#21262d", "#3a4048", "#59616b", "#7d8590", "#a8b0ba"];

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
	colors = COLORS,
): string {
	let out = "";
	columns.forEach((week, w) => {
		week.forEach((date, slot) => {
			if (!date) return;
			const day = days.get(date);
			const fill = day ? colors[day.level] : colors === GRAYS ? GRAYS[0] : NO_DATA;
			const x = at.left + w * at.step;
			const y = at.top + slot * at.step;
			out += `<rect x="${x}" y="${y}" width="${at.size}" height="${at.size}" rx="2" fill="${fill}"/>`;
		});
	});
	return out;
}

// Stream Deck takes an image as a base64 "data URI", which is the whole
// picture packed into one long string.
export function asImage(svg: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// --- The single dial graph ---

// The picture is the dial's whole 200x100 slice of the strip, with nothing
// else on it. Seven rows have to fit in 100px, so the squares are 12px
// with a 2px gap, the same as on the full-width graph. 14 weeks of those
// is 194px, which leaves 3px on each side.
export const WEEKS_SHOWN = 14;

export function drawGraph(columns: Columns, days: Map<string, Day>, gray: boolean): string {
	const visible = columns.slice(-WEEKS_SHOWN);

	// If there are fewer weeks than columns, keep them pushed against the
	// right side so the newest week is always in the same place.
	const left = 3 + (WEEKS_SHOWN - visible.length) * 14;

	const content = squares(visible, days, { left, top: 2, size: 12, step: 14 }, gray ? GRAYS : COLORS);
	return asImage(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">${content}</svg>`);
}

// This week: seven big squares in a row, Sunday to Saturday, across the
// middle of the dial. Seven of them at 26px with a 2px gap is the same
// 194px as the graph, so both views line up at the edges.
export function drawWeek(dates: string[], days: Map<string, Day>, gray: boolean): string {
	const colors = gray ? GRAYS : COLORS;

	let content = "";
	dates.forEach((date, i) => {
		const day = days.get(date);
		content += `<rect x="${3 + i * 28}" y="37" width="26" height="26" rx="5" fill="${day ? colors[day.level] : gray ? GRAYS[0] : NO_DATA}"/>`;
	});

	return asImage(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">${content}</svg>`);
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
