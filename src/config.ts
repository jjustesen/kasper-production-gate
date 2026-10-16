// Definition of Ready thresholds. Policy lives here, not in the rule code.

// "Today" for the test data set. Override with --now on the CLI.
export const DEFAULT_CHECK_TIME = new Date("2026-10-13T09:00:00Z");

// Rule 3: minimum business days between the check date (day 0) and the due date.
export const MIN_BUSINESS_DAYS_STATIC = 3;
export const MIN_BUSINESS_DAYS_VIDEO = 5;

// Rule 6 (Brain rules): the one place we use an LLM.
export const BRAIN_MODEL = "claude-haiku-5-5";
export const BRAIN_MAX_TOKENS = 2048;
