import { CONSULTING_DOMAIN_GROUPS, CONSULTING_DOMAINS } from '@bellum/contracts'
import type { SubStep } from './types'

/**
 * Sous-étape `domaine-offre` du stage `offer_expertise`.
 *
 * Portefeuille de domaines de conseil (DATAFORGE V10, D-DF2 du 24/08) — les 66
 * domaines de la taxonomie contracts, groupés pour l'affichage.
 * AUCUNE présélection : le choix est explicite (l'ancienne question
 * `offer_domain` présélectionnait `esn_it` en silence — c'est exactement le
 * biais IT-par-défaut que le retour bêta a nommé). `validate` refuse une
 * liste vide, donc on ne passe pas l'étape sans avoir répondu. Pas de
 * `allowOther` : les valeurs sont des CODES (clé de jointure avec les priors
 * DATAFORGE) et un texte libre serait écarté en silence par le contrat.
 */
export const domaineOffreStep: SubStep = {
  slug: 'domaine-offre',
  questions: [
    {
      key: 'offer_domains',
      kind: 'multi-grouped',
      label: 'questions.offerDomains.label',
      subtitle: 'questions.offerDomains.subtitle',
      groups: CONSULTING_DOMAIN_GROUPS.map(group => ({
        label: `groups.offerDomains.${group}`,
        choices: CONSULTING_DOMAINS.filter(domain => domain.group === group).map(domain => ({
          value: domain.code,
          labelKey: `questions.offerDomains.options.${domain.code}`,
        })),
      })),
    },
  ],
}
