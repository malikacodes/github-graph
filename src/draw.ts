import type { Placed } from "./branches";
import type { Day } from "./github";

// GitHub's dark theme greens. The empty color is a touch lighter than
// GitHub's, because theirs disappears against the strip's black background.
const COLORS = ["#21262d", "#0e4429", "#006d32", "#26a641", "#39d353"];

// The same five steps with the color taken out. The single dial draws
// with these when something's off, so a gray graph means "go look at the
// Status line in the Stream Deck app".
const GRAYS = ["#21262d", "#3a4048", "#59616b", "#7d8590", "#a8b0ba"];

// The rest of this week on the single dial: days that haven't happened
// yet. One shade darker than an empty day, so the graph still looks full
// but I can tell "not yet" from "nothing that day".
const UPCOMING = "#1a1e24";

// For a day we have no data for, like the rest of this year that hasn't
// happened yet. Darker than an empty day, so the shape of the year still
// shows without looking like a row of days off.
const NO_DATA = "#14181d";

type Columns = (string | undefined)[][];

// Draws week columns as rounded squares, starting at (left, top). Each
// square is size wide, and step is the distance from one to the next.
// missing is the color for a date there's no data for.
function squares(
	columns: Columns,
	days: Map<string, Day>,
	at: { left: number; top: number; size: number; step: number },
	colors = COLORS,
	missing = NO_DATA,
): string {
	let out = "";
	columns.forEach((week, w) => {
		week.forEach((date, slot) => {
			if (!date) return;
			const day = days.get(date);
			const fill = day ? colors[day.level] : missing;
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
	const colors = gray ? GRAYS : COLORS;

	// If there are fewer weeks than columns, keep them pushed against the
	// right side so the newest week is always in the same place.
	const left = 3 + (WEEKS_SHOWN - visible.length) * 14;

	// The rest of this week gets squares too. That keeps the graph a full
	// rectangle on a Monday, when the last column would otherwise be two
	// squares and a hole. In gray there's no data at all on
	// the very first load, so those squares get the lightest gray and the
	// dial shows a faint grid, not nothing.
	const missing = gray ? GRAYS[0] : UPCOMING;
	const content = squares(visible, days, { left, top: 2, size: 12, step: 14 }, colors, missing);
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

// --- The branch dial ---

// Main runs along the top, lanes hang off it in two rows, and the picked
// lane's name runs along the bottom. Words stay out of the top right
// corner, because a dial in a dial stack gets its stack icon drawn there.
const MAIN_Y = 18;
const ROW_Y = [44, 70];
const NAME_Y = 94;
const MAIN_COLOR = "#58a6ff";
const QUIET = "#8b949e";
const FONT = "Helvetica, Arial, sans-serif";

// Dash then gap, in pixels, for a branch that's only on my Mac. The caps
// are round, which stretches each dash by the line's width, so the gap has
// to be wider than it looks here to still show.
const DASHES = "4 6";

// The lanes that aren't picked fade back to this much of their color.
// That's dark color over black, not gray, so nothing turns into a gray
// square next to the deck's own black.
const FADED = 0.3;

// A rough width for one letter at font size 1. Stream Deck draws the text
// itself, so there's no way to measure it from here, and it draws letters
// wider than a browser does. This is from what fit on the real strip.
const LETTER = 0.62;

// Branch names come from whoever made the branch, so anything that means
// something in SVG gets swapped for its safe version first.
function escape(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The line along the bottom: the picked lane's name, and whether it's
// still open or when it merged. On a narrow strip the "when" goes first,
// then the letters get smaller, and only a really long name on one dial
// gets cut.
function nameLine(lane: Placed, width: number): string {
	const when = lane.local
		? "only on my Mac"
		: lane.open
			? "still open"
			: `merged ${new Date(lane.merged!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
	const room = width - 8;
	const fits = (text: string, size: number) => text.length * size * LETTER <= room;

	// A "*" after the name means uncommitted changes, the same way a lot of
	// terminal prompts show it.
	let name = lane.dirty ? `${lane.name}*` : lane.name;

	let size = 11;
	// The "  ·  " is only for measuring how much room the line needs.
	let extra = `  ·  ${when}`;
	if (!fits(name + extra, size)) extra = "";
	if (!fits(name, size)) size = 9;

	const letters = Math.floor(room / (size * LETTER));
	if (name.length > letters) name = `${name.slice(0, letters - 1)}…`;

	const text = (x: number, anchor: string, fill: string, words: string, bold = false) =>
		`<text x="${x}" y="${NAME_Y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}"${bold ? ` font-weight="600"` : ""} fill="${fill}">${escape(words)}</text>`;

	if (!extra) return text(width / 2, "middle", lane.color, name, true);

	// Three separate pieces, each placed on its own: the name ends just
	// left of the dot and the date starts just right of it. Stream Deck
	// ignores spaces and nudges between pieces of one text, so this is the
	// only way the gaps stay put. Only the centering uses the letter guess.
	const dot = width / 2 + ((name.length - when.length) * size * LETTER) / 2;
	return (
		text(dot - size * 0.6, "end", lane.color, name, true) +
		text(dot, "middle", QUIET, "·") +
		text(dot + size * 0.6, "start", QUIET, when)
	);
}

// Same idea as drawWide: every dial draws the whole picture, width wide,
// and shows its own 200px of it. slot is which 200px, counting from the
// left among the dials showing this repo. picked is the lane that's bright
// and named. message replaces the map with a few words, for loading and
// for anything that went wrong.
export function drawBranches(
	lanes: Placed[],
	main: string,
	width: number,
	slot: number,
	picked: number,
	message?: string,
): string {
	let content = "";

	if (message) {
		content = `<text x="${width / 2}" y="56" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${QUIET}">${escape(message)}</text>`;
	} else {
		let faded = "";
		let bright = "";

		lanes.forEach((lane, i) => {
			const y = ROW_Y[lane.row];

			// An open lane stops just short of the right edge with a dot (see
			// RIGHT in branches.ts), so it reads as "still going", not cut off.
			const { from, to, slant } = lane;

			// Each bend is an S: it leaves main flat, curves down, and levels
			// off in its row. The two middle points of a "C" curve pull the
			// line flat at both ends, which is what makes it an S and not a
			// straight slant.
			const down = `C${from + slant / 2},${MAIN_Y} ${from + slant / 2},${y} ${from + slant},${y}`;
			const up = `L${to - slant},${y} C${to - slant / 2},${y} ${to - slant / 2},${MAIN_Y} ${to},${MAIN_Y}`;
			// A branch that's only on my Mac is dashed, like a route that's
			// planned but not built yet.
			const dashes = lane.local ? ` stroke-dasharray="${DASHES}"` : "";
			let part = `<path d="M${from},${MAIN_Y} ${down} ${lane.open ? `L${to},${y}` : up}" fill="none" stroke="${lane.color}" stroke-width="2.5" stroke-linecap="round"${dashes}/>`;

			// Rings on main where the lane leaves and comes back, filled with
			// black so main's line doesn't show through them.
			part += `<circle cx="${from}" cy="${MAIN_Y}" r="3.5" fill="#000000" stroke="${lane.color}" stroke-width="2"/>`;
			part += lane.open
				? `<circle cx="${to}" cy="${y}" r="3" fill="${lane.color}"/>`
				: `<circle cx="${to}" cy="${MAIN_Y}" r="3.5" fill="#000000" stroke="${lane.color}" stroke-width="2"/>`;

			// Uncommitted changes get a ring around the end dot, so I can spot
			// them without picking the lane. A loop has no end dot, so it only
			// gets the "*" in its name.
			if (lane.open && lane.dirty) {
				part += `<circle cx="${to}" cy="${y}" r="6" fill="none" stroke="${lane.color}" stroke-width="1.5"/>`;
			}

			// The picked lane is drawn last so it sits on top where lanes cross.
			if (i === picked) bright = part;
			else faded += `<g opacity="${FADED}">${part}</g>`;
		});

		const mainLine = `<line x1="0" y1="${MAIN_Y}" x2="${width}" y2="${MAIN_Y}" stroke="${MAIN_COLOR}" stroke-width="2.5"/>`;
		const mainName = `<text x="4" y="${MAIN_Y - 6}" font-family="${FONT}" font-size="9" fill="${MAIN_COLOR}">${escape(main)}</text>`;
		const name = lanes[picked] ? nameLine(lanes[picked], width) : "";
		content = faded + mainLine + bright + mainName + name;
	}

	return asImage(
		`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="${slot * 200} 0 200 100">${content}</svg>`,
	);
}
