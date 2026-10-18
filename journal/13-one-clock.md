# 13 · One clock

*October 17, 2026*

The big one of this cleanup. Before today the plugin had twelve refresh
timers: one in the contribution store, one per kind of GitHub key (nine),
one in the Branch Map, and the Repo key watching the token on its own. Each
one read the settings, each one had its own "wait a second for the token
box to settle" copy, written four slightly different ways. Three of them
never stopped once started, so a page with none of my keys on it was still
asking GitHub for numbers nobody was looking at.

Worse: some of those timers called an async function with a bare `void`.
On Node 24 an error nobody catches ends the process, and Stream Deck
restarts the plugin with nothing in the log. That's the "plugin that
quietly dies" I'd been seeing.

## The shape

One file, `refresh.ts`, is the clock. Everything else registers a job:

```
contributions  ─┐
pull requests  ─┤
issues         ─┤   refresh.ts: one beat every N minutes, one alarm at
...            ─┼─  00:01, one wake-up handler, one settings listener,
branch map     ─┘   one place errors get caught and logged
```

The Repo key isn't a job. It only ever reloaded its list after a new
token, so it just listens for the clock's "the settings really changed"
and keeps doing that.

A job goes on the clock when the first key of its kind appears and comes
off when the last one leaves. No jobs, no timer at all.

Jobs run one at a time, in the order they arrived. That replaced a trick
where each kind of key waited two seconds longer than the last before its
first refresh, so a page of nine keys didn't hit GitHub nine times in the
same second. A queue does the same thing without any timers.

## Tests on a pretend clock

Node's test runner can fake `setTimeout` and `Date`, so the clock's tests
move time forward by hand and nothing really waits. Each rule got a test
before the keys moved over: once per interval, the one second settle, an
echo of the same settings does nothing, the last unregister stops the
timer, a job that throws is logged and the others still run, the wake-up
retry, and the midnight alarm.

> Heads up: importing the Stream Deck SDK makes a `logs/` folder wherever
> the process runs, even if nothing is logged. So `refresh.ts` never
> imports it. `plugin.ts` hands it the log line and the two events instead.

## One file at a time

The clock landed first with its tests and nothing using it. Then the
contribution store moved over in its own commit, then the GitHub keys, then
the Branch Map, then the Repo key. The whole suite ran green between each
one, and the plugin got a restart each time.

The contribution store also got the one thing the audit flagged that
wasn't a timer: a refresh that starts while one is already on its way
now joins it instead of asking GitHub twice.

## Reading it back

Once it was all in, I read the diff again against the tests and found
four things the tests hadn't caught. Two keys of one kind appearing in
the same moment could both decide they weren't the first, so neither put
the job on the clock. The first beat used the default 30 minutes even
when I'd set 5, because the setting arrives a moment after the first job
registers. A token pasted while no key was showing never made the plugin
forget the old one. And a wake-up asked "did that work?" of a round that
answered "fine" without running. Each got a test on the pretend clock,
then a fix.

## What I changed on purpose

- A dial press no longer restarts the countdown to the next tick. The
  tick comes whenever it was due. It barely matters at 30 minutes.
- When the token changes, the GitHub keys keep their last numbers up
  until the refresh lands, the same as after a wifi drop, instead of
  blanking first.

**Lesson:** twelve copies of "wait a second, check it really changed,
then refresh" is twelve chances to get one wrong. I'd got three wrong.
