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
