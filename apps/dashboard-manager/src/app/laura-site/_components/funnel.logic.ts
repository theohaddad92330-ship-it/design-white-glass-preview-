import type { ChatbotStageId, ChatbotStageReading, MedianScore, PassRate } from '@/lib/chatbot-funnel'

/**
 * #1659 — la mise en forme du tunnel de Laura, en logique PURE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST DÉCIDÉ ICI, ET CE QUI NE L'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * · Aucun TAUX n'est recalculé. L'API les rend déjà, seuil d'agrégation compris
 *   (`chatbot-funnel-stages.ts`). Deux chemins qui referaient la division
 *   divergeraient le jour où le seuil bouge, et l'écran publierait ce que
 *   l'API retient. Ce module ne fait que CHOISIR LA PHRASE.
 * · Aucune couleur n'est décidée ici : `SegmentBar` porte son cycle de tokens.
 * · Aucune horloge n'est lue — ce module n'a pas de `now`, parce qu'il n'a
 *   besoin d'aucune date.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES PHRASES ET PAS DES `null`
 * ─────────────────────────────────────────────────────────────────────────────
 * Un tiret dit « il n'y a rien » ; il ne dit pas LEQUEL des quatre riens. Or les
 * quatre appellent quatre gestes différents : réparer la mesure, instrumenter,
 * attendre du trafic, ou rien du tout parce que c'est la première étape. Chaque
 * branche de {@link PassRate} rend donc une phrase qui NOMME sa cause — c'est
 * la règle « une valeur absente ne s'affiche jamais 0 » portée jusqu'au texte.
 */

/** Le libellé de chaque étape. Le vocabulaire de l'écran, à un seul endroit. */
const LIBELLE: Record<ChatbotStageId, string> = {
  visitors: 'Visiteurs',
  widget_opened: 'Widget ouvert',
  conversation: 'Conversation',
  qualified: 'Qualification atteinte',
  booked: 'RDV pris',
}

export function libelleEtape(stage: ChatbotStageId): string {
  return LIBELLE[stage]
}

/**
 * Pourquoi une étape n'a pas de compte, en une phrase qui dit le GESTE.
 *
 * ⚠️ « Rien ne l'émet » et « la source n'a pas répondu » se ressemblent à
 * l'écran et appellent l'inverse l'un de l'autre : on répare une mesure cassée,
 * on instrumente une mesure absente. Les fondre en « non mesuré » enverrait
 * chercher une panne qui n'existe pas.
 */
export function raisonDeLAbsence(unmeasured: 'source_unavailable' | 'not_instrumented'): string {
  return unmeasured === 'source_unavailable'
    ? 'la mesure d’audience n’a pas répondu — on ne sait rien, ce n’est pas « zéro »'
    : 'rien ne l’émet aujourd’hui — c’est une instrumentation à poser, pas une panne'
}

/** Un taux de passage, formaté, ou la phrase qui dit pourquoi il n'existe pas. */
export function decrireTaux(taux: PassRate): string {
  switch (taux.kind) {
    case 'measured':
      return `${(taux.ratio * 100).toFixed(1)} %`
    case 'no_previous':
      return 'entrée du tunnel'
    case 'below_threshold':
      return `moins de ${taux.minSessions} sessions (${taux.sessions}) — pas encore de quoi en tirer une mesure`
    case 'unmeasured':
      return 'dénominateur non mesuré — un taux sans dénominateur n’existe pas'
  }
}

/**
 * La médiane du score, ou la raison NOMMÉE de son absence.
 *
 * ⚠️ Le SEUIL n'est jamais écrit ici : ni « 12 », ni la valeur du contrat. Le
 * premier vit dans le routage du chatbot du site, le second dans
 * `@bellum/contracts` — et un réglage vit à un seul endroit (GA-26). Quand la
 * mesure est retenue, le nombre affiché vient de la charge utile.
 */
export function decrireMediane(mediane: MedianScore): string {
  switch (mediane.kind) {
    case 'measured':
      return `${mediane.value.toFixed(1)} sur ${mediane.sessions} sessions`
    case 'below_threshold':
      return `retenue : moins de ${mediane.minSessions} sessions (${mediane.sessions}) — sous ce seuil, une médiane désigne quelqu’un`
    case 'source_unavailable':
      return 'la mesure d’audience n’a pas répondu'
    case 'not_instrumented':
      return 'non instrumentée — le score est calculé côté site et aucun événement ne le porte'
  }
}

/** Un segment de la barre : ce que `SegmentBar` attend, sans couleur imposée. */
type SegmentDuTunnel = { label: string; value: number }

/**
 * Ce que la barre segmentée peut dessiner, et ce qu'elle ne peut pas.
 *
 * ⚠️ Une étape NON MESURÉE ne devient pas un segment de largeur nulle : elle
 * SORT de la barre et son nom part dans `absentes`, que l'écran écrit à côté.
 * Un segment à zéro se lirait comme « personne n'y est passé », ce qui est
 * précisément l'affirmation qu'on n'a pas le droit de faire — et `SegmentBar`
 * ne peut pas le savoir, sa forme d'entrée ne porte que des nombres.
 *
 * Les largeurs comparent les étapes ENTRE ELLES : le dénominateur de la barre
 * est la somme des étapes dessinées, pas la population du site. C'est dit à
 * l'écran, sinon un segment de 40 % se lirait « 40 % des visiteurs ».
 */
export function segmentsDuTunnel(stages: readonly ChatbotStageReading[]): {
  segments: SegmentDuTunnel[]
  absentes: { libelle: string; raison: string }[]
} {
  const segments: SegmentDuTunnel[] = []
  const absentes: { libelle: string; raison: string }[] = []

  for (const stage of stages) {
    if (stage.measured) segments.push({ label: LIBELLE[stage.stage], value: stage.count })
    else absentes.push({ libelle: LIBELLE[stage.stage], raison: raisonDeLAbsence(stage.unmeasured) })
  }

  return { segments, absentes }
}
