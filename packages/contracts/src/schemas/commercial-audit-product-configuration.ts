import type { AuditProductAreaConfiguration, AuditProductParameter } from './commercial-audit-context.js'
import type { ProfileContext } from './profile-context.js'

/**
 * #2068.22-.33 — CE QUE L'ESPACE DOIT CONFIGURER POUR QUE LE PRODUIT LUI SERVE.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * LA DÉCISION D'ARCHITECTURE — QU'EST-CE QUI MET UN ESPACE DANS « SCORING »
 * PLUTÔT QUE DANS « CONTACTS » ?
 * ═════════════════════════════════════════════════════════════════════════
 * Décision Louis du 21/09/2026, prise après qu'un vérificateur a RÉFUTÉ trois
 * points marqués `livré` (#2068.24 « Scoring », #2068.26 « Carte d'influence »,
 * #2068.27 « Messages ») : ils n'étaient affichables par AUCUN chemin.
 *
 * L'audit a DEUX porteurs d'aire produit, et ils répondent à deux questions
 * différentes — c'est ce qui tranche l'appartenance :
 *
 *  1. `ACTION_TARGET_DOMAIN` (`build-audit.ts`) répond **« que faut-il
 *     FAIRE ? »** : une aire y entre parce qu'une ACTION OUVERTE la vise
 *     (`contact` → Contacts, `sequence` → Séquences, `partner` → Reverse
 *     Market, `meeting`/`crm_task` → Routines, `need` → Matching).
 *  2. CE FICHIER répond **« que faut-il RÉGLER ? »** : une aire y entre parce
 *     qu'un RÉGLAGE D'ESPACE que le produit LIT DÉJÀ pour cette aire a pu
 *     être lu — renseigné ou non. Jamais une action, jamais un type d'objet.
 *
 * Une aire n'est donc jamais portée par les deux : le plan dirait « appelle
 * ce contact » et la configuration « règle tes contacts » sous la même
 * étiquette, ce qui ferait apparaître la même aire deux fois sous deux formes
 * (GA-26). La garde `architecture/audit-product-areas-are-reachable.test.ts`
 * (GA-372) refuse le chevauchement ET l'aire orpheline des deux.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES TROIS AIRES, LEUR RÈGLE DE DÉCLENCHEMENT, ET CE QUI LES REND NON
 * ÉVALUABLES
 * ─────────────────────────────────────────────────────────────────────────
 * **AUCUN SECOND BARÈME N'EST ÉCRIT ICI.** Ce module ne calcule pas de score :
 * il NOMME les entrées des barèmes qui existent déjà, et dit si l'espace les a
 * renseignées. Chaque paramètre est lié à EXACTEMENT UN champ de
 * `ProfileContext` — aucun champ n'est lu deux fois, ici ou ailleurs sur
 * l'écran.
 *
 * • **`scoring` (#2068.24)** — le barème de priorité de cet espace est-il
 *   réglé ? Le barème des contacts vit à un seul endroit
 *   (`CONTACT_SCORE_CRITERIA`, `packages/contracts/src/schemas/classified-data.ts`)
 *   et son SEUL réglage d'espace est `SellerScoringContext`
 *   (`priorityRoles` / `focusThemes`, même fichier) : vide ou omis, le barème
 *   tourne NEUTRE — mesuré le 21/09/2026, `contacts.service.ts`
 *   (`scoreContacts`) l'appelle aujourd'hui sans contexte vendeur. Les deux
 *   listes que l'audit sait lui fournir sont donc les paramètres de cette
 *   aire : les secteurs prioritaires (`idealAccountProfile.sectorsPriority`,
 *   ce qui fait remonter un COMPTE) et les thèmes prioritaires
 *   (`analysisParameters.focusAreas`, le `focusThemes` du barème CONTACT).
 *   Une liste VIDE est un fait mesuré — « le barème n'a rien sur quoi
 *   classer » — jamais un 0, jamais un « non mesuré » (GA-18 / GA-19).
 * • **`orgGraph` (#2068.26)** — la carte d'influence est construite pour
 *   atteindre un ÉTAGE ; l'étage visé par cet espace est
 *   `idealAccountProfile.decisionLevel`. Sans lui, la carte se construit sans
 *   cible. (La complétude d'un organigramme DONNÉ — `deriveOrgCoverage`,
 *   `OrgCoverageHeader.uncoveredZones` — se mesure par COMPTE, jamais par
 *   espace : elle n'a pas sa place sur un écran d'espace, et la recopier ici
 *   ferait une deuxième mesure du même objet.)
 * • **`messages` (#2068.27)** — un message ne se prépare qu'avec un ANGLE et
 *   des PREUVES : `messagingStyle.valuePropositionAngle` et
 *   `.differentiationPoints`. Sans angle, rien n'est préparable — et l'écran
 *   le taisait jusqu'ici (la conséquence « messages » de `build-audit.ts`
 *   exige `messaging && angle`, donc un angle vide rendait la section muette
 *   au lieu de NOMMER ce qui manque.)
 *
 * **NON ÉVALUABLE** a une seule forme, et elle est dite : aucun des trois
 * blocs source n'a été lu (aucun instantané de profil) → cette fonction rend
 * `null`, l'écran NOMME « non mesuré » et la liste « ce qui n'a pas pu être
 * établi » porte l'entrée `productConfiguration` avec la raison
 * `profileMissing` (elle se répare en complétant son profil — ce n'est plus
 * `noSourceYet`, qui mentirait maintenant qu'une source existe).
 *
 * **CE QUI NE FAIT AUCUNE LIGNE** : une aire dont le bloc source n'a pas été
 * lu. « On n'affiche pas ce qu'on n'a pas » — dans une LISTE, une absence ne
 * fait AUCUNE ligne, et sûrement pas une ligne « rien à faire ».
 *
 * **AUCUNE PROBABILITÉ, AUCUN CLASSEMENT ENTRE ESPACES** : rien ici n'est un
 * pourcentage, une chance ni une comparaison — la lecture est PAR ESPACE, sur
 * les seuls réglages de cet espace (GA-43).
 */

/** Les aires que CE porteur produit, et le nom de chaque réglage qu'il lit.
 *  Lue par la garde GA-372 : une aire absente d'ici n'est produite par
 *  personne, et une aire présente ici ne doit pas l'être dans
 *  `ACTION_TARGET_DOMAIN`. */
export const AUDIT_CONFIGURATION_AREA_SETTINGS = {
  scoring: ['prioritySectors', 'priorityThemes'],
  orgGraph: ['targetDecisionLevel'],
  messages: ['valueAngle', 'proofPoints'],
} as const satisfies Readonly<Record<string, readonly string[]>>

const JOIN = ' · '

/** Une liste VIDE rend `null` : le bloc a été lu et ne nomme rien. */
function listValue(values: readonly string[] | undefined): string | null {
  const kept = (values ?? []).map(value => value.trim()).filter(value => value.length > 0)
  return kept.length > 0 ? kept.join(JOIN) : null
}

function textValue(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * #2068.33 — un paramètre qui porte une VALEUR remonte à un énoncé VALIDÉ.
 * Le contrat le refuse autrement (`auditProductParameterSchema.superRefine`),
 * et pour une bonne raison : une valeur sans trace n'est pas un réglage, c'est
 * une supposition. Conséquence assumée : quand l'énoncé de l'aire manque
 * (profil sans `welcomeSummary`), un réglage POURTANT renseigné n'est pas
 * listé — on ne le dégrade PAS en « non réglé », ce serait un mensonge ; il ne
 * fait simplement aucune ligne.
 */
function parameter(key: string, value: string | null, statement: string | null): AuditProductParameter | null {
  if (value === null) return { key, value: null, trace: null }
  if (statement === null) return null
  return { key, value, trace: { statement, provenance: null } }
}

export function buildAuditProductConfiguration(
  context: ProfileContext | null | undefined,
): AuditProductAreaConfiguration[] | null {
  const ideal = context?.idealAccountProfile
  const parameters = context?.analysisParameters
  const messaging = context?.messagingStyle
  const summary = context?.welcomeSummary

  const areas: AuditProductAreaConfiguration[] = []

  // #2068.24 — un espace dont le barème de priorité n'est pas réglé le voit
  // ici : `SellerScoringContext` vide, le barème tourne neutre.
  const scoringStatement = textValue(summary?.scoringPersonalization)
  const scoring = [
    ideal ? parameter('prioritySectors', listValue(ideal.sectorsPriority), scoringStatement) : null,
    parameters ? parameter('priorityThemes', listValue(parameters.focusAreas), scoringStatement) : null,
  ].filter((entry): entry is AuditProductParameter => entry !== null)
  if (scoring.length > 0) areas.push({ area: 'scoring', parameters: scoring })

  // #2068.26 — l'étage que la carte d'influence doit atteindre. L'énoncé
  // validé de cette aire est celui des INTERLOCUTEURS : la carte existe pour
  // les situer, elle n'a pas d'énoncé propre dans `welcomeSummary`.
  const orgGraph = ideal
    ? [parameter('targetDecisionLevel', ideal.decisionLevel, textValue(summary?.contactsPersonalization))].filter(
        (entry): entry is AuditProductParameter => entry !== null,
      )
    : []
  if (orgGraph.length > 0) areas.push({ area: 'orgGraph', parameters: orgGraph })

  // #2068.27 — l'angle et les preuves avec lesquels un message se prépare :
  // sans eux, rien n'est préparable, et l'écran le NOMME au lieu de se taire.
  const messagesStatement = textValue(summary?.messagesPersonalization)
  const messages = messaging
    ? [
        parameter('valueAngle', textValue(messaging.valuePropositionAngle), messagesStatement),
        parameter('proofPoints', listValue(messaging.differentiationPoints), messagesStatement),
      ].filter((entry): entry is AuditProductParameter => entry !== null)
    : []
  if (messages.length > 0) areas.push({ area: 'messages', parameters: messages })

  // Aucun bloc source lu : le bloc est ABSENT, pas vide — l'écran le NOMME
  // « non mesuré » et la liste du bas le porte (raison `profileMissing`).
  if (!ideal && !parameters && !messaging) return null
  return areas
}
