// One dial's slice of the touch strip is 200x100. Squares are 8px with a 2px
// gap, so each week takes 10px. 19 weeks comes to 188px, which leaves an even
// 6px margin on both sides. 20 would technically fit but touches the edges.
// The width and height here have to match the "graph" rect in layouts/graph.json.
export const WEEKS_SHOWN = 19;
const SQUARE = 8;
const STEP = 10;
const WIDTH = WEEKS_SHOWN * STEP - 2;
const HEIGHT = 7 * STEP - 2;

// GitHub's dark theme greens. The empty color is a touch lighter than
// GitHub's, because theirs disappears against the strip's black background.
const COLORS = ["#21262d", "#0e4429", "#006d32", "#26a641", "#39d353"];

// Draws the graph as an SVG and hands it back in the format setFeedback
// wants for an image. weeksBack is how far the dial has been scrolled:
// 0 puts the current week in the last column.
export function drawGraph(weeks: number[][], weeksBack: number): string {
	const end = weeks.length - weeksBack;
	const visible = weeks.slice(Math.max(0, end - WEEKS_SHOWN), end);

	// If there are fewer weeks than columns (or none yet), keep them pushed
	// against the right side so the newest week is always in the same place.
	const firstColumn = WEEKS_SHOWN - visible.length;

	let squares = "";
	visible.forEach((week, w) => {
		week.forEach((level, day) => {
			const x = (firstColumn + w) * STEP;
			const y = day * STEP;
			squares += `<rect x="${x}" y="${y}" width="${SQUARE}" height="${SQUARE}" rx="2" fill="${COLORS[level]}"/>`;
		});
	});

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${squares}</svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
