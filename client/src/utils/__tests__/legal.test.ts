import { isInAppHref, PRIVACY_PATH, resolvePrivacyUrl, resolveTermsUrl, TERMS_PATH } from '../legal';

describe('legal urls', () => {
  it('treats same-origin paths as in-app', () => {
    expect(isInAppHref('/privacy')).toBe(true);
    expect(isInAppHref('/terms')).toBe(true);
    expect(isInAppHref('https://example.com/privacy')).toBe(false);
    expect(isInAppHref('//example.com/privacy')).toBe(false);
    expect(isInAppHref(undefined)).toBe(false);
  });

  it('falls back to the in-app legal pages', () => {
    expect(resolvePrivacyUrl()).toBe(PRIVACY_PATH);
    expect(resolvePrivacyUrl('')).toBe(PRIVACY_PATH);
    expect(resolvePrivacyUrl('https://example.com/privacy')).toBe('https://example.com/privacy');
    expect(resolveTermsUrl()).toBe(TERMS_PATH);
    expect(resolveTermsUrl('/custom-terms')).toBe('/custom-terms');
  });
});
