import streamDeck from "@elgato/streamdeck";

import { BranchNetwork } from "./actions/branch-network";
import { Commits } from "./actions/commits";
import { Compare } from "./actions/compare";
import { GoToPlus, OpenGitHub } from "./actions/deck-keys";
import { ContributionGraph } from "./actions/contribution-graph";
import { ContributionStats } from "./actions/contribution-stats";
import { DailyGoal } from "./actions/daily-goal";
import { StreakCounter } from "./actions/streak-counter";
import { Issues } from "./actions/issues";
import { Projects } from "./actions/projects";
import { PullRequests } from "./actions/pull-requests";
import { Releases } from "./actions/releases";
import { RepoKey } from "./actions/repo-key";
import { RepoStats } from "./actions/repo-stats";
import { Security } from "./actions/security";
import { WideGraph } from "./actions/wide-graph";
import { Workflow } from "./actions/workflow";

// Keep this at "info". The "trace" level writes every message between the
// plugin and Stream Deck into the log file, and one of those messages is the
// global settings, which is where the GitHub token lives.
streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new ContributionGraph());
streamDeck.actions.registerAction(new WideGraph());
streamDeck.actions.registerAction(new ContributionStats());
streamDeck.actions.registerAction(new DailyGoal());
streamDeck.actions.registerAction(new StreakCounter());
streamDeck.actions.registerAction(new BranchNetwork());
streamDeck.actions.registerAction(new RepoKey());
streamDeck.actions.registerAction(new PullRequests());
streamDeck.actions.registerAction(new Issues());
streamDeck.actions.registerAction(new Workflow());
streamDeck.actions.registerAction(new RepoStats());
streamDeck.actions.registerAction(new Commits());
streamDeck.actions.registerAction(new Compare());
streamDeck.actions.registerAction(new Releases());
streamDeck.actions.registerAction(new Security());
streamDeck.actions.registerAction(new Projects());
streamDeck.actions.registerAction(new OpenGitHub());
streamDeck.actions.registerAction(new GoToPlus());

// connect() has to come last, after the actions are registered.
streamDeck.connect();
