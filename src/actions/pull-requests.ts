import { action } from "@elgato/streamdeck";

import { type Counts, fetchPullCounts } from "../github.ts";
import { COLORS, type Face } from "../key-art.ts";
import { pullLesson } from "../learn.ts";
import { GitHubKey } from "./github-key.ts";

// How many pull requests are open on the repo.
@action({ UUID: "com.malikacodes.github-graph.pulls" })
export class PullRequests extends GitHubKey<Counts> {
	protected readonly look = { icon: "pr", color: COLORS.lavender } as const;

	protected load(token: string | undefined, owner: string, name: string) {
		return fetchPullCounts(token, owner, name);
	}

	protected face(counts: Counts): Face {
		return {
			...this.look,
			big: String(counts.open),
			small: counts.open === 0 ? "none open" : counts.open === 1 ? "1 open" : `${counts.open} open`,
		};
	}

	protected lesson(repo: string | undefined, counts: Counts | undefined, message: string | undefined) {
		return pullLesson(repo, counts, message, Date.now());
	}

	protected link(_: Counts | undefined, __: string, url: string): string {
		return `${url}/pulls`;
	}
}
