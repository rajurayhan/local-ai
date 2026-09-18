import { Constants } from 'librechat-data-provider';
import type { TAttachment } from 'librechat-data-provider';
import {
  browserViewportFromTool,
  extractPageUrl,
  isBrowserViewTool,
  urlFromArgs,
} from './viewport';

const d = Constants.mcp_delimiter;
const browserTool = `open_page${d}RakaAI-Browser`;
const screenshot = {
  filename: 'open_page_img_abc.png',
  filepath: '/images/open_page_img_abc.png',
  file_id: 'file-1',
  width: 1280,
  height: 720,
  toolCallId: 'call-1',
} as TAttachment;

describe('browser viewport helpers', () => {
  it('recognizes RakaAI-Browser view tools only', () => {
    expect(isBrowserViewTool(browserTool)).toBe(true);
    expect(isBrowserViewTool(`click${d}RakaAI-Browser`)).toBe(true);
    expect(isBrowserViewTool(`fill${d}RakaAI-Browser`)).toBe(true);
    expect(isBrowserViewTool(`capture_page${d}RakaAI-Browser`)).toBe(true);
    expect(isBrowserViewTool(`page_text${d}RakaAI-Browser`)).toBe(false);
    expect(isBrowserViewTool(`list_links${d}RakaAI-Browser`)).toBe(false);
    expect(isBrowserViewTool(`open_page${d}other`)).toBe(false);
    expect(isBrowserViewTool('open_page')).toBe(false);
  });

  it('reads the page URL from the first line or the first http(s) match', () => {
    expect(extractPageUrl('https://example.com/docs\n\nVisible text')).toBe(
      'https://example.com/docs',
    );
    expect(extractPageUrl('Opened https://example.com/x for you.')).toBe('https://example.com/x');
    expect(extractPageUrl('no url here')).toBeUndefined();
  });

  it('reads a url argument from JSON or an object', () => {
    expect(urlFromArgs('{"url":"https://example.com/from-args"}')).toBe(
      'https://example.com/from-args',
    );
    expect(urlFromArgs({ url: 'https://example.com/from-args' })).toBe(
      'https://example.com/from-args',
    );
    expect(urlFromArgs({ url: 'file:///etc/passwd' })).toBeUndefined();
  });

  it('builds a viewport frame from a browser screenshot attachment', () => {
    const frame = browserViewportFromTool({
      name: browserTool,
      output: 'https://example.com/docs\n\nHello',
      attachments: [screenshot],
    });
    expect(frame).toEqual({
      url: 'https://example.com/docs',
      title: 'open_page_img_abc.png',
      imageUrl: '/images/open_page_img_abc.png',
      fileId: 'file-1',
      toolCallId: 'call-1',
    });
  });

  it('falls back to the tool args when the output has no URL', () => {
    const frame = browserViewportFromTool({
      name: `click${d}RakaAI-Browser`,
      output: 'Clicked a.next',
      args: { url: 'https://example.com/after' },
      attachments: [screenshot],
    });
    expect(frame?.url).toBe('https://example.com/after');
  });

  it('returns null without a screenshot or for a non-browser tool', () => {
    expect(
      browserViewportFromTool({
        name: browserTool,
        output: 'https://example.com',
        attachments: [],
      }),
    ).toBeNull();
    expect(
      browserViewportFromTool({
        name: 'web_search',
        output: 'https://example.com',
        attachments: [screenshot],
      }),
    ).toBeNull();
  });
});
