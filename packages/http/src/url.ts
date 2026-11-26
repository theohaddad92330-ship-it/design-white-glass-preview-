import { TechnicalError } from '@bellum/errors'

/**
 * Extracts placeholder names from a URL template string at the type level.
 * e.g. `/api/candidates/{candidateId}/notes/{noteId}` → `'candidateId' | 'noteId'`
 */
type ExtractPlaceholder<UrlTemplate extends string> =
  UrlTemplate extends `${infer _Start}{${infer Placeholder}}${infer Rest}`
    ? Placeholder | ExtractPlaceholder<Rest>
    : never

/**
 * Type-safe URL template with its variables.
 *
 * The `template` is a string with `{placeholder}` markers, and `variables`
 * is a record whose keys are inferred from those placeholders.
 * This gives compile-time safety: a missing or extra variable is a type error.
 *
 * The raw template (without substitution) is useful for low-cardinality metrics and logs.
 */
export type UrlInfo<UrlTemplate extends string> = {
  template: UrlTemplate
  variables: Record<ExtractPlaceholder<UrlTemplate>, string>
}

/**
 * Resolves a URL template by replacing `{placeholder}` markers with their values,
 * and optionally appends query parameters.
 *
 * @example
 * computeUrl({
 *   template: '/api/candidates/{candidateId}/notes/{noteId}',
 *   variables: { candidateId: '42', noteId: '7' },
 * })
 * // → '/api/candidates/42/notes/7'
 *
 * @example
 * computeUrl({
 *   template: '/api/jobs/{jobId}/candidates',
 *   variables: { jobId: '42' },
 *   query: { parsed: 'true', page: '1' },
 * })
 * // → '/api/jobs/42/candidates?parsed=true&page=1'
 */
export function computeUrl<const UrlTemplate extends string>(
  urlInfo: UrlInfo<UrlTemplate> & { query?: Record<string, string | undefined> },
): string {
  const path = urlInfo.template.replace(/{([^}]*)}/g, (_, variableName) => {
    const value = urlInfo.variables[variableName as keyof typeof urlInfo.variables]

    if (typeof value !== 'string') {
      throw new TechnicalError('Invalid or missing variable in URL info', { context: { urlInfo } })
    }

    return value
  })

  if (!urlInfo.query) {
    return path
  }

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(urlInfo.query)) {
    if (value !== undefined) {
      params.set(key, value)
    }
  }

  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}
