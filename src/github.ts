// One day on the graph. level is the shade GitHub picked for it
// (0 = no contributions, 4 = the darkest green).
export type Day = {
	date: string; // "2026-10-05"
	count: number;
	level: number;
};

// Either we got what we asked for, or we got a message to show instead.
// short is the same message squeezed down for the full-width view, where
// the only free space is a 52px column.
export type Result<T> = { ok: true; data: T } | { ok: false; message: string; short: string };

// GitHub already sorts each day into one of five buckets, the same ones it
// uses to pick the greens on a profile page, so I don't have to work out the
// shading from raw counts.
const LEVELS: Record<string, number> = {
	NONE: 0,
	FIRST_QUARTILE: 1,
	SECOND_QUARTILE: 2,
	THIRD_QUARTILE: 3,
	FOURTH_QUARTILE: 4,
};

const DAYS = "contributionCalendar { weeks { contributionDays { date contributionCount contributionLevel } } }";

type Calendar = {
	contributionCalendar: {
		weeks: { contributionDays: { date: string; contributionCount: number; contributionLevel: string }[] }[];
	};
};

// GitHub sends days grouped into weeks. The plugin does its own grouping
// later (see calendar.ts), so this unpacks them into one flat list.
function flatten(calendar: Calendar): Day[] {
	return calendar.contributionCalendar.weeks.flatMap((week) =>
		week.contributionDays.map((day) => ({
			date: day.date,
			count: day.contributionCount,
			level: LEVELS[day.contributionLevel] ?? 0,
		})),
	);
}

// Sends one question to GitHub and sorts out the ways it can go wrong.
// "viewer" in the queries means whoever owns the token, which is why
// there's no username setting.
async function ask<T>(token: string | undefined, query: string, variables: object): Promise<Result<T>> {
	if (!token) {
		return { ok: false, message: "Add a token in settings", short: "No token" };
	}

	// fetch only throws when the request never got an answer at all (wifi
	// off, DNS down), which is different from GitHub answering with an error.
	let response: Response;
	try {
		response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				"User-Agent": "github-graph-stream-deck",
			},
			body: JSON.stringify({ query, variables }),
		});
	} catch {
		return { ok: false, message: "No internet", short: "Offline" };
	}

	if (response.status === 401) {
		return { ok: false, message: "Token didn't work", short: "Bad token" };
	}
	if (!response.ok) {
		return { ok: false, message: `GitHub error ${response.status}`, short: `Error ${response.status}` };
	}

	// GraphQL can answer "200 OK" and still have refused the question, for
	// example when the token is valid but isn't allowed to read the profile.
	// In that case the data part is just missing.
	const body = (await response.json()) as { data?: { viewer: T } };
	if (!body.data) {
		return { ok: false, message: "Token can't read this", short: "No access" };
	}

	return { ok: true, data: body.data.viewer };
}

export type Recent = {
	days: Day[];
	total: number; // contributions since January 1
	year: number;
	joined: number; // the year the account was made, so scrolling knows where to stop
	login: string; // my username, for the link to my profile
};

// The regular refresh: the last 12 months of days, plus a total counted
// from January 1. This is the only request that repeats on the timer.
export async function fetchRecent(token: string | undefined): Promise<Result<Recent>> {
	const year = new Date().getFullYear();
	const result = await ask<{
		login: string;
		createdAt: string;
		lastYear: Calendar;
		thisYear: { contributionCalendar: { totalContributions: number } };
	}>(
		token,
		`query($from: DateTime!) {
			viewer {
				login
				createdAt
				lastYear: contributionsCollection { ${DAYS} }
				thisYear: contributionsCollection(from: $from) { contributionCalendar { totalContributions } }
			}
		}`,
		{ from: new Date(year, 0, 1).toISOString() },
	);
	if (!result.ok) return result;

	return {
		ok: true,
		data: {
			days: flatten(result.data.lastYear),
			total: result.data.thisYear.contributionCalendar.totalContributions,
			year,
			joined: new Date(result.data.createdAt).getFullYear(),
			login: result.data.login,
		},
	};
}

// One whole calendar year, January 1 to December 31. Only asked for when
// the full-width view is turned to a year that isn't loaded yet.
export async function fetchYear(token: string | undefined, year: number): Promise<Result<Day[]>> {
	const result = await ask<{ year: Calendar }>(
		token,
		`query($from: DateTime!, $to: DateTime!) {
			viewer { year: contributionsCollection(from: $from, to: $to) { ${DAYS} } }
		}`,
		{ from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` },
	);
	if (!result.ok) return result;

	return { ok: true, data: flatten(result.data.year) };
}
