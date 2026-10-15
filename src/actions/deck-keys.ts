import streamDeck, { action, DeviceType, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";

import { focus, onFocus } from "../focus";
import { COLORS, drawGithubKey } from "../key-art";

// The GitHub profiles this plugin ships, one per deck. A plugin can only
// switch to profiles it ships itself, so these are bundled in the plugin
// (made by npm run profiles) rather than ones I set up by hand.
const PROFILES: Partial<Record<DeviceType, string>> = {
	[DeviceType.StreamDeckXL]: "profiles/github-xl",
	[DeviceType.StreamDeckPlus]: "profiles/github-plus",
};

// The GitHub key: on my XL's Home page, it opens the GitHub page. It works
// the same on the + too, opening the + version.
@action({ UUID: "com.malikacodes.github-graph.github" })
export class OpenGitHub extends SingletonAction {
	constructor() {
		super();
		onFocus(() => void this.showAll());
	}

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		if (ev.action.isKey()) await this.show(ev.action);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const profile = PROFILES[ev.action.device.type];
		if (profile) await streamDeck.profiles.switchToProfile(ev.action.device.id, profile);
		else await ev.action.showAlert();
	}

	private async showAll(): Promise<void> {
		for (const key of this.actions) if (key.isKey()) await this.show(key);
	}

	private async show(key: KeyAction<{}>): Promise<void> {
		const supported = PROFILES[key.device.type] !== undefined;
		await key.setImage(
			drawGithubKey({
				icon: "branch",
				color: COLORS.pink,
				big: "GitHub",
				small: supported ? focus.repo || "my repos" : "XL or + only",
				quiet: !supported,
			}),
		);
	}
}

// Go to +: sends my Stream Deck + to its GitHub profile, with the Branch
// Map on the dials and the keys I use most, all on the same repo.
@action({ UUID: "com.malikacodes.github-graph.to-plus" })
export class GoToPlus extends SingletonAction {
	constructor() {
		super();
		onFocus(() => void this.showAll());
		streamDeck.devices.onDeviceDidConnect(() => void this.showAll());
		streamDeck.devices.onDeviceDidDisconnect(() => void this.showAll());
	}

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		if (ev.action.isKey()) await this.show(ev.action);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const plus = this.plus();
		if (plus) await streamDeck.profiles.switchToProfile(plus.id, PROFILES[DeviceType.StreamDeckPlus]!);
		else await ev.action.showAlert();
	}

	// The + that's plugged in right now, if there is one.
	private plus() {
		return [...streamDeck.devices].find((device) => device.type === DeviceType.StreamDeckPlus && device.isConnected);
	}

	private async showAll(): Promise<void> {
		for (const key of this.actions) if (key.isKey()) await this.show(key);
	}

	private async show(key: KeyAction<{}>): Promise<void> {
		const plugged = !!this.plus();
		await key.setImage(
			drawGithubKey({
				icon: "plus",
				color: COLORS.pink,
				big: "to the +",
				small: plugged ? focus.repo || "my repos" : "no + plugged in",
				quiet: !plugged,
				alarm: !plugged,
			}),
		);
	}
}
