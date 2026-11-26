/**
 * #4644 — l'arithmétique de la pagination de /contacts, en un seul endroit : la dernière page est la dernière.
 * Quand le total est connu il BORNE tout (« Suivant », le numéro de page, la plage) ; le drapeau serveur
 * `hasNextPage` ne sert que tant que le total est inconnu.
 */
export function contactsPagerOf(input: {
  page: number
  size: number
  loaded: number
  total: number | undefined
  hasNextPage: boolean
}): { page: number; pageCount: number | undefined; from: number; to: number; canNext: boolean } {
  const { size, loaded, total, hasNextPage } = input
  const pageCount = total !== undefined ? Math.max(1, Math.ceil(total / size)) : undefined
  const page = Math.max(0, pageCount !== undefined ? Math.min(input.page, pageCount - 1) : input.page)
  const known = total !== undefined ? Math.min(loaded, total) : loaded
  const rows = Math.max(0, Math.min(size, known - page * size))
  const canNext = total !== undefined ? (page + 1) * size < total : (page + 1) * size < loaded || hasNextPage
  return { page, pageCount, from: rows > 0 ? page * size + 1 : 0, to: page * size + rows, canNext }
}
