import {
  DEFAULT_APPROVAL_SETTINGS,
  hasPermission,
  reachesOutsideProduct,
  writesIntoClientTool,
  type ApprovalSettings,
  type AutomationLevel,
  type WorkflowStep,
  type WorkspaceRole,
} from '@bellum/contracts'

/**
 * Qui doit dire oui, et pourquoi (addendum final p25).
 *
 * La politique est PURE : elle ne lit ni base ni requête, elle prend l'état et
 * rend une décision. C'est ce qui la rend testable exhaustivement — et la
 * question « ce run avait-il le droit de partir ? » doit pouvoir se rejouer des
 * mois plus tard sans reconstituer un environnement.
 *
 * Quatre choses seulement font monter le niveau exigé :
 *   1. le pas lui-même (un envoi est irréversible, une note ne l'est pas) ;
 *   2. la PORTÉE du pas (son effet atteint-il quelqu'un hors du produit ?) ;
 *   3. le VOLUME (dix cibles ne sont pas une cible) ;
 *   4. la DÉPENSE (vingt crédits ne sont pas un crédit).
 *
 * Aucune de ces quatre ne peut être désactivée par un réglage : les seuils se
 * déplacent, le principe non. Un espace peut décider que la barre du volume est
 * à 50 plutôt qu'à 10 ; il ne peut pas décider qu'un envoi en masse se fait sans
 * personne pour l'approuver.
 *
 * ⚠️ « Ne peut pas être désactivée par un réglage » était FAUX jusqu'au
 * 01/09/2026 — voir le bloc {@link HUMAN_DEMAND_ORDER}, qui raconte comment un
 * réglage d'espace relevait le plancher au lieu de buter dessus.
 */

/**
 * ⚠️ `AUTOMATION_LEVEL_ORDER` N'EST PAS L'ORDRE QUE CETTE POLITIQUE COMPARE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUI A PRODUIT CE BLOC (mesuré le 01/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * `atLeast` classait `n4_bounded_auto` AU-DESSUS de `n2_user_approval`, parce
 * qu'il lisait l'échelle du contrat — qui va du moins autonome (`n0_advice`) au
 * plus autonome (`n5_extended_auto`). Sur cette échelle,
 * `maxLevel('n2_user_approval', 'n4_bounded_auto')` rend `n4`. Un espace dont
 * `workspaces.approval_default_level` vaut `n4` ou `n5` voyait donc le
 * PLANCHER d'un pas irréversible se faire RELEVER en autonomie : le
 * planificateur basculait le pas dans « exécutable maintenant », et le
 * récapitulatif de rendez-vous partait chez le client sans que personne l'ait
 * lu. Le docbloc de `levelForStep` disait déjà « la seule ligne du barème qui
 * ne dépend d'aucun réglage » ; le code faisait l'inverse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CAUSE : UNE ÉCHELLE POUR DEUX QUESTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * `AutomationLevel` répond à deux questions différentes selon l'endroit où on
 * se tient sur l'échelle. De `n0` à `n3`, il dit QUI DOIT DIRE OUI — personne,
 * personne, l'auteur, un responsable : c'est une EXIGENCE, et elle croît.
 * À `n4` et `n5`, il dit que le produit a le droit d'agir SEUL : c'est une
 * PERMISSION, et elle ne se compare pas à une exigence. `n4` n'est pas « plus
 * approuvé » que `n2` — il est MOINS.
 *
 * L'échelle du contrat reste ce qu'elle est (l'ordre de déclaration, croissant
 * en autonomie ; elle sert aussi de liste des valeurs valides). Ce que cette
 * politique compare, elle, est une seule chose : **combien un niveau réclame
 * d'un humain avant qu'un effet parte**. C'est l'ordre ci-dessous, et il n'est
 * pas une permutation arbitraire : il descend `n4` et `n5` sous les niveaux qui
 * n'écrivent rien, parce que « rien ne part » laisse moins au hasard que « ça
 * part tout seul ».
 *
 * La garde `apps/api/src/architecture/external-steps-need-a-human.spec.ts`
 * vérifie que cet ordre reste une PERMUTATION de l'échelle du contrat : un
 * septième niveau ne peut pas être ajouté d'un côté et oublié de l'autre.
 */
export const HUMAN_DEMAND_ORDER: readonly AutomationLevel[] = [
  /** Personne, sans borne. */
  'n5_extended_auto',
  /** Personne, dans des bornes. */
  'n4_bounded_auto',
  /** Rien ne part par ce chemin. */
  'n0_advice',
  /** Rien ne part non plus : on prépare. */
  'n1_prepare',
  /** L'auteur clique. */
  'n2_user_approval',
  /** Un responsable tranche. */
  'n3_manager_approval',
] as const

/** Compare deux niveaux — `a` réclame-t-il au moins autant d'humain que `b` ? */
export function atLeast(a: AutomationLevel, b: AutomationLevel): boolean {
  return HUMAN_DEMAND_ORDER.indexOf(a) >= HUMAN_DEMAND_ORDER.indexOf(b)
}

/** Celui des deux qui réclame le plus d'un humain. Ne DESCEND jamais un plancher. */
export function maxLevel(a: AutomationLevel, b: AutomationLevel): AutomationLevel {
  return atLeast(a, b) ? a : b
}

/**
 * Ce niveau exige-t-il qu'un humain dise oui avant que quoi que ce soit parte ?
 *
 * LA dérivation qui décide si un pas s'exécute seul — elle vit ici et nulle part
 * ailleurs. Le planificateur l'écrivait en dur (`=== 'n4' || === 'n5'`) à deux
 * endroits ; deux copies d'une même règle divergent le jour où un `n6` arrive.
 */
export function demandsAHuman(level: AutomationLevel): boolean {
  return atLeast(level, 'n2_user_approval')
}

/**
 * Les SEULS champs d'un pas que `levelForStep` lit.
 *
 * #2449 — le type est ÉLARGI (pas changé) : un `WorkflowStep` entier le
 * satisfait toujours, et la porte des niveaux d'action
 * (`copilot-action-gate.ts`) peut poser la même question sur un geste qui n'est
 * pas un pas de workflow — un intent dispatché depuis une carte de Laura, par
 * exemple. C'est ce qui permet à la porte de RÉUTILISER ce barème au lieu d'en
 * recopier les critères (GA-26 : « un réglage vit à un seul endroit »).
 */
type StepRequirement = Pick<WorkflowStep, 'risk' | 'intentType' | 'estimatedCredits'> & {
  sensitiveFamily?: WorkflowStep['sensitiveFamily']
}

/**
 * Le niveau exigé par un PAS, indépendamment du contexte du run.
 *
 * Un pas qu'on ne peut pas rattraper, ou dont l'effet ATTEINT quelqu'un, ne
 * descend jamais sous l'approbation utilisateur : c'est la seule ligne du barème
 * qui ne dépend d'aucun réglage, parce qu'aucun seuil ne rend un envoi
 * rattrapable. Le réglage de l'espace peut RELEVER ce plancher (un espace qui
 * exige un responsable partout l'obtient) ; il ne peut pas le retirer.
 */
export function levelForStep(step: StepRequirement, settings: ApprovalSettings): AutomationLevel {
  if (step.risk === 'irreversible') return maxLevel('n2_user_approval', settings.defaultLevel)
  // L'effet SORT du produit. Un pas peut être annoncé `low` et gratuit et
  // atteindre quand même une personne : `send_recap` du workflow « Après le
  // rendez-vous » ne tenait que par son `risk: 'irreversible'`, et rien
  // n'obligeait l'auteur du pas suivant à le déclarer.
  if (reachesOutsideProduct(step.intentType)) return maxLevel('n2_user_approval', settings.defaultLevel)
  // #4016 L6 — « pour le CRM faut quand même un go du user » (Louis 11/10/2026).
  // Une écriture dans l'outil du CLIENT (CRM, boîte) ne part jamais seule, quelle
  // que soit la posture. Avant le 11/10, une note CRM suivait le réglage : un
  // espace en N4 la voyait partir seule. L'autonomie N4/N5 ouverte ce jour-là
  // l'aurait étendue sans borne ; le plancher est posé ICI, avant elle.
  if (writesIntoClientTool(step.intentType)) return maxLevel('n2_user_approval', settings.defaultLevel)
  if (step.sensitiveFamily) return maxLevel('n2_user_approval', settings.defaultLevel)
  // #4016 L6 — ⚠️⚠️ RENVERSEMENT DATÉ (Louis 11/10/2026) : une dépense de
  // crédits ne demande plus un clic quand l'espace a choisi l'autonomie (N4/N5).
  // Elle est tenue par le seuil de dépense du RUN (`decideApproval`), réglé par
  // l'admin jusqu'à « sans plafond ». Hors posture autonome, inchangé.
  if (step.estimatedCredits > 0 && !isAutonomousPosture(settings.defaultLevel)) {
    return maxLevel('n2_user_approval', settings.defaultLevel)
  }
  // Écriture INTERNE, réversible et gratuite : le réglage de l'espace tranche.
  // Un espace prudent peut exiger un clic même là ; le défaut produit le fait,
  // et un espace en automatique borné obtient l'automatisme — c'est ce que `n4`
  // sert à faire, et sept routines du catalogue en vivent.
  return settings.defaultLevel
}

/** #4016 L6 — l'espace a-t-il choisi d'agir seul (N4 borné, N5 étendu) ? */
function isAutonomousPosture(level: AutomationLevel): boolean {
  return !demandsAHuman(level) && level !== 'n0_advice' && level !== 'n1_prepare'
}

/** Ce qui a fait monter le niveau — rendu à l'utilisateur, jamais un verdict nu. */
type EscalationReason = 'bulk' | 'spend' | 'irreversible' | 'sensitive_family' | 'workflow_minimum'

export type ApprovalDecision = {
  /** Le niveau réellement exigé pour ce run. */
  requiredLevel: AutomationLevel
  /** Les raisons qui l'ont porté là, dans l'ordre où elles ont joué. */
  reasons: EscalationReason[]
  /** Vrai quand un manager doit trancher (et pas seulement l'auteur). */
  needsManager: boolean
}

/**
 * Le niveau exigé par un RUN entier : le maximum des pas, relevé par le volume
 * et par la dépense.
 *
 * `targetCount` est le nombre de cibles réellement touchées (contacts, comptes),
 * pas le nombre de pas : trois pas sur un contact restent une action unitaire,
 * un pas sur trois cents contacts ne l'est pas.
 */
export function decideApproval(input: {
  steps: readonly WorkflowStep[]
  workflowMinimum: AutomationLevel
  targetCount: number
  estimatedCredits: number
  settings?: ApprovalSettings
}): ApprovalDecision {
  const settings = input.settings ?? DEFAULT_APPROVAL_SETTINGS
  const reasons: EscalationReason[] = []

  let level: AutomationLevel = input.workflowMinimum
  if (input.workflowMinimum !== settings.defaultLevel) reasons.push('workflow_minimum')

  for (const step of input.steps) {
    level = maxLevel(level, levelForStep(step, settings))
    // La RAISON est enregistrée pour l'attribut lui-même, pas seulement quand il
    // relève le niveau. Un envoi irréversible dans un run déjà à `n2` reste la
    // raison pour laquelle ce run demande une validation : ne pas le dire
    // laisserait l'utilisateur approuver sans savoir ce qui est en jeu.
    if (step.risk === 'irreversible' && !reasons.includes('irreversible')) reasons.push('irreversible')
    if (step.sensitiveFamily && !reasons.includes('sensitive_family')) reasons.push('sensitive_family')
  }

  // #4016 L6 — ⚠️⚠️ RENVERSEMENT DATÉ (Louis 11/10/2026) : en N5 (autonomie
  // ÉTENDUE), un run dont aucun pas ne demande un humain n'a PAS de plafond —
  // ni volume ni dépense ne le relèvent. N4 reste BORNÉ par les deux seuils.
  // Un run qui demande déjà un humain (envoi, écriture CRM, famille sensible)
  // garde l'escalade au responsable à TOUS les niveaux : c'est elle qui tient
  // « un envoi en masse ne tient jamais sur le seul clic de son auteur ».
  if (settings.defaultLevel === 'n5_extended_auto' && !demandsAHuman(level)) {
    return { requiredLevel: level, reasons, needsManager: false }
  }

  // Volume et dépense passent au-dessus de tout le reste : ce sont les deux
  // seuils que le rapport (p25) refuse de laisser au clic de l'auteur seul.
  if (input.targetCount >= settings.bulkThreshold) {
    level = maxLevel(level, 'n3_manager_approval')
    reasons.push('bulk')
  }
  if (input.estimatedCredits >= settings.spendThreshold) {
    level = maxLevel(level, 'n3_manager_approval')
    reasons.push('spend')
  }

  return { requiredLevel: level, reasons, needsManager: level === 'n3_manager_approval' }
}

/**
 * Une approbation de niveau `required` peut-elle être accordée par ce décideur ?
 *
 * `n3` exige un rôle manager/propriétaire ; en dessous, l'auteur suffit. On
 * refuse aussi l'auto-approbation d'un `n3` par son demandeur, même manager :
 * un garde-fou que la personne pressée peut lever seule n'en est pas un.
 */
export function canDecide(input: {
  requiredLevel: AutomationLevel
  deciderRole: WorkspaceRole
  deciderId: string
  requesterId: string
  /** #2864 — le collègue à qui la demande a été DÉLÉGUÉE, s'il y en a un. */
  assigneeId?: string | null
}): { allowed: boolean; reason?: string } {
  if (input.requiredLevel !== 'n3_manager_approval') {
    // #2864 — la délégation transfère le clic simple : le délégué tranche comme
    // l'auteur l'aurait fait. Un lecteur reste un lecteur (la route exige
    // `records:write`), et `canAssign` refuse d'emblée de lui déléguer.
    const delegated = Boolean(input.assigneeId) && input.deciderId === input.assigneeId
    return input.deciderId === input.requesterId || delegated
      ? { allowed: true }
      : { allowed: false, reason: "Seul l'auteur de la demande, ou le collègue à qui il l'a confiée, peut la valider." }
  }
  // #2864 — ⚠️ en `n3`, la délégation ne change RIEN à la règle : elle ne fait
  // que désigner QUEL responsable doit regarder. Un demandeur qui se délègue sa
  // propre demande ne s'ouvre pas l'auto-validation (refus plus bas).
  // « Manager » n'est pas un rôle du produit : c'est quiconque gère l'équipe
  // (`team:manage`, donc owner / admin / sales_ops). Réutiliser la matrice de
  // permissions plutôt que d'inventer une seconde liste de rôles évite qu'un
  // futur rôle soit ajouté d'un côté et oublié de l'autre.
  if (!hasPermission(input.deciderRole, 'team:manage')) {
    return { allowed: false, reason: 'Cette action demande la validation d’un responsable d’équipe.' }
  }
  if (input.deciderId === input.requesterId) {
    return { allowed: false, reason: 'Une validation responsable ne peut pas être accordée par son propre demandeur.' }
  }
  return { allowed: true }
}

/**
 * Les postures qu'un espace peut réellement demander — et que cette politique
 * sait TENIR.
 *
 * `workspaces.approval_default_level` est une colonne `text` sans contrainte :
 * elle accepte les six niveaux du barème. Deux d'entre eux ne sont pourtant pas
 * des postures d'approbation. `n0_advice` et `n1_prepare` promettent « rien ne
 * s'écrit » — une promesse que RIEN ici ne peut tenir : un pas ordinaire résolu
 * à `n1` atterrit dans « à approuver » et part au premier clic, exactement comme
 * `n2`. Les accepter, c'est offrir un réglage qui annonce autre chose que ce
 * qu'il fait ; on retombe donc sur le défaut produit, comme pour une valeur
 * illisible.
 *
 * `n4` et `n5` RESTENT acceptés, et c'est délibéré : ce sont les postures des
 * travaux internes bornés (rafraîchissement, digest, contrôle de santé), et sept
 * routines du catalogue en vivent. Le défaut du 01/09 ne venait pas d'eux — il
 * venait de ce qu'ils pouvaient relever le plancher d'un pas EXTERNE. Ce plancher
 * est maintenant tenu par `levelForStep`, à l'endroit où la question se pose ;
 * amputer le réglage aurait puni le travail interne pour un défaut qui n'était
 * pas le sien.
 */
const WORKSPACE_POSTURES: readonly AutomationLevel[] = [
  'n2_user_approval',
  'n3_manager_approval',
  'n4_bounded_auto',
  'n5_extended_auto',
] as const

/** Réglages effectifs d'un espace : ses valeurs quand elles existent, le défaut
 *  produit sinon. NULL en base = « suit le défaut », pas « zéro ». */
export function resolveSettings(row: {
  approval_default_level?: string | null
  approval_bulk_threshold?: number | null
  approval_spend_threshold?: number | null
}): ApprovalSettings {
  const level = WORKSPACE_POSTURES.find(l => l === row.approval_default_level)
  return {
    defaultLevel: level ?? DEFAULT_APPROVAL_SETTINGS.defaultLevel,
    bulkThreshold: row.approval_bulk_threshold ?? DEFAULT_APPROVAL_SETTINGS.bulkThreshold,
    spendThreshold: row.approval_spend_threshold ?? DEFAULT_APPROVAL_SETTINGS.spendThreshold,
  }
}

/**
 * #2864 — Peut-on s'occuper du CIRCUIT d'une demande (la déléguer, la reporter) ?
 *
 * Le demandeur, le collègue qui l'a déjà reçue, ou quelqu'un qui gère l'équipe.
 * Un tiers sans responsabilité ne s'attribue pas la demande d'un autre : ce
 * serait le moyen de trancher à sa place un clic que la règle lui refuse.
 */
function canRoute(input: {
  actorId: string
  actorRole: WorkspaceRole
  requesterId: string
  currentAssigneeId: string | null
}): boolean {
  return (
    input.actorId === input.requesterId ||
    (input.currentAssigneeId !== null && input.actorId === input.currentAssigneeId) ||
    hasPermission(input.actorRole, 'team:manage')
  )
}

/**
 * #2864 — DÉLÉGUER une demande d'approbation à un collègue.
 *
 * Trois refus, dans l'ordre où on les lit :
 *  1. le destinataire n'est PAS membre de l'espace (`assigneeRole: null`) —
 *     une demande ne sort jamais de son espace, même nommée ;
 *  2. celui qui délègue n'a pas la main sur ce circuit (voir `canRoute`) ;
 *  3. le destinataire ne POURRAIT PAS trancher — lui confier la demande ne
 *     ferait que la bloquer sous son nom jusqu'à expiration.
 */
export function canAssign(input: {
  requiredLevel: AutomationLevel
  assignerId: string
  assignerRole: WorkspaceRole
  requesterId: string
  currentAssigneeId: string | null
  assigneeId: string
  /** `null` = le destinataire n'est pas membre de l'espace de la demande. */
  assigneeRole: WorkspaceRole | null
}): { allowed: boolean; reason?: string } {
  if (input.assigneeRole === null) {
    return { allowed: false, reason: 'Seul un membre de cet espace peut recevoir cette demande.' }
  }
  if (
    !canRoute({
      actorId: input.assignerId,
      actorRole: input.assignerRole,
      requesterId: input.requesterId,
      currentAssigneeId: input.currentAssigneeId,
    })
  ) {
    return {
      allowed: false,
      reason: "Seul l'auteur, le collègue désigné ou un responsable peut confier cette demande.",
    }
  }
  if (!hasPermission(input.assigneeRole, 'records:write')) {
    return { allowed: false, reason: 'Ce membre a un accès en lecture seule : il ne peut pas trancher cette demande.' }
  }
  const verdict = canDecide({
    requiredLevel: input.requiredLevel,
    deciderRole: input.assigneeRole,
    deciderId: input.assigneeId,
    requesterId: input.requesterId,
    assigneeId: input.assigneeId,
  })
  return verdict.allowed ? { allowed: true } : { allowed: false, reason: verdict.reason }
}

/** #2856 — REPORTER une demande : même main que la délégation (`canRoute`). */
export function canSnooze(input: {
  actorId: string
  actorRole: WorkspaceRole
  requesterId: string
  currentAssigneeId: string | null
}): { allowed: boolean; reason?: string } {
  return canRoute(input)
    ? { allowed: true }
    : { allowed: false, reason: "Seul l'auteur, le collègue désigné ou un responsable peut reporter cette demande." }
}
