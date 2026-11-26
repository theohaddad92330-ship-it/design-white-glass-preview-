import { describe, expect, it } from 'vitest'
import { COMPUTED_AT_LIVE_WINDOW_MS, deriveComputedAt } from './computed-at.js'

/** Un « maintenant » fixe, construit en composantes LOCALES : la notion de
 *  « même jour » est celle de l'utilisateur, et un ISO figé la ferait dépendre
 *  du fuseau du runner. */
const NOW = new Date(2026, 7, 30, 14, 0, 0)

describe('deriveComputedAt — quand cet agrégat a-t-il été calculé', () => {
  it('une date ABSENTE se dit inconnue — jamais « à l’instant »', () => {
    // La transposition au temps de « non mesuré n'est jamais 0 » : une date de
    // calcul qu'on n'a pas ne devient pas la date du jour par défaut.
    expect(deriveComputedAt(null, NOW)).toEqual({ kind: 'unknown' })
    expect(deriveComputedAt(undefined, NOW)).toEqual({ kind: 'unknown' })
    expect(deriveComputedAt('', NOW)).toEqual({ kind: 'unknown' })
  })

  it('une date ILLISIBLE se dit inconnue, elle ne se devine pas', () => {
    expect(deriveComputedAt('pas une date', NOW)).toEqual({ kind: 'unknown' })
  })

  it('un « maintenant » illisible ne permet de juger de rien', () => {
    // Sans référence, « il y a deux heures » n'a pas de sens : on ne rend pas un
    // verdict daté sur une horloge qu'on ne sait pas lire.
    expect(deriveComputedAt(NOW, new Date(Number.NaN))).toEqual({ kind: 'unknown' })
  })

  it('une date INDISCERNABLE de la requête n’apprend rien — elle ne s’affiche pas', () => {
    // Le piège central du lot : si l'agrégat est calculé à la volée, sa date de
    // calcul EST l'heure du chargement. « Il y a une seconde » est du bruit, et
    // c'est ainsi qu'une heure de requête se déguise en date de calcul.
    expect(deriveComputedAt(NOW, NOW).kind).toBe('live')
    expect(deriveComputedAt(new Date(NOW.getTime() - 30_000), NOW).kind).toBe('live')
    expect(deriveComputedAt(new Date(NOW.getTime() - COMPUTED_AT_LIVE_WINDOW_MS), NOW).kind).toBe('live')
  })

  it('une horloge en avance de quelques secondes reste « à l’instant », pas une erreur', () => {
    // Deux machines ne sont jamais à la seconde près. La fenêtre se lit en
    // VALEUR ABSOLUE, sinon un serveur en avance de 5 s produirait « date de
    // calcul inconnue » sur un agrégat parfaitement sain.
    expect(deriveComputedAt(new Date(NOW.getTime() + 5_000), NOW).kind).toBe('live')
  })

  it('une date FUTURE au-delà de la fenêtre est une horloge cassée, pas un calcul très frais', () => {
    // Même refus que `planFreshness`, pour la même raison : afficher « calculé
    // le 12 septembre » le 30 août ferait passer une panne pour une fraîcheur.
    expect(deriveComputedAt(new Date(NOW.getTime() + 3 * 86_400_000), NOW)).toEqual({ kind: 'unknown' })
  })

  it('un calcul du JOUR MÊME porte son heure — « recalculé à 06:12 »', () => {
    // La formulation du tome 7 (loi 2, élément n°10) est une HEURE, et elle
    // n'a de sens que le jour même : « recalculé à 06:12 » un mardi ne dit pas
    // lequel.
    const at = new Date(2026, 7, 30, 6, 12, 0)
    expect(deriveComputedAt(at, NOW)).toEqual({
      kind: 'sameDay',
      at: at.toISOString(),
      ageMs: NOW.getTime() - at.getTime(),
    })
  })

  it('un calcul d’un autre jour porte sa DATE, pas son heure', () => {
    // « Recalculé à 06:12 » sur un chiffre de la semaine dernière est un
    // horodatage qui ment par omission : c'est le jour qui manque.
    const at = new Date(2026, 7, 12, 6, 12, 0)
    expect(deriveComputedAt(at, NOW)).toEqual({
      kind: 'dated',
      at: at.toISOString(),
      ageMs: NOW.getTime() - at.getTime(),
    })
  })

  it('hier à 23:59 n’est pas « aujourd’hui », même à quelques minutes près', () => {
    // La frontière est le JOUR CIVIL de l'utilisateur, pas une durée. Une
    // fenêtre en heures aurait écrit « recalculé à 23:59 » le lendemain matin.
    const at = new Date(2026, 7, 29, 23, 59, 0)
    expect(deriveComputedAt(at, new Date(2026, 7, 30, 0, 20, 0)).kind).toBe('dated')
  })

  it('accepte une chaîne ISO comme un `Date` — l’API sert l’une, le web manipule l’autre', () => {
    const at = new Date(2026, 7, 12, 6, 12, 0)
    expect(deriveComputedAt(at.toISOString(), NOW)).toEqual(deriveComputedAt(at, NOW))
  })

  it('est PURE — deux appels identiques rendent le même verdict', () => {
    const at = new Date(2026, 7, 12, 6, 12, 0)
    expect(deriveComputedAt(at, NOW)).toEqual(deriveComputedAt(at, NOW))
  })
})
