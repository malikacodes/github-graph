import streamDeck from "@elgato/streamdeck";

import { ContributionGraph } from "./actions/contribution-graph";
import { ContributionStats } from "./actions/contribution-stats";
import { DailyGoal } from "./actions/daily-goal";
import { WideGraph } from "./actions/wide-graph";

// Keep this at "info". The "trace" level writes every message between the
// plugin and Stream Deck into the log file, and one of those messages is the
// global settings, which is where the GitHub token lives.
streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new ContributionGraph());
streamDeck.actions.registerAction(new WideGraph());
streamDeck.actions.registerAction(new ContributionStats());
streamDeck.actions.registerAction(new DailyGoal());

// connect() has to come last, after the actions are registered.
streamDeck.connect();
