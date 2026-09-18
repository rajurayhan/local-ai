import { Constants, imageExtRegex, splitToolCallName } from 'librechat-data-provider';
import type { TAttachment, TFile } from 'librechat-data-provider';

export const BROWSER_PACK_NAME = 'RakaAI-Browser';

const VIEW_TOOLS = new Set(['open_page', 'click', 'fill', 'capture_page']);

export type BrowserViewport = {
  conversationId: string;
  url: string;
  title?: string;
  imageUrl: string;
  fileId?: string;
  toolCallId?: string;
};

export type BrowserToolInput = {
  name: string;
  output?: string | null;
  args?: string | Record<string, unknown>;
  attachments?: TAttachment[];
  knownServers?: readonly string[];
};

export function isBrowserViewTool(name: string, knownServers?: readonly string[]): boolean {
  if (!name.includes(Constants.mcp_delimiter)) {
    return false;
  }
  const [tool, server] = splitToolCallName(name, knownServers);
  return server === BROWSER_PACK_NAME && VIEW_TOOLS.has(tool);
}

export function extractPageUrl(text: string | null | undefined): string | undefined {
  if (text == null || text === '') {
    return undefined;
  }
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? '';
  const fromLine = asHttpUrl(firstLine);
  if (fromLine != null) {
    return fromLine;
  }
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match != null ? asHttpUrl(match[0].replace(/[),.;]+$/, '')) : undefined;
}

export function urlFromArgs(args: BrowserToolInput['args']): string | undefined {
  if (args == null) {
    return undefined;
  }
  if (typeof args === 'string') {
    const parsed = parseObject(args);
    return typeof parsed?.url === 'string' ? asHttpUrl(parsed.url) : undefined;
  }
  return typeof args.url === 'string' ? asHttpUrl(args.url) : undefined;
}

export function browserViewportFromTool(
  input: BrowserToolInput,
): Omit<BrowserViewport, 'conversationId'> | null {
  if (!isBrowserViewTool(input.name, input.knownServers)) {
    return null;
  }
  const file = screenshotOf(input.attachments);
  if (file?.filepath == null) {
    return null;
  }
  return {
    url: extractPageUrl(input.output) ?? urlFromArgs(input.args) ?? '',
    title: file.filename,
    imageUrl: file.filepath,
    fileId: file.file_id,
    toolCallId: (file as TFile & { toolCallId?: string }).toolCallId,
  };
}

function screenshotOf(attachments: TAttachment[] | undefined): TFile | undefined {
  if (attachments == null) {
    return undefined;
  }
  for (const attachment of attachments) {
    const file = attachment as TFile;
    if (file.filepath != null && file.filename != null && imageExtRegex.test(file.filename)) {
      return file;
    }
  }
  return undefined;
}

function parseObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function asHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}
