import assert from "node:assert";
import { test } from "node:test";

import {
	type Lane,
	laneLink,
	lanesFrom,
	layout,
	parseAhead,
	parseRefs,
	parseRepo,
	parseStatus,
	pick,
	ROWS,
} from "../src/branches.ts";
import { drawBranches } from "../src/draw.ts";

// A repo the way github.ts hands it over, with nothing in it yet.
function network(parts: { branches?: object[]; merged?: object[] }) {
	return { url: "https://github.com/me/repo", main: "main", branches: [], merged: [], ...parts } as never;
}

const pr = (branch: string, oid: string, start: string, mergedAt: string) => ({ number: 2, branch, oid, start, mergedAt });

// Protects against my squash merges showing every leftover branch as
// open. GitHub still counts a squash-merged branch as ahead of main.
test("lanes: a merged branch still on its pull request's commit is a loop, not an open lane", () => {
	const lanes = lanesFrom(
		network({
			merged: [pr("bigger-queue", "aaa", "2026-10-10T20:47:00Z", "2026-10-10T21:16:00Z")],
			branches: [{ name: "bigger-queue", oid: "aaa", ahead: 27, firstCommit: "2026-10-06T00:00:00Z" }],
		}),
	);
	assert.deepStrictEqual(lanes, [{ name: "bigger-queue", start: "2026-10-10T20:47:00Z", end: "2026-10-10T21:16:00Z", pr: 2 }]);
});

// Protects a branch I kept working on after its pull request merged.
test("lanes: a merged branch with new commits shows as open again", () => {
	const lanes = lanesFrom(
		network({
			merged: [pr("atlas", "aaa", "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z")],
			branches: [{ name: "atlas", oid: "bbb", ahead: 3, firstCommit: "2026-10-03T00:00:00Z" }],
		}),
	);
	assert.strictEqual(lanes.filter((lane) => !lane.end).length, 1);
});

// Protects open lanes from branches that have nothing main doesn't, like
// one made and never committed to.
test("lanes: a branch that isn't ahead of main isn't shown", () => {
	const lanes = lanesFrom(network({ branches: [{ name: "empty", oid: "ccc", ahead: 0 }] }));
	assert.deepStrictEqual(lanes, []);
});

// My Mac's side of a repo, the way git.ts hands it over.
const mac = (branches: object[], current?: string, dirty = false) => ({ branches, current, dirty }) as never;

// Protects the whole point of the local lanes: a branch I never pushed
// shows up, and it's marked as local so it gets drawn dashed.
test("lanes: a branch only on my Mac is an open local lane", () => {
	const lanes = lanesFrom(
		network({}),
		mac([{ name: "try-dashes", oid: "ddd", ahead: 2, firstCommit: "2026-10-15T19:30:11Z" }]),
	);
	assert.deepStrictEqual(lanes, [{ name: "try-dashes", start: "2026-10-15T19:30:11Z", local: true }]);
});

// Protects against every pushed branch showing up twice, once from GitHub
// and once from my Mac.
test("lanes: a local branch GitHub also has only shows once, as GitHub's", () => {
	const lanes = lanesFrom(
		network({ branches: [{ name: "pushed", oid: "eee", ahead: 1, firstCommit: "2026-10-14T00:00:00Z" }] }),
		mac([{ name: "pushed", oid: "eee", ahead: 1, firstCommit: "2026-10-14T00:00:00Z" }]),
	);
	assert.strictEqual(lanes.length, 1);
	assert.strictEqual(lanes[0].local, undefined);
});

// Protects against my old local branches haunting the map. After a squash
// merge GitHub deletes its copy, mine stays, and git counts it as ahead.
test("lanes: a local branch still on its merged pull request's commit isn't open", () => {
	const lanes = lanesFrom(
		network({ merged: [pr("branch-dial", "fff", "2026-10-15T00:00:00Z", "2026-10-15T01:00:00Z")] }),
		mac([{ name: "branch-dial", oid: "fff", ahead: 9, firstCommit: "2026-10-15T00:00:00Z" }]),
	);
	assert.strictEqual(lanes.filter((lane) => !lane.end).length, 0);
});

// Protects the uncommitted mark from landing on the wrong lane, or on any
// lane at all when everything is committed.
test("lanes: only the checked out branch gets the uncommitted mark, and only when dirty", () => {
	const branches = [
		{ name: "a", oid: "1", ahead: 1, firstCommit: "2026-10-14T00:00:00Z" },
		{ name: "b", oid: "2", ahead: 1, firstCommit: "2026-10-15T00:00:00Z" },
	];
	const dirty = lanesFrom(network({}), mac(branches, "b", true));
	assert.deepStrictEqual(
		dirty.map((lane) => lane.dirty),
		[undefined, true],
	);
	const clean = lanesFrom(network({}), mac(branches, "b", false));
	assert.ok(clean.every((lane) => !lane.dirty));
});

// Protects which refs count as mine and which are origin's, including a
// name with a "/" in it.
test("parseRefs: splits my branches from origin's", () => {
	const { heads, origin } = parseRefs(
		"refs/heads/main\taaa\nrefs/heads/feature/login\tbbb\nrefs/remotes/origin/HEAD\taaa\nrefs/remotes/origin/main\taaa\n",
	);
	assert.deepStrictEqual([...heads], [["main", "aaa"], ["feature/login", "bbb"]]);
	assert.ok(origin.has("main"));
	assert.ok(!heads.has("HEAD"));
});

// Protects the order on the map: git's dates are in my time zone, GitHub's
// are UTC, and layout compares them as text. Both have to look the same.
test("parseAhead: counts commits and turns the oldest date into GitHub's format", () => {
	const ahead = parseAhead("2026-10-15T15:00:00-05:00\n2026-10-15T14:30:11-05:00\n");
	assert.deepStrictEqual(ahead, { ahead: 2, firstCommit: "2026-10-15T19:30:11Z" });
	assert.deepStrictEqual(parseAhead(""), { ahead: 0, firstCommit: undefined });
});

// Protects the checked out branch name in every shape git's status line
// comes in, and the dirty check.
test("parseStatus: reads the branch and whether anything is uncommitted", () => {
	assert.deepStrictEqual(parseStatus("## local-branches...origin/local-branches [ahead 1]\n M src/draw.ts\n"), {
		current: "local-branches",
		dirty: true,
	});
	assert.deepStrictEqual(parseStatus("## try-dashes\n"), { current: "try-dashes", dirty: false });
	assert.deepStrictEqual(parseStatus("## No commits yet on main\n?? notes.md\n"), { current: "main", dirty: true });
	assert.deepStrictEqual(parseStatus("## HEAD (no branch)\n"), { dirty: false });
});

// Three lanes, at the times given as hours on one day.
function lane(name: string, start: number, end?: number): Lane {
	const at = (hour: number) => `2026-10-10T${String(hour).padStart(2, "0")}:00:00Z`;
	return { name, start: at(start), ...(end === undefined ? {} : { end: at(end) }) };
}

// Protects the row packing: lanes that overlap in time can't share a row,
// and one that starts after another ends reuses its row.
test("layout: overlapping lanes get their own rows, later ones reuse them", () => {
	const placed = layout([lane("a", 1, 4), lane("b", 2, 3), lane("c", 5, 6)], 800);
	const row = (name: string) => placed.find((p) => p.name === name)!.row;
	assert.notStrictEqual(row("a"), row("b"));
	assert.strictEqual(row("c"), 0);
});

// Protects the bottom of the strip, which is kept for the picked name.
test("layout: a lane with no free row is left off", () => {
	const lanes = [lane("a", 1, 9), lane("b", 2, 9), lane("c", 3, 9)];
	const placed = layout(lanes, 800);
	assert.strictEqual(placed.length, ROWS);
	assert.ok(placed.every((p) => p.row < ROWS));
});

// Protects the branches I'm still working on when there isn't room for
// everything: two dials fit four lanes, and the open one has to be one.
test("layout: open lanes are kept before old merged ones", () => {
	const lanes = [lane("one", 1, 2), lane("two", 3, 4), lane("three", 5, 6), lane("four", 7, 8), lane("open", 0)];
	const names = layout(lanes, 400).map((p) => p.name);
	assert.ok(names.includes("open"));
	assert.ok(!names.includes("one"));
});

// Protects the "still going" look: an open lane ends at the right edge.
test("layout: an open lane runs to the right edge", () => {
	const [open] = layout([lane("open", 1)], 400);
	assert.strictEqual(open.open, true);
	assert.ok(open.to > 390);
});

// Protects the name along the bottom: lanes keep their whole names now,
// since they're only shown one at a time.
test("layout: names are never shortened", () => {
	const name = "a-very-long-branch-name-that-goes-on";
	const [first] = layout([lane(name, 1, 2), lane("next", 3, 4)], 200);
	assert.strictEqual(first.name, name);
});

// Protects what I see first: the branch I'm working on, not an old one.
test("pick: starts on the newest open branch", () => {
	const placed = layout([lane("old-open", 1), lane("merged", 2, 3), lane("new-open", 4)], 800);
	assert.strictEqual(placed[pick(placed, undefined)].name, "new-open");
});

// Protects the pick from jumping to a different branch when a refresh
// adds one further left and every position shifts.
test("pick: follows the branch by name, not by position", () => {
	const before = layout([lane("b", 3, 4), lane("c", 5, 6)], 800);
	const after = layout([lane("a", 1, 2), lane("b", 3, 4), lane("c", 5, 6)], 800);
	assert.strictEqual(after[pick(after, before[0].name)].name, "b");
});

// Protects a pick that fell off the map (deleted, or pushed out by newer
// ones) from leaving nothing picked.
test("pick: a branch that's gone falls back to the newest lane", () => {
	const placed = layout([lane("a", 1, 2), lane("b", 3, 4)], 800);
	assert.strictEqual(pick(placed, "deleted"), 1);
});

// Protects the tap: a merged branch is usually deleted, so it has to go to
// its pull request, and a "/" in a branch name has to stay a "/".
test("laneLink: merged goes to the pull request, open goes to the branch", () => {
	const [merged] = layout([{ name: "x", start: "2026-10-01", end: "2026-10-02", pr: 7 }], 200);
	const [open] = layout([lane("feature/log in", 1)], 200);
	assert.strictEqual(laneLink("https://github.com/me/repo", merged), "https://github.com/me/repo/pull/7");
	assert.strictEqual(laneLink("https://github.com/me/repo", open), "https://github.com/me/repo/tree/feature/log%20in");
});

// Protects the tap on a branch GitHub has never seen from opening a 404.
test("laneLink: a branch only on my Mac has no link", () => {
	const [local] = layout([{ ...lane("try-dashes", 1), local: true }], 200);
	assert.strictEqual(laneLink("https://github.com/me/repo", local), undefined);
});

// Protects the repo setting from pasted links and leftovers.
test("parseRepo: takes a name or owner/name, and nothing else", () => {
	assert.deepStrictEqual(parseRepo("karaoke-maker"), { owner: undefined, name: "karaoke-maker" });
	assert.deepStrictEqual(parseRepo(" someone/their.repo "), { owner: "someone", name: "their.repo" });
	assert.strictEqual(parseRepo("someone/"), undefined);
	assert.strictEqual(parseRepo("https://github.com/someone/repo"), undefined);
	assert.strictEqual(parseRepo(""), undefined);
});

function svg(image: string): string {
	return Buffer.from(image.split(",")[1], "base64").toString();
}

// Protects the picture from a branch name with SVG characters in it.
test("draw: branch names are escaped", () => {
	const placed = layout([lane("fix<b>&more", 1, 2)], 800);
	const picture = svg(drawBranches(placed, "main", 800, 0, 0));
	assert.ok(picture.includes("fix&lt;b&gt;&amp;more"));
	assert.ok(!picture.includes("<b>"));
});

// Protects against gray squares on the deck: anything filled with the
// background color has to be pure black, the same as the deck itself.
test("draw: the rings on main are filled with pure black", () => {
	const placed = layout([lane("a", 1, 2), lane("b", 3, 4)], 400);
	const picture = svg(drawBranches(placed, "main", 400, 0, 0));
	const fills = [...picture.matchAll(/<circle[^>]*fill="([^"]+)"[^>]*stroke=/g)].map((m) => m[1]);
	assert.ok(fills.length > 0);
	assert.ok(fills.every((fill) => fill === "#000000"));
});

// Protects the fade from turning lanes gray: a faded lane is its own color
// at lower opacity, never a gray color.
test("draw: only the picked lane is bright", () => {
	const placed = layout([lane("a", 1, 2), lane("b", 3, 4)], 400);
	const picture = svg(drawBranches(placed, "main", 400, 0, 1));
	assert.strictEqual((picture.match(/<g opacity="0.3">/g) ?? []).length, 1);
	assert.ok(picture.includes(">b</text>"));
	assert.ok(!picture.includes(">a</text>"));
});

// Protects telling the two kinds of open lane apart: only my Mac's lanes
// are dashed, and their line along the bottom says where they live.
test("draw: a branch only on my Mac is dashed and says so", () => {
	const placed = layout([lane("pushed", 1), { ...lane("try-dashes", 2), local: true }], 800);
	const local = placed.findIndex((p) => p.local);
	const picture = svg(drawBranches(placed, "main", 800, 0, local));
	assert.strictEqual((picture.match(/stroke-dasharray/g) ?? []).length, 1);
	assert.ok(picture.includes(">only on my Mac</text>"));
	assert.ok(!picture.includes(">still open</text>"));
});
