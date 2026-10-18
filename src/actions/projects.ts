import streamDeck, { action } from "@elgato/streamdeck";

import { token } from "../focus.ts";
import { type Result } from "../github.ts";
import { type Board, fetchBoard, fetchBoards } from "../github-repo.ts";
import { boardPiles, COLORS, type Face } from "../key-art.ts";
import { boardLesson } from "../learn.ts";
import { GitHubKey, type KeySettings } from "./github-key.ts";

// "No board" is a real answer, so it's wrapped, the same as Releases.
type View = { board?: Board };

// One of my project boards, counted into to do, doing and done. Unlike the
// other keys it doesn't follow the Repo key: a board belongs to me, not to
// one repo, and can hold work from several.
@action({ UUID: "com.malikacodes.github-graph.projects" })
export class Projects extends GitHubKey<View> {
	protected readonly look = { icon: "board", color: COLORS.lavender } as const;
	protected override readonly follows = false;

	// Every Projects key is about my boards, whatever repo is picked.
	protected override subject(): string {
		return "my boards";
	}

	protected override variant(settings: KeySettings): string {
		return settings.board ?? "";
	}

	protected async load(token: string | undefined, _owner: string, _name: string, settings: KeySettings): Promise<Result<View>> {
		const number = Number(settings.board) || undefined;
		const result = await fetchBoard(token, number);
		return result.ok ? { ok: true, data: { board: result.data } } : result;
	}

	protected face({ board }: View): Face {
		if (!board) return { ...this.look, color: COLORS.gray, big: "none", small: "no boards yet" };
		return { ...this.look, big: "", small: board.title, middle: boardPiles(board.todo, board.doing, board.done) };
	}

	protected lesson(_: string | undefined, view: View | undefined, message: string | undefined) {
		return boardLesson(view && (view.board ?? null), message);
	}

	protected link(view: View | undefined): string {
		return view?.board?.url ?? "https://github.com/";
	}

	// The board menu on the settings page: my open boards, newest first,
	// with "Newest board" as the blank choice at the top.
	protected override async answer(event: string): Promise<void> {
		if (event !== "getBoards") return;
		const boards = await fetchBoards(await token());
		const items = [
			{ value: "", label: "Newest board" },
			...(boards.ok ? boards.data.map((b) => ({ value: String(b.number), label: b.title })) : []),
		];
		await streamDeck.ui.sendToPropertyInspector({ event, items });
	}
}
