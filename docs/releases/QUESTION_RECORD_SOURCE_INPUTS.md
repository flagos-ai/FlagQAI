# Durable questionnaire record source inputs

This private issue #93 batch replaces the transcript fold for answered questionnaires. Its inputs are the published `@deepseek-ai/dsh-user-questions` question/answer declarations, the exported `QuestionRecord` interface and call sites, the localization key, and the existing projection/secret-answer regression fixtures. The inherited implementation body was not used as a template. The implementer has prior exposure to the imported repository, so this is not a strict clean-room claim or a source-rights clearance.

The replacement parses persisted tool arguments/results without throwing on damaged JSON or array items. It keeps item positions aligned, summarizes only actual answers, strips terminal control bytes, and clips by grapheme. A secret question or local wizard redaction masks selected labels and free text before either reaches the transcript. The session log remains authoritative; no separate answer store is added.

Validation and exact-tree lineage results are recorded on the private PR. The larger inherited TUI source, other compiler inputs, dependencies, notices, and private Git history remain in the release review. No public export or package publication follows from this batch.
