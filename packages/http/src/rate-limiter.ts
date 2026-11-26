export type ApiPriority = 1 | 2 | 3 | 4 | 5

export type UrlParams = {
  baseUrl: string
  path: string
  priority?: ApiPriority
}

/**
 * Builds a full URL from base + path, appending `priority` as a query parameter if provided.
 * Uses the native `URL` API to handle query parameter concatenation safely.
 */
export function buildUrlWithPriority({ baseUrl, path, priority }: UrlParams): string {
  const url = new URL(path, baseUrl)

  if (priority !== undefined) {
    url.searchParams.set('priority', String(priority))
  }

  return url.toString()
}
