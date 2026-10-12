# 04 · The hole on Mondays

*October 12, 2026*

The graph on my dial looked broken at the start of every week, and it
took me until a Monday to see why.

| Monday, before | Monday, after |
|---|---|
| ![The last column is two squares and a gap](assets/04-the-hole-on-mondays/before.png) | ![Every column is full](assets/04-the-hole-on-mondays/after.png) |

The graph only drew days that had happened. So on a Monday the last
column was two squares, Sunday and Monday, with black space under them
where Tuesday to Saturday would go. It filled in one square a day and
looked whole by Saturday, just in time to start over. Technically
correct. Still looked like a missing tooth.

Now the whole week gets its squares up front. The days that haven't
happened yet are one shade dimmer than an empty day, and they pick up
their color as I do things. I tried them the exact same color first, then
two shades darker, and landed in the middle: full enough to look whole,
different enough to see where today is.

The fix was small: the graph used to run "to today", and now it runs "to
Saturday".

**Lesson:** I built this midweek and tested it midweek. Some bugs only
come out on a Monday. (Relatable.)
