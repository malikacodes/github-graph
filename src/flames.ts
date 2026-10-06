// The fire on the streak key. It lives in its own file because it's a lot
// of shape math that the other keys don't need. Like everything in keys.ts,
// it's drawn on a 144x144 grid and takes plain numbers, so the same numbers
// always give the same picture.

// Rounds to one decimal place for writing into the SVG. It goes through
// Math.round and not toFixed, because toFixed turns a hair below zero into
// "-0.0", and then two pictures that look the same wouldn't be the same
// text. The key only skips a picture when the text matches exactly.
function n(value: number): string {
	return String(Math.round(value * 10) / 10);
}

// The fire grows with the streak. Each tier starts at this many days, and
// in weekly mode a week counts as 7 of them. The names don't show on the
// key. They're for the preview page and for me. A streak of 0 isn't a tier.
// It's the cold coal. What each tier's fire looks like is in SHAPES just
// below, in the same order.
export const TIERS = [
	{ name: "Ember", from: 1 },
	{ name: "Flicker", from: 3 },
	{ name: "Candle", from: 7 },
	{ name: "Lantern", from: 14 },
	{ name: "Hearth", from: 30 },
	{ name: "Campfire", from: 60 },
	{ name: "Bonfire", from: 120 },
	{ name: "Starfire", from: 365 },
];

// What each tier's fire looks like standing still. base is how far down
// the key the fire sits, wide is half its width, and tall is its height.
// The bigger fires sit lower so they can grow behind the number. lean
// pushes the tip sideways. glow is how strong the soft light around it is.
// grow is how much bigger it gets at the start of a burst, and the tall
// ones get less because they have less room above them.
//
// The big fires are kept slim on purpose. My first go had them wide
// enough to fill the key, and a row of big bushy fires was too much. Tall
// and narrow reads as a bigger fire without the bulk. Starfire is only a
// little taller than Bonfire, and what sets it apart is its color.
const SHAPES = [
	{ base: 56, wide: 10, tall: 14, lean: 0, glow: 0, grow: 1.1 }, // 0 unlit, only here so the rows line up with the tiers
	{ base: 56, wide: 10, tall: 14, lean: 0, glow: 0.55, grow: 1.1 }, // 1 Ember
	{ base: 68, wide: 11, tall: 30, lean: 6, glow: 0, grow: 0.6 }, // 2 Flicker
	{ base: 70, wide: 16, tall: 52, lean: 0, glow: 0, grow: 0.4 }, // 3 Candle
	{ base: 74, wide: 18, tall: 64, lean: 0, glow: 0.5, grow: 0.3 }, // 4 Lantern
	{ base: 100, wide: 20, tall: 76, lean: 0, glow: 0, grow: 0.28 }, // 5 Hearth
	{ base: 104, wide: 26, tall: 84, lean: 0, glow: 0, grow: 0.25 }, // 6 Campfire
	{ base: 108, wide: 32, tall: 94, lean: 0, glow: 0.3, grow: 0.18 }, // 7 Bonfire
	{ base: 110, wide: 34, tall: 102, lean: 0, glow: 0.5, grow: 0.14 }, // 8 Starfire
];

// A fire is one or more tongues side by side. Each row is one tongue: how
// far across it stands, how wide and how tall it is, and which way it
// leans, all as a share of the whole fire. The middle tongue comes last so
// it's drawn in front.
const ONE = [[0, 1, 1, 0]];
const THREE = [
	[-0.56, 0.5, 0.58, -0.3],
	[0.56, 0.5, 0.66, 0.3],
	[0, 0.7, 1, 0],
];

// The sway is the small movement a lit fire always has, so the key never
// looks frozen. It's a loop this long, and a picture is told how far round
// the loop it is, from 0 to 1. Everything in it moves in whole waves per
// loop, so the end of one loop is exactly the start of the next and
// there's no jump where it wraps, like a song on repeat that ends on the
// note it starts on.
export const SWAY_MS = 3200;

// The key only gets 3 or 4 of these pictures a second, so each one has to
// be a bit different from the last or it would look stuck. REACH is how
// far a tip rocks to each side, and BREATH is how much taller and shorter
// a tongue gets, both in pixels. Both are small on purpose. This is a
// candle in a quiet room, and the burst is the part that's meant to be
// noticed.
//
// They're the same few pixels for every tier. I first had them grow with
// the fire, and the big ones (Hearth, Campfire, Bonfire) ended up thrashing
// around, because several tall tongues each moving a lot is a lot.
const REACH = 3;
const BREATH = 2.5;

// Where a tip is in its rocking, from about -1 (far left) to 1 (far
// right). It goes over and back once a loop, with a smaller, faster wobble
// on top so it doesn't swing like a pendulum.
function rock(loop: number): number {
	return 0.85 * Math.sin(loop * Math.PI * 2) + 0.3 * Math.sin(loop * Math.PI * 6 + 1);
}

// Where a tongue is in its breathing, from -1 (shortest) to 1 (tallest).
// It breathes twice a loop, so when the tip is at the end of a swing and
// barely moving sideways, the height is still changing.
function breathe(loop: number): number {
	return Math.sin(loop * Math.PI * 4);
}

// One tongue of flame as an SVG path: round at the bottom, pointed at the
// top. It's two curves that leave the bottom middle, swing out to the
// sides and meet at the tip. The right side is pulled in more than the
// left, which gives the tip its little curl. A tongue that's the same on
// both sides looks like a water drop, not a flame.
function tongue(x: number, base: number, wide: number, tall: number, lean: number): string {
	const tip = x + lean;
	return (
		`M ${n(x)} ${n(base)} ` +
		`C ${n(x - wide * 1.5)} ${n(base)} ${n(x - wide * 0.85 + lean * 0.4)} ${n(base - tall * 0.5)} ${n(tip)} ${n(base - tall)} ` +
		`C ${n(tip + wide * 0.45)} ${n(base - tall * 0.52)} ${n(x + wide * 1.5)} ${n(base)} ${n(x)} ${n(base)} Z`
	);
}

// All of a fire's tongues as one path. loop is how far round the sway the
// picture is, and reach and breath are how much of it to show (both 0 for
// a fire standing still). Each tongue is a little ahead of or behind the
// middle one, by how far to the side it stands. If they all moved together
// a big fire would rock like one cardboard cutout.
function tongues(rows: number[][], base: number, wide: number, tall: number, lean: number, loop: number, reach: number, breath: number): string {
	return rows
		.map(([across, width, height, tilt]) => {
			const own = loop + across * 0.35;
			return tongue(
				72 + across * wide,
				base,
				width * wide,
				height * tall * (1 + breath * breathe(own)),
				tilt * wide + (lean + reach * rock(own)) * height,
			);
		})
		.join(" ");
}

// A color fade that runs up the fire, from its base to its tip.
function fade(id: string, base: number, tall: number, bottom: string, top: string): string {
	return (
		`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="72" y1="${n(base)}" x2="72" y2="${n(base - tall)}">` +
		`<stop offset="0" stop-color="${bottom}"/><stop offset="1" stop-color="${top}"/></linearGradient>`
	);
}

// A soft round light that's strongest in the middle and gone at its edge.
function light(id: string, x: number, y: number, reach: number, color: string, strength: number): string {
	return (
		`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(x)}" cy="${n(y)}" r="${n(reach)}">` +
		`<stop offset="0" stop-color="${color}" stop-opacity="${n(strength)}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>` +
		`<circle cx="${n(x)}" cy="${n(y)}" r="${n(reach)}" fill="url(#${id})"/>`
	);
}

const SPARKS = ["#ffd33d", "#fff4c2", "#ffa657"];
const STAR_SPARKS = ["#ffffff", "#a5d8ff", "#ffd33d"];

// The sparks a burst throws up out of the fire. Like the confetti on the
// goal key, nothing is random. Each spark's path comes from its number in
// the line, so the same moment always gives the same picture.
function sparks(tier: number, burst: number): string {
	// The sparks are gone four fifths of the way through the burst, so the
	// last pictures are the fire settling on its own.
	const flight = burst / 0.8;
	if (flight >= 1) return "";

	// They're already a third of the way out in the very first picture and
	// cover most of the rest in the next few, then coast. The key only gets
	// about ten pictures a second, so big early jumps are what read as a
	// burst. Over the last third of the flight they fade and shrink.
	const thrown = 0.34 + 0.66 * (1 - (1 - Math.min(1, burst / 0.3)) ** 4);
	const opacity = n(Math.min(1, (1 - flight) / 0.35));
	const shape = SHAPES[tier];
	const colors = tier === 8 ? STAR_SPARKS : SPARKS;

	let dots = "";
	for (let i = 0; i < 12; i++) {
		// The sparks fan out over the top of the fire, from about 10
		// o'clock round to 2 o'clock. Going through them in jumps of 5 is
		// what stops neighbors from flying off in size order. A bigger fire
		// throws them further.
		const angle = -Math.PI / 2 + (((i * 5) % 12) - 5.5) * 0.19;
		const distance = (0.55 + 0.25 * (i % 3)) * (shape.tall + 34) * thrown;
		const x = 72 + distance * Math.cos(angle);

		// They start from the middle of the fire. The bit on the end is
		// gravity, which is nothing early on and then tips them back down.
		const y = shape.base - shape.tall * 0.45 + distance * Math.sin(angle) + 36 * flight ** 3;
		dots += `<circle cx="${n(x)}" cy="${n(y)}" r="${n((i % 2 ? 6 : 4.5) * (1 - 0.4 * flight))}" fill="${colors[i % 3]}" fill-opacity="${opacity}"/>`;
	}
	return dots;
}

// Where the few sparks that always hang over the three biggest fires sit,
// measured from the middle of the fire's base as a share of its size.
const EMBERS = [
	[-0.82, 0.78],
	[0.9, 0.62],
	[0.62, 0.97],
	[-0.5, 1.02],
	[-1.02, 0.42],
];

// Draws the fire for a tier, from 0 (nothing lit) to 8. burst is only
// passed while one is playing, and says how far through it this picture
// is, from 0 to 1. sway is how far round the sway loop it is, also 0 to 1.
// With neither, this is the fire standing still.
export function flame(tier: number, burst?: number, sway?: number): string {
	// No streak: a cold grey coal with a lighter top, and no fire at all.
	if (tier === 0) {
		return `<ellipse cx="72" cy="56" rx="17" ry="10" fill="#30363d"/><ellipse cx="68" cy="52" rx="9" ry="4" fill="#484f58"/>`;
	}

	// How far the fire is flared up. It's at its biggest in the very first
	// picture of a burst and falls away fast, the way a fire jumps when you
	// blow on it and then settles: about three quarters of the way back
	// down after half a second, and still for the last few pictures.
	const through = burst === undefined ? 1 : Math.min(1, Math.max(0, burst));
	const flare = (1 - through) ** 3;

	// How much of the sway shows. A fire that has just flared up stands
	// straight, and the sway comes back in as the flare dies down. By the
	// end of a burst it's all there, so the last picture of the burst and
	// the first one after it are the same fire and nothing snaps.
	const loop = sway ?? 0;
	const calm = sway === undefined ? 0 : 1 - flare;

	const shape = SHAPES[tier];
	const size = 1 + shape.grow * flare;
	const wide = shape.wide * size;
	const tall = shape.tall * size;
	const middle = shape.base - tall / 2;
	const reach = REACH * calm;
	const breath = (BREATH / shape.tall) * calm;

	// The soft light behind the fire. The lantern and the two biggest have
	// some all the time, and a burst turns it up for every tier.
	let content = "";
	const glow = shape.glow + 0.5 * flare;
	if (glow > 0) content += light("glow", 72, middle, tall * 0.4 + 26, tier === 8 ? "#9ecbff" : "#ff8a1f", glow);

	// An ember is just a glowing dot with a hot middle. It has no tongue,
	// so its sway is the dot swelling and the hot middle wandering a
	// little inside it, the way a coal pulses when air moves over it.
	if (tier === 1) {
		const r = 8 * size * (1 + 0.2 * calm * breathe(loop));
		content +=
			`<circle cx="72" cy="${n(middle)}" r="${n(r)}" fill="#ff7a18"/>` +
			`<circle cx="${n(72 + reach * 0.6 * rock(loop))}" cy="${n(middle)}" r="${n(r * 0.5)}" fill="#ffd33d"/>`;
		return content + (burst === undefined ? "" : sparks(tier, through));
	}

	// The outside of the fire, bright orange at the base and redder at the
	// tip. The first small flame is a dimmer orange all the way up.
	const rows = tier >= 6 ? THREE : ONE;
	content +=
		fade("outer", shape.base, tall, tier === 2 ? "#f5872b" : "#ffa726", tier === 2 ? "#d9481c" : "#f0481e") +
		`<path d="${tongues(rows, shape.base, wide, tall, shape.lean, loop, reach, breath)}" fill="url(#outer)"/>`;

	// From the hearth up there's a second, brighter fire inside the first.
	// It's yellow, until the last tier turns it blue-white. The inside one
	// sways a little less than the outside, like the calm part of a flame.
	const inside = tongues(ONE, shape.base - tall * 0.03, wide * 0.58, tall * 0.6, shape.lean * 0.6, loop, reach * 0.6, breath);
	if (tier >= 5) {
		content +=
			fade("inner", shape.base, tall * 0.6, tier === 8 ? "#ffffff" : "#fff4c2", tier === 8 ? "#7cc4ff" : "#ffc933") +
			`<path d="${inside}" fill="url(#inner)"/>`;
	}

	// During a burst the inside goes white-hot. This is laid over whatever
	// is there and fades out as the flare does.
	if (flare > 0) content += `<path d="${inside}" fill="#fffbe6" fill-opacity="${n(flare)}"/>`;

	// The sparks that are always there: two over the campfire, three over
	// the bonfire and four over the starfire. In the sway each one drifts a few pixels around its
	// spot, and each is at a different point in the loop so they don't
	// bob up and down together.
	if (tier >= 6) {
		EMBERS.slice(0, tier === 8 ? 4 : tier === 7 ? 3 : 2).forEach(([across, up], i) => {
			const own = loop + i * 0.27;
			const x = 72 + across * shape.wide + reach * 0.5 * rock(own);
			const y = shape.base - up * shape.tall - 60 * breath * breathe(own);
			content += `<circle cx="${n(x)}" cy="${n(y)}" r="${i % 2 ? 3 : 4}" fill="${tier === 8 ? STAR_SPARKS[i % 3] : SPARKS[i % 3]}"/>`;
		});
	}

	return content + (burst === undefined ? "" : sparks(tier, through));
}
