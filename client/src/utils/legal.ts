export const PRIVACY_PATH = '/privacy';
export const TERMS_PATH = '/terms';

export function isInAppHref(href?: string | null): href is string {
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
}

export function resolvePrivacyUrl(url?: string | null): string {
  return url != null && url.trim() !== '' ? url : PRIVACY_PATH;
}

export function resolveTermsUrl(url?: string | null): string {
  return url != null && url.trim() !== '' ? url : TERMS_PATH;
}
