"""Definition of Ready thresholds. Policy lives here, not in the rule code."""

from datetime import datetime, timezone

# "Today" for the test data set. Override with --now on the CLI.
DEFAULT_CHECK_TIME = datetime(2026, 10, 13, 9, 0, tzinfo=timezone.utc)

# Rule 3: minimum business days between the check date (day 0) and the due date.
MIN_BUSINESS_DAYS_STATIC = 3
MIN_BUSINESS_DAYS_VIDEO = 5

# Rule 6 (Brain rules): the one place we use an LLM.
BRAIN_MODEL = "claude-haiku-5-5"
BRAIN_MAX_TOKENS = 2048
