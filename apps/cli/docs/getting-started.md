# FlagQAI CLI：安装与快速开始

[文档索引](README.md) · [English](getting-started.en.md)

FlagQAI CLI 目前只能从本仓库源码或本地构建的 tarball 体验；
`@flagqai/cli` 尚未发布到 npm，请勿从 npm 仓库安装该包。

## 构建并安装本地包

需要 Node.js 22.19 或 24+、pnpm 11 和 npm。在仓库根目录执行：

```sh
pnpm --dir apps/cli install --frozen-lockfile
pnpm --dir apps/cli run compile
node apps/cli/scripts/pack-flagqai.mjs --out /tmp/flagqai-packages
npm install -g /tmp/flagqai-packages/flagqai-cli-0.1.0.tgz --omit=peer
flagqai setup
flagqai
```

打包脚本会把工作区依赖和许可证声明一同放入本地包，不会发布到 npm。
`flagqai setup` 会将固定版本的 Harness 和 pnpm 依赖安装到
`~/.flagqai/cli`，并建立兼容的 `flagqai` profile。此受管理的安装路径
无需另行全局安装 `dsh`；下载依赖时需要联网。

从源码开发时，在构建后运行 `pnpm --dir apps/cli run tui`；这条路径沿用
仓库的开发 profile。安装本地 tarball 后则使用 `flagqai setup`。

## 配置模型提供方

首次启动时，`/setup` 会显示本地的提供方和凭据状态，不会请求模型。
选择 **Configure provider** 打开 `/provider`。可以选择官方 API，
也可以配置兼容网关；自定义网关需要协议、Base URL、API Key 和模型 ID。
开始任务前请验证连接。密钥保存在原生凭据存储中。验证失败时可以返回
`/provider` 修正配置，无需重新构建。

`flagqai doctor` 检查本地运行环境与受管理的 FlagQuantum MCP，不能证明线上
提供方已连通。不要提交真实密钥。运行 `flagqai setup` 前安装 uv；setup 会安装
固定版本的 MCP 和 Python 环境，普通 CLI 启动直接运行已安装的 MCP。

## 命令与兼容性

| 命令 | 用途 |
| --- | --- |
| `flagqai setup` | 准备受管理的本地 Harness 运行环境及 profile |
| `flagqai` | 启动交互式终端客户端 |
| `flagqai doctor` | 检查本地运行环境 |
| `flagqai safe` | 排查损坏的 profile 并提供救援流程 |
| `flagqai serve` | 启动本地无界面服务 |
| `flagqai attach <url>` | 连接运行中的本地服务 |
| `flagqai --help` | 显示完整命令列表 |

`fq` is the short command. The native profile is `flagqai`, preferences and
CLI history use `~/.flagqai`, and product environment variables use `FLAGQAI_*`.
Old commands and configuration are not read or migrated. An explicit `DSH_HOME`
selects the Harness home containing the new profile.

键位、会话、安全模式和其他继承的终端能力请参阅[使用说明](user-guide.md)。
源码来源和发布边界请参阅 [CLI 首版清单](../../../docs/releases/CLI_FIRST_RELEASE.md)。
