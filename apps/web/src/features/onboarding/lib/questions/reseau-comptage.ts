import { VIVIER_COUNT_BAND_CHOICES } from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `reseau-comptage` du stage `target_market` — #2045.1/.2/.4/.6/.7
 * (lot B, 22/09/2026).
 *
 * `canaux.ts` (#2048) nomme quatre portes reposant sur un réseau PERSONNEL
 * plutôt qu'une prospection active (« Anciens clients », « Anciens
 * collègues », « Partenaires et rang 2 », « Recommandation »), sans jamais
 * dire leur TAILLE. Compter APPROXIMATIVEMENT ce réseau, en bandes — jamais
 * un nombre exact (`VIVIER_COUNT_BAND_CHOICES`, même référentiel que
 * `vivier-comptage.ts`, GA-26 : un second catalogue de bandes diverge dès le
 * premier ajustement). `referrers_count_band` clôt les quatre portes, puis
 * `warm_relations_count_band` (#2045.6) compte un cinquième réservoir,
 * transversal aux quatre : les relations jugées « chaudes », quel que soit
 * le canal — distinct de `accounts_relationship_status` [PQ], un ÉTAT
 * catégoriel, jamais un compte.
 *
 * AJOUTÉE EN FIN du stage `target_market` : l'ordre déjà posé ne bouge pas
 * d'un cran.
 */
export const reseauComptageStep: SubStep = {
  slug: 'reseau-comptage',
  questions: [
    {
      key: 'former_clients_count_band',
      kind: 'single',
      label: 'questions.formerClientsCountBand.label',
      subtitle: 'questions.formerClientsCountBand.subtitle',
      choices: choice(...VIVIER_COUNT_BAND_CHOICES),
    },
    {
      key: 'former_colleagues_count_band',
      kind: 'single',
      label: 'questions.formerColleaguesCountBand.label',
      subtitle: 'questions.formerColleaguesCountBand.subtitle',
      choices: choice(...VIVIER_COUNT_BAND_CHOICES),
    },
    {
      key: 'partners_count_band',
      kind: 'single',
      label: 'questions.partnersCountBand.label',
      subtitle: 'questions.partnersCountBand.subtitle',
      choices: choice(...VIVIER_COUNT_BAND_CHOICES),
    },
    {
      key: 'referrers_count_band',
      kind: 'single',
      label: 'questions.referrersCountBand.label',
      subtitle: 'questions.referrersCountBand.subtitle',
      choices: choice(...VIVIER_COUNT_BAND_CHOICES),
    },
    {
      // #2045.6 — transversal aux quatre portes ci-dessus : les relations
      // jugées « chaudes », quel que soit le canal par lequel elles sont
      // arrivées.
      key: 'warm_relations_count_band',
      kind: 'single',
      label: 'questions.warmRelationsCountBand.label',
      subtitle: 'questions.warmRelationsCountBand.subtitle',
      choices: choice(...VIVIER_COUNT_BAND_CHOICES),
    },
  ],
}
