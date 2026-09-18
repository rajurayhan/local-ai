export function hostAllowed(hostname: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return true;
  }

  const host = hostname.toLowerCase();
  return patterns.some((pattern) => {
    const pat = pattern.toLowerCase();
    if (pat === '*') {
      return true;
    }
    if (pat.startsWith('*.')) {
      const suffix = pat.slice(1);
      return host === pat.slice(2) || host.endsWith(suffix);
    }
    return host === pat;
  });
}

export function assertHttpUrl(raw: string, allowedDomains: string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }
  if (!hostAllowed(url.hostname, allowedDomains)) {
    throw new Error(`Host is not allowed: ${url.hostname}`);
  }
  return url;
}
