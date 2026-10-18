import { action } from "@elgato/streamdeck";

import { type Alerts, fetchAlerts } from "../github";
import { COLORS, type Face } from "../key-art";
import { alertsLesson } from "../learn";
import { GitHubKey } from "./github-key";

// Open Dependabot alerts on the repo. The shield takes the color of the
// worst one, and says "off" when Dependabot isn't turned on, because
// nobody checking isn't the same as nothing wrong.
@action({ UUID: "com.malikacodes.github-graph.security" })
export class Security extends GitHubKey<Alerts> {
	protected readonly look = { icon: "shield", color: COLORS.green } as const;

	protected load(token: string | undefined, owner: string, name: string) {
		return fetchAlerts(token, owner, name);
	}

	protected face(alerts: Alerts): Face {
		if (alerts.off) return { ...this.look, color: COLORS.gray, big: "off", small: "Dependabot off" };

		const total = alerts.critical + alerts.high + alerts.medium + alerts.low;
		if (total === 0) return { ...this.look, big: "0", small: "no alerts" };

		const worst = alerts.critical ? "critical" : alerts.high ? "high" : alerts.medium ? "medium" : "low";
		const color = { critical: COLORS.red, high: COLORS.orange, medium: COLORS.yellow, low: COLORS.gray }[worst];
		return { icon: "shield", color, big: String(total), small: `worst: ${worst}` };
	}

	protected lesson(repo: string | undefined, alerts: Alerts | undefined, message: string | undefined) {
		return alertsLesson(repo, alerts, message);
	}

	protected link(alerts: Alerts | undefined, _: string, url: string): string {
		return alerts?.off ? `${url}/settings/security_analysis` : `${url}/security/dependabot`;
	}
}
