# 08 · Stars, commits and branches

*October 15, 2026*

Three more keys: Repo Stats, Commit Activity and Branch Comparison. These
were quicker than the first batch, because all the groundwork from last
time (the look, the Repo key, the settings pages) was already there.

## A press opens things, so no more flipping

The Repo Stats key in the plugin I'm replacing flips through ten different
numbers when you press it. Mine opens GitHub on a press, like every other
key, so the flipping moved to a **Show** setting: stars, forks, watchers or
language. Language turned out to be my favorite. It's a dot in GitHub's
own color for the language, the same one next to the language on the repo
page. leak-flow gets Swift orange.

## Branch Comparison works with no setup

Usually you'd have to tell it two branches. That doesn't work when the key
follows the Repo key from repo to repo, since every repo has different
branches. So blank means "main, and the newest branch that isn't main".
On karaoke-maker it says **3 ahead** for timing-editor without me touching
anything.

The other plugin had a bug here: two compare keys on the same repo saved
their answers in the same spot, so they could show each other's numbers.
Mine saves each answer under the repo *and* the two branches.

> Why does my-words say "1 behind" when it was merged weeks ago?

Squash merge again. The branch's work went onto main as a new commit, so
main has one commit the branch doesn't. That's actually the tell that a
branch is done and safe to delete, so it's in the settings page's
"Normal" row now.

## The bars needed room

The first Commit Activity key had short bars, a dashed-looking line where
the empty weeks were, and the total squeezed under them in tiny letters.
I moved the total into the bottom words ("58 in 4 weeks") and let the bars
be as tall as the key allows.

## One test earned its keep

The Show setting checks the value against the list of names with `in`.
A test feeding it `"toString"` failed, because every object in JavaScript
has a built-in `toString`. `Object.hasOwn` only looks at what I actually
put in the list.

**Lesson:** a test with a silly input found a real hole. I wouldn't have
typed "toString" into a menu, but a setting can come from anywhere.
