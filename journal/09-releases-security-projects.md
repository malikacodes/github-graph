# 09 · Off isn't the same as safe

*October 15, 2026*

The last three keys: Releases, Security and Projects. The story of this
batch is mostly one word: **off**.

## The cheerful A

The plugin I'm replacing grades a repo's security with a letter. On every
one of my repos it would show **A, No Alerts**. That sounds great, except
Dependabot (GitHub's helper that watches the packages my code uses) isn't
turned on for any of them. There are no alerts because nothing is looking.

GitHub does say so, just not where his code looks. Asking for the alerts
comes back as an error that says "Dependabot alerts are disabled for this
repository." So my Security key reads that, and shows a gray shield that
says **off**. Zero alerts, once it's on, gets a green shield. A press on
"off" goes to the setting that turns it on.

To make that work, my little REST helper now keeps GitHub's own wording
when something fails. "Off" and "your token isn't allowed" are the same
error number, and only the words tell them apart.

## None is an answer too

Releases had the opposite trap. Asking for the latest release of a repo
that has never had one comes back as "not found", the same thing GitHub
says for a repo that doesn't exist. Only one of those is a problem. No
releases shows a calm gray **none**, and leak-flow shows **v1.1**.

## Projects doesn't follow

Every other key follows the Repo key. A project board belongs to me, not
to a repo, and can hold work from several. So the Projects key has a board
menu instead, and counts the cards into to do, doing and done by their
Status column. Boards name columns differently ("In Progress", "In
review", "Shipped"), so it goes by the words in the name.

It needs a token permission I don't have yet (`read:project`), so all I've
seen it say for real is **No access**, in soft red, which is at least the
honest answer.

**Lesson:** an empty answer and a missing answer can look identical. The
key's job is to know which one it got.
