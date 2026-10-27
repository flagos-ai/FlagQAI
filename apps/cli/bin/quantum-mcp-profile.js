/** One pinned launcher profile for CLI setup, preflight, and the native preset.
 * No process startup or Python package resolution happens when importing it. */
export const FLAGQUANTUM_MCP_PACKAGE = 'flagquantum-mcp-server==0.3.2'
// Keep the interpreter compatible with the pinned MCP's PyTorch dependency.
export const FLAGQUANTUM_MCP_PYTHON = '3.12'
// The local Linux capability is CPU-only. Resolve the CPU PyTorch wheel
// instead of pulling several gigabytes of CUDA dependencies from PyPI.
export const FLAGQUANTUM_MCP_TORCH_ARGS = Object.freeze(process.platform === 'linux'
  ? ['--torch-backend', 'cpu'] : [])
export const FLAGQUANTUM_MCP_INSTALL_ID = process.platform === 'linux'
  ? `${FLAGQUANTUM_MCP_PACKAGE}|torch=cpu` : FLAGQUANTUM_MCP_PACKAGE
export const FLAGQUANTUM_MCP_INSTALL_ARGS = Object.freeze([
  'tool', 'install', ...FLAGQUANTUM_MCP_TORCH_ARGS,
  '--python', FLAGQUANTUM_MCP_PYTHON, FLAGQUANTUM_MCP_PACKAGE,
])
export const FLAGQUANTUM_MCP_ARGS = Object.freeze([
  ...FLAGQUANTUM_MCP_TORCH_ARGS, '--python', FLAGQUANTUM_MCP_PYTHON,
  '--from', FLAGQUANTUM_MCP_PACKAGE,
  'flagquantum-mcp-server',
])
