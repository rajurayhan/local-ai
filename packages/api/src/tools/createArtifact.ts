import { z } from 'zod';
import { Tools } from 'librechat-data-provider';
import { tool } from '@librechat/agents/langchain/tools';
import type { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import type { CreateArtifactInput } from '~/artifacts/create';
import {
  CREATE_ARTIFACT_CONTENT_MAX,
  CREATE_ARTIFACT_TITLE_MAX,
  CREATE_ARTIFACT_TYPES,
  createArtifact,
} from '~/artifacts/create';

export const CREATE_ARTIFACT_TOOL_DESCRIPTION: string = [
  'Show a page, document, diagram, or component in the side panel.',
  'Use this instead of writing artifact fences or inventing other artifact tool names.',
  `type must be one of: ${CREATE_ARTIFACT_TYPES.join(', ')}.`,
].join(' ');

const createArtifactToolSchema: z.ZodType<CreateArtifactInput> = z.object({
  title: z
    .string()
    .min(1)
    .max(CREATE_ARTIFACT_TITLE_MAX)
    .describe('Short title shown on the artifact.'),
  content: z
    .string()
    .min(1)
    .max(CREATE_ARTIFACT_CONTENT_MAX)
    .describe('Full artifact body. For text/html, send a complete HTML page when possible.'),
  type: z.enum(CREATE_ARTIFACT_TYPES).describe('Artifact MIME type.'),
  identifier: z
    .string()
    .max(80)
    .optional()
    .describe('Stable kebab-case id. Reuse it to update the same artifact.'),
});

type CreateArtifactToolDefinition = {
  name: typeof Tools.create_artifact;
  description: string;
  schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
};

export const CreateArtifactToolDefinition: CreateArtifactToolDefinition = {
  name: Tools.create_artifact,
  description: CREATE_ARTIFACT_TOOL_DESCRIPTION,
  schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        minLength: 1,
        maxLength: CREATE_ARTIFACT_TITLE_MAX,
        description: 'Short title shown on the artifact.',
      },
      content: {
        type: 'string',
        minLength: 1,
        maxLength: CREATE_ARTIFACT_CONTENT_MAX,
        description: 'Full artifact body. For text/html, send a complete HTML page when possible.',
      },
      type: {
        type: 'string',
        enum: [...CREATE_ARTIFACT_TYPES],
        description: `Artifact MIME type. One of: ${CREATE_ARTIFACT_TYPES.join(', ')}.`,
      },
      identifier: {
        type: 'string',
        maxLength: 80,
        description: 'Stable kebab-case id. Reuse it to update the same artifact.',
      },
    },
    required: ['title', 'content', 'type'],
  },
};

export function createArtifactTool(): DynamicStructuredTool {
  return tool(
    async (input) => {
      const result = createArtifact(input);
      return [result.content, result.artifact];
    },
    {
      name: Tools.create_artifact,
      description: CREATE_ARTIFACT_TOOL_DESCRIPTION,
      schema: createArtifactToolSchema,
      responseFormat: 'content_and_artifact',
    },
  );
}
