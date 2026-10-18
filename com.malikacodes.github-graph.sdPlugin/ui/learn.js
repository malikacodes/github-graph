// Fills in the learning rows on a GitHub key's settings page. The plugin
// sends the words, and sends them again after every refresh, so "Right
// now" keeps up with the key while the page is open. Same idea as the
// Mac Vitals stat pages.
(() => {
	const { streamDeckClient } = SDPIComponents;
	const put = (id, text) => {
		const spot = document.getElementById(id);
		if (spot) spot.textContent = text ?? "";
	};

	// A list of short lines, each one as plain text, never as HTML.
	const list = (id, lines) => {
		const spot = document.getElementById(id);
		if (!spot) return;
		spot.replaceChildren(
			...lines.map((line) => {
				const item = document.createElement("li");
				if (Array.isArray(line)) {
					const term = document.createElement("b");
					term.textContent = line[0];
					item.append(term, `: ${line[1]}`);
				} else {
					item.textContent = line;
				}
				return item;
			}),
		);
	};

	streamDeckClient.sendToPropertyInspector.subscribe((message) => {
		const sent = message.payload ?? {};
		if (sent.event !== "explain" || !sent.lesson) return;
		const lesson = sent.lesson;
		put("this-is", lesson.thisIs);
		put("now", lesson.now);
		list("normal", lesson.normal ?? []);
		list("words", lesson.words ?? []);
		put("try", lesson.tryThis);
		put("press", lesson.press);
	});

	streamDeckClient.send("sendToPlugin", { event: "explain" });
})();
