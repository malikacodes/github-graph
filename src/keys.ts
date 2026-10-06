import { asImage } from "./draw";

// Pictures for the regular keys. A key is 72x72 on most Stream Decks and
// 144x144 on the sharper ones, so these are drawn on a 144 grid and Stream
// Deck scales them down where it needs to.

const FONT = `font-family="Helvetica Neue, Helvetica, Arial, sans-serif"`;

function key(content: string): string {
	return asImage(
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="#0d1117"/>${content}</svg>`,
	);
}

// An SVG is written like HTML, so these three characters mean "a tag or a
// code starts here" and not themselves. One stray & in a label and the
// whole key comes out blank. The & has to be swapped first, or it would
// catch the ones the other two swaps just added.
function safe(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// The contribution stats key: the year on top, the total in the middle,
// and along the bottom a colored dot with how old the data is.
export function drawStatsKey(year: string, total: string, dot: string, age: string): string {
	// A longer number needs smaller digits to stay inside the key.
	const size = total.length <= 3 ? 60 : total.length <= 5 ? 46 : 36;

	// The bottom line starts from the left and doesn't try to center
	// itself. Centering means knowing how wide the words are, and that
	// changes with the font, so the dot would wander. The dot is 12px wide
	// around x=20, which leaves a 14px margin, and the words start 6px
	// after it. The longest label, "12 min ago", ends around x=121.
	return key(
		`<text x="72" y="34" font-size="20" fill="#8b949e" text-anchor="middle" ${FONT}>${safe(year)}</text>` +
			`<text x="72" y="${72 + size / 3}" font-size="${size}" font-weight="700" fill="#e6edf3" text-anchor="middle" ${FONT}>${safe(total)}</text>` +
			`<circle cx="20" cy="121" r="6" fill="${dot}"/>` +
			`<text x="32" y="127" font-size="18" fill="#8b949e" text-anchor="start" ${FONT}>${safe(age)}</text>`,
	);
}
