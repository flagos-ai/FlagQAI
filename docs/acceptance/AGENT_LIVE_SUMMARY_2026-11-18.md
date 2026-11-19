# Live native activity summary

The existing Work details disclosure names the current native tool and a bounded
input summary. It also shows the in-progress Harness todo, when present. Between
tools it distinguishes thinking from the last recorded tool and its failure.
Reconnecting, stopping and permission waits take priority over stale tool activity.
No tool output is fabricated and no estimated completion percentage is displayed.

The existing disclosure, task checklist, completed Worked for history, failures,
reading-position restoration and explicit follow controls retain their owners.
Live output remains expandable. The three-line preview avoids high-frequency
raw-log scrolling while retaining the full tool record inside the disclosure.

Validation: all 312 Web unit tests passed, including native status, waiting,
historical failure and task-summary cases. The existing browser task-progress
journey passed with assertions for the visible current task and completed
checklist. Web type checking, production build and formatting passed. All tests
use fixed local Agent events; no paid model call is made.
