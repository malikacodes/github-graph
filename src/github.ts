// What the rest of the plugin needs from GitHub: a grid of shade levels
// (0 = no contributions, 4 = the darkest green) and the total for this year.
// weeks[0] is the oldest week, and each week is a list of days starting Sunday.
export type Contributions = {
	weeks: number[][];
	total: number;
	year: number;
};

// Either we got the data, or we got a short message that fits on the strip.
export type FetchResult = { ok: true; data: Contributions } | { ok: false; message: string };

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

// "viewer" means whoever owns the token, so there's no username setting.
// The same query asks for two things: the last 12 months of days for the
// graph, and a total counted from January 1st for the text line.
const QUERY = `
	query($from: DateTime!) {
		viewer {
			lastYear: contributionsCollection {
				contributionCalendar {
					weeks { contributionDays { contributionLevel } }
				}
			}
			thisYear: contributionsCollection(from: $from) {
				contributionCalendar { totalContributions }
			}
		}
	}
`;

type Calendar = {
	data?: {
		viewer: {
			lastYear: { contributionCalendar: { weeks: { contributionDays: { contributionLevel: string }[] }[] } };
			thisYear: { contributionCalendar: { totalContributions: number } };
		};
	};
};

export async function fetchContributions(token: string | undefined): Promise<FetchResult> {
	if (!token) {
		return { ok: false, message: "Add a token in settings" };
	}

	const year = new Date().getFullYear();

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
			body: JSON.stringify({ query: QUERY, variables: { from: new Date(year, 0, 1).toISOString() } }),
		});
	} catch {
		return { ok: false, message: "No internet" };
	}

	if (response.status === 401) {
		return { ok: false, message: "Token didn't work" };
	}
	if (!response.ok) {
		return { ok: false, message: `GitHub error ${response.status}` };
	}

	// GraphQL can answer "200 OK" and still have refused the question, for
	// example when the token is valid but isn't allowed to read the profile.
	// In that case the data part is just missing.
	const body = (await response.json()) as Calendar;
	if (!body.data) {
		return { ok: false, message: "Token can't read this" };
	}

	const { lastYear, thisYear } = body.data.viewer;
	return {
		ok: true,
		data: {
			weeks: lastYear.contributionCalendar.weeks.map((week) =>
				week.contributionDays.map((day) => LEVELS[day.contributionLevel] ?? 0),
			),
			total: thisYear.contributionCalendar.totalContributions,
			year,
		},
	};
}
