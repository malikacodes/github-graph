import type { Network } from "./github";

// One branch on the metro map. end is when it merged back into main.
// An open branch has no end, so its lane runs off the right side.
export type Lane = {
	name: string;
	start: string;
	end?: string;
	pr?: number; // the pull request it merged through
	local?: boolean; // only on my Mac, never pushed
	dirty?: boolean; // checked out, with changes I haven't committed
};

// What git on my Mac says about the same repo. branches are my local
// branches other than main, in the same shape as GitHub's. current is the
// branch I have checked out, and dirty means it has uncommitted changes.
export type Local = {
	branches: { name: string; oid: string; ahead: number; firstCommit?: string }[];
	current?: string;
	dirty: boolean;
};

// Sorts what GitHub sent into lanes: a loop for every merged pull request,
// and an open lane for every branch with work main doesn't have yet. Branches
// that only exist on my Mac get open lanes too, when local is there.
//
// The tricky one is a merged branch I never deleted. My pull requests get
// squash merged, which copies the work onto main as one new commit, so
// GitHub still counts the branch's own commits as missing from main. If
// "ahead of main" were the only test, every old branch would show as open.
// So a branch that's still on exactly the commit its pull request merged
// from counts as merged. One with new commits after that is open again.
// The same goes for a local branch whose pull request merged and whose
// GitHub copy got deleted: my Mac still has it, sitting on that commit.
export function lanesFrom(network: Network, local?: Local): Lane[] {
	const mergedTips = new Set(network.merged.map((pr) => pr.oid));
	const isOpen = (branch: Network["branches"][number]) =>
		branch.ahead > 0 && branch.firstCommit !== undefined && !mergedTips.has(branch.oid);

	const lanes: Lane[] = network.merged.map((pr) => ({ name: pr.branch, start: pr.start, end: pr.mergedAt, pr: pr.number }));
	for (const branch of network.branches.filter(isOpen)) {
		lanes.push({ name: branch.name, start: branch.firstCommit! });
	}

	// A local branch only gets a lane if GitHub doesn't have one by that
	// name. Pushed branches are already on the map from GitHub's side.
	const onGitHub = new Set([network.main, ...network.branches.map((branch) => branch.name)]);
	for (const branch of (local?.branches ?? []).filter((branch) => !onGitHub.has(branch.name) && isOpen(branch))) {
		lanes.push({ name: branch.name, start: branch.firstCommit!, local: true });
	}

	// The uncommitted mark goes on whichever lane is the checked out branch.
	// If that's main, there's no lane for it, and draw.ts marks main instead.
	if (local?.dirty) {
		for (const lane of lanes) if (lane.name === local.current) lane.dirty = true;
	}
	return lanes;
}

// --- Reading git on my Mac ---
// git.ts runs the commands. These turn what they print into data, so they
// can be tested without a repo.

// `git for-each-ref --format="%(refname)%09%(objectname)" refs/heads refs/remotes/origin`
// prints one ref per line: its full name, a tab, and the commit it's on.
// heads are my local branches. origin is what my Mac last heard GitHub
// has, which can be out of date, so lanesFrom never trusts it for "is it on
// GitHub". It's only here so main can be compared against origin's main.
export function parseRefs(text: string): { heads: Map<string, string>; origin: Set<string> } {
	const heads = new Map<string, string>();
	const origin = new Set<string>();
	for (const line of text.split("\n")) {
		const [ref, oid] = line.split("\t");
		if (!ref || !oid) continue;
		if (ref.startsWith("refs/heads/")) heads.set(ref.slice("refs/heads/".length), oid);
		else if (ref.startsWith("refs/remotes/origin/")) origin.add(ref.slice("refs/remotes/origin/".length));
	}
	return { heads, origin };
}

// `git log --format=%aI <branch> --not <main>` prints the date of every
// commit the branch has that main doesn't, newest first, one per line. So
// the count is how far ahead it is, and the last line is where it started.
//
// git writes the date in my time zone ("14:30:11-05:00") and GitHub writes
// it in UTC ("19:30:11Z"). layout sorts dates as plain text, so they have to
// match or a local branch lands in the wrong spot. This turns git's into
// GitHub's.
export function parseAhead(text: string): { ahead: number; firstCommit?: string } {
	const dates = text.split("\n").filter((line) => line.trim());
	const oldest = dates.at(-1);
	const firstCommit = oldest ? new Date(oldest).toISOString().replace(/\.\d{3}Z$/, "Z") : undefined;
	return { ahead: dates.length, firstCommit };
}

// `git status --porcelain=v1 --branch` starts with a "## " line about the
// branch, then one line per changed file. Porcelain is git's word for
// "output that won't change between versions", so it's safe to read.
//   ## local-branches...origin/local-branches [ahead 1]
//   ## No commits yet on main
//   ## HEAD (no branch)          <- detached, nothing checked out by name
export function parseStatus(text: string): { current?: string; dirty: boolean } {
	const [first = "", ...rest] = text.split("\n");
	const dirty = rest.some((line) => line.trim());

	const header = first.replace(/^## /, "");
	if (header.startsWith("HEAD (no branch)")) return { dirty };
	const current = header.replace(/^No commits yet on /, "").split("...")[0].split(" ")[0];
	return { current: current || undefined, dirty };
}

// A lane with a spot on the strip, in pixels. from is where it leaves
// main, to is where it comes back (or the right edge, for an open one).
// The name isn't drawn on the lane. It shows along the bottom of the strip
// when the lane is the one picked (see pick below).
export type Placed = {
	name: string;
	row: number; // 0 is the row right under main
	from: number;
	to: number;
	slant: number; // how far along the strip it curves down from main and back up
	open: boolean;
	merged?: string; // when it merged, for the line along the bottom
	pr?: number;
	local?: boolean;
	dirty?: boolean;
	color: string;
};

// Two rows of lanes under main. The bottom of the strip is kept for the
// picked lane's name.
export const ROWS = 2;

// Two lanes per dial, so a lane is never so short its curves squash flat.
const LANES_PER_DIAL = 2;

// Room at the edges, so the first fork and the open lanes' end dots
// don't touch the sides of the strip.
const LEFT = 10;
const RIGHT = 6;

// How far along the strip a lane curves on its way down from main and
// back up.
const SLANT = 24;

// The lane colors, in the order lanes start. Main is blue (see draw.ts),
// so blue isn't in here.
const COLORS = ["#3fb950", "#d2a8ff", "#e3b341", "#f778ba", "#56d4dd", "#ff7b72"];

// Lays the lanes out like a metro map: in order, not to scale. Every
// "branch started" and "branch merged" gets the same step along the strip,
// in the order they happened. My pull requests often live for half an
// hour, and on a to-scale month that's less than a pixel.
//
// width is the whole strip across every dial showing this repo. The lanes
// come back in left to right order, which is the order turning the dial
// steps through them.
export function layout(lanes: Lane[], width: number): Placed[] {
	// Open branches go first, since they're the ones I'm still working on.
	// Then merged ones, newest first, until there's no more room.
	const byNewest = (a: Lane, b: Lane) => (b.end ?? "").localeCompare(a.end ?? "");
	const open = lanes.filter((lane) => !lane.end).sort((a, b) => b.start.localeCompare(a.start));
	const merged = lanes.filter((lane) => lane.end).sort(byNewest);
	const wanted = [...open, ...merged].slice(0, (width / 200) * LANES_PER_DIAL);

	// Rows are filled like seats on a train: each lane takes the first row
	// that's empty for its whole trip. A lane with no free row is left off.
	// Overlap only depends on which events come before which, so leaving a
	// lane off never makes two others crash, and the steps can be worked
	// out again from just the lanes that made it.
	const kept: { lane: Lane; row: number }[] = [];
	const order = events(wanted);
	for (const lane of wanted) {
		const [start, end] = order.get(lane)!;
		const row = [...Array(ROWS).keys()].find((r) =>
			kept.every((k) => {
				if (k.row !== r) return true;
				const [otherStart, otherEnd] = order.get(k.lane)!;
				return otherEnd < start || otherStart > end;
			}),
		);
		if (row !== undefined) kept.push({ lane, row });
	}

	// The final steps, from the lanes that made it. When anything is still
	// open, "now" gets a step of its own at the right end, so a branch I
	// started a minute ago doesn't fork right against the edge.
	const final = events(kept.map((k) => k.lane));
	const last = Math.max(-1, ...[...final.values()].flat().filter(Number.isFinite));
	const anyOpen = kept.some((k) => !k.lane.end);
	const steps = last + (anyOpen ? 1 : 0);
	const step = steps > 0 ? (width - LEFT - RIGHT) / steps : 0;
	const x = (i: number) => (Number.isFinite(i) ? LEFT + i * step : width - RIGHT);

	// Colors go in the order lanes start, so they read left to right.
	kept.sort((a, b) => final.get(a.lane)![0] - final.get(b.lane)![0]);

	return kept.map(({ lane, row }, i) => {
		const from = x(final.get(lane)![0]);
		const to = x(final.get(lane)![1]);
		return {
			name: lane.name,
			row,
			from,
			to,
			// Short lanes curve in tighter so their two curves never cross.
			slant: Math.min(SLANT, (to - from) / 2),
			open: !lane.end,
			merged: lane.end,
			pr: lane.pr,
			local: lane.local,
			dirty: lane.dirty,
			color: COLORS[i % COLORS.length],
		};
	});
}

// Which lane is picked. It's remembered by name, not by position, so a
// refresh that adds a branch on the left doesn't quietly move the pick to
// a different one. With nothing picked yet, or a pick that's gone off the
// map, it's the newest open branch, since that's what I'm working on. With
// nothing open, it's the newest lane, at the right.
export function pick(lanes: Placed[], name: string | undefined): number {
	const named = lanes.findIndex((lane) => lane.name === name);
	if (named >= 0) return named;

	const open = lanes.map((lane, i) => (lane.open ? i : -1)).filter((i) => i >= 0);
	if (open.length) return open.reduce((a, b) => (lanes[b].from > lanes[a].from ? b : a));
	return lanes.length - 1;
}

// Numbers every start and end in time order. An open lane's end is
// Infinity, which is always after everything else.
function events(lanes: Lane[]): Map<Lane, [number, number]> {
	const times = lanes.flatMap((lane) => [lane.start, ...(lane.end ? [lane.end] : [])]).sort();
	const order = new Map<Lane, [number, number]>();
	const used = new Set<number>();

	// Two events at the exact same second still get their own step, so
	// each one takes the first matching slot nobody has claimed yet.
	const claim = (time: string) => {
		let i = times.indexOf(time);
		while (used.has(i)) i = times.indexOf(time, i + 1);
		used.add(i);
		return i;
	};

	for (const lane of lanes) {
		order.set(lane, [claim(lane.start), lane.end ? claim(lane.end) : Infinity]);
	}
	return order;
}

// Where tapping a lane goes on GitHub. A merged lane goes to its pull
// request, since the branch itself is often deleted after merging. An open
// one goes to the branch. Each part of a name like "feature/login" is made
// safe for a link on its own, so the "/" between them stays a "/".
// A branch that's only on my Mac has nothing on GitHub to open.
export function laneLink(repoUrl: string, lane: Placed): string | undefined {
	if (lane.local) return undefined;
	if (lane.pr) return `${repoUrl}/pull/${lane.pr}`;
	return `${repoUrl}/tree/${lane.name.split("/").map(encodeURIComponent).join("/")}`;
}

// Reads a repo setting. The repo picker saves "karaoke-maker" for a
// repo of mine, and "someone/their-repo" works too. Anything else, like a
// pasted link, isn't a repo.
export function parseRepo(text: string | undefined): { owner?: string; name: string } | undefined {
	const match = text?.trim().match(/^(?:([\w.-]+)\/)?([\w.-]+)$/);
	if (!match) return undefined;
	return { owner: match[1], name: match[2] };
}
