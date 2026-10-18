import { action } from "@elgato/streamdeck";

import { type Counts, fetchIssueCounts } from "../github.ts";
import { COLORS, type Face } from "../key-art.ts";
import { issueLesson } from "../learn.ts";
import { GitHubKey } from "./github-key.ts";

// How many issues are open on the repo.
@action({ UUID: "com.malikacodes.github-graph.issues" })
export class Issues extends GitHubKey<Counts> {
	protected readonly look = { icon: "issue", color: COLORS.green } as const;

	protected load(token: string | undefined, owner: string, name: string) {
		return fetchIssueCounts(token, owner, name);
	}

	protected face(counts: Counts): Face {
		// Turned off is calm gray, the same as Security's "off": nothing is
		// wrong, there's just nothing here to count.
		if (counts.off) return { ...this.look, color: COLORS.gray, big: "off", small: "issues off" };
		return {
			...this.look,
			big: String(counts.open),
			small: counts.open === 0 ? `${counts.closed} closed` : `${counts.open} open`,
		};
	}

	protected lesson(repo: string | undefined, counts: Counts | undefined, message: string | undefined) {
		return issueLesson(repo, counts, message, Date.now());
	}

	protected link(counts: Counts | undefined, _: string, url: string): string {
		return counts?.off ? `${url}/settings` : `${url}/issues`;
	}
}
