// The repo picker. It looks like a dropdown, but opens into a search box
// and a list, newest push first, with a small drawn lock on private repos.
// It's written by hand because a plain dropdown can only hold text, and
// the lock is a drawing, not an emoji.
//
// The plugin sends the list (getRepos), and a pick is saved into this
// key's own settings, which the plugin hears right away.
(() => {
	const { streamDeckClient } = SDPIComponents;
	const root = document.getElementById("picker");
	const FOLLOW = "";
	const LOCK =
		'<svg class="lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2.5" fill="none" stroke="#9a9a9a" stroke-width="2.4"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#9a9a9a" stroke-width="2.4"/></svg>';

	root.className = "picker";
	root.innerHTML = '<button type="button"></button><div class="panel"><input placeholder="Search repos..." /><ul></ul></div>';
	const button = root.querySelector("button");
	const search = root.querySelector("input");
	const list = root.querySelector("ul");

	let repos = [];
	let follow = false;
	let current = FOLLOW;
	let message;

	// One row of the list, or the button's label. Names go in as text.
	const row = (into, value) => {
		into.replaceChildren();
		if (value === FOLLOW) {
			into.append("Follow the Repo key");
			return;
		}
		const repo = repos.find((r) => r.name === value);
		if (repo?.private) into.insertAdjacentHTML("afterbegin", LOCK);
		into.append(value);
	};

	const draw = () => {
		row(button, current);
		if (!follow && current === FOLLOW) button.textContent = "Pick a repo";

		const words = search.value.trim().toLowerCase();
		const items = [];
		if (follow && !words) items.push(FOLLOW);
		for (const repo of repos) if (repo.name.toLowerCase().includes(words)) items.push(repo.name);

		list.replaceChildren(
			...items.map((value) => {
				const item = document.createElement("li");
				row(item, value);
				if (value === FOLLOW) item.classList.add("follow");
				if (value === current) item.classList.add("picked");
				item.addEventListener("click", () => pick(value));
				return item;
			}),
		);

		if (message || items.length === 0) {
			const note = document.createElement("li");
			note.className = "note";
			note.textContent = message ?? "No repos match";
			list.append(note);
		}
	};

	const pick = async (value) => {
		current = value;
		root.classList.remove("open");
		draw();
		const { settings } = await streamDeckClient.getSettings();
		await streamDeckClient.setSettings({ ...settings, repo: value });
	};

	button.addEventListener("click", () => {
		root.classList.toggle("open");
		if (root.classList.contains("open")) {
			search.value = "";
			draw();
			search.focus();
		}
	});
	search.addEventListener("input", draw);

	// Clicking anywhere else closes the list.
	document.addEventListener("click", (ev) => {
		if (!root.contains(ev.target)) root.classList.remove("open");
	});

	streamDeckClient.sendToPropertyInspector.subscribe((sent) => {
		const payload = sent.payload ?? {};
		if (payload.event !== "getRepos") return;
		repos = payload.repos ?? [];
		follow = !!payload.follow;
		current = payload.current ?? FOLLOW;
		message = payload.message;
		draw();
	});

	draw();
	streamDeckClient.send("sendToPlugin", { event: "getRepos" });
})();
