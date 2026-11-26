import type { MemoryLedgerEntry } from './memory-ledger.js'

/**
 * #1916.5 → #1916.11 — LES SECTIONS de Réglages › Mémoire de Laura, dans l'ordre
 * du retour : « Préférences personnelles · Objectifs personnels · Règles de
 * l'ESN · Contexte d'un compte · Corrections terrain · Documents de référence ·
 * Éléments temporaires ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE DÉRIVATION, PAS UNE SECONDE CLASSIFICATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune colonne « section » n'existe et aucune n'est ajoutée : une section se
 * LIT sur ce que la ligne porte déjà — sa couche, sa nature (`kind`), sa portée
 * (`scope`), son compte, son échéance, et pour une ligne déclarée sa clé
 * (`detail`). Une seconde étiquette stockée divergerait de la nature au premier
 * changement de portée. La règle vit ICI, une fois (GA-26) ; l'écran et la garde
 * de démonstration l'appellent.
 *
 * Chaque ligne tombe dans UNE section, jamais deux (loi 4 du tome 7 : rien
 * n'apparaît deux fois sous la même forme). L'ordre des tests ci-dessous est
 * donc une PRÉCÉDENCE, et chaque cran a sa raison.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « DOCUMENTS DE RÉFÉRENCE » NE SE DÉRIVE D'AUCUNE LIGNE
 * ─────────────────────────────────────────────────────────────────────────────
 * La mémoire ne garde aucun document : aucune table de mémoire n'en porte, et
 * l'origine `analysis` (« issu d'un dossier ») n'est écrite par aucun chemin de
 * production. Les documents que Laura consulte vivent dans la base de
 * connaissance, relue à chaque question du chat (`apps/ia/app/routers/chat.py`,
 * `rag_knowledge.retrieve_reranked_citations`). La section EXISTE donc à
 * l'écran comme un RENVOI vers l'endroit où ils vivent (GA-26), pas comme une
 * liste qu'on remplirait en rangeant autre chose dedans.
 */
export const MEMORY_LEDGER_SECTIONS = [
  'personalPreferences',
  'personalObjectives',
  'esnRules',
  'accountContext',
  'corrections',
  'referenceDocuments',
  'temporary',
  // #1918.2 — « Mon équipe / ma BU » : AJOUTÉE EN FIN, comme les sections ne
  // sont PAS un enum persisté (aucune colonne « section » n'existe, voir la
  // doc de tête), rien n'imposait cet ordre — elle reste en fin par prudence,
  // au cas où un appelant ordonnerait sur ce tableau sans le savoir.
  'teamContext',
] as const
export type MemoryLedgerSection = (typeof MEMORY_LEDGER_SECTIONS)[number]

/**
 * Q2 (décision du 13/09) — les clés de la couche DÉCLARÉE `identity` qui sont
 * des OBJECTIFS : l'objectif individuel et la cible mensuelle, saisis dans le
 * questionnaire de profil (`individual_goal`, `monthly_target` →
 * `sellerGoal`, `monthlyTarget`). Ils quittent « Ce que Laura sait de toi » pour
 * « Objectifs personnels ». La couche ne change pas — ils restent déclarés, ils
 * se corrigent là où ils se saisissent et ne s'oublient pas ; seule leur place à
 * l'écran change, et elle est décidée ici, une fois.
 */
export const MEMORY_DECLARED_OBJECTIVE_KEYS = ['sellerGoal', 'monthlyTarget'] as const

/**
 * OÙ SE CORRIGE chaque ligne DÉCLARÉE de la couche `identity` — écrit une fois.
 *
 * Défaut trouvé le 13/09 : l'écran renvoyait tout le groupe vers « Mon compte »
 * (`/settings/profile/identity`), qui n'édite que le prénom, le nom et l'e-mail.
 * Le rôle, la proactivité, le portefeuille… se règlent dans le questionnaire de
 * profil ; la difficulté principale dans une étape du profil (Temps 1). Chaque
 * destination nomme la QUESTION qui écrit la valeur (`answerKey`, la clé de
 * `EsnAnswers` que `buildAnalysisProfileData` lit) : c'est ce qui la rend
 * vérifiable — une garde confronte ces clés au questionnaire et aux étapes, au
 * lieu de faire confiance à cette table.
 *
 * Une clé absente d'ici n'a PAS de destination : l'écran n'offre alors aucun
 * geste plutôt qu'un renvoi deviné. La garde API (`memory-ledger.spec.ts`) fait
 * rougir toute clé d'identité que le registre produit sans destination.
 */
export const MEMORY_DECLARED_CORRECTIONS = {
  firstName: { editedIn: 'account' },
  sellerRole: { editedIn: 'profileQuestionnaire', answerKey: 'user_role' },
  proactivity: { editedIn: 'profileQuestionnaire', answerKey: 'proactivity_level' },
  sellerGoal: { editedIn: 'profileQuestionnaire', answerKey: 'individual_goal' },
  monthlyTarget: { editedIn: 'profileQuestionnaire', answerKey: 'monthly_target' },
  portfolioSize: { editedIn: 'profileQuestionnaire', answerKey: 'portfolio_size' },
  accountsRelationshipStatus: { editedIn: 'profileQuestionnaire', answerKey: 'accounts_relationship_status' },
  salesBlockers: { editedIn: 'profileQuestionnaire', answerKey: 'sales_blockers' },
  mainChallenge: { editedIn: 'onboardingStage', answerKey: 'main_sales_pain' },
} as const satisfies Record<
  string,
  { editedIn: 'account' } | { editedIn: 'profileQuestionnaire' | 'onboardingStage'; answerKey: string }
>

type MemoryDeclaredCorrection = (typeof MEMORY_DECLARED_CORRECTIONS)[keyof typeof MEMORY_DECLARED_CORRECTIONS]

/** Où corriger une ligne déclarée d'identité, ou `null` (autre couche, clé sans destination connue). */
export function memoryDeclaredCorrectionOf(
  entry: Pick<MemoryLedgerEntry, 'layer'> & { detail?: string | null },
): MemoryDeclaredCorrection | null {
  if (entry.layer !== 'identity' || typeof entry.detail !== 'string') return null
  return Object.hasOwn(MEMORY_DECLARED_CORRECTIONS, entry.detail)
    ? MEMORY_DECLARED_CORRECTIONS[entry.detail as keyof typeof MEMORY_DECLARED_CORRECTIONS]
    : null
}

function isDeclaredObjective(detail: string | null | undefined): boolean {
  return typeof detail === 'string' && (MEMORY_DECLARED_OBJECTIVE_KEYS as readonly string[]).includes(detail)
}

/**
 * La section d'une ligne du registre, ou `null` quand elle n'appartient à
 * aucune : les couches qui gardent leur propre groupe (le fil, les refus, le
 * reste des deux profils déclarés), et un fait servi SANS nature ni portée — une
 * API plus ancienne que ces champs. On ne devine pas où il irait ; l'écran le
 * montre dans le groupe historique « Ce que tu as épinglé ».
 */
export function memoryLedgerSectionOf(
  // `detail` est facultatif : seule une ligne de la couche `identity` en a besoin
  // pour être rangée, et un appelant qui ne classe que des faits n'a pas à l'inventer.
  entry: Pick<MemoryLedgerEntry, 'layer' | 'kind' | 'scope' | 'accountId' | 'expiresAt'> & {
    detail?: string | null
  },
): MemoryLedgerSection | null {
  if (entry.layer === 'preferences') return 'personalPreferences'
  // Q2 — l'objectif et la cible DÉCLARÉS ; le reste de l'identité garde son groupe.
  if (entry.layer === 'identity') return isDeclaredObjective(entry.detail) ? 'personalObjectives' : null
  if (entry.layer !== 'facts') return null
  if (!entry.kind || !entry.scope) return null
  // 1. L'ÉCHÉANCE d'abord : c'est ce qui change le plus la lecture — l'élément
  //    cesse de valoir à une date, et c'est la seule section qui dit QUAND. Échu,
  //    il y reste, avec sa date (« on archive, on ne supprime pas »). Sa nature
  //    reste lisible sur la ligne.
  if (entry.expiresAt) return 'temporary'
  // 2. La CORRECTION : elle domine tout dans le contexte de Laura (rang 1 de
  //    `_format_memory`), sur un compte comme ailleurs.
  if (entry.kind === 'correction') return 'corrections'
  // 3. Le COMPTE : ce qui ne vaut que pour un dossier n'est ni une règle de
  //    l'ESN ni un objectif personnel, quelle que soit sa portée.
  if (entry.accountId) return 'accountContext'
  // 3bis. #1918.5 — UNE CONVERSATION : elle ne nourrit qu'un fil et meurt avec
  //    lui, ce que « Éléments temporaires » dit déjà — pas une section de plus.
  if (entry.scope === 'conversation') return 'temporary'
  // 3ter. #1918.2 — UNE BU / UNE ÉQUIPE : ni toute l'ESN ni un compte, un
  //    périmètre de travail distinct — sa propre section, sinon elle se
  //    lirait comme une règle d'ESN qu'elle n'est pas.
  if (entry.scope === 'business_unit') return 'teamContext'
  // 4. La PORTÉE : ce qui vaut pour toute l'ESN est une règle de l'ESN.
  if (entry.scope === 'workspace') return 'esnRules'
  // 5. Pour toi seul : une préférence, ou un objectif.
  if (entry.kind === 'preference') return 'personalPreferences'
  if (entry.kind === 'fact') return 'personalObjectives'
  // #1962.7/.9/.10 — les natures ajoutées ne sont NI une préférence NI un
  // objectif : une hypothèse à vérifier rangée sous « Objectifs personnels »
  // prendrait le sens d'une section qui dit « ce que tu vises », et un libellé
  // se lit hors contexte. Hors section, avec leur étiquette de nature sur la
  // ligne — jamais sous un nom faux.
  return null
}
