import type { Comparison, Counts, Run, Stats } from "./github";
import { ago, count } from "./picking.ts";

// What each GitHub key's settings page says, row by row, in the same shape
// as the Mac Vitals pages: what the key is, what it's showing right now,
// what's normal, a few words worth knowing, one small thing to try, and
// what a press does. "Right now" is written fresh from the key's latest
// numbers, so the page always matches the key.

export type Lesson = {
	thisIs: string;
	now: string;
	normal: string[];
	words: [string, string][];
	tryThis: string;
	press: string;
};

// What "Right now" says before there's anything to say.
function waiting(repo: string | undefined, message: string | undefined): string | undefined {
	if (!repo) return "No repo yet. Pick one above, or press the Repo key.";
	if (message) return `Couldn't check ${repo}: ${message}.`;
	return undefined;
}

export function repoLesson(repo: string | undefined, place: number, total: number, locked: boolean): Lesson {
	return {
		thisIs: "The repo every GitHub key follows. Pick one here, or press the key to step to the next one.",
		now: repo
			? `${repo}${locked ? ", a private repo" : ""}. It's number ${place} of ${total}, newest push first.`
			: "No repo picked yet.",
		normal: [
			"The list starts with whatever I pushed to most recently",
			"A lock means private: only people I add can see it",
			"Keys set to a specific repo stay put. Only the ones following move",
		],
		words: [
			["Repo", "short for repository: one project's folder of code, with its whole history"],
			["Push", "sending commits from my Mac up to GitHub"],
			["Private", "hidden from everyone except me and anyone I invite"],
		],
		tryThis: "Press the key a few times and watch every key on the page change to the new repo together.",
		press: "Steps to the next repo. After the last one it goes back to the first.",
	};
}

export function pullLesson(repo: string | undefined, counts: Counts | undefined, message: string | undefined, now: number): Lesson {
	let right = waiting(repo, message);
	if (!right && counts) {
		right =
			counts.open === 0
				? `Nothing open on ${repo}. ${count(counts.merged, "pull request")} merged so far.`
				: `${count(counts.open, "pull request")} open on ${repo}. The oldest was opened ${ago(counts.oldest!, now)}.`;
	}
	return {
		thisIs: "How many pull requests are open on the repo: changes waiting to be merged into main.",
		now: right ?? "Checking...",
		normal: [
			"0 most days on a solo repo: I open one, merge it, and it's gone",
			"1 while I'm partway through a feature",
			"An old one sitting open usually means something I forgot to merge or close",
		],
		words: [
			["Pull request", "asking to bring the commits on a branch into main, with a page to look them over first"],
			["Merge", "accepting it: the branch's work becomes part of main"],
			["Squash merge", "merging all of a branch's commits as one new commit on main"],
			["Draft", "a pull request marked as not ready yet"],
		],
		tryThis: "Make a branch, push one commit, and open a pull request. The key goes up by one. Merge it and watch it go back down.",
		press: "Opens the repo's pull requests on GitHub.",
	};
}

export function issueLesson(repo: string | undefined, counts: Counts | undefined, message: string | undefined, now: number): Lesson {
	let right = waiting(repo, message);
	if (!right && counts) {
		right =
			counts.open === 0
				? `No open issues on ${repo}. ${count(counts.closed, "issue")} closed so far.`
				: `${count(counts.open, "open issue")} on ${repo}. The oldest is from ${ago(counts.oldest!, now)}.`;
	}
	return {
		thisIs: "How many issues are open on the repo: notes about bugs, ideas and things to do.",
		now: right ?? "Checking...",
		normal: [
			"0 to 5 open on a small project, mostly notes to myself",
			"Closed should slowly outgrow open",
			"A pull request can close an issue by saying \"Fixes #3\" in its description",
		],
		words: [
			["Issue", "a note on the repo about a bug, an idea or a job to do, with a number like #3"],
			["Open", "still to do"],
			["Closed", "done, or decided against"],
			["Label", "a colored tag for sorting issues, like bug or idea"],
		],
		tryThis: "Open an issue called \"test the deck\" on a repo, watch the key go up, then close it.",
		press: "Opens the repo's issues on GitHub.",
	};
}

export function runLesson(repo: string | undefined, run: Run | undefined, message: string | undefined, now: number): Lesson {
	let right = waiting(repo, message);
	if (!right && run) {
		if (run.workflows === 0) right = `${repo} has no workflows yet, so nothing runs on a push.`;
		else if (!run.status) right = `${repo} has a workflow that hasn't run yet.`;
		else if (run.status !== "completed") right = `"${run.name}" is running now on ${run.branch}.`;
		else right = `"${run.name}" ${outcome(run.conclusion)} on ${run.branch}, ${ago(run.at!, now)}.`;
	}
	return {
		thisIs: "The latest GitHub Actions run on the repo: the checks GitHub runs by itself when I push.",
		now: right ?? "Checking...",
		normal: [
			"Most of my repos have no workflows, and that's fine",
			"On a repo that has one: green almost always",
			"Red means the last run failed. The run's page says which step",
		],
		words: [
			["Workflow", "a recipe file in .github/workflows that says what to run, and when"],
			["Run", "one time a workflow ran, start to finish"],
			["CI", "short for continuous integration: checks that run on every push"],
			["Conclusion", "how a finished run ended: success, failure or cancelled"],
		],
		tryThis: "On leak-flow, push a tiny commit and watch the key go yellow while it runs, then green.",
		press: "Opens the latest run on GitHub, or the repo's Actions page if nothing has run.",
	};
}

// A run's conclusion, as words for a sentence.
export function outcome(conclusion: string | null | undefined): string {
	switch (conclusion) {
		case "success":
			return "passed";
		case "failure":
			return "failed";
		case "cancelled":
			return "was cancelled";
		case "skipped":
			return "was skipped";
		case "timed_out":
			return "ran out of time";
		default:
			return "finished";
	}
}

// Which number Repo Stats shows. Stars unless the settings say otherwise.
export const STAT_NAMES = { stars: "Stars", forks: "Forks", watchers: "Watchers", language: "Language" } as const;
export type Stat = keyof typeof STAT_NAMES;

// hasOwn and not "in": every object has a built-in toString, so "in"
// would let a setting like "toString" through.
export function statOf(setting: string | undefined): Stat {
	return setting && Object.hasOwn(STAT_NAMES, setting) ? (setting as Stat) : "stars";
}

export function statsLesson(repo: string | undefined, stats: Stats | undefined, message: string | undefined, stat: Stat): Lesson {
	let right = waiting(repo, message);
	if (!right && stats) {
		right =
			`${repo} has ${count(stats.stars, "star")}, ${count(stats.forks, "fork")} and ${count(stats.watchers, "watcher")}` +
			(stats.language ? `. It's mostly ${stats.language.name}.` : ".");
	}
	return {
		thisIs: `One number about the repo, picked under Show. This one shows ${STAT_NAMES[stat].toLowerCase()}.`,
		now: right ?? "Checking...",
		normal: [
			"0 to 5 stars on a small personal repo",
			"0 forks unless someone wants to build on it",
			"1 watcher: me. GitHub watches my own repos for me",
		],
		words: [
			["Star", "a bookmark someone leaves on a repo, and a small thumbs up"],
			["Fork", "someone's own copy of the repo, which they can change without touching mine"],
			["Watcher", "someone who gets told about everything that happens on the repo"],
			["Language", "what most of the code is written in, worked out by GitHub from the files"],
		],
		tryThis: "Star one of my own repos on GitHub, then look back at the key after the next refresh.",
		press: "Opens the page for the number on the key: stargazers, forks, watchers, or the repo itself for language.",
	};
}

export function commitsLesson(repo: string | undefined, weeks: number[] | undefined, message: string | undefined): Lesson {
	let right = waiting(repo, message);
	if (!right && weeks) {
		const recent = weeks.slice(-4).reduce((sum, n) => sum + n, 0);
		const thisWeek = weeks[weeks.length - 1] ?? 0;
		right = `${count(recent, "commit")} on ${repo}'s main branch in the last four weeks, ${thisWeek} of them this week.`;
	}
	return {
		thisIs: "Commits on the repo's main branch, one bar per week for the last eight weeks. The number is the last four weeks.",
		now: right ?? "Checking...",
		normal: [
			"0 to 15 a week on a small solo repo",
			"Busy weeks spike and quiet weeks go flat. Both are normal",
			"Squash merges count as one commit each, however many the branch had",
		],
		words: [
			["Commit", "a saved snapshot of the code, with a message saying what changed"],
			["Main branch", "the repo's default branch, where finished work ends up"],
			["Push", "sending commits from my Mac up to GitHub"],
		],
		tryThis: "Merge a pull request, wait for the next refresh, and watch this week's bar grow.",
		press: "Opens the repo's commit history on GitHub.",
	};
}

// What Branch Comparison knows: the branches it chose, and how far apart
// they are. comparison is missing when main is the only branch.
export type CompareView = { main: string; names: string[]; comparison?: Comparison };

export function compareLesson(repo: string | undefined, view: CompareView | undefined, message: string | undefined): Lesson {
	let right = waiting(repo, message);
	const c = view?.comparison;
	if (!right && view && !c) right = `${repo} only has ${view.main}, so there's nothing to compare yet.`;
	if (!right && c) {
		if (c.ahead === 0 && c.behind === 0) right = `${c.head} and ${c.base} are the same right now.`;
		else if (c.behind === 0) right = `${c.head} has ${count(c.ahead, "commit")} that ${c.base} doesn't.`;
		else if (c.ahead === 0) right = `${c.head} is missing ${count(c.behind, "commit")} from ${c.base}.`;
		else right = `${c.head} has ${count(c.ahead, "commit")} ${c.base} doesn't, and is missing ${c.behind} of ${c.base}'s.`;
	}
	return {
		thisIs: "How far one branch has moved away from another. Blank settings compare the newest branch with main.",
		now: right ?? "Checking...",
		normal: [
			"A branch I'm working on: a few ahead, 0 behind",
			"Behind means main moved on since the branch started",
			"After a squash merge a branch stays \"ahead\" forever. That's a sign it's safe to delete",
		],
		words: [
			["Ahead", "commits the branch has that the base doesn't"],
			["Behind", "commits the base has that the branch doesn't"],
			["Diverged", "both at once: each has something the other doesn't"],
			["Squash merge", "a branch's commits folded into one new commit on main"],
		],
		tryThis: "Make a branch, commit twice and push. With blank settings the key shows \"2 ahead\".",
		press: "Opens GitHub's compare page for the two branches.",
	};
}
