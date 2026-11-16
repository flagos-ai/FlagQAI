# FlagQAI Web CI runner pilot

The reusable Web CI selects a dedicated Linux x64 CPU runner for a FlagQAI
pull request from a branch in the repository when GitHub confirms repository
admin permission for the PR author, workflow actor and rerun initiator.
Forks, other PRs, pushes and failed permission lookups use hosted Linux.
The CLI matrix continues to run on its existing platform runners.

## Rollout

1. Merge the reusable workflow into protected `main`. Then wire the CI caller
   to `flagos-ai/FlagQAI/.github/workflows/web-ci.yml@main`. Keep the existing
   required Web check as a hosted job that succeeds only if the called workflow
   succeeds. The base reference lets GitHub enforce the trusted workflow
   revision independently of changes in a PR.
2. Ask an organization administrator to create `flagqai-web-ci`. Limit its
   repository access to `flagos-ai/FlagQAI` and its workflow access to
   `flagos-ai/FlagQAI/.github/workflows/web-ci.yml@refs/heads/main`.
   The dedicated group needs public repository access.
3. Use an isolated Linux x64 CPU runner with label `flagqai-web-linux`.
   Register using the organization flow and
   `config.sh --ephemeral --runnergroup flagqai-web-ci`. Use a fresh Ubuntu VM
   with Chromium libraries, a non-root user, and its own CPU and memory quota.
   Keep private mounts, accelerator access and persistent credentials out of
   the VM. Replenish the ephemeral slot after it runs a job.
4. Once the trusted caller and runner group are in place and FlagQAI lists the
   runner as online, set `FLAGQAI_WEB_RUNNER` to `enabled`. Verify an
   administrator PR runs the SDK and browser tests on the dedicated runner and
   a non-admin PR or fork runs the same tests on hosted Linux. Check the
   required Web status on both PRs.

To revert the routing, remove `FLAGQAI_WEB_RUNNER` or set it to `disabled`.
New runs then use hosted runners. A queued pilot run can be cancelled and
replaced after the switch.
