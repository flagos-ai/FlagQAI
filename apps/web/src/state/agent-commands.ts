export type AgentCommand = {
  name: string;
  aliases: string[];
  description: string;
  keywords: string;
  tab: "models" | "providers" | "new" | "resume";
};
export const agentCommands: AgentCommand[] = [
  {
    name: "new",
    aliases: [],
    description: "Start a new Agent conversation",
    keywords: "新建 会话 聊天",
    tab: "new",
  },
  {
    name: "resume",
    aliases: [],
    description: "Search and resume a past session",
    keywords: "历史 恢复 会话 history",
    tab: "resume",
  },
  {
    name: "model",
    aliases: ["models"],
    description: "Search and switch AI models",
    keywords: "模型 选择 切换",
    tab: "models",
  },
  {
    name: "provider",
    aliases: [],
    description: "Configure built-in or custom providers",
    keywords: "服务商 配置 接口 endpoint api",
    tab: "providers",
  },
];
export function commandQuery(text: string): string | null {
  // A slash inside prose, a file path or a multiline message is ordinary input.
  const match = text.match(/^\/([^\s/]*)$/u);
  return match ? match[1].toLocaleLowerCase() : null;
}
export function matchCommands(text: string): AgentCommand[] {
  const query = commandQuery(text);
  return query === null
    ? []
    : agentCommands.filter((command) =>
        [
          command.name,
          ...command.aliases,
          command.description,
          command.keywords,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query),
      );
}
export function exactCommand(text: string): AgentCommand | undefined {
  const query = commandQuery(text.trim());
  return query
    ? agentCommands.find(
        (command) => command.name === query || command.aliases.includes(query),
      )
    : undefined;
}
