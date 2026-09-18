import { useMemo } from 'react';
import remarkGfm from 'remark-gfm';
import ReactMarkdown from 'react-markdown';
import { ThemeSelector } from '@librechat/client';
import { Link, matchPath, useLocation } from 'react-router-dom';
import type { Components } from 'react-markdown';
import type { TranslationKeys } from '~/hooks';
import { DEFAULT_APP_TITLE, PRIVACY_PATH, TERMS_PATH } from '~/utils';
import { useDocumentTitle, useLocalize } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import PolicyLink from './PolicyLink';

const legalLinkClassName =
  'text-sm text-accent-primary underline decoration-transparent transition-all duration-200 hover:text-accent-primary-hover hover:decoration-accent-primary-hover focus:text-accent-primary-hover focus:decoration-accent-primary-hover';

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <PolicyLink href={href ?? ''} className="text-accent-primary underline">
      {children}
    </PolicyLink>
  ),
  h1: ({ children }) => (
    <h2 className="mb-4 mt-8 text-2xl font-semibold text-text-primary first:mt-0">{children}</h2>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-8 text-xl font-semibold text-text-primary">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-6 text-lg font-semibold text-text-primary">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-4 leading-7 text-text-primary">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-4 list-disc space-y-2 pl-6 text-text-primary">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-4 list-decimal space-y-2 pl-6 text-text-primary">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-7">{children}</li>,
};

function LegalPage() {
  const localize = useLocalize();
  const location = useLocation();
  const { data: startupConfig } = useGetStartupConfig();
  const isTerms = matchPath('/terms', location.pathname) != null;
  const titleKey: TranslationKeys = isTerms ? 'com_ui_terms_of_service' : 'com_ui_privacy_policy';
  const contentKey: TranslationKeys = isTerms
    ? 'com_ui_terms_of_service_content'
    : 'com_ui_privacy_policy_content';
  const title = localize(titleKey);
  const appTitle = startupConfig?.appTitle ?? DEFAULT_APP_TITLE;

  useDocumentTitle(`${title} | ${appTitle}`);

  const markdown = useMemo(() => localize(contentKey), [contentKey, localize]);

  return (
    <div className="relative flex min-h-screen flex-col bg-surface-primary">
      <div className="mt-6 h-10 w-full bg-cover">
        <Link to="/" aria-label={localize('com_ui_logo', { 0: appTitle })}>
          <img
            src="assets/logo.svg"
            className="h-full w-full object-contain"
            alt={localize('com_ui_logo', { 0: appTitle })}
          />
        </Link>
      </div>
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>
      <main className="mx-auto w-full max-w-3xl flex-grow px-6 py-10">
        <h1 className="mb-2 text-3xl font-semibold text-text-primary">{title}</h1>
        <p className="mb-8 text-sm text-text-muted">{localize('com_ui_legal_last_updated')}</p>
        <article>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {markdown}
          </ReactMarkdown>
        </article>
      </main>
      <div className="align-end m-4 flex justify-center gap-2" role="contentinfo">
        <PolicyLink href={PRIVACY_PATH} className={legalLinkClassName}>
          {localize('com_ui_privacy_policy')}
        </PolicyLink>
        <div className="border-r-[1px] border-border-medium" />
        <PolicyLink href={TERMS_PATH} className={legalLinkClassName}>
          {localize('com_ui_terms_of_service')}
        </PolicyLink>
      </div>
    </div>
  );
}

export default LegalPage;
