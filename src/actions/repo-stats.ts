import { action } from "@elgato/streamdeck";

import { fetchStats, type Stats } from "../github-repo.ts";
import { COLORS, type Face } from "../key-art.ts";
import { statOf, statsLesson } from "../learn.ts";
import { GitHubKey, type KeySettings } from "./github-key.ts";

// One number from the repo's front page, picked under Show in the
// settings: stars, forks, watchers, or the main language.
@action({ UUID: "com.malikacodes.github-graph.stats-repo" })
export class RepoStats extends GitHubKey<Stats> {
	protected readonly look = { icon: "star", color: COLORS.yellow } as const;

	protected load(token: string | undefined, owner: string, name: string) {
		return fetchStats(token, owner, name);
	}

	protected face(stats: Stats, _: string, settings: KeySettings): Face {
		const stat = statOf(settings.stat);
		const number = (n: number, word: string) => ({ big: String(n), small: n === 1 ? word : `${word}s` });

		if (stat === "forks") return { icon: "branch", color: COLORS.teal, ...number(stats.forks, "fork") };
		if (stat === "watchers") return { icon: "issue", color: COLORS.blue, ...number(stats.watchers, "watcher") };

		// The language gets GitHub's own color for it, the same dot color
		// GitHub shows next to the language on the repo page.
		if (stat === "language") {
			return {
				icon: "dot",
				color: stats.language?.color ?? COLORS.gray,
				big: stats.language?.name ?? "none",
				small: "language",
			};
		}
		return { ...this.look, ...number(stats.stars, "star") };
	}

	protected lesson(repo: string | undefined, stats: Stats | undefined, message: string | undefined, settings: KeySettings) {
		return statsLesson(repo, stats, message, statOf(settings.stat));
	}

	protected link(_: Stats | undefined, __: string, url: string, settings: KeySettings): string {
		const stat = statOf(settings.stat);
		if (stat === "stars") return `${url}/stargazers`;
		if (stat === "forks") return `${url}/forks`;
		if (stat === "watchers") return `${url}/watchers`;
		return url;
	}
}
