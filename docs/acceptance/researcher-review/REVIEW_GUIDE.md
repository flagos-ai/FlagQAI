# Reviewer procedure and discussion prompts

This round is run by the evaluator without recruited participants. The prompts
below structure expert inspection; responses are reviewer notes, not fictional
interviews or evidence of user preferences. Keep the owner out of execution work.

## Before each scenario

1. Read the task card and write down the scientific question in one sentence.
2. State the required output and acceptance checks before opening the Web.
3. Inspect local dependencies and a reference output. Mark missing dependencies
   separately from missing product support. Do not enable a paid provider.
4. Freeze the build, source/input hashes, units, seeds, budgets and tool versions.
5. Open a clean local evaluation workspace and independent browser origin. Save
   an unsent chat draft and an unsaved editor draft as preservation sentinels.

## Inspect the existing-tool lane

- What files and commands are needed to get a scientifically checkable answer?
- Where are assumptions, code versions, results and failed attempts recorded?
- What must be transferred manually to compare or reproduce two outcomes?
- Which work is domain-specific, and which is generic file/environment handling?
- Which steps are actually performed, rather than merely described as customary?

Record the exact lane used. We do not know a real user's incumbent workflow in
this internal round. Avoid saying “researchers normally spend X minutes” based
on our own reference implementation.

## Walk through the Web

For each step, first inspect what the existing screen communicates without using
source-code knowledge. State what action the screen appears to invite and what
outcome would demonstrate success. Then perform the action and record its result.
If source inspection, a raw API command or a developer repair is needed, mark the
assistance explicitly; do not retroactively call the path self-explanatory.

Check these transitions in every domain:

- Question to scientific inputs and assumptions.
- Inputs to editable code and the selected execution environment.
- Run completion to visible scientific results, distinct from process status.
- Result to its exact code/settings/source artifact.
- Baseline to a changed candidate and a defensible comparison.
- Failed or rejected candidate to a new attempt without erasing prior evidence.
- Saved result to independent reopening/re-execution, without duplicate submission.
- Return to both unsent-chat and unsaved-editor drafts.

Use normal navigation and existing controls. Do not insist on visiting every
navigation page. Record a correct calculation presented only in console output
as such; it does not prove that the specialized result experience is complete.

## Final expert review questions

1. What scientific conclusion can be supported by the saved outputs?
2. Can an independent reader distinguish the baseline, candidate, failure and
   unverified claim without the evaluator narrating them?
3. Which exact step was easier than in the reference lane, and what evidence
   supports that assessment? What became harder?
4. Was the SDK materially useful for this task, or was it generic Python running
   inside a Web frame? Record the contribution rather than assuming one.
5. Did the Agent surface help when its model was disconnected or scripted? Which
   parts of a live-model collaboration remain untested?
6. What single missing capability would prevent completion? Could the question
   be answered satisfactorily without this Web at all?
7. What was recovered from durable artifacts, and what still depended on local
   memory, browser state or an unexplained external file?

## Later revisit

Start a fresh local process or reload the evaluation workspace. Retrieve the
selected scientific result, explain its settings, change one condition and
identify the exact predecessor. Read-only recovery must not silently run a job.
Explicit re-execution must retain a separate attempt and respect the task's
deterministic or statistical reproduction criteria.

## If independent interviews happen later

This section is optional and creates no recruitment dependency now. Ask about
the person's last concrete research task, current files/tools, recent failures
and time-consuming handoffs before showing the product. Afterwards ask what they
would use next week, what they would keep in their existing tools, and what they
would actually bring back. Avoid “would an AI quantum platform help you?” and
questions that invite politeness. Record verbatim quotes only when genuinely
spoken and consented; never replace missing participants with persona answers.

## Findings synthesis

Separate observed behavior, scientific evidence and product hypotheses. Rank
blockers by whether they invalidate a conclusion, block completion, require an
external workaround, or create presentation friction. Summarize each domain
independently. Carry observed issues into a later decision; do not turn this
review into an automatic feature implementation queue.
