# 12 · One file per audience

*October 17, 2026*

`github.ts` had grown to 683 lines. It started as the file that fetched my
contribution days, and then every GitHub key I added put its own fetcher
in there too, until the two doors to GitHub (`ask` for GraphQL, `rest` for
REST) were buried in the middle, below things that used them.

## Who reads what

Two very different parts of the plugin read this file:

```
contribution dials, repo pickers  →  github.ts       (days, my login, my repos)
GitHub keys, branch map           →  github-repo.ts  (one repo at a glance)
```

So that's the split. `github.ts` keeps the two doors, my year of days and
the repo list. `github-repo.ts` gets everything that asks about one repo,
plus my project boards. Nothing inside any function changed: this was a
cut and paste with the imports pointed at the new place.

## Tests first, in three steps

The doors had no tests of their own, only the fetchers above them. Before
moving anything I wrote tests for `ask` and `rest` straight: a good answer,
a 204 with nothing in it, a 200 that still refuses with no data, a dead
token, a wifi login page instead of JSON, and no internet at all. They
passed on the old code, which is the point. Then:

1. **The doors move to the top** of `github.ts`, so they sit above the
   first function that walks through them.
2. **The branch map's fetchers move** to `github-repo.ts`.
3. **The keys' fetchers and the boards move** too.

Tests green after each step. Reading a 683-line diff for a move is
hopeless. Reading three smaller ones is fine.

## Did it work?

78 tests, the build is clean, and the GitHub keys drew on the XL after a
restart.

**Lesson:** a move with tests on both sides of it is boring, which is
exactly what I want from a move.
