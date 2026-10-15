// The look every GitHub key shares: a small drawing in its own color on
// top, the main number or word under it in white, and a few gray words
// along the bottom. The drawing leads, the same way the ring and the fire
// do on my other keys.
//
// This file imports nothing, so the tests can load it. Node's test runner
// can't follow an import that leaves off ".ts", and keys.ts has those, so
// the black tile and the text escaping are written out again here.

// Every key is plain black, the same as the deck around it.
function key(content: string): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="#000000"/>${content}</svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// Repo and branch names come from GitHub, so anything that means something
// in SVG gets swapped for its safe version. The & goes first, or it would
// catch the ones the other swaps add.
function safe(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export const COLORS = {
	pink: "#ff7eb6",
	yellow: "#ffd33d",
	blue: "#58a6ff",
	lavender: "#bc8cff",
	orange: "#ffa657",
	green: "#39d353",
	red: "#ff7b72",
	teal: "#56d4dd",
	gray: "#8b949e",
};

const WHITE = "#e6edf3";
const FONT = `font-family="Helvetica Neue, Helvetica, Arial, sans-serif"`;

// About how wide one letter is, as a share of the font size. Stream Deck
// draws the text itself, so this is a guess, and it's on the wide side on
// purpose: the deck draws letters wider than a browser does.
const LETTER = 0.62;

// The drawings, each in a 24 by 24 box with lines, not fills, so they
// scale to any size and stay light. c is the color.
const ICONS = {
	repo: (c: string) =>
		`<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><path d="M5 17a3 3 0 0 1 3-3h11" fill="none" stroke="${c}" stroke-width="2"/>`,
	lock: (c: string) =>
		`<rect x="5" y="11" width="14" height="10" rx="2.5" fill="none" stroke="${c}" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="${c}" stroke-width="2"/>`,
	pr: (c: string) =>
		`<circle cx="6" cy="6" r="2.6" fill="none" stroke="${c}" stroke-width="2"/><circle cx="6" cy="18" r="2.6" fill="none" stroke="${c}" stroke-width="2"/><circle cx="18" cy="18" r="2.6" fill="none" stroke="${c}" stroke-width="2"/><path d="M6 8.6v6.8M18 15.4V10a4 4 0 0 0-4-4h-3" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/><path d="M13 3.5 10.5 6 13 8.5" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
	issue: (c: string) =>
		`<circle cx="12" cy="12" r="8.5" fill="none" stroke="${c}" stroke-width="2"/><circle cx="12" cy="12" r="2.4" fill="${c}"/>`,
	check: (c: string) =>
		`<circle cx="12" cy="12" r="8.5" fill="none" stroke="${c}" stroke-width="2"/><path d="m8 12.3 2.8 2.7 5.2-5.6" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
	cross: (c: string) =>
		`<circle cx="12" cy="12" r="8.5" fill="none" stroke="${c}" stroke-width="2"/><path d="m9 9 6 6m0-6-6 6" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`,
	running: (c: string) =>
		`<circle cx="12" cy="12" r="8.5" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="4 3.2"/><circle cx="12" cy="12" r="2.4" fill="${c}"/>`,
	star: (c: string) =>
		`<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`,
	commits: (c: string) =>
		`<circle cx="12" cy="12" r="3.6" fill="none" stroke="${c}" stroke-width="2"/><path d="M2 12h6.4M15.6 12H22" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
	compare: (c: string) =>
		`<path d="M7 20V8M7 8 3.8 11.2M7 8l3.2 3.2M17 4v12m0 0-3.2-3.2M17 16l3.2-3.2" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
	tag: (c: string) =>
		`<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.1 6.1a1.5 1.5 0 0 1-2.1 0z" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><circle cx="8.3" cy="8.3" r="1.6" fill="${c}"/>`,
	shield: (c: string) =>
		`<path d="M12 3 19.5 6v5.6c0 4.6-3.2 8-7.5 9.4-4.3-1.4-7.5-4.8-7.5-9.4V6z" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`,
	board: (c: string) =>
		`<rect x="3.5" y="4" width="17" height="16" rx="2.5" fill="none" stroke="${c}" stroke-width="2"/><path d="M9.2 4v16M14.8 4v16" stroke="${c}" stroke-width="2"/>`,
	branch: (c: string) =>
		`<circle cx="6" cy="5.5" r="2.4" fill="none" stroke="${c}" stroke-width="2"/><circle cx="6" cy="18.5" r="2.4" fill="none" stroke="${c}" stroke-width="2"/><circle cx="18" cy="9" r="2.4" fill="none" stroke="${c}" stroke-width="2"/><path d="M6 8v8M18 11.4c0 4-6 3.4-11 5.4" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
	plus: (c: string) =>
		`<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="${c}" stroke-width="2"/><path d="M12 9v6M9 12h6" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
};

export type Icon = keyof typeof ICONS;

// One drawing, size pixels square, with its top left corner at x, y.
export function icon(name: Icon, color: string, x: number, y: number, size: number): string {
	return `<g transform="translate(${x} ${y}) scale(${size / 24})">${ICONS[name](color)}</g>`;
}

// The biggest font size, up to most, that lets text fit in width pixels.
// Below least it stops shrinking and cuts the text short with "…" instead,
// since tiny letters on a key are worse than a shortened word.
function fit(text: string, width: number, most: number, least: number): { text: string; size: number } {
	const size = Math.floor(Math.min(most, width / (Math.max(1, text.length) * LETTER)));
	if (size >= least) return { text, size };

	const letters = Math.floor(width / (least * LETTER));
	return { text: `${text.slice(0, Math.max(1, letters - 1))}…`, size: least };
}

export type Face = {
	icon: Icon;
	color: string; // the drawing's color
	big: string; // the number or word in the middle
	small: string; // the gray words along the bottom
	lock?: boolean; // a small lock in the corner, for a private repo
	quiet?: boolean; // loading or something's wrong: the drawing goes gray
	alarm?: boolean; // something's wrong: the bottom words turn soft red
	middle?: string; // extra drawing for the middle instead of big, like bars
};

export function drawGithubKey(face: Face): string {
	const color = face.quiet ? COLORS.gray : face.color;
	let content = icon(face.icon, color, 52, 14, 40);

	// The private lock sits in the top right corner, small and gray, so it
	// says "private" without being the first thing I see.
	if (face.lock) content += icon("lock", COLORS.gray, 102, 12, 18);

	if (face.middle) {
		content += face.middle;
	} else {
		// Short numbers are big. Words and long names shrink until they fit
		// the middle 136 of the key's 144 pixels.
		const big = fit(face.big, 136, face.big.length <= 3 ? 48 : 40, 16);
		content += `<text x="72" y="${74 + big.size / 3}" font-size="${big.size}" font-weight="700" fill="${WHITE}" text-anchor="middle" ${FONT}>${safe(big.text)}</text>`;
	}

	const small = fit(face.small, 132, 16, 12);
	content += `<text x="72" y="130" font-size="${small.size}" fill="${face.alarm ? COLORS.red : COLORS.gray}" text-anchor="middle" ${FONT}>${safe(small.text)}</text>`;

	return key(content);
}
