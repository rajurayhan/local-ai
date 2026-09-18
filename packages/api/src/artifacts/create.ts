import { Tools } from 'librechat-data-provider';

export const CREATE_ARTIFACT_TOOL_NAME = Tools.create_artifact;

export const CREATE_ARTIFACT_TYPES = [
  'text/html',
  'text/markdown',
  'text/md',
  'text/plain',
  'image/svg+xml',
  'application/vnd.react',
  'application/vnd.mermaid',
] as const;

export type CreateArtifactType = (typeof CREATE_ARTIFACT_TYPES)[number];

export type CreateArtifactInput = {
  title: string;
  content: string;
  type: string;
  identifier?: string;
};

export type CreateArtifactFile = {
  file_id: string;
  filename: string;
  type: CreateArtifactType;
  text: string;
};

export type CreateArtifactToolArtifact = {
  [Tools.create_artifact]: CreateArtifactFile;
};

export type CreateArtifactResult = {
  content: string;
  artifact?: CreateArtifactToolArtifact;
};

export const CREATE_ARTIFACT_TITLE_MAX = 120;
export const CREATE_ARTIFACT_CONTENT_MAX = 200_000;
export const CREATE_ARTIFACT_IDENTIFIER_MAX = 80;

export const CREATE_ARTIFACT_TOOL_HINT =
  'To show a page, document, diagram, or component in the side panel, call create_artifact with title, content, and type. Do not invent other artifact tool names.';

const EXTENSION_BY_TYPE: Record<CreateArtifactType, string> = {
  'text/html': 'html',
  'text/markdown': 'md',
  'text/md': 'md',
  'text/plain': 'txt',
  'image/svg+xml': 'svg',
  'application/vnd.react': 'tsx',
  'application/vnd.mermaid': 'mmd',
};

export function isCreateArtifactType(value: string): value is CreateArtifactType {
  return (CREATE_ARTIFACT_TYPES as readonly string[]).includes(value);
}

export function slugifyArtifactIdentifier(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CREATE_ARTIFACT_IDENTIFIER_MAX);
  return slug.length > 0 ? slug : 'artifact';
}

export function withCreateArtifactTool(
  tools: string[] | undefined,
  artifacts?: string,
): string[] {
  const next = [...(tools ?? [])];
  if (typeof artifacts !== 'string' || artifacts === '') {
    return next;
  }
  if (!next.includes(CREATE_ARTIFACT_TOOL_NAME)) {
    next.push(CREATE_ARTIFACT_TOOL_NAME);
  }
  return next;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeArtifactContent(type: CreateArtifactType, content: string): string {
  if (type !== 'text/html') {
    return content;
  }
  const trimmed = content.trim();
  if (/<!DOCTYPE/i.test(trimmed) || /<html[\s>]/i.test(trimmed) || trimmed.startsWith('<')) {
    return content;
  }
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '</head>',
    '<body>',
    `  <p>${escapeHtml(content)}</p>`,
    '</body>',
    '</html>',
  ].join('\n');
}

export function createArtifact(
  input: CreateArtifactInput,
  options?: { fileId?: string },
): CreateArtifactResult {
  const title = input.title.trim();
  if (title.length === 0) {
    return { content: 'title is required' };
  }
  if (title.length > CREATE_ARTIFACT_TITLE_MAX) {
    return { content: `title must be ${CREATE_ARTIFACT_TITLE_MAX} characters or fewer` };
  }

  const type = input.type.trim();
  if (!isCreateArtifactType(type)) {
    return { content: `type must be one of: ${CREATE_ARTIFACT_TYPES.join(', ')}` };
  }

  if (input.content.length === 0) {
    return { content: 'content is required' };
  }
  if (input.content.length > CREATE_ARTIFACT_CONTENT_MAX) {
    return { content: `content must be ${CREATE_ARTIFACT_CONTENT_MAX} characters or fewer` };
  }

  const identifier = slugifyArtifactIdentifier(input.identifier ?? title);
  const text = normalizeArtifactContent(type, input.content);
  const file: CreateArtifactFile = {
    file_id: options?.fileId ?? `artifact-${identifier}-${Date.now().toString(36)}`,
    filename: `${identifier}.${EXTENSION_BY_TYPE[type]}`,
    type,
    text,
  };

  return {
    content: `Created "${title}" (${type}). It is open in the side panel.`,
    artifact: { [Tools.create_artifact]: file },
  };
}

export function readCreateArtifactFile(artifact: unknown): CreateArtifactFile | undefined {
  if (artifact == null || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return undefined;
  }
  const candidate = (artifact as CreateArtifactToolArtifact)[Tools.create_artifact];
  if (candidate == null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return undefined;
  }
  if (
    typeof candidate.file_id !== 'string' ||
    candidate.file_id.length === 0 ||
    typeof candidate.filename !== 'string' ||
    candidate.filename.length === 0 ||
    !isCreateArtifactType(candidate.type) ||
    typeof candidate.text !== 'string' ||
    candidate.text.length === 0
  ) {
    return undefined;
  }
  return {
    file_id: candidate.file_id,
    filename: candidate.filename,
    type: candidate.type,
    text: candidate.text,
  };
}

export function buildCreateArtifactAttachment(params: {
  file: CreateArtifactFile;
  messageId: string;
  toolCallId: string;
  conversationId: string;
}): CreateArtifactFile & {
  messageId: string;
  toolCallId: string;
  conversationId: string;
  filepath: string;
} {
  return {
    ...params.file,
    messageId: params.messageId,
    toolCallId: params.toolCallId,
    conversationId: params.conversationId,
    filepath: '',
  };
}
