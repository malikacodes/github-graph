import streamDeck from "@elgato/streamdeck";

import { ContributionGraph } from "./actions/contribution-graph";
import { WideGraph } from "./actions/wide-graph";

// Keep this at "info". The "trace" level writes every message between the
// plugin and Stream Deck into the log file, and one of those messages is the
// global settings, which is where the GitHub token lives.
streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new ContributionGraph());
streamDeck.actions.registerAction(new WideGraph());

// connect() has to come last, after the actions are registered.
streamDeck.connect();
