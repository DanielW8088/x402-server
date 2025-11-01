/**
 * Validate token name (alphanumeric, spaces, and basic punctuation)
 */
export function isValidTokenName(name: string): boolean {
  return /^[a-zA-Z0-9\s\-_.,!?()]+$/.test(name);
}

/**
 * Validate token symbol (uppercase letters and numbers only)
 */
export function isValidSymbol(symbol: string): boolean {
  return /^[A-Z0-9]+$/.test(symbol);
}

/**
 * Validate HTTP/HTTPS URL
 */
export function isValidHttpUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

