// Fills in the Status line on a settings page. The plugin sends one plain
// sentence about what's going on ("Up to date", "No internet" and so on),
// and this puts it on the page. All three settings pages load this file,
// so it only has to be written once.
const { streamDeckClient } = SDPIComponents;

// Every time the plugin has something new to say, show it.
streamDeckClient.sendToPropertyInspector.subscribe((message) => {
	document.getElementById("status").textContent = message.payload;
});

// The page has only just opened, so ask the plugin where things stand.
streamDeckClient.send("sendToPlugin", "status");
