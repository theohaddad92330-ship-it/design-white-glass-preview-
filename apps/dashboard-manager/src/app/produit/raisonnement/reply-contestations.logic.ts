type Lang = 'fr' | 'en'

/** Une part contestée en pourcentage entier ; `null` = pas de retour, dit « non mesuré » (jamais « 0 % »). */
export function valeurPartContestee(share: number | null, lang: Lang): string {
  if (share === null) return lang === 'fr' ? 'non mesuré' : 'not measured'
  return `${Math.round(share * 100)} %`
}

/** Ce qui est retenu sous le plancher, et pourquoi — un compte, jamais un nom de fonction. */
export function phraseFonctionsRetenues(withheld: number, min: number, lang: Lang): string | null {
  if (withheld <= 0) return null
  return lang === 'fr'
    ? `${withheld} fonction${withheld > 1 ? 's' : ''} non publiée${withheld > 1 ? 's' : ''} : moins de ${min} réponses distinctes.`
    : `${withheld} function${withheld > 1 ? 's' : ''} not published: fewer than ${min} distinct replies.`
}
