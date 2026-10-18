// One day on the graph. level is the shade GitHub picked for it
// (0 = no contributions, 4 = the darkest green).
export type Day = {
	date: string; // "2026-10-05"
	count: number;
	level: number;
};

// Either we got what we asked for, or we got a message to show instead.
// short is the same message squeezed down for the full-width view, where
// the only free space is a 52px column.
// detail is GitHub's own reason, when it gave one, for the log only.
export type Result<T> = { ok: true; data: T } | { ok: false; message: string; short: string; detail?: string };

// GitHub already sorts each day into one of five buckets, the same ones it
// uses to pick the greens on a profile page, so I don't have to work out the
// shading from raw counts.
const LEVELS: Record<string, number> = {
	NONE: 0,
	FIRST_QUARTILE: 1,
	SECOND_QUARTILE: 2,
	THIRD_QUARTILE: 3,
	FOURTH_QUARTILE: 4,
};

const DAYS = "contributionCalendar { weeks { contributionDays { date contributionCount contributionLevel } } }";

type Calendar = {
	contributionCalendar: {
		weeks: { contributionDays: { date: string; contributionCount: number; contributionLevel: string }[] }[];
	};
};

// GitHub sends days grouped into weeks. The plugin does its own grouping
// later (see calendar.ts), so this unpacks them into one flat list.
function flatten(calendar: Calendar): Day[] {
	return calendar.contributionCalendar.weeks.flatMap((week) =>
		week.contributionDays.map((day) => ({
			date: day.date,
			count: day.contributionCount,
			level: LEVELS[day.contributionLevel] ?? 0,
		})),
	);
}

// Sends one question to GitHub and sorts out the ways it can go wrong.
// "viewer" in the queries means whoever owns the token, which is why
// there's no username setting.
async function ask<T>(token: string | undefined, query: string, variables: object): Promise<Result<T>> {
	if (!token) {
		return { ok: false, message: "Add a token in settings", short: "No token" };
	}

	// fetch only throws when the request never got an answer at all (wifi
	// off, DNS down), which is different from GitHub answering with an error.
	let response: Response;
	try {
		response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				"User-Agent": "github-graph-stream-deck",
			},
			body: JSON.stringify({ query, variables }),
		});
	} catch {
		return { ok: false, message: "No internet", short: "Offline" };
	}

	if (response.status === 401) {
		return { ok: false, message: "Token didn't work", short: "Bad token" };
	}
	if (!response.ok) {
		return { ok: false, message: `GitHub error ${response.status}`, short: `Error ${response.status}` };
	}

	// GraphQL can answer "200 OK" and still have refused the question, for
	// example when the token is valid but isn't allowed to read the profile.
	// In that case the data part is just missing.
	const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
	if (!body.data) {
		const detail = body.errors?.map((error) => error.message).join("; ");
		return { ok: false, message: "Token can't read this", short: "No access", detail };
	}

	return { ok: true, data: body.data };
}

export type Recent = {
	days: Day[];
	total: number; // contributions since January 1
	year: number;
	joined: number; // the year the account was made, so scrolling knows where to stop
	login: string; // my username, for the link to my profile
};

// The regular refresh: the last 12 months of days, plus a total counted
// from January 1. This is the only request that repeats on the timer.
export async function fetchRecent(token: string | undefined): Promise<Result<Recent>> {
	const year = new Date().getFullYear();
	const result = await ask<{
		viewer: {
			login: string;
			createdAt: string;
			lastYear: Calendar;
			thisYear: { contributionCalendar: { totalContributions: number } };
		};
	}>(
		token,
		`query($from: DateTime!) {
			viewer {
				login
				createdAt
				lastYear: contributionsCollection { ${DAYS} }
				thisYear: contributionsCollection(from: $from) { contributionCalendar { totalContributions } }
			}
		}`,
		{ from: new Date(year, 0, 1).toISOString() },
	);
	if (!result.ok) return result;

	const viewer = result.data.viewer;
	return {
		ok: true,
		data: {
			days: flatten(viewer.lastYear),
			total: viewer.thisYear.contributionCalendar.totalContributions,
			year,
			joined: new Date(viewer.createdAt).getFullYear(),
			login: viewer.login,
		},
	};
}

// One whole calendar year, January 1 to December 31. Only asked for when
// the full-width view is turned to a year that isn't loaded yet.
export async function fetchYear(token: string | undefined, year: number): Promise<Result<Day[]>> {
	const result = await ask<{ viewer: { year: Calendar } }>(
		token,
		`query($from: DateTime!, $to: DateTime!) {
			viewer { year: contributionsCollection(from: $from, to: $to) { ${DAYS} } }
		}`,
		{ from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` },
	);
	if (!result.ok) return result;

	return { ok: true, data: flatten(result.data.viewer.year) };
}

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

	let response: Response;
	try {
		response = await fetch(`https://api.github.com/repos/${path}?per_page=1`, {
			headers: {
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				Accept: "application/vnd.github+json",
				"User-Agent": "github-graph-stream-deck",
			},
		});
	} catch {
		return { ok: false, message: "No internet", short: "Offline" };
	}

	if (response.status === 401) return { ok: false, message: "Token didn't work", short: "Bad token" };

	// A branch deleted between the two requests, or one GitHub can't
	// compare, just gets left off the map. It's not worth losing the
	// whole map over one branch.
	if (response.status === 404 || response.status === 422) return { ok: true, data: undefined };
	if (!response.ok) {
		return { ok: false, message: `GitHub error ${response.status}`, short: `Error ${response.status}` };
	}

	const body = (await response.json()) as { ahead_by: number; commits: { commit: { author: { date: string } | null } }[] };
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

// Who owns the token, for a repo setting that's just a name.
export async function fetchLogin(token: string | undefined): Promise<Result<string>> {
	const result = await ask<{ viewer: { login: string } }>(token, "{ viewer { login } }", {});
	if (!result.ok) return result;
	return { ok: true, data: result.data.viewer.login };
}

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

	const compared = await Promise.all(others.map((ref) => compare(token, owner, name, main, ref.name)));
	const failed = compared.find((result) => !result.ok);
	if (failed && !failed.ok) return failed;

	const branches = others.map((ref, i) => {
		const result = compared[i];
		const info = result.ok ? result.data : undefined;
		return { name: ref.name, oid: ref.target.oid, ahead: info?.ahead ?? 0, firstCommit: info?.firstCommit };
	});

	return { ok: true, data: { url: repo.url, main, branches, merged } };
}

// My repos, most recently pushed first, for the dropdown on the Branch Map
// settings page. It only lists what the token can see, so with a token
// that can't read private repos, those just aren't in the list.
export async function fetchRepos(token: string | undefined): Promise<Result<string[]>> {
	const result = await ask<{ viewer: { repositories: { nodes: { name: string }[] } } }>(
		token,
		`{ viewer { repositories(first: 100, ownerAffiliations: OWNER, orderBy: { field: PUSHED_AT, direction: DESC }) { nodes { name } } } }`,
		{},
	);
	if (!result.ok) return result;
	return { ok: true, data: result.data.viewer.repositories.nodes.map((repo) => repo.name) };
}
