import { needNextAction, type OpenNeedRow, type PositionedConsultantFact } from '@bellum/contracts'

/**
 * LES DEUX RAILS D'UNE AFFAIRE — CE QU'ON SAIT DU CLIENT, CE QU'ON SAIT DU
 * CONSULTANT, ET SURTOUT CE QU'ON N'A PAS ENCORE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2067.18-.30 — UN RAIL N'EST PAS UNE FICHE À REMPLIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce module ne RÉ-AFFICHE aucune valeur : `NeedDetailPage.tsx` montre déjà
 * `context`, `budget_cents`, `languages`/`clearances`, `start_on`… Refaire ce
 * rendu ici violerait « rien n'apparaît deux fois sous la même forme » (loi 4
 * du tome 7) et GA-26 (une dérivation vit à un seul endroit). Ce qu'il calcule
 * est un DIGEST de présence/absence — #2067.30 : « la conclusion montre les
 * éléments ABSENTS sur chaque rail », pas les valeurs elles-mêmes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « DÉCISION » ET « VOIE D'ACHAT » — MESURÉES SUR LE BTMMP DU PROJET
 * ─────────────────────────────────────────────────────────────────────────────
 * La qualification BTMMP (`packages/contracts/src/schemas/project.ts`,
 * `btmmpSchema` — axes `management`/`process`) se SAISIT sur la fiche du
 * PROJET (`BtmmpPanel.tsx`), jamais sur celle d'un BESOIN — mais `GET
 * /projects/needs` joint déjà `opportunities` (compte, libellé…), donc
 * `OpenNeedRow.decision_known` / `.buying_process_known` lisent la PRÉSENCE du
 * texte sur l'axe, sans colonne neuve en base (#2067.21, #2067.22). Jamais le
 * texte lui-même : `BtmmpPanel.tsx` le porte déjà, le réafficher ici violerait
 * « rien n'apparaît deux fois sous la même forme » (loi 4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RAIL CONSULTANT — DÉCISION Louis 17/09 après-midi (#2067.25-.29)
 * ─────────────────────────────────────────────────────────────────────────────
 * L'adéquation, le TJM demandé, la mobilité, les autres processus en cours et
 * l'accord réel sont des faits d'un CANDIDAT précis — et avant un premier
 * rapprochement, aucun candidat n'est « le » consultant de ce besoin. La
 * réponse retenue : le rail est porté par le consultant POSITIONNÉ, c'est-à-
 * dire celui dont la soumission existe ET dont le CV est réellement PARTI
 * (`OpenNeedRow.positioned_consultant`, lu depuis `submissions.submitted_at`
 * côté serveur — voir `open-needs.ts`). Un simple shortlisté ne suffit pas :
 * le client n'a encore rien reçu de lui.
 *
 * `positioned_consultant` est `null` quand personne n'est positionné — une
 * VRAIE réponse, pas une absence de mesure — et tous les champs du rail
 * consultant restent `false`. Quand il existe, chaque fait est relu TEL QUEL
 * (jamais recalculé) : ce module ne trie ni ne note personne, il nomme des
 * présences et des absences (doctrine c58_criteres_proteges).
 *
 * `realAgreement` (#2067.29 / #2175.29 — accord réel et restrictions) :
 * BRANCHÉ au lot V33 (épopée #2880, tranché sans Louis) sur
 * `positioned_consultant.agreementConfirmed` — le TJM ET le CV du positionné
 * validés par un GESTE du commercial (`consultants.tjm_validated_at` /
 * `.cv_validated_at`, #2948). Aucun critère protégé n'entre dans ce fait :
 * deux horodatages de geste, rien d'autre. Absent (API plus ancienne) ⇒ non
 * mesuré, jamais un faux « oui ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2175.30 / #2175.32 — QUATRE ÉTATS, ET « PRÊT À DÉMARRER »
 * ─────────────────────────────────────────────────────────────────────────────
 * {@link buildNeedRailStates} donne à chaque fait l'un des quatre états
 * nommés par #2175 — Confirmé / À vérifier / Bloquant / Non applicable — et
 * ne fabrique JAMAIS un « Bloquant » ni un « Non applicable » qu'une donnée
 * ne porte pas :
 *  - Bloquant : seulement sur un fait DÉCLARÉ qui interdit l'affaire — le
 *    positionné dit « indisponible » (`consultants.availability`) ;
 *  - Non applicable : seulement quand le besoin lui-même rend la question
 *    vide — la mobilité d'un poste en full remote (`need.remote`) ;
 *  - sans positionné, le rail consultant reste « À vérifier » en entier : un
 *    rail sans consultant n'est pas « sans objet », il est ouvert.
 * {@link needReadyToStart} ne conclut « prêt à démarrer » que si les DEUX
 * rails n'ont que des faits Confirmés ou Non applicables (#2175.32), et
 * compte sinon ce qui reste à vérifier et ce qui bloque — jamais un
 * pourcentage, jamais une probabilité.
 */

export const CLIENT_RAIL_KEYS = [
  'problem',
  'requirements',
  'budget',
  'decision',
  'buyingProcess',
  'timing',
  'nextStep',
] as const
export type ClientRailKey = (typeof CLIENT_RAIL_KEYS)[number]

export const CONSULTANT_RAIL_KEYS = [
  'fitAndAvailability',
  'tjm',
  'mobility',
  'competingProcesses',
  'realAgreement',
] as const
export type ConsultantRailKey = (typeof CONSULTANT_RAIL_KEYS)[number]

type NeedDiscoveryRails = {
  /** `true` = ce champ est MESURÉ (même vide, quand une valeur vide est une
   *  vraie réponse) ; `false` = personne ne l'a dit. Jamais un jugement sur
   *  l'affaire — une absence n'est pas une faiblesse prouvée. */
  client: Record<ClientRailKey, boolean>
  consultant: Record<ConsultantRailKey, boolean>
  /** #2067.25-.29 — le consultant dont le rail est affiché, `null` = aucun
   *  positionné. Porte le NOM (pour le titre du rail) et sert aux tests. */
  positionedConsultant: PositionedConsultantFact | null
  /** #2067.25-.29 — le nombre TOTAL de positionnés, pour dire « et N autres »
   *  sans les cacher. `0` est un vrai zéro. */
  positionedConsultantsCount: number
}

/** Un texte n'est un fait que s'il dit quelque chose : « » et les espaces seuls n'en sont pas. */
function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

export function buildNeedDiscoveryRails(need: OpenNeedRow, now: Date): NeedDiscoveryRails {
  const positioned = need.positioned_consultant ?? null
  return {
    client: {
      // #2067.18 — LE PROBLÈME. Le seul champ en prose qui porte le contexte et
      // les objectifs (`needSheet.context`, §3.3). Rien d'autre ne le dit.
      problem: hasText(need.context),
      // #2067.19 — LES EXIGENCES. `NeedRequirementsCard.tsx` nomme LUI-MÊME ces
      // deux champs « CE QUE LE POSTE EXIGE » — c'est le vocabulaire du dépôt,
      // pas une invention de ce lot. `[]` est une réponse RÉELLE (« ce poste
      // n'exige rien de plus ») : seul `undefined` (deploy-skew, la question
      // n'a pas de réponse) compte comme absent.
      requirements: need.languages !== undefined || need.clearances !== undefined,
      // #2067.20 — LE BUDGET. `budget_cents`, jamais `target_tjm_cents` : ce
      // dernier est un TARIF DE POSTE (comparé au tarif vendu moyen par
      // `NeedRateComparison.tsx`), pas un budget d'affaire. Les confondre
      // ferait répondre une question par le chiffre d'une autre.
      budget: need.budget_cents != null,
      // #2067.21 — LA DÉCISION. Voir le docblock du fichier :
      // `OpenNeedRow.decision_known` lit la présence du texte sur
      // `BTMMP.management`, joint depuis le projet. `undefined` (deploy-skew,
      // API pas encore à jour) compte comme absent, pas comme mesuré.
      decision: need.decision_known === true,
      // #2067.22 — LA VOIE D'ACHAT. Même lecture sur `BTMMP.process`.
      buyingProcess: need.buying_process_known === true,
      // #2067.23 — LE TIMING. Trois signaux déjà réels sur le besoin ; UN seul
      // suffit à dire que le timing a commencé à se préciser.
      timing: need.start_on !== null || need.duration_months !== null || need.deadline_at !== null,
      // #2067.24 — LA PROCHAINE ÉTAPE. RÉUTILISE `needNextAction` (GA-26) :
      // écrire un second calcul ici finirait par diverger de celui que
      // `NeedDetailPage.tsx` affiche déjà.
      nextStep: needNextAction(need, now) !== null,
    },
    consultant: {
      // #2067.25 — ADÉQUATION ET DISPONIBILITÉ, en UNE clé (comme la demande
      // du registre). `OR` : le rail dit « quelque chose est su », pas « tout
      // est su » — même logique que #2067.19 (langues OU habilitations).
      fitAndAvailability:
        positioned != null &&
        (positioned.fitScore != null || (positioned.availability != null && positioned.availability !== 'inconnu')),
      // #2067.26 — le TJM DEMANDÉ sur LA soumission, jamais le TJM cible du
      // consultant ni celui du client (déjà couverts ailleurs sur la fiche).
      tjm: positioned != null && positioned.proposedRateCents != null,
      // #2067.27 — mobilité connue (zones ou préférence remote déclarées).
      mobility: positioned != null && positioned.mobilityKnown,
      // #2067.28 — « autres processus en cours » : le COMPTE est toujours
      // calculable dès qu'un consultant est positionné (`0` inclus, c'est un
      // vrai zéro) — measurer n'est pas juger l'affaire.
      competingProcesses: positioned != null,
      // #2067.29 / #2175.29 — accord réel : TJM ET CV validés par geste.
      // Voir le docblock.
      realAgreement: positioned != null && positioned.agreementConfirmed === true,
    },
    positionedConsultant: positioned,
    positionedConsultantsCount: need.positioned_consultants_count ?? 0,
  }
}

/** #2067.30 — ce qui manque sur le rail CLIENT, dans l'ordre déclaré. */
export function missingClientRailKeys(rails: NeedDiscoveryRails): ClientRailKey[] {
  return CLIENT_RAIL_KEYS.filter(key => !rails.client[key])
}

/** #2067.30 — ce qui manque sur le rail CONSULTANT, dans l'ordre déclaré. */
export function missingConsultantRailKeys(rails: NeedDiscoveryRails): ConsultantRailKey[] {
  return CONSULTANT_RAIL_KEYS.filter(key => !rails.consultant[key])
}

export const RAIL_FACT_STATES = ['confirmed', 'to_verify', 'blocking', 'not_applicable'] as const
export type RailFactState = (typeof RAIL_FACT_STATES)[number]

type NeedRailStates = {
  client: Record<ClientRailKey, RailFactState>
  consultant: Record<ConsultantRailKey, RailFactState>
}

/** #2175.30 — l'état de chaque fait des deux rails. Voir le docblock du fichier. */
export function buildNeedRailStates(need: OpenNeedRow, now: Date): NeedRailStates {
  const rails = buildNeedDiscoveryRails(need, now)
  const positioned = rails.positionedConsultant
  const measured = (present: boolean): RailFactState => (present ? 'confirmed' : 'to_verify')
  const client = Object.fromEntries(CLIENT_RAIL_KEYS.map(key => [key, measured(rails.client[key])])) as Record<
    ClientRailKey,
    RailFactState
  >
  const consultant = Object.fromEntries(
    CONSULTANT_RAIL_KEYS.map(key => [key, measured(rails.consultant[key])]),
  ) as Record<ConsultantRailKey, RailFactState>
  if (positioned != null) {
    if (positioned.availability === 'indisponible') consultant.fitAndAvailability = 'blocking'
    if (need.remote === 'full_remote' && consultant.mobility !== 'confirmed') consultant.mobility = 'not_applicable'
  }
  return { client, consultant }
}

/** #2175.32 — « prêt à démarrer » ssi les deux rails sont sécurisés ; sinon, ce qui manque, compté. */
export function needReadyToStart(states: NeedRailStates): { ready: boolean; toVerify: number; blocking: number } {
  const all = [...Object.values(states.client), ...Object.values(states.consultant)]
  const toVerify = all.filter(state => state === 'to_verify').length
  const blocking = all.filter(state => state === 'blocking').length
  return { ready: toVerify === 0 && blocking === 0, toVerify, blocking }
}
