/**
 * #3544 (recette Y14, 02/10) — une barrière d'accès écrite AVANT la correction
 * de sa phrase garde « 126 an(s) » et « 2320 établissements » dans le texte
 * stocké. Le moteur écrit désormais juste (`access_scoring.py`) ; ce passage
 * remet d'accord, à l'AFFICHAGE, ce qui est déjà en base : le pluriel se
 * tranche par le nombre, les milliers se groupent comme partout ailleurs.
 */
const GROUP_SEPARATOR = ' '

export function settleAccessEvidence(evidence: string): string {
  return evidence
    .replace(/(\d+) an\(s\)/g, (_m, n: string) => `${n} ${Number(n) >= 2 ? 'ans' : 'an'}`)
    .replace(/(^|[^\d\u202f])(\d{4,}) (établissements?)/g, (_m, lead: string, n: string, word: string) => {
      const grouped = n.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR)
      return `${lead}${grouped} ${word}`
    })
    .replace(/(\d) établissement\(s\)/g, (_m, n: string) => `${n} établissement${Number(n) >= 2 ? 's' : ''}`)
}
