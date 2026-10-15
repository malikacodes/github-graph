import streamDeck from "@elgato/streamdeck";

import { type GlobalSettings, store } from "./data";
import { fetchLogin, fetchRepos, type RepoListing, type Result } from "./github";

// The repo every GitHub key follows, plus the list the Repo key steps
// through. Like data.ts, it's one shared whiteboard: the Repo key writes
// on it, and every key set to "Follow the Repo key" reads from it.
export const focus = {
	repo: "",
	repos: [] as RepoListing[],
};

const listeners: (() => void)[] = [];

// Keys call this once to hear about a new repo being picked.
export function onFocus(changed: () => void): void {
	listeners.push(changed);
}

export function setFocus(name: string): void {
	if (name === focus.repo) return;
	focus.repo = name;
	for (const changed of listeners) changed();
}

export async function token(): Promise<string | undefined> {
	const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
	return settings.token?.trim();
}

// My username, for repos picked by name only. The contribution keys
// usually know it already, which saves asking.
let login = "";
export async function owner(): Promise<Result<string>> {
	login ||= store.login;
	if (login) return { ok: true, data: login };

	const result = await fetchLogin(await token());
	if (result.ok) login = result.data;
	return result;
}

// My repos, newest push first. Kept for ten minutes, since every settings
// page and every Repo key press reads it, and it barely ever changes.
let listedAt = 0;
let listing: Promise<Result<RepoListing[]>> | undefined;
export async function repoList(): Promise<Result<RepoListing[]>> {
	if (!listing || Date.now() - listedAt > 10 * 60 * 1000) {
		listedAt = Date.now();
		listing = token().then(fetchRepos);
	}
	const result = await listing;
	if (result.ok) focus.repos = result.data;
	else listing = undefined; // try again next time instead of keeping a failure
	return result;
}

// A new token can belong to someone else, or see repos the old one
// couldn't, so the username and the repo list are asked for again.
export function forget(): void {
	login = "";
	listing = undefined;
}

// Whether a repo is private, if the list knows it.
export function isPrivate(name: string): boolean {
	return focus.repos.find((repo) => repo.name === name)?.private ?? false;
}
