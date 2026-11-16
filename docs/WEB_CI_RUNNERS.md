# FlagQAI Web CI runner pilot

The Web and real-SDK check can use one dedicated Linux x64 CPU slot for pushes
to protected `main`. All pull request checks and the CLI matrix use GitHub
hosted runners. `FLAGQAI_WEB_RUNNER` defaults to hosted routing when unset.

## Provisioning

1. In the `flagos-ai` organization, create a runner group named `flagqai-web-ci`.
   Allow only `flagos-ai/FlagQAI` and restrict it to
   `flagos-ai/FlagQAI/.github/workflows/ci.yml@refs/heads/main`. Public repository
   access is needed for this group. Confirm the exact workflow restriction before
   registering a runner.
2. Register an ephemeral Linux x64 runner in that group with the custom label
   `flagqai-web-linux`. Give the slot its own CPU and memory quota. Use a fresh
   Ubuntu VM with Chromium system libraries already installed. Run as a
   non-root user without sudo, private mounts, accelerator access, or persistent
   credentials. Forward runner logs before destroying each VM.
3. Use the organization registration flow with
   `config.sh --ephemeral --runnergroup flagqai-web-ci`. An ephemeral runner
   processes one job. For recurring routing, provision a replacement when a job
   consumes the slot. For a single trial, disable routing after that trial starts.
   Once this workflow is merged and the dedicated runner is online for FlagQAI,
   set the repository Actions variable `FLAGQAI_WEB_RUNNER` to `enabled`.
4. After the next protected-main push, verify the Web job used the dedicated
   runner, SDK acceptance reported zero skips, and browser acceptance passed.
   Check that a PR run on the same workflow revision used standard Ubuntu.
   Compare queue time and total duration before adding a second slot.

For rollback, remove the variable or set it to `disabled`. A new run then
uses hosted routing. Cancel any queued pilot job before replacing its run.
