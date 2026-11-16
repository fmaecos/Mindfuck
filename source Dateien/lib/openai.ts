import { ApiError } from './errors';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, any>;
};

export type ToolResult = {
  callId: string;
  name: string;
  ok: boolean;
  summary: string;
  data?: any;
};

export type AssistantRun = {
  text: string;
  toolCalls: ToolResult[];
  previousResponseId?: string | null;
};

const API_URL = 'https://api.openai.com/v1';

export const DEFAULT_MODEL = 'gpt-6-luna';

export type ToolDefinition = {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, any>;
  strict?: boolean;
};

export async function listModels(apiKey: string): Promise<string[]> {
  const response = await fetch(`${API_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(response.status, { code: 'openai_error', message: body.slice(0, 300) });
  }
  const data: any = await response.json();
  const ids: string[] = (data?.data || []).map((m: any) => m.id as string).filter(Boolean);
  return ids
    .filter((id) => /^(gpt|o[134])/i.test(id) && !/(embedding|audio|tts|whisper|moderation|dall-e|realtime|image)/i.test(id))
    .sort();
}

async function callResponses(
  apiKey: string,
  model: string,
  body: Record<string, any>
): Promise<any> {
  const response = await fetch(`${API_URL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, ...body }),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message || message;
    } catch (e) {
      /* keep raw */
    }
    throw new ApiError(response.status, { code: 'openai_error', message });
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new ApiError(0, { code: 'openai_error', message: 'Ungültige Antwort von OpenAI.' });
  }
}

export function extractText(response: any): string {
  const parts: string[] = [];
  const output = response?.output || [];
  output.forEach((item: any) => {
    if (item?.type === 'message' || item?.type === 'output_text') {
      const content = item?.content;
      if (Array.isArray(content)) {
        content.forEach((part: any) => {
          if (part?.type === 'output_text' && part.text) parts.push(part.text);
        });
      } else if (typeof content === 'string') {
        parts.push(content);
      } else if (typeof item?.text === 'string') {
        parts.push(item.text);
      }
    }
  });
  if (!parts.length && typeof response?.output_text === 'string') parts.push(response.output_text);
  return parts.join('\n').trim();
}

export function extractToolCalls(response: any): ToolCall[] {
  const calls: ToolCall[] = [];
  (response?.output || []).forEach((item: any) => {
    if (item?.type === 'function_call' && item?.name) {
      let args: any = {};
      try {
        args = item.arguments ? JSON.parse(item.arguments) : {};
      } catch (e) {
        args = {};
      }
      calls.push({ id: item.call_id || item.id, name: item.name, arguments: args });
    }
  });
  return calls;
}

export type RunTurnOptions = {
  apiKey: string;
  model: string;
  instructions: string;
  input: any[];
  tools: ToolDefinition[];
  previousResponseId?: string | null;
  onToolCall?: (call: ToolCall) => void | Promise<void>;
  executeTool: (call: ToolCall) => Promise<{ ok: boolean; summary: string; data?: any }>;
};

/** Runs one assistant turn, resolving tool calls until the model answers. */
export async function runTurn(options: RunTurnOptions): Promise<AssistantRun> {
  const toolResults: ToolResult[] = [];
  let previousResponseId = options.previousResponseId || undefined;
  const input = options.input.slice();
  let response = await callResponses(options.apiKey, options.model, {
    instructions: options.instructions,
    input,
    tools: options.tools,
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
  });
  previousResponseId = response?.id || previousResponseId;

  for (let round = 0; round < 8; round++) {
    const calls = extractToolCalls(response);
    if (!calls.length) break;
    const outputs: any[] = [];
    for (const call of calls) {
      await options.onToolCall?.(call);
      let result: { ok: boolean; summary: string; data?: any };
      try {
        result = await options.executeTool(call);
      } catch (e: any) {
        result = { ok: false, summary: e?.message || 'Tool-Fehler' };
      }
      toolResults.push({ callId: call.id, name: call.name, ok: result.ok, summary: result.summary, data: result.data });
      outputs.push({ type: 'function_call_output', call_id: call.id, output: result.summary });
    }
    response = await callResponses(options.apiKey, options.model, {
      instructions: options.instructions,
      input: outputs,
      tools: options.tools,
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
    });
    previousResponseId = response?.id || previousResponseId;
  }

  return { text: extractText(response), toolCalls: toolResults, previousResponseId };
}
