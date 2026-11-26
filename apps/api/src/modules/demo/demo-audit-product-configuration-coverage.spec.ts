import { buildAuditProductConfiguration } from '@bellum/contracts'
import { DEMO_PROFILE_CONTEXT } from './demo-dataset'

/**
 * #2068.24 / #2068.26 / #2068.27 — LA SALLE DE DÉMONSTRATION MONTRE « CE QUE
 * LAURA POURRA RÉGLER », ET ON LE PROUVE EN EXÉCUTANT LA VRAIE RÈGLE.
 *
 * `demo-coverage.spec.ts` raisonne au niveau TABLE : `profile_context` est
 * semée, donc il resterait VERT même si la section « Ce que Laura pourra régler
 * depuis cet audit » n'affichait rien du tout en démonstration. Une garde
 * aveugle n'est pas une exemption, et une classification de couverture AFFIRME
 * là où une garde VÉRIFIE — ce fichier vérifie : il fait passer
 * {@link DEMO_PROFILE_CONTEXT} par la dérivation de PRODUCTION
 * (`buildAuditProductConfiguration`, `packages/contracts`) et exige que les
 * trois aires réfutées le 21/09/2026 soient NOMMÉES, avec au moins un réglage
 * renseigné et sa trace.
 *
 * C'est la raison pour laquelle la dérivation vit dans `packages/contracts` et
 * non dans `apps/web` : une garde de démonstration qui recopierait la règle
 * serait verte sur sa propre copie (GA-26).
 */
describe('#2068.24/.26/.27 — la configuration produit est REMPLIE en démonstration', () => {
  const configuration = buildAuditProductConfiguration(DEMO_PROFILE_CONTEXT)

  it('nomme les trois aires réfutées le 21/09/2026 — un prospect les voit', () => {
    expect(configuration).not.toBeNull()
    expect(configuration?.map(entry => entry.area).sort()).toEqual(['messages', 'orgGraph', 'scoring'])
  })

  it('chaque aire porte au moins un réglage RENSEIGNÉ, avec l’énoncé validé dont il sort', () => {
    for (const entry of configuration ?? []) {
      const valued = entry.parameters.filter(parameter => parameter.value !== null)
      // Une aire qui n'afficherait que des réglages « non réglés » ferait une
      // salle de démonstration vide là où un prospect regarde.
      expect({ area: entry.area, valued: valued.length > 0 }).toEqual({ area: entry.area, valued: true })
      // #2068.33 — une valeur sans trace n'est pas un réglage, c'est une
      // supposition : le contrat le refuse, la démonstration le prouve.
      for (const parameter of valued) expect(parameter.trace?.statement).toBeTruthy()
    }
  })

  it('aucun réglage n’est inventé : chaque valeur se retrouve MOT POUR MOT dans le semis', () => {
    const seeded = JSON.stringify(DEMO_PROFILE_CONTEXT)
    for (const entry of configuration ?? []) {
      for (const parameter of entry.parameters) {
        if (parameter.value === null) continue
        for (const piece of parameter.value.split(' · ')) {
          expect({ piece, seeded: seeded.includes(piece) }).toEqual({ piece, seeded: true })
        }
      }
    }
  })
})
