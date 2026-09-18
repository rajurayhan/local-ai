import { gateImageGenerationTools, isImageGenerationRequest } from './imageRequest';

describe('isImageGenerationRequest', () => {
  it.each([
    'Generate an image of a quiet river at dusk',
    'draw me a cat',
    'create a picture of the office',
    'Can you make an illustration of a lighthouse?',
    'an image of a red bicycle',
    'regenerate the image with warmer light',
    'use stable-diffusion for a portrait',
  ])('detects %s', (text) => {
    expect(isImageGenerationRequest(text)).toBe(true);
  });

  it.each([
    'What is his current role?',
    'Tell me more about Raju Rayhan',
    'Search my uploaded files for the latest decision',
    'Generate a summary of the resume',
    'Create a list of his previous employers',
    '',
    undefined,
  ])('ignores %s', (text) => {
    expect(isImageGenerationRequest(text)).toBe(false);
  });
});

describe('gateImageGenerationTools', () => {
  const tools = ['file_search', 'stable-diffusion', 'image_gen_oai'];

  it('leaves the list unchanged when the lever is off', () => {
    expect(
      gateImageGenerationTools({
        tools,
        userText: 'What is his current role?',
        requireExplicitRequest: false,
      }),
    ).toEqual(tools);
  });

  it('hides image tools on a document follow-up', () => {
    expect(
      gateImageGenerationTools({
        tools,
        userText: 'What is his current role?',
        requireExplicitRequest: true,
      }),
    ).toEqual(['file_search']);
  });

  it('keeps image tools when the user asked for an image', () => {
    expect(
      gateImageGenerationTools({
        tools,
        userText: 'Generate an image of a quiet river at dusk',
        requireExplicitRequest: true,
      }),
    ).toEqual(tools);
  });
});
