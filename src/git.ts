import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { type Local, parseAhead, parseRefs, parseStatus } from "./branches.ts";

const run = promisify(execFile);

// Runs one git command in a folder and hands back what it printed. Anything
// going wrong (no such folder, not a git repo, git missing) comes back as
// undefined, because local branches are a bonus on top of GitHub's map.
// The timeout is so a stuck git can never hold up a refresh.
//
// --no-optional-locks matters because git status normally tidies up its
// index file (git's list of what's staged) while it looks, and takes a
// lock to do it. If that happened in the middle of me committing, my
// commit would fail with "index.lock exists". This keeps it read only.
async function git(folder: string, ...args: string[]): Promise<string | undefined> {
	try {
		const { stdout } = await run("git", ["--no-optional-locks", "-C", folder, ...args], { timeout: 5000 });
		return stdout;
	} catch {
		return undefined;
	}
}

// Asks git about one of my repos, in ~/Projects/<name>, where all my repos
// live with folder names matching their GitHub names. main is the default
// branch's name from GitHub. Undefined means "no local copy, just show
// GitHub", which is never an error worth showing on the strip.
export async function readLocal(name: string, main: string): Promise<Local | undefined> {
	const folder = join(homedir(), "Projects", name);

	const [refs, status] = await Promise.all([
		git(folder, "for-each-ref", "--format=%(refname)%09%(objectname)", "refs/heads", "refs/remotes/origin"),
		git(folder, "status", "--porcelain=v1", "--branch"),
	]);
	if (refs === undefined || status === undefined) return undefined;

	// "Ahead" means not in main, and my Mac has two mains: my local one,
	// which is only as new as my last pull, and origin's, which is only as
	// new as my last fetch. A commit in either one counts as on main, so a
	// stale copy of one of them can't make old work look new.
	const { heads, origin } = parseRefs(refs);
	const bases = [
		...(heads.has(main) ? [`refs/heads/${main}`] : []),
		...(origin.has(main) ? [`refs/remotes/origin/${main}`] : []),
	];
	if (bases.length === 0) return undefined;

	// One git log per branch, all at once. A branch that fails to read is
	// left off, same as a branch GitHub can't compare.
	const names = [...heads.keys()].filter((branch) => branch !== main);
	const logs = await Promise.all(
		names.map((branch) => git(folder, "log", "--format=%aI", `refs/heads/${branch}`, "--not", ...bases, "--")),
	);

	const branches = names.flatMap((branch, i) => {
		const log = logs[i];
		return log === undefined ? [] : [{ name: branch, oid: heads.get(branch)!, ...parseAhead(log) }];
	});
	return { branches, ...parseStatus(status) };
}
