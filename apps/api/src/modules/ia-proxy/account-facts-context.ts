import { accountFactAgePhrase, type AccountFact, type AccountFactKind } from '@bellum/contracts'

/**
 * #4071.1/.2 — LES FAITS DU COMPTE (socle #4069) DANS LE CONTEXTE DE LAURA.
 *
 * Avant : le contexte d'un dossier ouvert ne recevait ni les signaux de plus
 * de 7 jours, ni les affaires gagnées/perdues/en sommeil, ni les missions, ni
 * la mémoire marché du compte — Laura devait penser à appeler un outil.
 * Désormais le socle (`AccountFactsService`) lui rend TOUT, déjà pesé ; ce
 * fichier le met en texte :
 *  - BORNÉ : les {@link MAX_FACTS} plus pertinents (l'ordre reçu, déjà trié
 *    par poids), le reste se DIT (« N faits… »), jamais se tait ;
 *  - DATÉ : chaque ligne porte sa date ET son âge en mots (« il y a 14
 *    mois »), calculé ici — le modèle ne refait pas l'arithmétique ;
 *  - SANS PROVENANCE : la ligne dit la nature du fait, jamais d'où il vient ;
 *  - SANS POIDS : le poids ordonne, il ne s'affiche pas (jamais une
 *    probabilité, doctrine).
 */
const MAX_FACTS = 30
/** #4068.7 — au plus ces places sont GARDÉES à l'historique de plus de {@link OLD_FACT_DAYS} jours quand les récents saturent. */
const OLD_FACT_QUOTA = 8
const OLD_FACT_DAYS = 90

const KIND_LABEL: Record<AccountFactKind, string> = {
  hiring: 'Recrutement',
  need: 'Besoin',
  signal: 'Signal',
  deal_won: 'Affaire gagnée',
  deal_lost: 'Affaire perdue',
  deal_dormant: 'Affaire en sommeil',
  deal_renewal: 'Renouvellement à examiner',
  mission: 'Mission',
  note: 'Note',
  meeting: 'Compte rendu de RDV',
  correction: "Correction de l'équipe",
  market_observation: 'Observation de marché',
  document: 'Document',
  exchange: 'Échange',
  career: 'Parcours',
}

/** `null` = aucun fait : aucun bloc, le prompt reste identique au byte près. */
export function accountFactsContextFor(facts: readonly AccountFact[]): string | null {
  const seen = new Set<string>()
  const unique = facts.filter(fact => {
    const key = `${fact.kind}|${fact.date.slice(0, 10)}|${fact.label.trim().toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (unique.length === 0) return null
  // #4068.7 — les faits récents (poids fort) ne mangent pas toutes les places : l'historique > 90 j garde son quota,
  // sans quoi Laura « ne connaît » que la dernière semaine. L'ordre reçu est conservé dans le bloc.
  const old = unique.filter(fact => fact.ageDays > OLD_FACT_DAYS)
  const reservedOld = new Set(old.slice(0, OLD_FACT_QUOTA))
  const others = unique.filter(fact => !reservedOld.has(fact))
  const kept = new Set([...reservedOld, ...others.slice(0, MAX_FACTS - reservedOld.size)])
  const shown = unique.filter(fact => kept.has(fact))
  const lines = shown.map(
    fact =>
      `- [${fact.date.slice(0, 10)} · ${accountFactAgePhrase(fact.ageDays)}] ${KIND_LABEL[fact.kind]} : ${fact.label}`,
  )
  const rest = unique.length - shown.length
  if (rest > 0) lines.push(`(${rest} faits plus anciens ou moins pertinents ne sont pas listés ici.)`)
  return lines.join('\n')
}
