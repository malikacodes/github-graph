// Dates in this plugin are plain "2026-10-05" strings, the way GitHub sends
// them. These helpers do the date math in UTC so a daylight saving change
// can never make a day come out 23 or 25 hours long and shift everything.

export function addDays(date: string, days: number): string {
	const moved = new Date(`${date}T00:00:00Z`);
	moved.setUTCDate(moved.getUTCDate() + days);
	return moved.toISOString().slice(0, 10);
}

// 0 is Sunday, 6 is Saturday.
export function weekday(date: string): number {
	return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// Lays a stretch of dates out the way the graph is drawn: one column per
// week, seven slots per column, Sunday in slot 0. A stretch that starts on
// a Wednesday leaves the first three slots of its first column empty, so
// every day still lands in the row for its own weekday.
export function weekColumns(from: string, to: string): (string | undefined)[][] {
	const columns: (string | undefined)[][] = [];
	if (!from || !to) return columns;

	for (let date = from; date <= to; date = addDays(date, 1)) {
		const slot = weekday(date);
		if (slot === 0 || columns.length === 0) {
			columns.push(new Array(7).fill(undefined));
		}
		columns[columns.length - 1][slot] = date;
	}
	return columns;
}
