import { escapeHtmlAttribute } from '../security/html';
import { injectBootstrapConfig } from './bootstrap';

const APP_TITLE_SENTINEL = 'data-librechat-app-title="true"';

/** Matches `/api/config` when `APP_TITLE` is unset, so the shell and the
 *  later config payload cannot disagree on the default brand. */
export const DEFAULT_APP_TITLE = 'RakaAI';

export const resolveAppTitle = (appTitle?: string | null): string => {
  const trimmed = appTitle?.trim();
  return trimmed ? trimmed : DEFAULT_APP_TITLE;
};

/**
 * Writes the deployment's app title into the HTML shell.
 *
 * The tab title is otherwise the baked `<title>` until `/api/config` returns.
 * A leftover LibreChat build, or a first visit before localStorage is primed,
 * flashes the old name. The server already knows `APP_TITLE` when it serves
 * the document, so the first byte carries the brand the config will confirm.
 */
export const injectAppTitle = (html: string, appTitle?: string | null): string => {
  if (html.includes(APP_TITLE_SENTINEL)) {
    return html;
  }

  const title = resolveAppTitle(appTitle);
  const escaped = escapeHtmlAttribute(title);
  const withTitleTag = html.includes('<title>')
    ? html.replace(/<title>[^<]*<\/title>/, () => `<title>${escaped}</title>`)
    : html;

  return injectBootstrapConfig(withTitleTag, {
    sentinel: APP_TITLE_SENTINEL,
    values: { appTitle: title },
  });
};
