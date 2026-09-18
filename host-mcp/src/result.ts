import type { JsonSchema, ToolResult } from './types.ts';

export function ok(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

export function fail(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

export function objectSchema(
  properties: Record<string, Record<string, unknown>>,
  required: string[] = [],
): JsonSchema {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}
