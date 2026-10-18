import assert from "node:assert";
import { test } from "node:test";

import { safe } from "../src/draw.ts";
import { ask, rest } from "../src/github.ts";
import { fetchAlerts, fetchCommitWeeks, fetchRelease, pile } from "../src/github-repo.ts";
import { drawGithubKey, weekBars } from "../src/key-art.ts";
import { alertsLesson, alertWords, compareLesson, issueLesson, pullLesson, releaseLesson, runLesson, statOf } from "../src/learn.ts";
import { ago, pickBranches, stepRepo, whichRepo } from "../src/picking.ts";

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

// Protects the one escape every picture shares. A quote inside a name
// would end an SVG attribute early, and the keys used to have their own
// escape that missed it.
test("safe: a quote is escaped too, and the keys use the shared escape", () => {
	assert.strictEqual(safe('say "hi" & <bye>'), "say &quot;hi&quot; &amp; &lt;bye&gt;");
	const picture = svg(drawGithubKey({ icon: "repo", color: "#ff7eb6", big: 'a"b', small: "x" }));
	assert.ok(picture.includes("a&quot;b"));
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

// Protects Branch Comparison working with no setup: blank settings compare
// the newest branch that isn't main against main.
test("pickBranches: blank means main and the newest other branch", () => {
	const names = ["main", "fix-login", "old-idea"];
	assert.deepStrictEqual(pickBranches(["fix-login", "main", "old-idea"], "main", "", ""), { base: "main", head: "fix-login" });
	assert.deepStrictEqual(pickBranches(names, "main", "old-idea", ""), { base: "old-idea", head: "main" });
	assert.deepStrictEqual(pickBranches(names, "main", undefined, "old-idea"), { base: "main", head: "old-idea" });
	assert.deepStrictEqual(pickBranches(["main"], "main", "", ""), { base: "main", head: undefined });
});

// Protects the "ahead / behind" sentences, including the squash-merge case
// that looks ahead forever.
test("compareLesson: says ahead, behind and both in plain words", () => {
	const view = (ahead: number, behind: number) => ({
		main: "main",
		names: [],
		comparison: { base: "main", head: "my-words", ahead, behind, url: "" },
	});
	assert.strictEqual(compareLesson("leak-flow", view(2, 0), undefined).now, "my-words has 2 commits that main doesn't.");
	assert.strictEqual(compareLesson("leak-flow", view(0, 1), undefined).now, "my-words is missing 1 commit from main.");
	assert.strictEqual(compareLesson("leak-flow", view(0, 0), undefined).now, "my-words and main are the same right now.");
	assert.strictEqual(compareLesson("leak-flow", { main: "main", names: ["main"] }, undefined).now, "leak-flow only has main, so there's nothing to compare yet.");
});

// Protects the Show setting from a value it doesn't know.
test("statOf: unknown or blank falls back to stars", () => {
	assert.strictEqual(statOf("forks"), "forks");
	assert.strictEqual(statOf(undefined), "stars");
	assert.strictEqual(statOf("toString"), "stars");
});

// Protects the commit bars: eight bars, empty weeks still visible as faint
// stubs, and the busiest week as the tallest bar.
test("weekBars: a bar per week, faint stubs for empty weeks", () => {
	const drawn = weekBars([0, 0, 0, 0, 0, 9, 6, 5], "#58a6ff");
	assert.strictEqual((drawn.match(/<rect /g) ?? []).length, 8);
	assert.strictEqual((drawn.match(/opacity="0.35"/g) ?? []).length, 5);
	assert.ok(drawn.includes('height="40"'));
});

// Protects the "GitHub is still counting" wait. The first ask for a repo's
// weekly numbers can come back 202 with an empty body. This pretends to be
// GitHub for one call, then answers properly.
test("fetchCommitWeeks: waits out a 202, then keeps the last eight weeks", async () => {
	const real = globalThis.fetch;
	let calls = 0;
	globalThis.fetch = (async () => {
		calls++;
		if (calls === 1) return new Response("{}", { status: 202 });
		const weeks = Array.from({ length: 52 }, (_, i) => ({ total: i }));
		return new Response(JSON.stringify(weeks), { status: 200 });
	}) as typeof fetch;
	try {
		const result = await fetchCommitWeeks("token", "me", "repo", async () => {});
		assert.deepStrictEqual(result, { ok: true, data: [44, 45, 46, 47, 48, 49, 50, 51] });
		assert.strictEqual(calls, 2);
	} finally {
		globalThis.fetch = real;
	}
});

// Pretends to be GitHub for the length of one test: every request gets the
// same status and body back.
async function withGitHub(status: number, body: unknown, run: () => Promise<void>): Promise<void> {
	const real = globalThis.fetch;
	globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
	try {
		await run();
	} finally {
		globalThis.fetch = real;
	}
}

// Pretends to be GitHub with whatever fetch the test hands over, for the
// answers withGitHub can't make: a web page instead of JSON, or no answer
// at all.
async function withFetch(fake: (url?: string, init?: RequestInit) => Promise<Response>, run: () => Promise<void>): Promise<void> {
	const real = globalThis.fetch;
	globalThis.fetch = fake as typeof fetch;
	try {
		await run();
	} finally {
		globalThis.fetch = real;
	}
}

// Protects the one GraphQL door every question goes through: a good
// answer comes back as its data, and a missing token never reaches fetch.
test("ask: a 200 with data is the data, and no token is its own message", async () => {
	await withGitHub(200, { data: { viewer: { login: "me" } } }, async () => {
		assert.deepStrictEqual(await ask("t", "{ viewer { login } }", {}), { ok: true, data: { viewer: { login: "me" } } });
	});
	let called = false;
	await withFetch(
		async () => {
			called = true;
			return new Response("{}", { status: 200 });
		},
		async () => {
			assert.deepStrictEqual(await ask(undefined, "{ viewer { login } }", {}), { ok: false, message: "Add a token in settings", short: "No token" });
			assert.strictEqual(called, false);
		},
	);
});

// Protects the GraphQL edge: GitHub can say 200 and still refuse, with
// errors and no data. That's a permission problem, and GitHub's own
// reason rides along for the log.
test("ask: a 200 with errors and no data is a permission problem", async () => {
	await withGitHub(200, { errors: [{ message: "needs read:project" }, { message: "and again" }] }, async () => {
		const result = await ask("t", "{ viewer { login } }", {});
		assert.deepStrictEqual(result, { ok: false, message: "Token can't read this", short: "No access", detail: "needs read:project; and again" });
	});
});

// Protects the ways asking can fail: a dead token, any other GitHub error,
// a wifi login page instead of JSON, and no answer at all.
test("ask: a 401, a 500, a non-JSON reply and a dead connection each say what happened", async () => {
	await withGitHub(401, { message: "Bad credentials" }, async () => {
		assert.deepStrictEqual(await ask("t", "{ viewer { login } }", {}), { ok: false, message: "Token didn't work", short: "Bad token" });
	});
	await withGitHub(500, {}, async () => {
		assert.deepStrictEqual(await ask("t", "{ viewer { login } }", {}), { ok: false, message: "GitHub error 500", short: "Error 500" });
	});
	await withFetch(
		async () => new Response("<html>Sign in to the wifi</html>", { status: 200 }),
		async () => {
			assert.deepStrictEqual(await ask("t", "{ viewer { login } }", {}), { ok: false, message: "GitHub's answer didn't make sense", short: "Odd reply" });
		},
	);
	await withFetch(
		async () => {
			throw new TypeError("fetch failed");
		},
		async () => {
			assert.deepStrictEqual(await ask("t", "{ viewer { login } }", {}), { ok: false, message: "No internet", short: "Offline" });
		},
	);
});

// Protects the REST door the same way: a good answer is its body, and a
// token is optional, since public repos answer without one.
test("rest: a 200 is its body, and the token header is only sent when there's a token", async () => {
	const headers: (string | undefined)[] = [];
	await withFetch(
		async (_url?: string, init?: RequestInit) => {
			headers.push((init?.headers as Record<string, string>).Authorization);
			return new Response(JSON.stringify({ total_count: 3 }), { status: 200 });
		},
		async () => {
			assert.deepStrictEqual(await rest("t", "me/repo/actions/workflows"), { ok: true, data: { total_count: 3 } });
			assert.deepStrictEqual(await rest(undefined, "me/repo/actions/workflows"), { ok: true, data: { total_count: 3 } });
			assert.deepStrictEqual(headers, ["Bearer t", undefined]);
		},
	);
});

// Protects the REST edge: 204 is "nothing to send" and comes back as
// null, not as a broken reply.
test("rest: a 204 is null", async () => {
	await withFetch(
		async () => new Response(null, { status: 204 }),
		async () => {
			assert.deepStrictEqual(await rest("t", "me/repo/stats/commit_activity"), { ok: true, data: null });
		},
	);
});

// Protects the REST failures: a dead token, a repo that isn't there, any
// other error with GitHub's reason attached, a non-JSON reply, and no
// answer at all.
test("rest: 401, 404, 403 with a reason, non-JSON and a dead connection", async () => {
	await withGitHub(401, { message: "Bad credentials" }, async () => {
		assert.deepStrictEqual(await rest("t", "me/repo"), { ok: false, message: "Token didn't work", short: "Bad token" });
	});
	await withGitHub(404, { message: "Not Found" }, async () => {
		assert.deepStrictEqual(await rest("t", "me/nope"), { ok: false, message: "Repo not found", short: "No repo" });
	});
	await withGitHub(403, { message: "Dependabot alerts are disabled for this repository." }, async () => {
		assert.deepStrictEqual(await rest("t", "me/repo/dependabot/alerts"), {
			ok: false,
			message: "GitHub error 403",
			short: "Error 403",
			detail: "Dependabot alerts are disabled for this repository.",
		});
	});
	await withFetch(
		async () => new Response("<html>Sign in to the wifi</html>", { status: 200 }),
		async () => {
			assert.deepStrictEqual(await rest("t", "me/repo"), { ok: false, message: "GitHub's answer didn't make sense", short: "Odd reply" });
		},
	);
	await withFetch(
		async () => {
			throw new TypeError("fetch failed");
		},
		async () => {
			assert.deepStrictEqual(await rest("t", "me/repo"), { ok: false, message: "No internet", short: "Offline" });
		},
	);
});

// Protects the difference between "safe" and "nobody's checking": GitHub
// answers 403 with "disabled" when Dependabot is off, and that must not
// come out as 0 alerts or as a token problem.
test("fetchAlerts: Dependabot turned off is off, not zero and not an error", async () => {
	await withGitHub(403, { message: "Dependabot alerts are disabled for this repository." }, async () => {
		const result = await fetchAlerts("t", "me", "repo");
		assert.ok(result.ok && result.data.off);
	});
	await withGitHub(403, { message: "Resource not accessible by personal access token" }, async () => {
		const result = await fetchAlerts("t", "me", "repo");
		assert.ok(!result.ok && result.short === "No access");
	});
});

// Pretends to be GitHub with a different answer per address: the first
// rule whose words are in the address wins.
async function withAnswers(rules: [string, number, unknown][], run: () => Promise<void>): Promise<void> {
	const real = globalThis.fetch;
	globalThis.fetch = (async (url: string) => {
		const [, status, body] = rules.find(([words]) => String(url).includes(words)) ?? ["", 404, {}];
		return new Response(status === 204 ? null : JSON.stringify(body), { status });
	}) as typeof fetch;
	try {
		await run();
	} finally {
		globalThis.fetch = real;
	}
}

// Protects a repo with no releases: GitHub's 404 there means "none yet",
// which the key shows calmly...
test("fetchRelease: a repo with no releases says none", async () => {
	await withAnswers([["releases/latest", 404, { message: "Not Found" }], ["/repos/me/repo", 200, { name: "repo" }]], async () => {
		assert.deepStrictEqual(await fetchRelease("t", "me", "repo", false), { ok: true, data: undefined });
	});
});

// ...but a misspelled repo, or a private one the token can't see, also
// 404s there, and that must say so instead of a fake "none".
test("fetchRelease: a repo that isn't there says so", async () => {
	await withAnswers([], async () => {
		const result = await fetchRelease("t", "me", "nope", false);
		assert.ok(!result.ok && result.short === "No repo");
	});
});

// Protects an empty repo: GitHub answers its weekly commits with 204 and
// no body, which used to throw and leave the key stuck on loading.
test("fetchCommitWeeks: an empty repo is eight empty weeks", async () => {
	await withAnswers([["commit_activity", 204, null]], async () => {
		assert.deepStrictEqual(await fetchCommitWeeks("t", "me", "repo", async () => {}), { ok: true, data: [0, 0, 0, 0, 0, 0, 0, 0] });
	});
});

// Protects the Security count from stopping at GitHub's 100 per page.
test("fetchAlerts: counts past the first 100", async () => {
	const alert = { security_advisory: { severity: "low" } };
	await withAnswers([["&page=1", 200, Array(100).fill(alert)], ["&page=2", 200, Array(30).fill(alert)]], async () => {
		const result = await fetchAlerts("t", "me", "repo");
		assert.ok(result.ok && result.data.low === 130);
	});
});

// Protects the board piles: boards name their columns differently, and an
// item with no status is still work to do.
test("pile: sorts statuses by their words, no status is to do", () => {
	assert.deepStrictEqual(pile(["Todo", "In Progress", "Done", undefined, "In review", "Backlog", "Shipped"]), { todo: 3, doing: 2, done: 2 });
});

// Protects the security sentences, worst first.
test("alerts: words go worst first, and off says off", () => {
	assert.strictEqual(alertWords({ off: false, critical: 0, high: 2, medium: 0, low: 1 }), "2 high and 1 low");
	assert.strictEqual(
		alertsLesson("leak-flow", { off: true, critical: 0, high: 0, medium: 0, low: 0 }, undefined).now,
		"Dependabot is off for leak-flow, so nothing is checking its packages. Off isn't the same as safe.",
	);
});

// Protects the release sentences for none and for a pre-release.
test("releaseLesson: none yet, and a pre-release says so", () => {
	assert.strictEqual(releaseLesson("karaoke-maker", null, undefined, NOW).now, "karaoke-maker hasn't had a release yet.");
	const pre = { tag: "v2.0.0-beta", name: "", at: "2026-10-13T12:00:00Z", pre: true, url: "" };
	assert.strictEqual(releaseLesson("leak-flow", pre, undefined, NOW).now, "leak-flow is on v2.0.0-beta, a pre-release, released 2 days ago.");
});

// Protects issues turned off (forks start that way) from showing as a
// red problem: it's an answer, with its own calm sentence.
test("issues turned off is an answer, not an error", () => {
	const off = { url: "", private: false, open: 0, closed: 0, merged: 0, off: true };
	assert.strictEqual(
		issueLesson("WhisperKey", off, undefined, NOW).now,
		"Issues are turned off for WhisperKey in its settings, so there's nowhere to file one. Forks start that way.",
	);
});
