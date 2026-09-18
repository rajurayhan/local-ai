export type TextResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export type ImageResult = {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  >;
  isError?: boolean;
};

export type ToolResult = TextResult | ImageResult;

export type JsonSchema = {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties: false;
};

export type PackTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
};

export type PackName = 'files' | 'shell' | 'browser' | 'desktop' | 'apps';

export type PackAuthor = {
  name: string;
  email: string;
};

export type PackDraft = {
  name: PackName;
  tools: PackTool[];
};

export type Pack = PackDraft & {
  shareName: string;
  author: PackAuthor;
  description: string;
};

export type AppHook = {
  id: string;
  name: string;
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
};

export type DeviceConfig = {
  host: string;
  port: number;
  token: string;
  logPath: string;
  files: {
    root: string;
    writes: boolean;
    maxReadBytes: number;
  };
  shell: {
    cwdAllow: string[];
    denyBinaries: string[];
    timeoutMs: number;
    maxOutputBytes: number;
  };
  browser: {
    allowedDomains: string[];
    userDataDir: string;
  };
  desktop: {
    screenshotDir: string;
  };
  apps: {
    hooks: AppHook[];
    slackToken: string;
    timeoutMs: number;
    maxResponseBytes: number;
  };
};

export type CommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

export type CommandRunner = (
  file: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    maxOutputBytes: number;
  },
) => Promise<CommandResult>;

export type HttpResponse = {
  status: number;
  body: string;
};

export type HttpPoster = (
  url: string,
  options: {
    method: 'GET' | 'POST' | 'PUT';
    headers: Record<string, string>;
    body?: string;
    timeoutMs: number;
    maxResponseBytes: number;
  },
) => Promise<HttpResponse>;
