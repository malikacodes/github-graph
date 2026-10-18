import { action } from "@elgato/streamdeck";

import { fetchRelease, type Release, type Result } from "../github.ts";
import { COLORS, type Face } from "../key-art.ts";
import { releaseLesson } from "../learn.ts";
import { ago } from "../picking.ts";
import { GitHubKey, type KeySettings } from "./github-key.ts";

// "No releases" is a real answer, not a missing one, so the release is
// wrapped: { release: undefined } means "checked, and there are none".
type View = { release?: Release };

// The newest release of the repo, and how long ago it came out.
@action({ UUID: "com.malikacodes.github-graph.releases" })
export class Releases extends GitHubKey<View> {
	protected readonly look = { icon: "tag", color: COLORS.orange } as const;

	protected override variant(settings: KeySettings): string {
		return settings.pre ? "pre" : "";
	}

	protected async load(token: string | undefined, owner: string, name: string, settings: KeySettings): Promise<Result<View>> {
		const result = await fetchRelease(token, owner, name, settings.pre === true);
		return result.ok ? { ok: true, data: { release: result.data } } : result;
	}

	protected face({ release }: View): Face {
		if (!release) return { ...this.look, color: COLORS.gray, big: "none", small: "no releases yet" };
		return { ...this.look, big: release.tag, small: release.pre ? "pre-release" : ago(release.at, Date.now()) };
	}

	protected lesson(repo: string | undefined, view: View | undefined, message: string | undefined) {
		return releaseLesson(repo, view && (view.release ?? null), message, Date.now());
	}

	protected link(view: View | undefined, _: string, url: string): string {
		return view?.release?.url ?? `${url}/releases`;
	}
}
