import { action } from "@elgato/streamdeck";

import { fetchCommitWeeks } from "../github.ts";
import { COLORS, type Face, weekBars } from "../key-art.ts";
import { commitsLesson } from "../learn.ts";
import { GitHubKey } from "./github-key.ts";

// Commits on the repo's main branch: a bar for each of the last eight
// weeks, and the total for the last four under them.
@action({ UUID: "com.malikacodes.github-graph.commits" })
export class Commits extends GitHubKey<number[]> {
	protected readonly look = { icon: "commits", color: COLORS.blue } as const;

	protected load(token: string | undefined, owner: string, name: string) {
		return fetchCommitWeeks(token, owner, name);
	}

	protected face(weeks: number[]): Face {
		const recent = weeks.slice(-4).reduce((sum, n) => sum + n, 0);
		return { ...this.look, big: "", small: `${recent} in 4 weeks`, middle: weekBars(weeks, COLORS.blue) };
	}

	protected lesson(repo: string | undefined, weeks: number[] | undefined, message: string | undefined) {
		return commitsLesson(repo, weeks, message);
	}

	protected link(_: number[] | undefined, __: string, url: string): string {
		return `${url}/commits`;
	}
}
