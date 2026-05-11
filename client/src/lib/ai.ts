export type AiMode = "explainer" | "devil" | "source";

export const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_VERSION = "2023-06-01";
const INPUT_DOLLARS_PER_MILLION = 3;
const OUTPUT_DOLLARS_PER_MILLION = 15;

type AnthropicMessageResponse = {
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type AskThirdSeatArgs = {
  apiKey: string;
  mode: AiMode;
  prompt: string;
  textTitle: string;
  notebookExcerpt: string;
};

export type ThirdSeatAnswer = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

function modeInstruction(mode: AiMode): string {
  if (mode === "devil") {
    return "Mode: devil's advocate. Steel-man the strongest counter-reading to the user's interpretation. Be rigorous but not theatrical.";
  }
  if (mode === "source") {
    return "Mode: source finder. Help locate related words, themes, passages, or likely cross-references. If the full text is not available, say exactly what evidence you would need.";
  }
  return "Mode: explainer. Explain context, terms, claims, and interpretive options briefly and clearly.";
}

function systemPrompt(mode: AiMode): string {
  return [
    "You are the AI third seat in Pilpul, a quiet two-person study room.",
    "Serve the human conversation. Do not replace it.",
    "Default to three concise sentences unless the user asks for more.",
    "Be honest about uncertainty and about missing text.",
    "Do not invent citations or quote passages you have not been given.",
    modeInstruction(mode),
  ].join("\n");
}

function userPrompt(args: AskThirdSeatArgs): string {
  return [
    `Shared text: ${args.textTitle}`,
    args.notebookExcerpt ? `Recent shared notebook:\n${args.notebookExcerpt}` : "Recent shared notebook: empty or not provided.",
    `Question:\n${args.prompt}`,
  ].join("\n\n");
}

function cost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * INPUT_DOLLARS_PER_MILLION + outputTokens * OUTPUT_DOLLARS_PER_MILLION) / 1_000_000;
}

export async function askThirdSeat(args: AskThirdSeatArgs): Promise<ThirdSeatAnswer> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 420,
      system: systemPrompt(args.mode),
      messages: [
        {
          role: "user",
          content: userPrompt(args),
        },
      ],
    }),
  });

  const body = (await response.json().catch(() => ({}))) as AnthropicMessageResponse;
  if (!response.ok) {
    throw new Error(body.error?.message || response.statusText || "Claude request failed");
  }

  const text = (body.content ?? [])
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text)
    .join("\n\n")
    .trim();

  const inputTokens = body.usage?.input_tokens ?? 0;
  const outputTokens = body.usage?.output_tokens ?? 0;
  return {
    text: text || "Claude returned an empty response.",
    inputTokens,
    outputTokens,
    estimatedCostUsd: cost(inputTokens, outputTokens),
  };
}

