import { MANAGER_KPI_OWNERS } from './manager-kpi.js'
import type { PilotageLevel } from './pilotage.js'

/**
 * #3415.2 (beta-feedback, lot C14 30/09/2026) — CE QU'UN MAILLON QUI DÉCROCHE
 * A À DIRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE REPROCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * *« Chaque indicateur doit afficher : tendance ; seuil ; cause ; décision
 * proposée ; responsable. »* La mosaïque `/pilotage` montrait déjà la
 * TENDANCE des indicateurs de STOCK (`LevelDetail.tsx`, `STOCK_METRIC_SOURCE`)
 * et le dictionnaire des 63 KPI (`manager-kpi.ts`) porte déjà SEUIL, DÉCISION
 * et RESPONSABLE — mais les deux catalogues ne parlent PAS le même
 * vocabulaire (`replyRate` de la chaîne contre `reply_rate` du dictionnaire),
 * et aucun des deux ne nomme la CAUSE. La mosaïque, elle, n'affichait aucun
 * des quatre pour ses dix-sept indicateurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI SEULEMENT SEPT DES DIX-SEPT INDICATEURS
 * ─────────────────────────────────────────────────────────────────────────────
 * Sur les dix-sept indicateurs d'`evaluatePilotageChain`, seuls SEPT peuvent
 * un jour porter le statut `alerte` (`pilotage.ts` : `flowStatus` avec un
 * amont réel, ou `rateStatus`) : `emailsSent`, `replyRate`, `meetings`,
 * `needsQualified`, `qualificationRate`, `conversions`, `conversionRate`. Les
 * dix autres sont soit un STOCK (`stockStatus` ne juge jamais), soit sans
 * amont (`contactsTargeted`), soit sans seuil (`correctionRate`) : leur
 * demander une cause ou une décision inventerait un décrochage qui n'existe
 * pas structurellement. « On n'affiche pas ce qu'on n'a pas » s'applique
 * ici : ce module ne couvre QUE ce qui peut réellement décrocher, et
 * `pilotageChainGuidance` rend `null` pour les dix autres plutôt qu'une
 * décision de façade.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS UNE RÉUTILISATION DU DICTIONNAIRE DES 63
 * ─────────────────────────────────────────────────────────────────────────────
 * `reply_rate` (catalogue) et `replyRate` (chaîne) mesurent un taux de
 * réponse, mais pas le MÊME périmètre : le premier peut se lire par séquence,
 * le second agrège toute la chaîne p24. Les confondre sous un seul texte
 * ferait dire à l'un ce qui n'est vrai que de l'autre. Ce module reste donc
 * SÉPARÉ, comme le sont déjà les deux dictionnaires — et prose FRANÇAISE
 * SEULE, à l'image de `threshold`/`decision` dans `manager-kpi.ts` (aucun des
 * 63 n'est traduit ; ce module suit la même convention plutôt que d'en
 * inventer une seconde pour sept entrées).
 */
export const PILOTAGE_ALERTABLE_METRIC_KEYS = [
  'emailsSent',
  'replyRate',
  'meetings',
  'needsQualified',
  'qualificationRate',
  'conversions',
  'conversionRate',
] as const
export type PilotageAlertableMetricKey = (typeof PILOTAGE_ALERTABLE_METRIC_KEYS)[number]

export type PilotageMetricGuidance = {
  /** Le maillon qui porte cet indicateur — pour retrouver le contexte. */
  level: PilotageLevel
  /** Le repère qui fait passer le maillon en alerte. Jamais une note, un repère. */
  threshold: string
  /** Ce que ce décrochage veut typiquement dire — pas une certitude, une piste. */
  cause: string
  /** CE QU'ON FAIT quand le seuil est franchi. */
  decision: string
  /** Qui répond de ce maillon. */
  owner: (typeof MANAGER_KPI_OWNERS)[number]
}

export const PILOTAGE_METRIC_GUIDANCE: Readonly<Record<PilotageAlertableMetricKey, PilotageMetricGuidance>> = {
  emailsSent: {
    level: 'conversation',
    threshold: 'Zéro e-mail parti alors que des contacts sont déjà ciblés — jamais sur un compte qui démarre.',
    cause: "La cadence d'envoi ne s'est pas déclenchée sur les contacts ciblés, ou personne n'a lancé la séquence.",
    decision: 'Vérifier la séquence des comptes ciblés et relancer l’envoi.',
    owner: 'business',
  },
  replyRate: {
    level: 'conversation',
    threshold: 'Sous 10 %, le message ne prend pas.',
    cause: "L'angle du message ne parle pas à la cible, ou le volume dépasse ce qu'un travail personnalisé permet.",
    decision: "Changer l'angle du message avant d'augmenter le volume.",
    owner: 'business',
  },
  meetings: {
    level: 'qualification',
    threshold: 'Zéro rendez-vous alors que des réponses sont arrivées — la conversation n’aboutit pas.',
    cause:
      'Les réponses obtenues ne se transforment pas en rendez-vous : la relance qui suit une réponse positive manque, ou aucun créneau n’est proposé.',
    decision: 'Reprendre chaque réponse récente et proposer un créneau dans le même message.',
    owner: 'business',
  },
  needsQualified: {
    level: 'qualification',
    threshold: 'Zéro besoin qualifié alors que des besoins sont pris en charge.',
    cause: 'Les besoins pris en charge n’avancent pas jusqu’au BTMMP complet — la qualification s’arrête en route.',
    decision: 'Reprendre les besoins pris en charge et compléter les six axes du BTMMP avant de les laisser ouverts.',
    owner: 'business',
  },
  qualificationRate: {
    level: 'qualification',
    threshold: 'Sous 10 %, la prise en charge ne débouche presque jamais sur un besoin qualifié.',
    cause:
      'La majorité des besoins pris en charge restent incomplets — un ou plusieurs axes du BTMMP ne sont jamais renseignés.',
    decision: "Revoir avec l'équipe quel axe du BTMMP bloque le plus souvent avant de qualifier davantage de besoins.",
    owner: 'business',
  },
  conversions: {
    level: 'conversion',
    threshold: 'Zéro besoin gagné alors que des besoins ont été pris en charge.',
    cause: 'Aucun besoin pris en charge ne se conclut — le blocage est en aval de la qualification, chez le client.',
    decision:
      'Revoir les besoins en cours avec le commercial : une décision est-elle encore attendue, ou le besoin est-il en réalité perdu ?',
    owner: 'direction',
  },
  conversionRate: {
    level: 'conversion',
    threshold:
      'Se compare au trimestre précédent, jamais à un absolu — sous ce niveau, le taux de réussite se dégrade.',
    cause: 'Une proportion croissante des besoins DÉCIDÉS se solde par une perte plutôt qu’un gain.',
    decision: 'Relire les motifs de perte enregistrés sur le trimestre pour identifier un motif qui revient.',
    owner: 'direction',
  },
}

/** `null` pour tout indicateur qui ne peut pas décrocher (stock, sans amont,
 *  sans seuil) — jamais une décision inventée pour un chiffre qui n'en a pas. */
export function pilotageChainGuidance(metricKey: string): PilotageMetricGuidance | null {
  return (PILOTAGE_METRIC_GUIDANCE as Record<string, PilotageMetricGuidance>)[metricKey] ?? null
}
