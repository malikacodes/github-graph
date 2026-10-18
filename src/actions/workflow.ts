import { action } from "@elgato/streamdeck";

import { fetchLatestRun, type Run } from "../github.ts";
import { COLORS, type Face } from "../key-art.ts";
import { outcome, runLesson } from "../learn.ts";
import { ago } from "../picking.ts";
import { GitHubKey } from "./github-key.ts";

// The latest GitHub Actions run on the repo: a check that passed, a cross
// that failed, or a dashed ring while it's still going.
@action({ UUID: "com.malikacodes.github-graph.workflow" })
export class Workflow extends GitHubKey<Run> {
	protected readonly look = { icon: "check", color: COLORS.green } as const;

	protected load(token: string | undefined, owner: string, name: string) {
		return fetchLatestRun(token, owner, name);
	}

	protected face(run: Run): Face {
		// Most of my repos have no workflows. That isn't a problem, so it's a
		// calm gray ring with words, not an error.
		if (run.workflows === 0) return { icon: "running", color: COLORS.gray, big: "none", small: "no workflows" };
		if (!run.status) return { icon: "running", color: COLORS.gray, big: "none", small: "hasn't run yet" };

		if (run.status !== "completed") {
			return { icon: "running", color: COLORS.yellow, big: "running", small: run.branch ?? "" };
		}

		const passed = run.conclusion === "success";
		const failed = run.conclusion === "failure" || run.conclusion === "timed_out";
		return {
			icon: passed ? "check" : "cross",
			color: passed ? COLORS.green : failed ? COLORS.red : COLORS.gray,
			big: outcome(run.conclusion).replace(/^was /, ""),
			small: ago(run.at!, Date.now()),
		};
	}

	protected lesson(repo: string | undefined, run: Run | undefined, message: string | undefined) {
		return runLesson(repo, run, message, Date.now());
	}

	protected link(run: Run | undefined, _: string, url: string): string {
		return run?.url ?? `${url}/actions`;
	}
}
