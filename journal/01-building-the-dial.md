# 01 · Building the contribution graph dial

**What I wanted:** my GitHub contribution graph on one of the dials of my
Stream Deck +, on the little strip of screen above it. Press to refresh,
turn to scroll back through older weeks, tap to come back to now.

## How it works

A Stream Deck plugin is a small program that the Stream Deck app starts
and talks to. The app says "someone turned dial 2", and the plugin answers
"okay, put this picture on its strip".

The strip above each dial is 200 pixels wide and 100 tall. A **layout**
file says what goes where on it. It's basically a seating chart: this
rectangle is a picture, that rectangle is text. Mine has three seats: the
graph, the total, and a small label for how far back I've scrolled.

The graph itself is a picture the plugin draws on the spot, one small
green square at a time, and hands to the app.

The data comes from GitHub's GraphQL API (a way of asking GitHub for
exactly the fields you want and nothing else). It needs a token, which is
like a spare key that only opens one door. Mine only opens "read my
profile".

## Steps

**1. Make the project with Elgato's wizard**

```bash
# on the MAC
cd ~/github-plugin                  # the folder I made for this
npx @elgato/cli@1.10.1 create       # Elgato's wizard: asks a few questions, then builds a starter plugin
```

My answers:

| Question | Answer |
|---|---|
| Author | Malika Pixels |
| Plugin Name | GitHub Graph |
| Plugin UUID | `com.malikacodes.github-graph` |
| Description | Shows my GitHub contribution graph on a Stream Deck + dial. |

The wizard also installs everything, builds once, turns on developer mode,
and links the plugin so the Stream Deck app can see it.

> Heads up: the wizard makes its own subfolder, named after the last part
> of the UUID. So the project ended up in `~/github-plugin/github-graph`,
> not in the folder I ran it from.

**2. Swap the example for a dial**

The starter plugin is a counter button. I deleted it and told
`manifest.json` (the plugin's ID card) that this action is for dials only:

```json
"Controllers": ["Encoder"],
"Encoder": {
	"layout": "layouts/graph.json",
	"TriggerDescription": {
		"Push": "Refresh",
		"Rotate": "Scroll through weeks",
		"Touch": "Back to this week"
	}
}
```

"Encoder" is Elgato's word for a dial.

**3. Lay out the strip**

`layouts/graph.json` has the three rectangles. The squares are 8 pixels
with a 2 pixel gap, so each week is 10 pixels wide. 19 weeks is 188
pixels, which leaves 6 on each side. 20 fits on paper but touches the
edges.

**4. Ask GitHub for the data**

Before writing any plugin code, I tried the question in the terminal:

```bash
# on the MAC
gh api graphql -f query='query { viewer { contributionsCollection { contributionCalendar { totalContributions } } } }'   # ask GitHub for my total, using the gh login I already have
```

`viewer` means "whoever this token belongs to", so the plugin never needs
my username. GitHub sends back 53 weeks, and each day already comes
labelled with one of five shade levels. No math needed on my side.

**5. Build it and load it**

```bash
# on the MAC
cd ~/github-plugin/github-graph
npm run build                                               # turn the TypeScript into the plugin Stream Deck runs
npx streamdeck validate com.malikacodes.github-graph.sdPlugin   # Elgato's checker for the manifest and layout
npx streamdeck restart com.malikacodes.github-graph         # reload the plugin in the Stream Deck app
```

**6. Add the token**

On GitHub: Settings, Developer settings, Personal access tokens, Tokens
(classic), Generate new token. Tick only `read:user`.

In the Stream Deck app: drag **Contribution Graph** onto a dial, click the
dial, and paste the token into **GitHub Token**.

## Did it work?

- The dial says `Add a token in settings` before there's a token.
- A second or two after pasting the token, the graph shows up. 🎉
- Turning left shows `1 wk back`, `2 wk back`, and so on. Tapping the
  strip clears it.

## What went wrong (and how I fixed it)

**The wizard ticked off every step, then left me an almost empty folder.**

The first time, I ran the wizard from the version of Elgato's CLI I
already had installed (1.10.0). It ticked off "Installing dependencies"
and "Building plugin", then finished with:

```
✖ Linking failed
Directory not found: com.malikacodes.github-graph.sdPlugin
```

The project folder had exactly one file in it, `rollup.config.mjs`. No
source, no manifest, nothing to link.

**Fix:** a newer CLI (1.10.1) was out. I deleted the empty folder and ran
that version through `npx`, which borrows a tool for one command without
installing it for good. Same answers, and this time everything was there.
The project keeps its own copy of the CLI now, so it doesn't matter what's
installed on the Mac.

**The starter plugin writes everything to a log file, including settings.**

The template sets logging to `trace`, the chattiest level. That records
every message between the plugin and the Stream Deck app, and one of those
messages is the global settings. Which is where my token lives.

**Fix:** `streamDeck.logger.setLevel("info")` in `src/plugin.ts`. I also
checked the log file for anything token-shaped. Nothing.

**TypeScript wanted to know what kind of dial.**

```
Generic type 'DialAction<TSettings>' requires 1 type argument(s).
```

The SDK wants to be told what settings each dial carries. Mine carry
none, because everything is in global settings.

**Fix:** `DialAction<{}>`. An empty pair of braces means "no settings of
its own".

## What I learned

- **A row of green ticks needs a second look.** Open the folder and see
  what's actually in it.
- When a tool does something strange, check if there's a newer version
  before anything else.
- Read what the template turns on by default. The logging one would have
  quietly saved my token to a file.
- Tokens go in **global** settings. A dial's own settings are plain text
  and get exported with the profile.
