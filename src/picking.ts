// The thinking behind the Repo key and "Follow the Repo key", with no
// Stream Deck and no GitHub in it, so the tests can check it.

// A key's repo setting. Empty (or never set) means it follows the Repo key.
// Anything else is a repo it's pinned to.
export function whichRepo(setting: string | undefined, followed: string): string | undefined {
	const pinned = setting?.trim();
	if (pinned) return pinned;
	return followed || undefined;
}

// The repo after (or before) the current one, going round the list. The
// list is newest push first, so the repos I'm working on are a press or
// two away. A current repo that isn't in the list (deleted, or the token
// can't see it any more) starts over at the top.
export function stepRepo(names: string[], current: string, step: number): string | undefined {
	if (names.length === 0) return undefined;
	const at = names.indexOf(current);
	if (at < 0) return names[0];
	return names[(((at + step) % names.length) + names.length) % names.length];
}

// "today", "1 day ago", "5 days ago", "3 mo ago", "2 yr ago". now is passed
// in so the tests don't depend on the clock.
export function ago(iso: string, now: number): string {
	const minutes = Math.floor((now - Date.parse(iso)) / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hr ago`;
	const days = Math.floor(hours / 24);
	if (days === 1) return "1 day ago";
	if (days < 30) return `${days} days ago`;
	if (days < 365) return `${Math.floor(days / 30)} mo ago`;
	return `${Math.floor(days / 365)} yr ago`;
}

// "1 open issue", "3 open issues".
export function count(n: number, word: string, plural = `${word}s`): string {
	return `${n.toLocaleString("en-US")} ${n === 1 ? word : plural}`;
}

// Which two branches Branch Comparison compares. Empty settings mean "the
// repo's main branch" for base and "the newest branch that isn't base" for
// head, so the key works with no setup, even while following the Repo key
// from one repo to the next. head is undefined when base is the only branch.
export function pickBranches(
	names: string[],
	main: string,
	base: string | undefined,
	head: string | undefined,
): { base: string; head?: string } {
	const from = base?.trim() || main;
	const to = head?.trim() || names.find((name) => name !== from);
	return { base: from, head: to };
}
