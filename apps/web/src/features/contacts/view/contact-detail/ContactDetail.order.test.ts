import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #3688 — recette 06/10 : « Historique des échanges » commençait à y≈1110 px,
 * sous la ligne de flottaison d'un écran de 829 px. La règle : entre la barre
 * de travail et le fil, RIEN que le résumé de relation et les notes (compactes) —
 * aucune des ~15 cartes de lecture ne se met devant l'historique.
 *
 * Garde de SOURCE (l'ordre de rendu est l'ordre du fichier) : elle sait dire NON
 * en nommant la carte qui s'est glissée devant, et elle LIT le fichier réel.
 */
const source = readFileSync(join(__dirname, 'ContactDetail.tsx'), 'utf8')
const body = source.slice(source.indexOf('return ('))
const at = (needle: string) => body.indexOf(needle)

describe('fiche contact — l’historique se trouve sans défiler longuement (#3688)', () => {
  it('lit le vrai fichier : la barre de travail, les notes et le fil y sont rendus', () => {
    expect(at('<ContactWorkBar')).toBeGreaterThan(0)
    expect(at('<ContactNotesCard')).toBeGreaterThan(0)
    expect(at('<ContactTimelineCard')).toBeGreaterThan(0)
  })

  // Refonte Théo B c5 (23/10) : le centre lit résumé de relation → « Prochaines actions » (tâches, appel : compactes,
  // sous le résumé) → « Historique & notes » (barre de gestes, notes, fil). L'intention de #3688 reste : de la
  // barre de gestes au fil, RIEN que les notes ; et aucune carte de lecture lourde ne passe devant le fil.
  it('ordre : résumé de relation → barre de travail → notes → fil', () => {
    const order = ['<ContactRelationSummary', '<ContactWorkBar', '<ContactNotesCard', '<ContactTimelineCard'].map(at)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('aucune carte de lecture ne passe devant le fil', () => {
    const before = body.slice(0, at('<ContactTimelineCard'))
    const intruders = ['<ContactRelations', '<ContactSignals', '<ContactCareerDetail', '<ContactOutreachCard'].filter(
      tag => before.includes(tag),
    )
    expect(intruders).toEqual([])
  })

  it('entre la barre de gestes et le fil : seulement les notes', () => {
    const between = body.slice(at('<ContactWorkBar'), at('<ContactTimelineCard'))
    const intruders = [
      '<TaskList',
      '<ContactCallTaskCard',
      '<ContactFold',
      '<ContactRelations',
      '<ContactSignals',
    ].filter(tag => between.includes(tag))
    expect(intruders).toEqual([])
  })

  // #4523 (recette 25/10) — la zone haute s'aligne au pixel sur C5 sans rien réordonner : les quatre régions gardent
  // leur ordre de source (informations → travail → rangées pleine largeur → dossiers), donc le mobile, qui suit
  // l'ordre `order-*`, et le lecteur d'écran, qui suit la source, lisent la fiche comme avant.
  it('#4523 — ordre des régions : informations → travail → rangées → dossiers', () => {
    const order = [
      "aria-label={t('zones.info')}",
      "aria-label={t('zones.work')}",
      'data-testid="contact-rows"',
      "aria-label={t('zones.files')}",
    ].map(at)
    expect(Math.min(...order)).toBeGreaterThan(0)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })
})
