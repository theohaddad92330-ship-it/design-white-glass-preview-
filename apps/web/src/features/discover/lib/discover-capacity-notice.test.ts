import { describe, expect, it } from 'vitest'
import { discoverCapacityNotice } from './discover-capacity-notice'

/**
 * #2804 (#2291.2) — « capacité » (livraison/montée en charge), le 4ᵉ type
 * d'entrée de Découvrir sans occurrence. Tri du 25/09 (registre
 * `.claude/notes/registre-2026-09-25-epopee-2804.md`) : source réelle
 * inutilisée (`ramp_up_capacity`, `available_consultants_band`), mais AUCUNE
 * spécification de ce qu'un filtre ferait à la liste de résultats. LOT
 * j3 26/09 — tranché sans Louis : « avertir » plutôt qu'exclure/réordonner
 * (moins de perte de résultats, réversible).
 *
 * D'où une fonction qui ne FILTRE ni ne RÉORDONNE jamais les comptes : elle
 * rend un simple constat, la capacité DÉCLARÉE, verbatim — jamais interprétée
 * en bas/moyen/haut (cette lecture existe déjà, `sales_context.py::
 * _bench_band`, côté prompt IA ; la recopier ici dupliquerait un réglage qui
 * vit à UN seul endroit, GA-26).
 */
describe('discoverCapacityNotice', () => {
  it('rend les deux axes déclarés, verbatim', () => {
    expect(
      discoverCapacityNotice({
        ramp_up_capacity: '1-2 semaines',
        available_consultants_band: 'Quelques consultants disponibles en intercontrat',
      }),
    ).toEqual({
      rampUpCapacity: '1-2 semaines',
      availableConsultantsBand: 'Quelques consultants disponibles en intercontrat',
    })
  })

  it('sait dire NON : rien de déclaré sur AUCUN des deux axes ne rend rien — on n’affiche pas ce qu’on n’a pas', () => {
    expect(discoverCapacityNotice({ ramp_up_capacity: null, available_consultants_band: null })).toBeNull()
    expect(discoverCapacityNotice(null)).toBeNull()
    expect(discoverCapacityNotice(undefined)).toBeNull()
  })

  it('un seul des deux axes déclaré : l’autre est ABSENT du résultat, jamais une ligne vide', () => {
    expect(discoverCapacityNotice({ ramp_up_capacity: '3-4 semaines', available_consultants_band: null })).toEqual({
      rampUpCapacity: '3-4 semaines',
    })
    expect(
      discoverCapacityNotice({
        ramp_up_capacity: null,
        available_consultants_band: 'Aucune disponibilité, planning plein',
      }),
    ).toEqual({ availableConsultantsBand: 'Aucune disponibilité, planning plein' })
  })
})
