// Builds preview/tiers.html, a page with all eight fires on it side by
// side. On the Stream Deck I only ever see the tier my own streak is at,
// and Starfire is a year away, so this is how I get to look at the rest.
//
// The page doesn't have its own copy of the drawing code. This script
// reads the real files out of src and puts them into the page, so the page
// draws every picture with the exact code the key runs. A copy would be
// right on the day I made it and quietly wrong after the next time I
// touched a flame.
//
// Run it with: npm run preview
import { readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

function read(file) {
	return readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
}

// Turns one of my TypeScript files into plain JavaScript a browser can
// run. Node takes the types out, and the import and export words go too,
// because the page is one script and has no other files to import from.
//
// Each file then gets wrapped in a function of its own, like putting it in
// its own room. Two files are allowed to have a helper with the same name,
// and without the rooms the second one would crash the page. takes is what
// the file used to import, handed in through the door, and gives is the
// short list of things the page wants back out.
function room(file, takes, gives) {
	const code = stripTypeScriptTypes(read(file))
		.replace(/^import\b[^;]*;/gm, "")
		.replace(/^export /gm, "");
	return `(function (${takes.join(", ")}) {\n${code}\nreturn { ${gives.join(", ")} };\n})`;
}

// A few plain numbers and colors live in files that can't go into the page
// whole, because those files talk to Stream Deck. This lifts one of them
// out by name, exactly as it's written there. If I ever rename or move
// one, this stops with a message, which beats a page that's out of date.
function constant(file, name) {
	const found = read(file).match(new RegExp(`^const ${name} = (.+);$`, "m"));
	if (!found) throw new Error(`Couldn't find "const ${name}" in src/${file}. Was it renamed or moved?`);
	return found[1];
}

const page = `<!DOCTYPE html>
<html lang="en">

<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Streak tiers</title>
	<style>
		body {
			margin: 0;
			padding: 40px 24px 64px;
			background: #0d1117;
			color: #e6edf3;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
			text-align: center;
		}

		h1 {
			margin: 0 0 8px;
			font-size: 26px;
			font-weight: 600;
		}

		p {
			max-width: 520px;
			margin: 0 auto 20px;
			color: #8b949e;
			font-size: 14px;
			line-height: 1.5;
		}

		button {
			padding: 7px 14px;
			border: 1px solid #30363d;
			border-radius: 999px;
			background: #161b22;
			color: #e6edf3;
			font: inherit;
			font-size: 13px;
			cursor: pointer;
		}

		button:hover:enabled {
			border-color: #ffa657;
			color: #ffa657;
		}

		button:disabled {
			color: #484f58;
			cursor: default;
		}

		main {
			display: flex;
			flex-wrap: wrap;
			justify-content: center;
			gap: 16px;
			max-width: 1240px;
			margin: 32px auto 0;
		}

		.card {
			padding: 20px 18px 18px;
			border: 1px solid #21262d;
			border-radius: 16px;
			background: #161b22;
		}

		.keys {
			display: flex;
			align-items: flex-end;
			gap: 12px;
			cursor: pointer;
		}

		.keys img {
			display: block;
			border-radius: 12%;
		}

		h2 {
			margin: 16px 0 2px;
			font-size: 16px;
			font-weight: 600;
		}

		.card p {
			margin-bottom: 14px;
			font-size: 13px;
		}
	</style>
</head>

<body>
	<h1>Streak tiers</h1>
	<p>Every fire the streak key can show, moving the way it moves on the Stream Deck. The small one is the real size of a key.</p>
	<button id="all">Play burst on all</button>

	<main id="cards"></main>

	<template id="card">
		<section class="card">
			<div class="keys">
				<img class="big" width="144" height="144" alt="" />
				<img class="real" width="72" height="72" alt="" />
			</div>
			<h2></h2>
			<p></p>
			<button>Play burst</button>
		</section>
	</template>

	<script>
		// The plugin packs a picture with a tool that only Node has, so this
		// is the browser's way of doing the same job. btoa only understands
		// one byte per letter, so the text is turned into bytes first.
		// Skipping that step would break on any letter that isn't plain
		// English.
		function asImage(svg) {
			let bytes = "";
			new TextEncoder().encode(svg).forEach(function (byte) {
				bytes += String.fromCharCode(byte);
			});
			return "data:image/svg+xml;base64," + btoa(bytes);
		}

		// The real drawing code, straight out of src/flames.ts and
		// src/keys.ts, each in its own room.
		const { flame, TIERS, SWAY_MS } = ${room("flames.ts", [], ["flame", "TIERS", "SWAY_MS"])}();
		const { drawStreakKey } = ${room("keys.ts", ["asImage", "flame"], ["drawStreakKey"])}(asImage, flame);

		// The same numbers and colors the plugin uses, lifted out of
		// src/animate.ts and src/actions/streak-counter.ts.
		const TURN_MS = ${constant("animate.ts", "TURN_MS")};
		const IDLE_EVERY = ${constant("animate.ts", "IDLE_EVERY")};
		const BURST_MS = ${constant("actions/streak-counter.ts", "BURST_MS")};
		const GREY = ${constant("actions/streak-counter.ts", "GREY")};

		// One card for the cold coal and one for each row of the real tier
		// table. A card's place in this list is its tier number. Each shows
		// the lowest streak that earns its tier, and its range of days runs
		// up to the day before the next tier starts.
		const cards = [{ name: "Unlit", count: 0, days: "No streak" }].concat(
			TIERS.map(function (tier, i) {
				const next = TIERS[i + 1];
				const days = next ? tier.from + " to " + (next.from - 1) + " days" : tier.from + " days and up";
				return { name: tier.name, count: tier.from, days: days };
			}),
		);

		// One key's picture at this moment, put together the way the plugin
		// does it, with the sway coming off the clock.
		function picture(tier, now) {
			const card = cards[tier];
			const burst = card.began === undefined ? undefined : (now - card.began) / BURST_MS;
			return drawStreakKey(
				String(card.count),
				"",
				GREY,
				tier,
				burst,
				(now % SWAY_MS) / SWAY_MS,
			);
		}

		function show(tier) {
			const card = cards[tier];
			const image = picture(tier, Date.now());
			card.big.src = image;
			card.real.src = image;
		}

		// Starts a burst on one key. The cold coal has nothing to flare,
		// same as on the Stream Deck.
		function play(tier) {
			if (tier === 0) return;
			cards[tier].began = Date.now();
			show(tier);
		}

		cards.forEach(function (card, tier) {
			const copy = document.getElementById("card").content.cloneNode(true);
			card.big = copy.querySelector(".big");
			card.real = copy.querySelector(".real");
			copy.querySelector("h2").textContent = card.name;
			copy.querySelector("p").textContent = card.days;
			copy.querySelector(".keys").onclick = function () {
				play(tier);
			};
			copy.querySelector("button").onclick = function () {
				play(tier);
			};
			copy.querySelector("button").disabled = tier === 0;
			document.getElementById("cards").append(copy);
			show(tier);
		});

		document.getElementById("all").onclick = function () {
			cards.forEach(function (card, tier) {
				play(tier);
			});
		};

		// The same beat as the plugin's metronome. A key in a burst gets a
		// new picture on every tick, which is 10 a second. A key that's
		// only swaying gets one on every third tick, which is what a single
		// streak key gets on the Stream Deck. It would be easy to make this
		// page smoother than that, and then it would be showing me
		// something the key can't do.
		let ticks = 0;
		setInterval(function () {
			ticks++;
			cards.forEach(function (card, tier) {
				if (card.began !== undefined) {
					if (Date.now() - card.began >= BURST_MS) card.began = undefined;
					show(tier);
				} else if (tier > 0 && ticks % IDLE_EVERY === 0) {
					show(tier);
				}
			});
		}, TURN_MS);
	</script>
</body>

</html>
`;

writeFileSync(new URL("tiers.html", import.meta.url), page);
console.log("Wrote preview/tiers.html. Open it in a browser to see the tiers.");
