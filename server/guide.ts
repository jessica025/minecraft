import { BedrockRuntimeClient, ConverseCommand, type Message } from "@aws-sdk/client-bedrock-runtime";
import type { GuideProvider } from "./app";

function sanitizeGuideText(value: string): string {
  return value
    .replace(/\p{Extended_Pictographic}|\uFE0F/gu, "")
    .replace(/[*_`~]/g, "")
    .replace(/^\s*[#>]+\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function createBedrockGuide(region: string, modelId: string): { provider: GuideProvider; dispose: () => void } {
  const bedrock = new BedrockRuntimeClient({ region, maxAttempts: 5, retryMode: "adaptive" });
  return {
    dispose: () => bedrock.destroy(),
    provider: async (prompt, context, signal) => {
      const messages: Message[] = [
        {
          role: "user",
          content: [
            {
              text: [
                `玩家问题：${prompt}`,
                `当前游戏状态：${JSON.stringify(context ?? {})}`,
              ].join("\n"),
            },
          ],
        },
      ];

      const result = await bedrock.send(
        new ConverseCommand({
          modelId,
          system: [
            {
              text: [
                "你是方境世界里的探险向导。",
                "只用纯文本中文回答，不要使用 Markdown、表情符号或项目符号，最多三句话。",
                "给出一个可以在当前游戏状态中执行的建议。",
                "游戏中可执行的动作只有：直接挖掘除基岩外的方块、放置快捷栏方块、使用长矛攻击、移动跳跃疾跑、放置铜灯照明。",
                "游戏没有合成、镐子、熔炉、背包数量、任务领取或驯服系统，绝对不要提到这些内容。",
                "不要把附近方块统计解释成玩家已拥有的资源，也不要给出精确矿藏数量。",
              ].join(""),
            },
          ],
          messages,
          inferenceConfig: {
            maxTokens: 240,
            temperature: 0.72,
          },
        }),
        { abortSignal: signal },
      );

      const text = sanitizeGuideText(
        result.output?.message?.content
        ?.map((block) => ("text" in block ? block.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim() ?? "",
      );

      if (!text) throw new Error("Empty guide response");
      return text;
    },
  };
}
