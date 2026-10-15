// Makes the two GitHub profiles this plugin ships, in the same format
// Stream Deck exports (a .streamDeckProfile is a zip of a <uuid>.sdProfile
// folder). The shape is borrowed from another of my plugins' profile script.
//
// - GitHub XL: the Repo key and every GitHub key, a Home key, and Go to +.
// - GitHub +: the keys I use most, a Home key, and the Branch Map on all
//   four dials.
//
// Every GitHub key and dial is left on "Follow the Repo key", so the whole
// page switches repos together.
//
// The Home keys are Stream Deck's own Switch Profile action, pointed at the
// profile called "Home" on each deck. Their ids are read from Stream Deck's
// own files on this Mac, so nothing personal is typed in here, and the
// built files stay out of git (see .gitignore). npm run profiles makes them.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN = "com.malikacodes.github-graph";
const SWITCH_PROFILE = "com.elgato.streamdeck.profile.rotate";

// The model names Stream Deck uses for my two decks in a profile file.
const MODELS = { xl: "20GAT9901", plus: "20GBD9901" };

// Each key is [column, row, action]. Columns and rows count from 0, top
// left. A dial is [column, action]. "home" is the built-in Switch Profile.
const PROFILES = {
	"github-xl": {
		name: "GitHub XL",
		device: "xl",
		keys: [
			[0, 0, "home"],
			[7, 0, "to-plus"],
			[1, 1, "repo"],
			[2, 1, "pulls"],
			[3, 1, "issues"],
			[4, 1, "workflow"],
			[5, 1, "compare"],
			[6, 1, "commits"],
			[2, 2, "stats-repo"],
			[3, 2, "releases"],
			[4, 2, "security"],
			[5, 2, "projects"],
		],
	},
	"github-plus": {
		name: "GitHub +",
		device: "plus",
		keys: [
			[0, 0, "repo"],
			[1, 0, "pulls"],
			[2, 0, "issues"],
			[3, 0, "workflow"],
			[0, 1, "compare"],
			[1, 1, "commits"],
			[2, 1, "releases"],
			[3, 1, "home"],
		],
		dials: [
			[0, "branches"],
			[1, "branches"],
			[2, "branches"],
			[3, "branches"],
		],
	},
};

// Stable ids made from a name, so building twice gives the same files.
function uuidFrom(name) {
	const hex = createHash("sha1").update(`github-graph:${name}`).digest("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// The id of the profile named "Home" on each kind of deck, from Stream
// Deck's own profile folders. The folder's name, lowercased, is the id.
async function homeProfiles() {
	const root = join(homedir(), "Library/Application Support/com.elgato.StreamDeck/ProfilesV3");
	const homes = {};
	for (const folder of await readdir(root).catch(() => [])) {
		if (!folder.endsWith(".sdProfile")) continue;
		const manifest = JSON.parse(await readFile(join(root, folder, "manifest.json"), "utf8").catch(() => "{}"));
		if (manifest.Name !== "Home") continue;
		const device = Object.keys(MODELS).find((kind) => MODELS[kind] === manifest.Device?.Model);
		if (device) homes[device] = folder.replace(".sdProfile", "").toLowerCase();
	}
	return homes;
}

function entry(manifest, name, id, homes, device) {
	const base = { ActionID: uuidFrom(id), LinkedTitle: false, Resources: null, State: 0 };
	if (name === "home") {
		return {
			...base,
			Name: "Switch Profile",
			Plugin: { Name: "Switch Profile", UUID: SWITCH_PROFILE, Version: "1.0" },
			// An empty DeviceUUID means "the deck this key is on", so no deck's
			// serial number ends up in the file.
			Settings: { DeviceUUID: "", PageIndex: 1, ProfileUUID: homes[device] },
			States: [{ FontFamily: "", FontSize: 16, FontStyle: "Bold", FontUnderline: false, OutlineThickness: 2, ShowTitle: true, Title: "Home", TitleAlignment: "middle", TitleColor: "#ffffff" }],
			UUID: SWITCH_PROFILE,
		};
	}
	const action = manifest.Actions.find((a) => a.UUID === `${PLUGIN}.${name}`);
	if (!action) throw new Error(`No action ${name} in the manifest`);
	return {
		...base,
		Name: action.Name,
		Plugin: { Name: manifest.Name, UUID: manifest.UUID, Version: manifest.Version },
		Settings: {},
		States: [{ FontFamily: "", FontSize: 12, FontStyle: "", FontUnderline: false, OutlineThickness: 2, ShowTitle: false, TitleAlignment: "bottom", TitleColor: "#ffffff" }],
		UUID: action.UUID,
	};
}

// The files inside one profile, as { path: object }.
function profileFiles(key, manifest, homes) {
	const profile = PROFILES[key];
	const root = `${uuidFrom(`${key}:profile`).toUpperCase()}.sdProfile`;
	const page = uuidFrom(`${key}:page`);
	const blank = uuidFrom(`${key}:default`);

	// A Home key is left out when that deck has no profile called Home.
	const keys = profile.keys.filter(([, , name]) => name !== "home" || homes[profile.device]);
	const actions = Object.fromEntries(keys.map(([c, r, name]) => [`${c},${r}`, entry(manifest, name, `${key}:${c},${r}`, homes, profile.device)]));
	const dials = profile.dials ?? [];
	const encoders = Object.fromEntries(dials.map(([c, name]) => [`${c},0`, entry(manifest, name, `${key}:dial:${c}`, homes, profile.device)]));

	return {
		[`${root}/manifest.json`]: {
			Device: { Model: MODELS[profile.device], UUID: "" },
			Name: profile.name,
			Pages: { Current: page, Default: blank, Pages: [page] },
			Version: "3.0",
		},
		// Stream Deck's own exports carry an empty default page that isn't in
		// the page list, so these do too.
		[`${root}/Profiles/${blank.toUpperCase()}/manifest.json`]: { Controllers: [{ Actions: null, Type: "Keypad" }, { Actions: null, Type: "Encoder" }], Icon: "", Name: "" },
		[`${root}/Profiles/${page.toUpperCase()}/manifest.json`]: {
			Controllers: [{ Actions: actions, Type: "Keypad" }, { Actions: dials.length ? encoders : null, Type: "Encoder" }],
			Icon: "",
			Name: "",
		},
	};
}

const pluginDir = fileURLToPath(new URL(`../${PLUGIN}.sdPlugin`, import.meta.url));
const manifest = JSON.parse(await readFile(join(pluginDir, "manifest.json"), "utf8"));
const homes = await homeProfiles();
const out = join(pluginDir, "profiles");
await mkdir(out, { recursive: true });

for (const key of Object.keys(PROFILES)) {
	const work = await mkdtemp(join(tmpdir(), "github-graph-profile-"));
	const files = profileFiles(key, manifest, homes);
	for (const [path, content] of Object.entries(files)) {
		await mkdir(join(work, path, ".."), { recursive: true });
		await writeFile(join(work, path), JSON.stringify(content));
	}
	const file = join(out, `${key}.streamDeckProfile`);
	await rm(file, { force: true });
	// Just the files, profile manifest first, no folder entries, the way
	// Stream Deck's own exports are laid out. -X leaves out extra file
	// attributes.
	execFileSync("zip", ["-q", "-X", "-D", file, ...Object.keys(files)], { cwd: work });
	await rm(work, { recursive: true, force: true });
	console.log(`${PROFILES[key].name}: ${homes[PROFILES[key].device] ? "with" : "without"} a Home key`);
}
