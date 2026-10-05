import streamDeck from "@elgato/streamdeck";

import { ContributionGraph } from "./actions/contribution-graph";

// Keep this at "info". The "trace" level writes every message between the
// plugin and Stream Deck into the log file, and one of those messages is the
// global settings, which is where the GitHub token lives.
streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new ContributionGraph());

// connect() has to come last, after the action is registered.
streamDeck.connect();
