# 11 · Three copies of three lines

*October 17, 2026*

A tidy-up, not a feature. I read back through the plugin with fresh eyes
and found the same three lines written out three times.

## The copies

`draw.ts` had a function that makes a name safe to put in a picture (an
SVG is written like HTML, so a stray `&` or `<` in a repo name blanks the
whole key). `keys.ts` had its own copy. `key-art.ts` had a third. Only the
first one handled a quote, so a branch called `say "hi"` would draw fine
on the dial and come out blank on a key.

Same story with the black square every key is drawn on, and with the bit
of date math that turns "2026-10-05" into a plain day number: `streak.ts`
had its own instead of using `calendar.ts`.

## Why I did that

The comments told me. Node's test runner couldn't follow an import that
left off the `.ts`, so any file I wanted to test had to import nothing
that existed at run time. So I copied. (Yes, three times.)

That reason is gone. Node 24 runs TypeScript files straight, and this
project's `tsconfig.json` already had `rewriteRelativeImportExtensions`
on, which lets me write `from "./draw.ts"` and have the build turn it into
the right thing. The only thing left to do was actually write `.ts` on
every import, which was a find-and-replace across 31 files.

## What changed

Four small commits, one change each, so each one can be read on its own:

- Every relative import ends in `.ts`.
- `draw.ts` owns `safe()` (the one that escapes quotes), `blackKey()` and
  `BLACK`. `keys.ts` and `key-art.ts` import them.
- `calendar.ts` owns `dayNumber()`. `streak.ts` imports it.
- `fetchNetwork` in `github.ts` had a line that could never run: it checked
  whether a compare had failed right after a line that had already
  returned if any had. Gone.

## Did it work?

The test came first: `safe('say "hi"')` has to come out as
`say &quot;hi&quot;`, and a GitHub key with a quote in its name has to
carry it. On the old code the test couldn't even import `safe`. On the new
code all 72 pass, the build is clean, and the keys drew on my XL after a
restart.

**Lesson:** when a comment explains why something is copied, check if the
reason is still true. Mine had been false since the Node upgrade.
