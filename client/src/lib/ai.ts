export type AiMode = "explainer" | "devil" | "source";
export type AiProvider = "anthropic" | "openai" | "compatible";

export const CLAUDE_MODEL = "claude-sonnet-4-6";
export const OPENAI_MODEL = "gpt-5.2";
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

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type CompatibleChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type AskThirdSeatArgs = {
  provider: AiProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  mode: AiMode;
  prompt: string;
  textTitle: string;
  pdfUrl?: string | null;
  notebookExcerpt: string;
};

export type ThirdSeatAnswer = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
  providerLabel: string;
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
    args.pdfUrl ? "A PDF of the shared text is attached to this request. Use it as the primary source." : "No PDF is attached to this request.",
    args.notebookExcerpt ? `Recent shared notebook:\n${args.notebookExcerpt}` : "Recent shared notebook: empty or not provided.",
    `Question:\n${args.prompt}`,
  ].join("\n\n");
}

function anthropicCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * INPUT_DOLLARS_PER_MILLION + outputTokens * OUTPUT_DOLLARS_PER_MILLION) / 1_000_000;
}

function normalizedCompatibleUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("Enter a compatible API base URL.");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function responseText(body: OpenAiResponse): string {
  if (body.output_text?.trim()) return body.output_text.trim();
  return (body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((item) => item.text ?? "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

async function askAnthropic(args: AskThirdSeatArgs): Promise<ThirdSeatAnswer> {
  const content: Array<
    | { type: "document"; source: { type: "url"; url: string } }
    | { type: "text"; text: string }
  > = [];
  if (args.pdfUrl) {
    content.push({
      type: "document",
      source: {
        type: "url",
        url: args.pdfUrl,
      },
    });
  }
  content.push({
    type: "text",
    text: userPrompt(args),
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: args.model || CLAUDE_MODEL,
      max_tokens: 420,
      system: systemPrompt(args.mode),
      messages: [
        {
          role: "user",
          content,
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
    estimatedCostUsd: anthropicCost(inputTokens, outputTokens),
    providerLabel: args.model || CLAUDE_MODEL,
  };
}

async function askOpenAi(args: AskThirdSeatArgs): Promise<ThirdSeatAnswer> {
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_file"; file_url: string }
  > = [{ type: "input_text", text: userPrompt(args) }];
  if (args.pdfUrl) {
    content.push({
      type: "input_file",
      file_url: args.pdfUrl,
    });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: args.model || OPENAI_MODEL,
      instructions: systemPrompt(args.mode),
      input: [
        {
          role: "user",
          content,
        },
      ],
      max_output_tokens: 420,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as OpenAiResponse;
  if (!response.ok) {
    throw new Error(body.error?.message || response.statusText || "OpenAI request failed");
  }

  return {
    text: responseText(body) || "OpenAI returned an empty response.",
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
    estimatedCostUsd: null,
    providerLabel: args.model || OPENAI_MODEL,
  };
}

async function askCompatible(args: AskThirdSeatArgs): Promise<ThirdSeatAnswer> {
  const model = args.model?.trim();
  if (!model) throw new Error("Enter a model name for this provider.");

  const response = await fetch(normalizedCompatibleUrl(args.baseUrl ?? ""), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt(args.mode) },
        { role: "user", content: userPrompt(args) },
      ],
      max_tokens: 420,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as CompatibleChatResponse;
  if (!response.ok) {
    throw new Error(body.error?.message || response.statusText || "Compatible provider request failed");
  }

  return {
    text: body.choices?.[0]?.message?.content?.trim() || "The provider returned an empty response.",
    inputTokens: body.usage?.prompt_tokens ?? 0,
    outputTokens: body.usage?.completion_tokens ?? 0,
    estimatedCostUsd: null,
    providerLabel: model,
  };
}

export async function askThirdSeat(args: AskThirdSeatArgs): Promise<ThirdSeatAnswer> {
  if (args.provider === "openai") return await askOpenAi(args);
  if (args.provider === "compatible") return await askCompatible(args);
  return await askAnthropic(args);
}
