import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function plugin(bb: BbPluginApi) {
  bb.cli.register({
    name: "thread-mobile",
    summary: "Inspect mobile thread navigation",
    commands: [{ name: "list", summary: "List visible project root threads", usage: "bb thread-mobile list <project-id>" }],
    async run(argv) {
      if (argv.length !== 2 || argv[0] !== "list" || !argv[1]) {
        return { exitCode: argv.length === 0 || argv[0] === "--help" ? 0 : 1, stdout: "Usage: bb thread-mobile list <project-id>" };
      }
      const threads = [];
      for (let offset = 0; offset < 10000; offset += 200) {
        const page = await bb.sdk.threads.list({ projectId: argv[1], archived: false, includeHidden: false, limit: 200, offset });
        threads.push(...page.filter(thread => thread.parentThreadId === null));
        if (page.length < 200) {
          threads.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
          return { exitCode: 0, stdout: JSON.stringify(threads.map(thread => ({ id: thread.id, title: thread.title || thread.titleFallback || "Untitled thread" })), null, 2) };
        }
      }
      return { exitCode: 1, stderr: "Project exceeds the CLI listing limit." };
    },
  });
}
