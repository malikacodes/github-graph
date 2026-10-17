# 15 · Honest Projects

*October 17, 2026*

The last of this cleanup, and the smallest. Two things had been bugging
me since the GitHub keys went in.

## A board isn't a repo

Every GitHub key shares one base class, and that class thinks in repos:
the repo a key is pinned to, or the one the Repo key picked. Projects
doesn't fit. A board belongs to me, not to a repo. When I built it I
made it fit anyway, by overriding "which repo is this key about" to
answer `"projects"`. It worked, because the base class only used the
name to file answers under, and the key's own code ignored it.

It worked, and it lied. Now the base class asks `subject(settings)`:
what is this key about? For nine keys that's a repo. For Projects it's
"my boards", and nothing downstream ever treats it as a repo name,
because the key says it doesn't follow one.

## Three copies of "whose repo is it?"

"leak-flow" means mine, "someone/their-repo" means theirs. That lookup
(parse the name, ask GitHub who I am if there's no owner) was written
out in the GitHub keys, in Branch Comparison's branch menus, and in the
Branch Map. Now it's one `resolveRepo()` in `focus.ts`, with tests for
the three cases: a name alone, owner/name, and the two ways it fails.

The tests hand it a stand-in for "who am I", so no test ever asks GitHub.

## One wording changed

A repo setting that isn't a repo name at all ("not a repo!") used to
make the Branch Map say "Pick a repo in settings". It now says what the
keys say: "That isn't a repo name", and it goes in the log like any other
failed lookup. Same lookup, same words.

Two small things got better by accident. A press on a key with a broken
repo setting used to ask GitHub who I am just to build a link that went
nowhere; now it opens GitHub's front page without asking. And a Projects
key filed its answers under the name "projects", which a real repo of
mine could be called too. "my boards" can't be.

**Lesson:** a workaround that "works because nothing checks" is a bug
waiting for the first thing that checks.
