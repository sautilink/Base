// Render's revision is public repository metadata, never an API token or DSN.
export function safeBaseReleaseRevision(value: string | undefined): string | null {
  return value && /^[a-f0-9]{40}$/.test(value) ? value : null;
}

export function baseReleaseInfo(env: { RENDER_GIT_COMMIT?: string }) {
  return {
    service: 'sautilink-base-api',
    revision: safeBaseReleaseRevision(env.RENDER_GIT_COMMIT)
  };
}
