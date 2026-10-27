# Linux arm64 installed acceptance

FlagQuantum 0.3.1 has no Linux arm64 wheel on PyPI. The pinned MCP installation
therefore builds FlagQuantum's PyTorch C++ extension from its source distribution.
The compiler-free `node:22-bookworm-slim` image fails during `flagqai setup`.
The following image supplies the missing native build toolchain without using
host Python packages, a model provider, or a QPU:

```Dockerfile
FROM node:22-bookworm-slim
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
    ca-certificates curl build-essential \
    && rm -rf /var/lib/apt/lists/*
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH=/root/.local/bin:$PATH
```

The verified image used Node 22.23.3 and uv 0.13.4 on Linux arm64. uv selected
Python 3.12 for `flagquantum-mcp-server==0.3.1`; FlagQAI requested CPU-only
PyTorch. Starting from an exact source checkout with its frozen workspace lockfile:

```sh
pnpm --dir apps/cli install --frozen-lockfile
FLAGQAI_ACCEPTANCE_INSTALL_TIMEOUT_MS=1200000 \
FLAGQAI_ACCEPTANCE_QUANTUM_PREFLIGHT=1 \
FLAGQAI_ACCEPTANCE_PTY_MODULE="$PWD/apps/cli/scripts/linux-script-pty.cjs" \
FLAGQAI_ACCEPTANCE_PROVIDER_WIZARD=1 \
FLAGQAI_ACCEPTANCE_AGENT_TURN=1 \
node apps/cli/scripts/verify-installed-first-run.mjs
```

Run the second command inside the build-equipped image with the source checkout
mounted at the working directory. The verifier stages the package, installs it
under a fresh HOME/cache, runs first and repeated setup and doctor, asks the
real installed FlagQuantum MCP to preflight a VQE task, and exercises the
default CLI entry in a PTY with a local scripted model. A separate optional
`FLAGQAI_ACCEPTANCE_QUANTUM_FIXTURE=1` lane substitutes a scripted MCP to
check launcher behavior; it must retain the managed Harness executable on
`PATH` when it sets `DSH_HOME` explicitly. The scripted model and MCP fixture
do not establish a real scientific calculation or a paid-provider result.

This recipe proves the source-build route in a toolchain-equipped Linux arm64
environment. An official wheel would remove that compiler prerequisite; the
minimal compiler-free image remains an expected failure for FlagQuantum 0.3.1.
