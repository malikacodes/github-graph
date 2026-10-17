import streamDeck, { action } from "@elgato/streamdeck";

import { resolveRepo, token } from "../focus.ts";
import { type Result } from "../github.ts";
import { fetchBranches, fetchComparison } from "../github-repo.ts";
import { COLORS, type Face } from "../key-art.ts";
import { compareLesson, type CompareView } from "../learn.ts";
import { pickBranches } from "../picking.ts";
import { GitHubKey, type KeySettings } from "./github-key.ts";

// How far one branch has moved from another. Blank settings compare the
// newest branch with main, so it works on whatever repo the Repo key picks.
@action({ UUID: "com.malikacodes.github-graph.compare" })
export class Compare extends GitHubKey<CompareView> {
	protected readonly look = { icon: "compare", color: COLORS.teal } as const;

	protected override variant(settings: KeySettings): string {
		return `${settings.base ?? ""}|${settings.head ?? ""}`;
	}

	protected async load(token: string | undefined, owner: string, name: string, settings: KeySettings): Promise<Result<CompareView>> {
		const branches = await fetchBranches(token, owner, name);
		if (!branches.ok) return branches;

		const { main, names } = branches.data;
		const { base, head } = pickBranches(names, main, settings.base, settings.head);
		if (!head) return { ok: true, data: { main, names } };

		const comparison = await fetchComparison(token, owner, name, base, head);
		if (!comparison.ok) return comparison;
		return { ok: true, data: { main, names, comparison: comparison.data } };
	}

	protected face(view: CompareView): Face {
		const c = view.comparison;
		if (!c) return { ...this.look, color: COLORS.gray, big: "–", small: `only ${view.main}` };

		let big = "even";
		if (c.ahead && c.behind) big = `${c.ahead} · ${c.behind}`;
		else if (c.ahead) big = `${c.ahead} ahead`;
		else if (c.behind) big = `${c.behind} behind`;
		return { ...this.look, big, small: c.ahead && c.behind ? "ahead · behind" : c.head };
	}

	protected lesson(repo: string | undefined, view: CompareView | undefined, message: string | undefined) {
		return compareLesson(repo, view, message);
	}

	protected link(view: CompareView | undefined, _: string, url: string): string {
		return view?.comparison?.url ?? `${url}/branches`;
	}

	// The two branch menus on the settings page ask for the repo's
	// branches. The first choice in each is the blank setting, which does
	// the sensible thing: main for the base, the newest branch to compare.
	protected override async answer(event: string, _id: string, repo: string | undefined): Promise<void> {
		if (event !== "getBases" && event !== "getHeads") return;

		let names: string[] = [];
		const resolved = repo ? await resolveRepo(repo) : undefined;
		if (resolved?.ok) {
			const branches = await fetchBranches(await token(), resolved.data.owner, resolved.data.name);
			if (branches.ok) names = branches.data.names;
		}

		const blank = { value: "", label: event === "getBases" ? "Main branch" : "Newest branch" };
		const items = [blank, ...names.map((name) => ({ value: name, label: name }))];
		await streamDeck.ui.sendToPropertyInspector({ event, items });
	}
}
