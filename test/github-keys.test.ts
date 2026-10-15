import assert from "node:assert";
import { test } from "node:test";

import { drawGithubKey } from "../src/key-art.ts";
import { issueLesson, pullLesson, runLesson } from "../src/learn.ts";
import { ago, stepRepo, whichRepo } from "../src/picking.ts";

const NOW = Date.parse("2026-10-15T12:00:00Z");

function svg(image: string): string {
	return Buffer.from(image.split(",")[1], "base64").toString();
}

// Protects "Follow the Repo key" as the default: a brand new key has no
// setting at all and has to follow.
test("whichRepo: no setting follows the Repo key, a pinned repo stays put", () => {
	assert.strictEqual(whichRepo(undefined, "leak-flow"), "leak-flow");
	assert.strictEqual(whichRepo("", "leak-flow"), "leak-flow");
	assert.strictEqual(whichRepo(" karaoke-maker ", "leak-flow"), "karaoke-maker");
	assert.strictEqual(whichRepo(undefined, ""), undefined);
});

// Protects the Repo key's press: it goes round the list, and a repo that
// vanished from the list starts over at the newest instead of getting stuck.
test("stepRepo: wraps at the end, and starts over when the repo is gone", () => {
	const names = ["a", "b", "c"];
	assert.strictEqual(stepRepo(names, "a", 1), "b");
	assert.strictEqual(stepRepo(names, "c", 1), "a");
	assert.strictEqual(stepRepo(names, "a", -1), "c");
	assert.strictEqual(stepRepo(names, "deleted", 1), "a");
	assert.strictEqual(stepRepo([], "a", 1), undefined);
});

// Protects the bottom line of the keys from odd wording at the edges.
test("ago: minutes, hours, one day, days, months", () => {
	assert.strictEqual(ago("2026-10-15T11:59:40Z", NOW), "just now");
	assert.strictEqual(ago("2026-10-15T11:15:00Z", NOW), "45 min ago");
	assert.strictEqual(ago("2026-10-15T07:00:00Z", NOW), "5 hr ago");
	assert.strictEqual(ago("2026-10-14T10:00:00Z", NOW), "1 day ago");
	assert.strictEqual(ago("2026-09-29T12:00:00Z", NOW), "16 days ago");
	assert.strictEqual(ago("2026-06-01T12:00:00Z", NOW), "4 mo ago");
});

// Protects against gray squares on the deck: the key is pure black.
test("drawGithubKey: the background is pure black", () => {
	const picture = svg(drawGithubKey({ icon: "pr", color: "#bc8cff", big: "3", small: "3 open" }));
	assert.ok(picture.includes('<rect width="144" height="144" fill="#000000"/>'));
});

// Protects the picture from a repo name with SVG characters in it.
test("drawGithubKey: names are escaped", () => {
	const picture = svg(drawGithubKey({ icon: "repo", color: "#ff7eb6", big: "a<b&c", small: "x" }));
	assert.ok(picture.includes("a&lt;b&amp;c"));
});

// Protects long repo names from running off the key: they shrink, and only
// past the smallest readable size do they get cut short.
test("drawGithubKey: long names shrink to fit, very long ones get cut", () => {
	const medium = svg(drawGithubKey({ icon: "repo", color: "#ff7eb6", big: "karaoke-maker", small: "" }));
	const size = Number(medium.match(/font-size="(\d+)" font-weight="700"/)![1]);
	assert.ok(size * 0.62 * "karaoke-maker".length <= 136);
	assert.ok(medium.includes(">karaoke-maker<"));

	const long = svg(drawGithubKey({ icon: "repo", color: "#ff7eb6", big: "a-really-long-repository-name-here", small: "" }));
	assert.ok(long.includes("…"));
});

// Protects the private lock: only on private repos.
test("drawGithubKey: the lock only shows for a private repo", () => {
	const lock = 'stroke-width="2"/><path d="M8 11V8';
	assert.ok(svg(drawGithubKey({ icon: "repo", color: "#ff7eb6", big: "x", small: "", lock: true })).includes(lock));
	assert.ok(!svg(drawGithubKey({ icon: "repo", color: "#ff7eb6", big: "x", small: "" })).includes(lock));
});

// Protects the "something's off" look: the drawing goes gray and the words
// turn red, so a broken key never looks like a real number.
test("drawGithubKey: a quiet alarmed key is gray with red words", () => {
	const picture = svg(drawGithubKey({ icon: "pr", color: "#bc8cff", big: "–", small: "Bad token", quiet: true, alarm: true }));
	assert.ok(!picture.includes("#bc8cff"));
	assert.ok(picture.includes('fill="#ff7b72"'));
});

// Protects "Right now" from showing a number when the last try failed,
// which is the mistake that made the other plugin show 0 for a dead token.
test("lessons: a failure says why, not a number", () => {
	const lesson = pullLesson("leak-flow", undefined, "Token didn't work", NOW);
	assert.strictEqual(lesson.now, "Couldn't check leak-flow: Token didn't work.");
});

// Protects the everyday sentences.
test("lessons: right now reads naturally for none, one and many", () => {
	const counts = { url: "", private: false, open: 0, closed: 4, merged: 7, oldest: undefined };
	assert.strictEqual(pullLesson("leak-flow", counts, undefined, NOW).now, "Nothing open on leak-flow. 7 pull requests merged so far.");
	const one = { ...counts, open: 1, oldest: "2026-10-12T12:00:00Z" };
	assert.strictEqual(issueLesson("leak-flow", one, undefined, NOW).now, "1 open issue on leak-flow. The oldest is from 3 days ago.");
});

// Protects the calm "no workflows" case: most of my repos have none, and
// that isn't an error.
test("lessons: a repo with no workflows says so calmly", () => {
	assert.strictEqual(runLesson("house-os", { workflows: 0 }, undefined, NOW).now, "house-os has no workflows yet, so nothing runs on a push.");
});
