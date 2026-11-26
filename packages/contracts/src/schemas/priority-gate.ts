import { z } from 'zod'
import { shouldSwitch, type SprintEvent, type SprintLevel, type SprintSwitch } from './sprint.js'

/**
 * La porte G1 : ce compte entre dans le portefeuille, ou il en sort
 * (PDF 2 §4.4 B2).
 *
 * `pending` n'est pas un état de transition, c'est une RÉPONSE : « personne n'a
 * encore posé la question ». La distinguer de « écarté » compte, parce que les
 * deux mènent à des gestes opposés — l'un se traite, l'autre se laisse.
 *
 * ⚠️ À ne JAMAIS fusionner avec `commercial_status`, qui dit où en est la
 * relation (à trier, suivi, client…). Un client peut être mis en veille sans
 * cesser d'être client ; les confondre le ferait disparaître de la facturation.
 */
export const PRIORITY_GATES = ['pending', 'prioritised', 'parked'] as const
export const priorityGateSchema = z.enum(PRIORITY_GATES)
export type PriorityGate = (typeof PRIORITY_GATES)[number]

/** Écarter exige un motif ; prioriser non. Un geste qu'on refait chaque semaine
 *  et qui demande un formulaire finit par être contourné, et un motif contourné
 *  ne vaut rien. Un « non », lui, est précisément ce qu'on voudra relire. */
export function gateRequiresReason(gate: PriorityGate): boolean {
  return gate === 'parked'
}

/**
 * Ce que la transition sait du refus qu'elle referme.
 *
 * `previousReason`/`previousDecidedAt` valent `null` aussi bien quand le
 * compte n'avait jamais été écarté que quand l'appelant ne les fournit pas —
 * cette fonction ne LIT pas la base, elle ne peut pas distinguer les deux.
 * C'est volontaire : seul l'appelant, qui a lu le compte, sait s'il était
 * `parked` et connaît son motif.
 */
export interface GateReopening {
  previousReason: string | null
  previousDecidedAt: string | null
}

/**
 * Ce qui peut suivre quoi.
 *
 * L'interdit du ticket : `parked → prioritised` en un geste. Un compte écarté
 * repasse par `pending`, c'est-à-dire par la question — sinon le motif de
 * l'écartement, seul apprentissage que produit un « non », disparaît au premier
 * revirement, et l'écran de Découvrir se remet à proposer un compte que trois
 * personnes ont déjà refusé.
 *
 * ⚠️ N15-A : `gate_reason`/`gate_decided_at` sont stockés sur le compte, et
 * `AccountGateService.decide` les EFFACE au moment même de la réouverture
 * (par design — un motif qui traînerait afficherait « hors cible » à côté
 * d'un compte redevenu à qualifier). Sans un relais, ils disparaissent donc
 * sans que personne ne les ait vus. Le troisième paramètre, optionnel, laisse
 * l'appelant transmettre ce qu'il vient de lire AVANT d'écraser ces colonnes ;
 * la transition les fait alors VOYAGER dans `reopening`, pour un seul usage —
 * l'écran de réouverture, pas une mémoire durable. « On archive, on ne
 * supprime pas » : un fait périmé redevient inconnu AVEC sa date, il ne
 * s'efface pas sans laisser de trace au moins une fois.
 */
export function canTransitionGate(
  from: string | null | undefined,
  to: PriorityGate,
  previous?: { reason: string | null; decidedAt: string | null },
): { allowed: boolean; reason?: string; reopening?: GateReopening } {
  const current: PriorityGate = (PRIORITY_GATES as readonly string[]).includes(from ?? '')
    ? (from as PriorityGate)
    : 'pending'
  if (current === to) return { allowed: false, reason: 'Ce compte est déjà dans cet état.' }
  if (current === 'parked' && to === 'prioritised') {
    return {
      allowed: false,
      reason: 'Un compte écarté se rouvre d’abord (« à requalifier »), pour que son motif reste lisible.',
    }
  }
  if (current === 'parked') {
    // Seule sortie permise depuis `parked` : vers `pending`. C'est la
    // réouverture — le seul moment où le motif et la date du refus qu'on
    // referme sont encore lisibles avant que l'écriture ne les efface.
    return {
      allowed: true,
      reopening: { previousReason: previous?.reason ?? null, previousDecidedAt: previous?.decidedAt ?? null },
    }
  }
  return { allowed: true }
}

/**
 * Les motifs d'écartement proposés par défaut (§4.4).
 *
 * PROPOSÉS, jamais imposés : une liste fermée pousse à cocher « Autre », qui
 * n'apprend rien. `other` est en dernier et son texte libre est obligatoire —
 * c'est ce qui distingue « je n'ai pas trouvé mon cas » de « je n'ai pas
 * regardé la liste ».
 */
export const DEFAULT_PARK_REASONS: readonly { key: string; fr: string; en: string }[] = [
  { key: 'out_of_icp', fr: 'Hors cible', en: 'Outside our ICP' },
  { key: 'no_access', fr: 'Pas d’accès', en: 'No way in' },
  { key: 'incumbent', fr: 'Concurrent installé', en: 'Incumbent in place' },
  { key: 'size', fr: 'Taille inadaptée', en: 'Wrong size' },
  { key: 'geography', fr: 'Zone géographique', en: 'Out of our area' },
  { key: 'no_budget', fr: 'Pas de budget', en: 'No budget' },
  // Les deux motifs que le tome 1 §11.5 nomme et qu'aucun catalogue ne portait.
  // Ils comptent parce qu'ils ne se réexaminent PAS pareil : « pas intéressé »
  // se rouvre quand l'organisation change, « ne plus me contacter » ne se
  // rouvre jamais.
  { key: 'not_interested', fr: 'Pas intéressé', en: 'Not interested' },
  { key: 'do_not_contact', fr: 'Ne plus me contacter', en: 'Do not contact again' },
  { key: 'bad_timing', fr: 'Mauvais timing', en: 'Bad timing' },
  // Les treize motifs de #3262 (BEL-SC-233, « STOP CONDITIONS ») qu'aucun
  // catalogue ne portait. Le quatorzième de la spec — « aucune voie d'accès
  // après plusieurs tests » — N'EST PAS ajouté ici : c'est `no_access`
  // ci-dessus, sous un autre mot ; l'ajouter en double aurait créé le second
  // motif concurrent que l'instruction commune #3249 (règle 4) interdit.
  { key: 'no_sponsor', fr: 'Sponsor introuvable', en: 'No sponsor found' },
  { key: 'panel_locked', fr: 'Panel verrouillé', en: 'Procurement panel locked' },
  { key: 'cycle_mismatch', fr: 'Cycle incompatible', en: 'Incompatible buying cycle' },
  { key: 'margin_insufficient', fr: 'Marge insuffisante', en: 'Insufficient margin' },
  { key: 'need_not_qualifiable', fr: 'Besoin non qualifiable', en: 'Need cannot be qualified' },
  { key: 'no_leverageable_proof', fr: 'Aucune preuve mobilisable', en: 'No usable proof to leverage' },
  { key: 'scope_too_broad', fr: 'Périmètre trop large', en: 'Scope too broad' },
  {
    key: 'prolonged_silence_no_signal',
    fr: 'Absence prolongée de réponse, sans apprentissage',
    en: 'Prolonged silence, with nothing learned',
  },
  { key: 'worked_by_colleague', fr: 'Déjà travaillé par un collègue', en: 'Already worked by a colleague' },
  { key: 'partner_conflict', fr: 'Conflit partenaire', en: 'Partner conflict' },
  { key: 'legal_reputational_risk', fr: 'Risque juridique ou réputationnel', en: 'Legal or reputational risk' },
  { key: 'insufficient_capacity', fr: 'Capacité commerciale insuffisante', en: 'Insufficient sales capacity' },
  {
    key: 'more_profitable_priority_available',
    fr: 'Priorité plus rentable disponible',
    en: 'A more profitable priority is available',
  },
  { key: 'other', fr: 'Autre', en: 'Other' },
]

/* ------------------------------------------------------------------ */
/*  La péremption du refus (tome 1 §11.5)                              */
/* ------------------------------------------------------------------ */

/**
 * Combien de mois avant de réexaminer un compte écarté, par MOTIF.
 *
 * « Un "non" a une durée de vie. Personne ne relance un refus. » Le bêta testeur
 * raconte le cas exactement : « je l'avais vue trois mois avant, elle m'a dit
 * non — j'avais lâché l'affaire », puis elle lui confie des besoins.
 *
 * Les cadences DIFFÈRENT parce que les motifs ne se périment pas au même
 * rythme : un budget se revote à l'exercice suivant, un mauvais timing passe en
 * un trimestre, une organisation met un an à changer. Une fenêtre unique
 * relancerait trop tôt les uns — la façon la plus rapide de se faire ignorer —
 * et trop tard les autres.
 *
 * `null` veut dire JAMAIS, et c'est un refus définitif qu'on respecte :
 * « ne plus me contacter » n'est pas un délai, c'est une décision.
 */
export const PARK_REASON_REVIEW_MONTHS: Readonly<Record<string, number | null>> = {
  no_budget: 6, // l'exercice change
  bad_timing: 3, // c'est ce qu'il a dit
  incumbent: 12, // un référencement change tous les 2 à 4 ans, on regarde chaque année
  not_interested: 12, // l'organisation change
  do_not_contact: null, // jamais. Ce n'est pas un délai, c'est une décision.
  out_of_icp: null, // ce n'est pas un refus du client, c'est un choix de l'ESN
  size: null, // idem — il changerait si l'ESN grandit, pas si le compte bouge
  geography: null,
  no_access: 12,
  // #3262 (BEL-SC-233) — les treize motifs neufs, la même logique que
  // ci-dessus appliquée à chacun : un refus du CLIENT a une cadence, un choix
  // ou une contrainte de l'ESN n'en a pas (il change si l'ESN change, pas au
  // temps), et ce qui se résout par un ÉVÉNEMENT plutôt qu'un délai reste à
  // `null` sans devenir pour autant un refus définitif (`isDefinitiveRefusal`
  // ne regarde QUE `do_not_contact`).
  no_sponsor: 6, // un sponsor peut émerger avec un changement d'organigramme
  panel_locked: 12, // même rythme qu'un référencement installé — on regarde chaque année
  cycle_mismatch: 6, // le cycle d'achat se rejoue au semestre suivant
  margin_insufficient: null, // un arbitrage de l'ESN, pas un refus du client
  need_not_qualifiable: 6, // le besoin peut se préciser au semestre suivant
  no_leverageable_proof: 12, // le temps que l'ESN construise une référence mobilisable
  scope_too_broad: 6, // se retravaille en segments plus petits, pas au hasard du calendrier
  prolonged_silence_no_signal: 6, // plus long qu'un mauvais timing : rien n'a été appris entre-temps
  worked_by_colleague: null, // se résout quand le collègue libère le compte, pas au temps
  partner_conflict: null, // se résout quand le conflit se dénoue, pas au temps
  legal_reputational_risk: null, // se résout sur revue explicite, jamais par simple délai
  insufficient_capacity: 6, // la capacité commerciale se réévalue au semestre
  more_profitable_priority_available: 6, // un arbitrage qui se rejoue, pas une fermeture
  other: null, // motif libre : on ne devine pas la cadence d'une phrase
}

/**
 * Les motifs qui interdisent tout recontact, par TOUTES les voies.
 *
 * ⚠️ À ne pas confondre avec « sans cadence ». Cinq motifs valent `null`
 * ci-dessus, et ils ne disent pas la même chose :
 *
 * - `out_of_icp`, `size`, `geography`, `other` sont des choix de l'ESN, pas des
 *   refus du client. Ils n'ont pas de cadence parce que le temps ne les change
 *   pas — mais un SIGNAL peut légitimement les remettre sur la table, et les
 *   proposer alors est inutile au pire, jamais fautif ;
 * - `do_not_contact` est une INTERDICTION. C'est la personne qui l'a demandée.
 *
 * La distinction compte parce qu'un compte écarté se rouvre par DEUX voies —
 * le temps écoulé, et « il s'est passé quelque chose ». La cadence ne gardait
 * que la première : un compte dont l'interlocuteur avait demandé à ne plus être
 * contacté remontait dans les propositions dès qu'un signal arrivait, ce que le
 * tome 1 interdit en toutes lettres (« opt-out : jamais relancé », U34).
 *
 * Le défaut penche vers « on peut recontacter » : traiter un motif inconnu comme
 * un opt-out ferait disparaître des comptes sans que personne l'ait décidé.
 */
export const DEFINITIVE_REFUSAL_REASONS: readonly string[] = ['do_not_contact']

export function isDefinitiveRefusal(reason: string | null | undefined): boolean {
  return DEFINITIVE_REFUSAL_REASONS.includes((reason ?? '').trim())
}

/**
 * Ce que le compte sait de la réouverture de sa porte.
 *
 * `reopensOn` vient de `access_facts.reopens_on`, calculée depuis l'attribution
 * DECP (date de notification + durée du marché). `null` = inconnue, ce qui est
 * le cas de toute entreprise privée : aucun registre ne publie l'échéance d'un
 * référencement privé.
 */
export type ReopeningHint = { reopensOn: string | null }

/**
 * Un compte écarté est-il à réexaminer ?
 *
 * `null` quand la question ne se pose pas — motif définitif, motif inconnu, ou
 * date de décision absente. Sans date, on ne PEUT pas savoir si le délai est
 * écoulé, et le supposer ferait relancer un refus d'hier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉCHÉANCE CONNUE AVANCE LE RÉEXAMEN
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tome 1 §11.5 écrit la cadence ainsi : « déjà un prestataire → **à
 * l'échéance du contrat si connue**, sinon 12 mois ». Le code appliquait 12
 * mois dans tous les cas, alors que le dépôt CONNAÎT l'échéance depuis le
 * 23/08 — `access_facts.reopens_on`, et `referencingWindowAlert` qui prévient à
 * T-9, T-6 et T-3.
 *
 * Les deux moitiés existaient et ne se parlaient pas. Sur un compte écarté pour
 * titulaire en place dont le marché finit dans quatre mois, l'alerte de fenêtre
 * disait « prépare tes preuves » pendant que la porte de priorité gardait le
 * compte écarté douze mois — huit mois APRÈS le seul moment où le panel s'ouvre,
 * qui est précisément ce que tout le chantier d'accessibilité cherche à saisir.
 *
 * ⚠️ On retient la plus PROCHE des deux dates, jamais la plus lointaine. Un
 * marché de trois ans ne doit pas faire dormir un compte trois ans : la cadence
 * de 12 mois est un PLAFOND de sommeil, pas une promesse de patience — son
 * commentaire le dit déjà, « on regarde chaque année ».
 *
 * Et une échéance ne renverse JAMAIS un refus définitif : « ne plus me
 * contacter » n'est pas un délai qu'une date de marché pourrait raccourcir.
 */
export function reexaminationDueAt(reason: string | null, decidedAt: string | null, hint?: ReopeningHint): Date | null {
  if (!reason || !decidedAt) return null
  const months = PARK_REASON_REVIEW_MONTHS[reason.trim()]
  // Un motif définitif le reste — c'est vérifié AVANT de regarder l'échéance.
  if (months === null || months === undefined) return null
  const decided = new Date(decidedAt)
  if (Number.isNaN(decided.getTime())) return null
  const due = new Date(decided)
  due.setUTCMonth(due.getUTCMonth() + months)

  const reopens = hint?.reopensOn ? new Date(hint.reopensOn) : null
  // Une échéance illisible ne fait rien : on ne devine pas une date.
  if (!reopens || Number.isNaN(reopens.getTime())) return due
  return reopens.getTime() < due.getTime() ? reopens : due
}

/** Le délai est-il écoulé ? */
export function isReexaminationDue(
  reason: string | null,
  decidedAt: string | null,
  now: Date,
  hint?: ReopeningHint,
): boolean {
  const due = reexaminationDueAt(reason, decidedAt, hint)
  return due !== null && due.getTime() <= now.getTime()
}

/**
 * #3262.20 (épopée #3262, lot R11 29/09) — LA PROCHAINE CONDITION DE REVUE,
 * UNIFIÉE.
 *
 * Deux dates existaient sans jamais se lire ensemble : {@link reexaminationDueAt}
 * (le délai CALCULÉ d'un compte écarté, par motif) et
 * `relationship_memory.nextReviewAt` (une date de revue LIBRE, posée à la
 * main sur la fiche compte — n'importe quel compte, écarté ou non). Aucun
 * appelant ne les combinait.
 *
 * Tranché sans Louis : une date posée à la main dans `relationship_memory`
 * GAGNE toujours sur le délai calculé — « une correction humaine gagne
 * toujours, quelle que soit sa date » (doctrine, `CLAUDE.md` § Doctrine).
 * Le calcul ne reprend la main que si personne n'a rien posé.
 */
export function nextReviewCondition(input: {
  gateReason: string | null
  gateDecidedAt: string | null
  relationshipMemoryNextReviewAt: string | null
  hint?: ReopeningHint
}): { dueAt: Date | null; source: 'relationship_memory' | 'priority_gate' | null } {
  if (input.relationshipMemoryNextReviewAt) {
    const posed = new Date(input.relationshipMemoryNextReviewAt)
    // Une date illisible n'est pas une correction humaine lisible : on ne la
    // devine pas, le calcul reprend la main comme si rien n'était posé.
    if (!Number.isNaN(posed.getTime())) return { dueAt: posed, source: 'relationship_memory' }
  }
  const computed = reexaminationDueAt(input.gateReason, input.gateDecidedAt, input.hint)
  if (computed) return { dueAt: computed, source: 'priority_gate' }
  return { dueAt: null, source: null }
}

/**
 * #3262.21 (épopée #3262, lot R11 29/09) — LES ÉVÈNEMENTS POUVANT RÉACTIVER,
 * UNIFIÉS.
 *
 * {@link shouldSwitch} (`sprint.ts`) porte les évènements qui font bouger le
 * niveau d'EFFORT ; le `reopening` de {@link canTransitionGate} porte la
 * réouverture de la porte de PRIORITÉ (`parked` → `pending`). Deux axes
 * distincts (tome 5 §28 le dit : jamais fondus), et un même évènement — une
 * réponse positive, par exemple — peut justifier les DEUX à la fois sur un
 * compte qui serait, en même temps, `sprint = 'no_go'` et
 * `priority_gate = 'parked'`. Aucun appelant ne posait la question aux deux
 * en même temps.
 *
 * Une LECTURE : elle ne transitionne rien elle-même — `SprintsService.applyEvent`
 * et l'écriture de `priority_gate` restent les deux portes réelles.
 */
export function reactivationOptions(
  event: SprintEvent,
  sprintLevel: SprintLevel | null,
  gate: string | null | undefined,
): { sprintSwitch: SprintSwitch | null; gateReopeningEligible: boolean } {
  const sprintSwitch = sprintLevel ? shouldSwitch(sprintLevel, event) : null
  // Seul un compte ACTUELLEMENT écarté a une porte à rouvrir — même garde que
  // `canTransitionGate` (`current === 'parked'`). L'éligibilité se lit sur
  // `shouldSwitch('no_go', event)` plutôt que sur une seconde liste
  // d'évènements recopiée à la main (GA-26) : `no_go`/`parked` sont deux axes
  // distincts, mais ce sont les MÊMES deux évènements — `positive_reply` et
  // `strong_signal` — que `sprint.ts` nomme déjà « proposition de
  // réouverture » dans leur `reason`.
  const gateReopeningEligible = gate === 'parked' && shouldSwitch('no_go', event) !== null
  return { sprintSwitch, gateReopeningEligible }
}

export const changeAccountGateSchema = z.object({
  gate: priorityGateSchema,
  /** Obligatoire pour écarter — vérifié côté serveur, pas seulement à l'écran. */
  reason: z.string().trim().max(200).nullish(),
})
export type ChangeAccountGate = z.infer<typeof changeAccountGateSchema>
