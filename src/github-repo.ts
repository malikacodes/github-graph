import { ask, rest, type Result } from "./github.ts";

// Everything the branch map and the GitHub keys ask about one repo. Each
// fetcher asks its own question on purpose: if one key needs a permission
// the token doesn't have, only that key says so, and the rest keep working.

// --- Branches, for the branch dial ---

// What one branch has that main doesn't. This is REST and not GraphQL on
// purpose: GraphQL's compare wants a token with the full "repo" permission
// before it'll say how far ahead a branch is, even on a public repo. REST
// answers that for public repos with any token, or none.
//
// per_page=1 keeps the answer small. GitHub lists the commits oldest
// first, so the one commit that comes back is where the branch split off.
async function compare(
	token: string | undefined,
	owner: string,
	name: string,
	main: string,
	branch: string,
): Promise<Result<{ ahead: number; firstCommit?: string } | undefined>> {
	const path = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}/compare/${encodeURIComponent(main)}...${encodeURIComponent(branch)}`;
	const result = await rest<{ ahead_by: number; commits: { commit: { author: { date: string } | null } }[] }>(token, `${path}?per_page=1`);

	// A branch deleted between the two requests, or one GitHub can't
	// compare, just gets left off the map. It's not worth losing the
	// whole map over one branch.
	if (!result.ok && (result.short === "No repo" || result.short === "Error 422")) return { ok: true, data: undefined };
	if (!result.ok) return result;

	const body = result.data;
	return { ok: true, data: { ahead: body.ahead_by, firstCommit: body.commits[0]?.commit.author?.date } };
}

// Everything the branch dial needs from one repo, still in GitHub's terms.
// branches.ts does the sorting into lanes, so this file only asks.
export type Network = {
	url: string;
	main: string; // the default branch's name
	// Every other branch on GitHub. ahead is how many commits it has that
	// main doesn't, and firstCommit is when the oldest of those was made.
	branches: { name: string; oid: string; ahead: number; firstCommit?: string }[];
	// The last 20 merged pull requests. oid is the commit the branch was
	// on when it merged, and start is when its first commit was made.
	merged: { number: number; branch: string; oid: string; start: string; mergedAt: string }[];
};

// Only the first 30 branches get compared against main. Every branch is
// one more request, and a repo of mine with more than 30 would be a mess
// on a 100px tall strip anyway.
const MOST_BRANCHES = 30;

// The branch names and merged pull requests come from GraphQL in one
// question. Then each branch is compared against main, one REST request
// each. Those have to wait for the names, so it can't be one trip.
export async function fetchNetwork(token: string | undefined, owner: string, name: string): Promise<Result<Network>> {
	type Repo = {
		url: string;
		defaultBranchRef: { name: string } | null;
		refs: { nodes: { name: string; target: { oid: string } }[] };
		pullRequests: {
			nodes: {
				number: number;
				headRefName: string;
				headRefOid: string;
				mergedAt: string;
				createdAt: string;
				commits: { nodes: { commit: { authoredDate: string } }[] };
			}[];
		};
	};

	const first = await ask<{ repository: Repo | null }>(
		token,
		`query($owner: String!, $name: String!) {
			repository(owner: $owner, name: $name) {
				url
				defaultBranchRef { name }
				refs(refPrefix: "refs/heads/", first: 50) { nodes { name target { oid } } }
				pullRequests(last: 20, states: MERGED) {
					nodes { number headRefName headRefOid mergedAt createdAt commits(first: 1) { nodes { commit { authoredDate } } } }
				}
			}
		}`,
		{ owner, name },
	);
	if (!first.ok) return first;

	// GitHub says the same "null" for a repo that doesn't exist and one the
	// token isn't allowed to see, so the message has to cover both.
	const repo = first.data.repository;
	if (!repo) return { ok: false, message: "Repo not found", short: "No repo" };
	if (!repo.defaultBranchRef) return { ok: false, message: "Repo is empty", short: "Empty" };

	const main = repo.defaultBranchRef.name;
	const others = repo.refs.nodes.filter((ref) => ref.name !== main).slice(0, MOST_BRANCHES);

	// A pull request with no commits can't happen on GitHub, but createdAt
	// is there as a fallback so a missing one can't break the whole dial.
	const merged = repo.pullRequests.nodes.map((pr) => ({
		number: pr.number,
		branch: pr.headRefName,
		oid: pr.headRefOid,
		start: pr.commits.nodes[0]?.commit.authoredDate ?? pr.createdAt,
		mergedAt: pr.mergedAt,
	}));

	if (others.length === 0) return { ok: true, data: { url: repo.url, main, branches: [], merged } };

	// One failed compare fails the whole map. A branch that compare left off
	// on purpose (see above) comes back with no data and gets zeros.
	const compared = await Promise.all(others.map((ref) => compare(token, owner, name, main, ref.name)));
	const branches: Network["branches"] = [];
	for (const [i, result] of compared.entries()) {
		if (!result.ok) return result;
		branches.push({ name: others[i].name, oid: others[i].target.oid, ahead: result.data?.ahead ?? 0, firstCommit: result.data?.firstCommit });
	}

	return { ok: true, data: { url: repo.url, main, branches, merged } };
}

// --- One repo at a glance, for the GitHub keys ---

// What the pull request and issue keys need, in one question. Each key
// asks its own question, on purpose: if one key needs a permission the
// token doesn't have, only that key says so, and the rest keep working.
export type Counts = {
	url: string;
	private: boolean;
	open: number;
	closed: number; // for pull requests, merged and closed without merging
	merged: number; // pull requests only
	off?: boolean; // issues only: turned off in the repo's settings
	oldest?: string; // when the oldest open one was opened
};

export async function fetchPullCounts(token: string | undefined, owner: string, name: string): Promise<Result<Counts>> {
	const result = await ask<{
		repository: {
			url: string;
			isPrivate: boolean;
			open: { totalCount: number; nodes: { createdAt: string }[] };
			merged: { totalCount: number };
			closed: { totalCount: number };
		} | null;
	}>(
		token,
		`query($owner: String!, $name: String!) {
			repository(owner: $owner, name: $name) {
				url isPrivate
				open: pullRequests(states: OPEN, first: 1, orderBy: { field: CREATED_AT, direction: ASC }) { totalCount nodes { createdAt } }
				merged: pullRequests(states: MERGED) { totalCount }
				closed: pullRequests(states: CLOSED) { totalCount }
			}
		}`,
		{ owner, name },
	);
	if (!result.ok) return result;
	const repo = result.data.repository;
	if (!repo) return { ok: false, message: "Repo not found", short: "No repo" };
	return {
		ok: true,
		data: {
			url: repo.url,
			private: repo.isPrivate,
			open: repo.open.totalCount,
			merged: repo.merged.totalCount,
			closed: repo.closed.totalCount,
			oldest: repo.open.nodes[0]?.createdAt,
		},
	};
}

export async function fetchIssueCounts(token: string | undefined, owner: string, name: string): Promise<Result<Counts>> {
	const result = await ask<{
		repository: {
			url: string;
			isPrivate: boolean;
			hasIssuesEnabled: boolean;
			open: { totalCount: number; nodes: { createdAt: string }[] };
			closed: { totalCount: number };
		} | null;
	}>(
		token,
		`query($owner: String!, $name: String!) {
			repository(owner: $owner, name: $name) {
				url isPrivate hasIssuesEnabled
				open: issues(states: OPEN, first: 1, orderBy: { field: CREATED_AT, direction: ASC }) { totalCount nodes { createdAt } }
				closed: issues(states: CLOSED) { totalCount }
			}
		}`,
		{ owner, name },
	);
	if (!result.ok) return result;
	const repo = result.data.repository;
	if (!repo) return { ok: false, message: "Repo not found", short: "No repo" };
	// Issues turned off in the repo's settings (forks start that way) is an
	// answer, not a problem, so it comes back like any other count.
	if (!repo.hasIssuesEnabled) return { ok: true, data: { url: repo.url, private: repo.isPrivate, open: 0, closed: 0, merged: 0, off: true } };
	return {
		ok: true,
		data: {
			url: repo.url,
			private: repo.isPrivate,
			open: repo.open.totalCount,
			closed: repo.closed.totalCount,
			merged: 0,
			oldest: repo.open.nodes[0]?.createdAt,
		},
	};
}

// The newest GitHub Actions run, from REST because Actions isn't in
// GraphQL. A public repo answers this with any token, or none.
export type Run = {
	workflows: number; // how many workflow files the repo has
	name?: string;
	status?: string; // queued, in_progress, completed...
	conclusion?: string | null; // success, failure, cancelled... once completed
	branch?: string;
	at?: string; // when it last changed
	url?: string;
};

export async function fetchLatestRun(token: string | undefined, owner: string, name: string): Promise<Result<Run>> {
	const repo = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
	const workflows = await rest<{ total_count: number }>(token, `${repo}/actions/workflows?per_page=1`);
	if (!workflows.ok) return workflows;
	if (workflows.data.total_count === 0) return { ok: true, data: { workflows: 0 } };

	const runs = await rest<{
		workflow_runs: { name: string; status: string; conclusion: string | null; head_branch: string; updated_at: string; html_url: string }[];
	}>(token, `${repo}/actions/runs?per_page=1`);
	if (!runs.ok) return runs;

	const run = runs.data.workflow_runs[0];
	return {
		ok: true,
		data: {
			workflows: workflows.data.total_count,
			name: run?.name,
			status: run?.status,
			conclusion: run?.conclusion,
			branch: run?.head_branch,
			at: run?.updated_at,
			url: run?.html_url,
		},
	};
}

// The numbers on a repo's front page, for Repo Stats.
export type Stats = {
	url: string;
	stars: number;
	forks: number;
	watchers: number;
	language?: { name: string; color: string | null };
};

export async function fetchStats(token: string | undefined, owner: string, name: string): Promise<Result<Stats>> {
	const result = await ask<{
		repository: {
			url: string;
			stargazerCount: number;
			forkCount: number;
			watchers: { totalCount: number };
			primaryLanguage: { name: string; color: string | null } | null;
		} | null;
	}>(
		token,
		`query($owner: String!, $name: String!) {
			repository(owner: $owner, name: $name) {
				url stargazerCount forkCount watchers { totalCount } primaryLanguage { name color }
			}
		}`,
		{ owner, name },
	);
	if (!result.ok) return result;
	const repo = result.data.repository;
	if (!repo) return { ok: false, message: "Repo not found", short: "No repo" };
	return {
		ok: true,
		data: {
			url: repo.url,
			stars: repo.stargazerCount,
			forks: repo.forkCount,
			watchers: repo.watchers.totalCount,
			language: repo.primaryLanguage ?? undefined,
		},
	};
}

// Commits on the default branch for each of the last eight weeks, oldest
// first. GitHub works these out in the background: the first ask for a
// repo can come back "202, still counting", so it gets a few short retries.
export async function fetchCommitWeeks(
	token: string | undefined,
	owner: string,
	name: string,
	wait = (ms: number) => new Promise((done) => setTimeout(done, ms)),
): Promise<Result<number[]>> {
	const path = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}/stats/commit_activity`;
	for (let attempt = 0; attempt < 4; attempt++) {
		const result = await rest<{ total: number }[] | Record<string, never> | null>(token, path);
		if (!result.ok) return result;

		// An empty repo has no weeks at all (that's the 204). A 202 has an
		// empty object for a body, not a list.
		if (result.data === null) return { ok: true, data: [0, 0, 0, 0, 0, 0, 0, 0] };
		if (Array.isArray(result.data)) return { ok: true, data: result.data.slice(-8).map((week) => week.total) };
		await wait(3000);
	}
	return { ok: false, message: "GitHub is still counting", short: "Counting..." };
}

// A repo's branches, newest commit first, and which one is the default.
type Branches = { main: string; names: string[] };

export async function fetchBranches(token: string | undefined, owner: string, name: string): Promise<Result<Branches>> {
	const result = await ask<{
		repository: { defaultBranchRef: { name: string } | null; refs: { nodes: { name: string }[] } } | null;
	}>(
		token,
		`query($owner: String!, $name: String!) {
			repository(owner: $owner, name: $name) {
				defaultBranchRef { name }
				refs(refPrefix: "refs/heads/", first: 50, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) { nodes { name } }
			}
		}`,
		{ owner, name },
	);
	if (!result.ok) return result;
	const repo = result.data.repository;
	if (!repo) return { ok: false, message: "Repo not found", short: "No repo" };
	if (!repo.defaultBranchRef) return { ok: false, message: "Repo is empty", short: "Empty" };
	return { ok: true, data: { main: repo.defaultBranchRef.name, names: repo.refs.nodes.map((ref) => ref.name) } };
}

// How far head has moved from base. ahead is commits head has that base
// doesn't, behind is the other way round.
export type Comparison = { base: string; head: string; ahead: number; behind: number; url: string };

export async function fetchComparison(
	token: string | undefined,
	owner: string,
	name: string,
	base: string,
	head: string,
): Promise<Result<Comparison>> {
	const repo = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
	const result = await rest<{ ahead_by: number; behind_by: number; html_url: string }>(
		token,
		`${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?per_page=1`,
	);
	if (!result.ok && result.short === "No repo") return { ok: false, message: "That branch isn't there", short: "No branch" };
	if (!result.ok) return result;
	return { ok: true, data: { base, head, ahead: result.data.ahead_by, behind: result.data.behind_by, url: result.data.html_url } };
}

// The newest release. latest skips pre-releases and drafts, which is what
// most people mean by "the latest version". With pre-releases on, it takes
// the newest one that isn't a draft.
export type Release = { tag: string; name: string; at: string; pre: boolean; url: string };

export async function fetchRelease(token: string | undefined, owner: string, name: string, pre: boolean): Promise<Result<Release | undefined>> {
	const repo = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
	type Body = { tag_name: string; name: string | null; published_at: string; prerelease: boolean; draft: boolean; html_url: string };
	const shape = (r: Body): Release => ({ tag: r.tag_name, name: r.name || r.tag_name, at: r.published_at, pre: r.prerelease, url: r.html_url });

	if (!pre) {
		const latest = await rest<Body>(token, `${repo}/releases/latest`);
		if (latest.ok) return { ok: true, data: shape(latest.data) };
		if (latest.short !== "No repo") return latest;

		// A 404 here means either "no releases" or "no such repo" (or one the
		// token can't see). Asking about the repo itself tells them apart.
		const exists = await rest<object>(token, repo);
		return exists.ok ? { ok: true, data: undefined } : exists;
	}

	const list = await rest<Body[]>(token, `${repo}/releases?per_page=10`);
	if (!list.ok) return list;
	const newest = list.data.find((r) => !r.draft);
	return { ok: true, data: newest && shape(newest) };
}

// Open Dependabot alerts, counted by how bad they are. off means Dependabot
// isn't turned on for the repo, which GitHub answers with a 403 that says
// so. That's different from "no alerts": nobody is checking.
export type Alerts = { off: boolean; critical: number; high: number; medium: number; low: number };

export async function fetchAlerts(token: string | undefined, owner: string, name: string): Promise<Result<Alerts>> {
	const repo = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
	type Alert = { security_advisory: { severity: string } };
	const none = { off: false, critical: 0, high: 0, medium: 0, low: 0 };

	// GitHub sends at most 100 alerts at a time, so it keeps asking for the
	// next 100 until a page comes back short. Ten pages is a thousand
	// alerts, which would be a very different problem.
	const all: Alert[] = [];
	for (let page = 1; page <= 10; page++) {
		const result = await rest<Alert[]>(token, `${repo}/dependabot/alerts?state=open&per_page=100&page=${page}`);
		if (!result.ok && result.detail?.toLowerCase().includes("disabled")) return { ok: true, data: { ...none, off: true } };
		if (!result.ok && result.short === "Error 403") return { ok: false, message: "Token can't read alerts", short: "No access" };
		if (!result.ok) return result;
		all.push(...result.data);
		if (result.data.length < 100) break;
	}

	const counts = { ...none };
	for (const alert of all) {
		const severity = alert.security_advisory.severity as keyof typeof counts;
		if (severity in counts && severity !== "off") counts[severity]++;
		else counts.low++;
	}
	return { ok: true, data: counts };
}

// One of my GitHub project boards, with its items counted into three piles
// by their Status column. Reading a project that belongs to me (not to a
// repo or an organization) needs the classic read:project permission.
export type Board = { title: string; url: string; todo: number; doing: number; done: number };
type BoardChoice = { number: number; title: string };

type ProjectNode = {
	number: number;
	title: string;
	url: string;
	items: { nodes: { fieldValueByName: { name?: string } | null }[] };
};

export async function fetchBoards(token: string | undefined): Promise<Result<BoardChoice[]>> {
	const result = await ask<{ viewer: { projectsV2: { nodes: { number: number; title: string; closed: boolean }[] } } }>(
		token,
		`{ viewer { projectsV2(first: 20, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { number title closed } } } }`,
		{},
	);
	if (!result.ok) return noProjectScope(result);
	return { ok: true, data: result.data.viewer.projectsV2.nodes.filter((p) => !p.closed).map(({ number, title }) => ({ number, title })) };
}

export async function fetchBoard(token: string | undefined, number: number | undefined): Promise<Result<Board | undefined>> {
	const items = `items(first: 100) { nodes { fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } }`;
	const result = await ask<{ viewer: { one?: ProjectNode | null; newest?: { nodes: ProjectNode[] } } }>(
		token,
		number
			? `query($number: Int!) { viewer { one: projectV2(number: $number) { number title url ${items} } } }`
			: `{ viewer { newest: projectsV2(first: 1, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { number title url ${items} } } } }`,
		number ? { number } : {},
	);
	if (!result.ok) return noProjectScope(result);

	// A board picked by number that isn't there any more is a problem to
	// say. No boards at all is just "none yet".
	if (number && !result.data.viewer.one) return { ok: false, message: "That board isn't there", short: "No board" };
	const project = result.data.viewer.one ?? result.data.viewer.newest?.nodes[0];
	if (!project) return { ok: true, data: undefined };
	return { ok: true, data: { title: project.title, url: project.url, ...pile(project.items.nodes.map((n) => n.fieldValueByName?.name)) } };
}

// Sorts items into to do, doing and done by the name of their Status.
// Boards name their columns differently, so it goes by words in the name,
// and anything without a status counts as to do.
export function pile(statuses: (string | undefined)[]): { todo: number; doing: number; done: number } {
	const piles = { todo: 0, doing: 0, done: 0 };
	for (const status of statuses) {
		if (status && /done|complete|closed|shipped/i.test(status)) piles.done++;
		else if (status && /progress|doing|review|active/i.test(status)) piles.doing++;
		else piles.todo++;
	}
	return piles;
}

// The token answered, but GitHub refused the project part. That's almost
// always the missing read:project permission, so the key says so.
function noProjectScope<T>(result: { ok: false; message: string; short: string; detail?: string }): Result<T> {
	if (result.detail?.includes("read:project") || result.message === "Token can't read this") {
		return { ok: false, message: "The token needs read:project", short: "No access", detail: result.detail };
	}
	return result;
}
