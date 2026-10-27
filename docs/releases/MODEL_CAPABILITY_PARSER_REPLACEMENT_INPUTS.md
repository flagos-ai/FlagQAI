# Provider model capability parser replacement inputs

The first-release CLI's local `/provider` model editor accepts decimal token
capacities with optional K/M units, and a comma-separated list of reasoning
levels with optional wire aliases. The editor and provider override adapter use
`parseModelCapacity`, `parseModelReasoning`, `formatModelReasoning`, and the
exported field and level lists. Their type and call-site contracts, the
existing `verify-provider-model-editor` assertions, and black-box observations
of the previous compiled runtime are the inputs for this replacement. The
previous implementation body was not used as a template.

The replacement preserves empty-value inheritance, positive safe-integer
capacities, explicit `none`, optional `off` alongside another level, rejection
of duplicates and unknown levels, wire alias spelling, and stored display
order. Focused tests cover these boundaries and the editor's public behavior.

This removes one exact historical same-path source blob from the independent
Ink compiler inputs. It does not establish rights for other CLI source or
private Git history, nor authorize publication.
