import { imageGenTools } from 'librechat-data-provider';

/** Image tools whose schemas leak into ordinary answers on small local models. */
const GATED_IMAGE_TOOLS = new Set<string>([...imageGenTools, 'image_gen_oai', 'image_edit_oai']);

/**
 * True when the current user turn is asking for a generated image.
 * Follow-ups about documents must not match — those keep image tools hidden.
 */
const IMAGE_REQUEST_PATTERN =
  /\b(?:generate|create|draw|paint|render|imagine|illustrate|sketch|make)\b[\s\S]{0,48}\b(?:image|picture|photo|illustration|portrait|artwork|drawing|logo)\b|\b(?:image|picture|photo|illustration|portrait)\b[\s\S]{0,24}\bof\b|\b(?:draw|paint|sketch|illustrate)\s+(?:me\s+)?(?:a|an|the)\b|\b(?:text[- ]to[- ]image|txt2img|stable[- ]diffusion)\b|\bregenerate\b[\s\S]{0,24}\b(?:image|picture|photo)\b/i;

export function isImageGenerationTool(name: string): boolean {
  return GATED_IMAGE_TOOLS.has(name);
}

export function isImageGenerationRequest(text: string | null | undefined): boolean {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return false;
  }
  return IMAGE_REQUEST_PATTERN.test(text);
}

/** MCP init bodies omit `text`; the Express body still has the user turn. */
export function extractLatestUserText({
  requestBodyText,
  reqBodyText,
}: {
  requestBodyText?: unknown;
  reqBodyText?: unknown;
}): string {
  for (const value of [requestBodyText, reqBodyText]) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return '';
}

/**
 * Drops image-generation tools unless this turn asked for an image.
 * Off (`requireExplicitRequest: false`) returns the list unchanged.
 * If every remaining tool would be an image tool, keep them — an image-only
 * agent must still be able to generate.
 */
export function gateImageGenerationTools({
  tools,
  userText,
  requireExplicitRequest,
}: {
  tools: readonly string[];
  userText?: string | null;
  requireExplicitRequest: boolean;
}): string[] {
  if (!requireExplicitRequest || isImageGenerationRequest(userText)) {
    return [...tools];
  }
  const withoutImage = tools.filter((tool) => !isImageGenerationTool(tool));
  if (withoutImage.length === 0 && tools.some((tool) => isImageGenerationTool(tool))) {
    return [...tools];
  }
  return withoutImage;
}
