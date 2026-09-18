import { Tools } from 'librechat-data-provider';
import {
  CREATE_ARTIFACT_CONTENT_MAX,
  CREATE_ARTIFACT_TITLE_MAX,
  CREATE_ARTIFACT_TOOL_NAME,
  buildCreateArtifactAttachment,
  createArtifact,
  normalizeArtifactContent,
  readCreateArtifactFile,
  slugifyArtifactIdentifier,
  withCreateArtifactTool,
} from './create';

describe('createArtifact', () => {
  it('builds a file attachment for HTML content', () => {
    const result = createArtifact(
      {
        title: 'Sulus AI',
        content: '<h1>Sulus AI</h1>',
        type: 'text/html',
      },
      { fileId: 'artifact-sulus-ai' },
    );

    expect(result.content).toContain('Sulus AI');
    expect(result.artifact?.[Tools.create_artifact]).toEqual({
      file_id: 'artifact-sulus-ai',
      filename: 'sulus-ai.html',
      type: 'text/html',
      text: '<h1>Sulus AI</h1>',
    });
  });

  it('wraps plain text HTML artifacts so the panel can render them', () => {
    expect(normalizeArtifactContent('text/html', 'Never miss a call.')).toContain(
      '<p>Never miss a call.</p>',
    );
  });

  it('rejects unknown types instead of inventing a viewer', () => {
    const result = createArtifact({
      title: 'Notes',
      content: 'hello',
      type: 'application/pdf',
    });

    expect(result.artifact).toBeUndefined();
    expect(result.content).toContain('type must be one of');
  });

  it('rejects empty and oversized fields', () => {
    expect(createArtifact({ title: ' ', content: 'x', type: 'text/plain' }).content).toBe(
      'title is required',
    );
    expect(
      createArtifact({
        title: 'a'.repeat(CREATE_ARTIFACT_TITLE_MAX + 1),
        content: 'x',
        type: 'text/plain',
      }).content,
    ).toContain('title must be');
    expect(createArtifact({ title: 'Notes', content: '', type: 'text/plain' }).content).toBe(
      'content is required',
    );
    expect(
      createArtifact({
        title: 'Notes',
        content: 'x'.repeat(CREATE_ARTIFACT_CONTENT_MAX + 1),
        type: 'text/plain',
      }).content,
    ).toContain('content must be');
  });
});

describe('withCreateArtifactTool', () => {
  it('adds create_artifact only when artifacts are enabled', () => {
    expect(withCreateArtifactTool(['file_search'], '')).toEqual(['file_search']);
    expect(withCreateArtifactTool(['file_search'], 'default')).toEqual([
      'file_search',
      CREATE_ARTIFACT_TOOL_NAME,
    ]);
    expect(withCreateArtifactTool([CREATE_ARTIFACT_TOOL_NAME], 'default')).toEqual([
      CREATE_ARTIFACT_TOOL_NAME,
    ]);
  });
});

describe('slugifyArtifactIdentifier', () => {
  it('turns titles into kebab-case identifiers', () => {
    expect(slugifyArtifactIdentifier('Sulus AI')).toBe('sulus-ai');
    expect(slugifyArtifactIdentifier('???')).toBe('artifact');
  });
});

describe('readCreateArtifactFile', () => {
  it('accepts a valid tool artifact and rejects malformed ones', () => {
    const file = {
      file_id: 'artifact-1',
      filename: 'notes.md',
      type: 'text/markdown' as const,
      text: '# Notes',
    };
    expect(readCreateArtifactFile({ [Tools.create_artifact]: file })).toEqual(file);
    expect(readCreateArtifactFile({ [Tools.create_artifact]: { filename: 'x' } })).toBeUndefined();
    expect(readCreateArtifactFile(null)).toBeUndefined();
  });
});

describe('buildCreateArtifactAttachment', () => {
  it('adds message ownership fields for the attachment stream', () => {
    const file = {
      file_id: 'artifact-1',
      filename: 'page.html',
      type: 'text/html' as const,
      text: '<p>Hi</p>',
    };
    expect(
      buildCreateArtifactAttachment({
        file,
        messageId: 'msg-1',
        toolCallId: 'call-1',
        conversationId: 'convo-1',
      }),
    ).toEqual({
      ...file,
      messageId: 'msg-1',
      toolCallId: 'call-1',
      conversationId: 'convo-1',
      filepath: '',
    });
  });
});
