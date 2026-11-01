// This early-access Base release must never send Supabase bearer tokens to
// an arbitrary NEXT_PUBLIC_BASE_API_URL, even when the URL is valid HTTPS.
const STAGING_API_ORIGIN = 'https://sautilink-base-api-staging.onrender.com';

/** @param {string | undefined} value
 *  @returns {string | null}
 */
export function trustedBaseApiOrigin(value) {
  return value === STAGING_API_ORIGIN || value === STAGING_API_ORIGIN + '/'
    ? STAGING_API_ORIGIN : null;
}
