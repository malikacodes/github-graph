import { action } from "@elgato/streamdeck";

import { type Counts, fetchIssueCounts } from "../github";
import { COLORS, type Face } from "../key-art";
import { issueLesson } from "../learn";
import { GitHubKey } from "./github-key";

// How many issues are open on the repo.
@action({ UUID: "com.malikacodes.github-graph.issues" })
export class Issues extends GitHubKey<Counts> {
	protected readonly look = { icon: "issue", color: COLORS.green } as const;

	protected load(token: string | undefined, owner: string, name: string) {
		return fetchIssueCounts(token, owner, name);
	}

	protected face(counts: Counts): Face {
		return {
			...this.look,
			big: String(counts.open),
			small: counts.open === 0 ? `${counts.closed} closed` : `${counts.open} open`,
		};
	}

	protected lesson(repo: string | undefined, counts: Counts | undefined, message: string | undefined) {
		return issueLesson(repo, counts, message, Date.now());
	}

	protected link(_: Counts | undefined, __: string, url: string): string {
		return `${url}/issues`;
	}
}
