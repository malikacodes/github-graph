# 14 · The same three words

*October 17, 2026*

A small one. The three contribution keys (stats, daily goal, streak) each
had the same block at the bottom of their drawing code: before the first
download say "loading", during a press say "updating", and if the last try
failed say the short reason in red. Three copies, two color constants each,
and the stats key had its own "5 min ago" formatter with different wording
from the one the GitHub keys use.

## One answer

`bottomLine()` in `data.ts` now answers it once: the few words, the
color, and whether there are numbers to show at all.

```
                small        color   ready
before download "loading"    grey    no
during a press  "updating"   grey    yes
last try failed "Bad token"  red     yes (or no)
all fine        ""           grey    yes
```

An empty `small` means "nothing to say", so each key puts its own
everyday line there: the goal key writes "of 5", the stats key writes how
old the numbers are, the streak key writes nothing.

Tests first, as usual: the four rows above, with the helper handed a
made-up whiteboard so GitHub stays out of it. Then one key per commit.

## The age wording

The stats key now uses the same `ago()` as the GitHub keys, so "3 d ago"
became "3 days ago" (and past a month, "2 mo ago"). It's a little longer
along the bottom of the key, which only shows up if the numbers are more
than a day old, which only happens if the Mac has been offline that long.

The dot next to it kept its own red. I'd first tied it to the color of
the words, and a press after a failed try turned it grey, which isn't a
color the dot has. Reading the diff back caught that one.

## One thing I changed on purpose

The goal key and the streak key disagreed about one moment: a press while
the last try had failed. The goal key went grey for "updating", the streak
key stayed red. Grey is right (a press is a neutral thing), so the streak
key now does what the goal key did.

**Lesson:** when three keys copy a block, look for the one that's
slightly different. That's where the bug is, or the decision I never made.
