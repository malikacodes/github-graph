# GitHub Graph

A Stream Deck + plugin that puts my GitHub contribution graph on the little
touch strip above a dial. It's for anyone with a Stream Deck + who likes
seeing their green squares without opening a browser tab. It's meant to be
quiet: it sits there, updates itself every half hour, and only says
something when it can't reach GitHub.

## What it shows

The last 19 weeks of contributions, 7 rows for the days of the week (Sunday
at the top, like on GitHub), in GitHub's dark theme greens. Above the graph
is one line of text with my total since January 1, like `387 in 2026`.

| Do this | And this happens |
|---|---|
| 🔘 Press the dial | Fetches fresh data from GitHub |
| ↩️ Turn the dial left | Scrolls back through older weeks, up to about a year |
| ↪️ Turn the dial right | Scrolls forward again |
| 👆 Tap the strip | Jumps back to this week |

When it's scrolled back, a small label on the right says how far, like
`5 wk back`.

## Setting it up

You need Node.js 24 or newer, the Stream Deck app 7.1 or newer, and a
Stream Deck +.

```bash
npm install                                               # get the SDK and build tools
npm run build                                             # build the plugin into the .sdPlugin folder
npx streamdeck dev                                        # turn on developer mode so Stream Deck loads local plugins
npx streamdeck link com.malikacodes.github-graph.sdPlugin # tell Stream Deck where the plugin lives
```

Then in the Stream Deck app, find **GitHub Graph** in the action list and
drag **Contribution Graph** onto a dial.

### The token

The plugin needs a GitHub token to ask for your graph.

1. Go to <https://github.com/settings/tokens/new> (a classic token).
2. Tick only `read:user`. Nothing else.
3. Generate it, copy it, and paste it into the **GitHub Token** field in
   the dial's settings in the Stream Deck app.

There's also a **Refresh Every** setting. It starts at 30 minutes.

> Heads up: the token is saved in Stream Deck's own app data, not in this
> folder. There's no settings file here to accidentally commit.

## If something's wrong

The text line changes to a short message. The last good graph stays on
screen underneath, so one failed refresh doesn't blank the dial.

| Message | What it means |
|---|---|
| `Add a token in settings` | The token field is empty |
| `Token didn't work` | GitHub rejected the token (wrong, expired or deleted) |
| `Token can't read this` | The token is real but isn't allowed to read the profile |
| `No internet` | The request never reached GitHub |
| `GitHub error 502` | GitHub answered with an error. The number is theirs |

## Why I built it this way

- **19 weeks, not 20.** One dial's strip is 200 pixels wide. 20 weeks
  technically fits but the squares touch the edges. 19 leaves an even 6
  pixels on each side.
- **"This year" means since January 1.** GitHub's profile page shows a
  rolling "last year" number. I wanted the one that resets in January, so
  the plugin asks for both: the last 12 months for the graph, and a
  calendar year total for the text.
- **The token is a global setting.** A dial's own settings are saved as
  plain text and go along for the ride when you export a profile. Global
  settings don't.
- **Logging is turned down.** The SDK template logs every message between
  the plugin and Stream Deck, and one of those messages contains the
  settings. It's set to `info` so the token never lands in a log file.
- **GitHub picks the shades.** The API already sorts each day into one of
  five levels, the same ones the profile page uses, so there's no math
  here trying to guess them.

## What it doesn't do

- It only shows the account the token belongs to. There's no username field.
- No automated tests yet. I checked the drawing and the error messages by
  hand, and the rest on the actual dial.
- The icon for the plugin's category is still the placeholder from
  Elgato's template.
- It isn't on the Elgato Marketplace.

## Changing it later

```bash
npm run build                                       # rebuild after editing anything in src/
npx streamdeck restart com.malikacodes.github-graph # reload the plugin in Stream Deck
```

Or `npm run watch`, which does both every time a file is saved.

How I built it, and what broke along the way, is in the [journal](journal/).
