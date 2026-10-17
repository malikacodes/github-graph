# 16 · The last three voids

*October 17, 2026*

A short one. When the clock went in (entry 13), I swept the bare `void`
calls out of the four files it touched. A `void` in front of an async
call means "start this and don't wait", which also means "and if it
fails, nobody hears about it". On Node 24 an error nobody hears about
ends the plugin. Three more were hiding in files the clock never
touched.

## Where they were

```
daily-goal.ts      each frame of the celebration ring
streak-counter.ts  each frame of the flame burst, and the idle sway
deck-keys.ts       the GitHub and Go to + keys, on focus and when a deck
                   plugs in or out
```

None of these refresh anything. They just send a picture to a key. But
sending a picture can fail (a key that left the page mid-animation, a
deck unplugged at the wrong second), and any of those would have been a
quiet restart with nothing in the log.

## The fix

Each one now goes through `safely()` from `refresh.ts`, with a short
name: "goal", "streak" or "deck keys". A failure becomes one log line,
like `streak failed: ...`, and the plugin keeps going.

`safely()` didn't have a test of its own yet, only the clock's tests
using it. So it got one first: hand it a promise that fails, check it
doesn't throw, check the log says `goal failed: Error: boom`. Small
test, but it's the one guarding the whole plugin.

There's no `void this.` left anywhere in `src/` now. I checked with
grep, because I don't trust myself to have checked by looking. (Entry
13 is proof.)

**Lesson:** a sweep only covers the files you sweep. Grep the whole
folder when you think you're done.
