import { asImage } from "./draw";
import { flame } from "./flames";

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

// The confetti colors. Each piece takes the next one, going round the list.
const CONFETTI = ["#ff7eb6", "#ffd33d", "#58a6ff", "#bc8cff", "#ffa657", "#39d353", "#ffffff"];

// Keeps a number between 0 and 1. The celebration is a few things that each
// start and stop at a different moment, and this is what holds each one at
// "not started" before its moment and at "finished" after it.
function clamp(n: number): number {
	return Math.min(1, Math.max(0, n));
}

// Eighteen pieces of confetti thrown out from the middle of the key. Nothing
// here is random. Where a piece goes comes from its number in the line, so
// the same moment always gives the same picture, and a redraw in the middle
// of the celebration can't make the pieces jump around.
function confetti(burst: number): string {
	// The flight is the pieces' whole time in the air, and it's over about
	// 1.9 seconds in. Past that there's nothing to draw. Sending pieces
	// nobody can see would still make the picture a different one from the
	// normal key, and the celebration is meant to end on exactly that.
	const flight = clamp(burst / 0.86);
	if (flight >= 1) return "";

	// The throw is the outward part, and it's much shorter than the flight.
	// Almost all of the distance is covered in the first third of a second
	// and the rest is the pieces coasting to a stop, like a handful of
	// confetti that leaves your hand fast and then drifts. The key only
	// gets about ten pictures a second, so the big early jumps are what
	// make it look like a burst. Small even steps would look like a slide
	// show. Over the last quarter of the flight the pieces fade away.
	const thrown = 1 - (1 - clamp(burst / 0.4)) ** 4;
	const opacity = clamp((1 - flight) / 0.25).toFixed(2);

	let pieces = "";
	for (let i = 0; i < 18; i++) {
		// Turning by 2.4 (about 137 degrees) for each piece is the trick
		// sunflowers use for their seeds. No two pieces end up going the
		// same way, and they never line up into spokes. The ring's outside
		// edge is 58px from the middle and the edge of the key is 72. The
		// slowest pieces stop 64 out, so they clear the ring and hang around
		// in the corners, and the fastest go 112 and fly right off the key.
		const angle = i * 2.4;
		const distance = (64 + 16 * (i % 4)) * thrown;
		const x = 72 + distance * Math.cos(angle);

		// The extra bit on the end is gravity. It's almost nothing until
		// late in the flight and then pulls every piece down.
		const y = 72 + distance * Math.sin(angle) + 34 * flight ** 3;
		const paint = `fill="${CONFETTI[i % CONFETTI.length]}" fill-opacity="${opacity}"`;

		// Every third piece is a round one.
		if (i % 3 === 0) {
			pieces += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" ${paint}/>`;
			continue;
		}

		// The rest are little 14x8 strips that tumble as they fly, half of
		// them one way and half the other. I work out where the four
		// corners land myself, so the strip is a plain shape and doesn't
		// lean on the key knowing how to rotate things.
		const turn = i + flight * (i % 2 ? 7 : -7);
		const cos = Math.cos(turn);
		const sin = Math.sin(turn);
		const corners = [
			[-7, -4],
			[7, -4],
			[7, 4],
			[-7, 4],
		].map(([across, down]) => `${(x + across * cos - down * sin).toFixed(1)},${(y + across * sin + down * cos).toFixed(1)}`);
		pieces += `<polygon points="${corners.join(" ")}" ${paint}/>`;
	}
	return pieces;
}

// The daily goal key: a ring that fills up as today's count gets closer to
// the goal, with the count in the middle and a small line under it. fill
// is how much of the ring is green, from 0 to 1. met is whether today's
// goal has been reached, and puts a star on the ring. burst is only passed
// during the celebration, and says how far through it this picture is (also
// 0 to 1). The celebration is 2.2 seconds long, so 0.1 of it is a bit under
// a quarter of a second. Each picture is its own still, like the pages of
// a flip book.
export function drawGoalKey(count: string, small: string, smallColor: string, fill: number, met: boolean, burst?: number): string {
	const ring = `fill="none" stroke-width="12"`;
	let content = `<circle cx="72" cy="72" r="52" stroke="#21262d" ${ring}/>`;

	// The green part fades from the darker green at the bottom left to the
	// bright one at the top right. The fade is pinned to the key and not
	// to the arc, so a short arc doesn't get the whole fade squashed into it.
	content +=
		`<linearGradient id="green" gradientUnits="userSpaceOnUse" x1="20" y1="124" x2="124" y2="20">` +
		`<stop offset="0" stop-color="#26a641"/><stop offset="1" stop-color="#39d353"/></linearGradient>`;

	// An arc that ends exactly where it starts draws nothing at all, so a
	// full ring has to be a circle. Anything less is an arc that starts at
	// 12 o'clock and goes clockwise. The "large" flag tells it to take the
	// long way round once it's past halfway.
	if (fill >= 1) {
		content += `<circle cx="72" cy="72" r="52" stroke="url(#green)" ${ring}/>`;
	} else if (fill > 0) {
		const angle = fill * 2 * Math.PI;
		const x = 72 + 52 * Math.sin(angle);
		const y = 72 - 52 * Math.cos(angle);
		const large = fill > 0.5 ? 1 : 0;
		content += `<path d="M 72 20 A 52 52 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)}" stroke="url(#green)" stroke-linecap="round" ${ring}/>`;
	}

	// The celebration opens with the ring flashing, like a camera flash
	// going off. It's two rings laid over the normal one: a wide soft green
	// one for the glow, and a thick nearly white one on top. Both are at
	// full strength from the very first picture, start dimming a tenth of a
	// second in and are gone by about a third of a second, which leaves the
	// normal ring underneath. The glow reaches 67px from the middle, so it
	// stays inside the key.
	const flash = burst === undefined ? 0 : clamp((0.16 - burst) / 0.11);
	if (flash > 0) {
		content +=
			`<circle cx="72" cy="72" r="52" fill="none" stroke="#39d353" stroke-width="30" stroke-opacity="${(flash * 0.45).toFixed(2)}"/>` +
			`<circle cx="72" cy="72" r="52" fill="none" stroke="#eafff0" stroke-width="${(12 + flash * 8).toFixed(2)}" stroke-opacity="${flash.toFixed(2)}"/>`;
	}

	// The star that says today's goal is done. It sits on the ring at about
	// half past one on a clock, 28px across, with a thin outline in the
	// key's background color so the yellow doesn't melt into the green. A
	// star is ten points around a circle that take turns being far out and
	// close in.
	if (met) {
		let points = "";
		for (let i = 0; i < 10; i++) {
			const angle = (i * Math.PI) / 5;
			const reach = i % 2 ? 6 : 14;
			points += `${(108.8 + reach * Math.sin(angle)).toFixed(1)},${(35.2 - reach * Math.cos(angle)).toFixed(1)} `;
		}
		content += `<polygon points="${points.trim()}" fill="#ffd33d" stroke="#0d1117" stroke-width="2.5" stroke-linejoin="round"/>`;
	}

	// During the celebration a checkmark takes the place of the words. It
	// pops in over the first sixth of a second or so, growing a bit too big
	// and then settling, the way a sticker gets pressed on. It holds until
	// 1.3 seconds, takes a quarter of a second to fade out, and the words
	// fade back in right behind it over the next third of a second, so the
	// two are never on top of each other and the ending doesn't drag. The
	// size is worked into the three corners of the tick here, measured from
	// the middle of the key.
	let words = 1;
	if (burst !== undefined) {
		words = clamp((burst - 0.7) / 0.14);

		const pop = clamp(burst / 0.08) - 1;
		const scale = 1 + 3.5 * pop ** 3 + 2.5 * pop ** 2;
		const tick = [
			[-24.5, 1.5],
			[-7.5, 17.5],
			[24.5, -17.5],
		].map(([across, down]) => `${(72 + across * scale).toFixed(1)} ${(72 + down * scale).toFixed(1)}`);
		const opacity = 1 - clamp((burst - 0.59) / 0.11);
		if (opacity > 0) {
			content += `<path d="M ${tick.join(" L ")}" fill="none" stroke="#ffffff" stroke-width="${(15 * scale).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${opacity.toFixed(2)}"/>`;
		}
	}

	// The inside of the ring is 46px from the middle to its edge, so the
	// digits shrink as the number gets longer to stay clear of it. The
	// small line sits lower down, where the circle is already narrowing,
	// so anything as long as "updating" or "Bad token" shrinks too.
	const size = count.length <= 2 ? 44 : count.length === 3 ? 34 : 26;
	const smallSize = small.length < 8 ? 18 : 15;
	if (words > 0) {
		const fade = `fill-opacity="${words.toFixed(2)}" text-anchor="middle" ${FONT}`;
		content +=
			`<text x="72" y="76" font-size="${size}" font-weight="700" fill="#e6edf3" ${fade}>${safe(count)}</text>` +
			`<text x="72" y="98" font-size="${smallSize}" fill="${smallColor}" ${fade}>${safe(small)}</text>`;
	}

	// The confetti goes on last so it flies over the top of everything.
	if (burst !== undefined) content += confetti(burst);

	return key(content);
}

// The streak key: a fire that gets bigger with the streak, the streak
// itself as a big number, and a small line along the bottom. tier picks
// the fire, from 0 (nothing lit) to 8. burst is only passed while one is
// playing, and says how far through it this picture is, from 0 to 1. sway
// is how far round its always-on sway the fire is, also 0 to 1. The fire
// itself is drawn in flames.ts.
export function drawStreakKey(count: string, small: string, smallColor: string, tier: number, burst?: number, sway?: number): string {
	let content = flame(tier, burst, sway);

	// The small fires sit above the number, but from the hearth up the fire
	// is behind it, and white digits on bright yellow are hard to read. So
	// the number gets a dark edge, like the border on a sticker. The edge
	// is the same digits in the background color, stamped sixteen times in
	// a small circle around the spot where the real ones go on top. It's
	// more work than asking for an outline, but plain filled text is
	// something I know the key can draw.
	const size = count.length <= 2 ? 48 : count.length === 3 ? 42 : 34;
	const digits = `font-size="${size}" font-weight="700" text-anchor="middle" ${FONT}>${safe(count)}</text>`;
	for (let i = 0; i < 16; i++) {
		const angle = (i * Math.PI) / 8;
		content += `<text x="${(72 + 4.5 * Math.cos(angle)).toFixed(1)}" y="${(112 + 4.5 * Math.sin(angle)).toFixed(1)}" fill="#0d1117" ${digits}`;
	}

	// With nothing lit the number is grey, like the coal.
	content += `<text x="72" y="112" fill="${tier === 0 ? "#8b949e" : "#ffffff"}" ${digits}`;

	// The bottom line. It's empty unless there's something to say:
	// "updating", or what went wrong.
	content += `<text x="72" y="137" font-size="17" fill="${smallColor}" text-anchor="middle" ${FONT}>${safe(small)}</text>`;

	return key(content);
}
