# 10 · Two decks, one repo

*October 15, 2026*

The keys were done. This part was about getting to them: a way in from my
XL's Home page, a way over to the +, and the + dials following along.

## How it's wired

```
XL Home ── GitHub key ──> GitHub XL page
                            Repo, 9 GitHub keys, Home, Go to +
                                                    │
                                                    v
                          GitHub + page
                            7 keys, Home, Branch Map on 4 dials
```

Everything on both pages starts on "Follow the Repo key". So when I press
Repo on the XL, the keys on the + change too, and so does the map on the
dials. That last part needed the Branch Map to learn the same trick: its
repo setting used to mean "this exact repo". Now blank means "whatever
the Repo key says", and it uses the same picker as the keys.

## Pages the plugin carries

A plugin can only switch to pages it ships itself (Stream Deck calls them
profiles), not ones I set up by hand. My wiki already had the whole
recipe from two of my other plugins, so this went quickly:

1. **A script builds both pages** (`npm run profiles`) as the same kind of
   file Stream Deck makes when you export a profile.
2. **The Home keys** are Stream Deck's own Switch Profile action, pointed
   at the profile called "Home" on each deck. The script finds those in
   Stream Deck's own files, so nothing personal is typed into the code.
3. **The built pages stay out of git.** The Home ids are only true on my
   Mac, and the repo is public.
4. **The first press asks to install.** A plugin that's only linked, like
   mine while I build it, gets its pages on the first switch. Stream Deck
   asks once per deck.

## Modular on purpose

I'm not sure yet if I'll actually like a whole GitHub page, so every piece
still works on its own. A Pull Requests key can live on my Home page by
itself, Go to + can sit anywhere, and the pages are just a starting
layout I can rearrange.

> What does Go to + do if the + isn't plugged in?

It says "no + plugged in" in soft red, and a press shows the warning sign
instead of doing nothing.

**Lesson:** the hard part of a page of keys turned out to be the
following, not the keys. Once one setting meant "follow", every other
piece could just ask what it was.

## What's next

- Put the GitHub key on my XL Home page and press it.
- A token with `read:project`, so Projects can show my board.
