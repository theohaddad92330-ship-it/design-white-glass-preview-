import {
  BRIEFING_BLOCK_IDS,
  personaFromUserRole,
  resolveRoleStageCell,
  type BriefingBlockId,
  type PilotagePersona,
} from '@bellum/contracts'

/**
 * #3386 — LE RÔLE RÉORDONNE LES BLOCS DE /briefing, JAMAIS LEUR CONTENU (c76).
 *
 * Les rangées du bureau (« À faire maintenant » + « Tes tâches » forment UNE rangée,
 * l'agenda + la messagerie une autre), chacune écrite UNE fois dans `BriefingPage`.
 * Ce module ne dit que par lesquelles la page COMMENCE : les rangées d'avant-garde du
 * rôle passent devant, toutes les autres gardent leur ordre d'origine. Aucune n'est
 * retirée, aucune n'est dupliquée — `block-order.test.ts` le vérifie pour chaque rôle.
 *
 * Décision Louis 11/10 (« fais tout ») : quand le rôle déclaré ET la taille de l'ESN
 * (`consultant_size`) sont connus, c'est la COMBINAISON rôle × stade du tableau
 * `ROLE_STAGE_PLAYBOOK` (@bellum/contracts, `briefingLeads`) qui ouvre la page. Sans
 * taille, la lecture du rôle seul ci-dessous (`personaFromUserRole`, la MÊME
 * correspondance que le pilotage, GA-26). Sans rôle reconnu, l'ordre standard —
 * jamais une préférence ni un stade devinés.
 *
 * `BRIEFING_BLOCK_IDS` vit dans le contrat (la donnée et l'écran lisent la même
 * liste) ; il est réexporté ici pour la page et ses tests.
 */
export { BRIEFING_BLOCK_IDS, type BriefingBlockId }

/** Par quoi la page s'ouvre pour chaque rôle — dans CET ordre, avant tout le reste. */
export const BRIEFING_LEADS: Readonly<Record<PilotagePersona, readonly BriefingBlockId[]>> = {
  // Celui qui vend : ses relances, puis les comptes qui ont bougé, puis son agenda.
  business_developer: ['actions', 'accountsToWatch', 'agenda'],
  // Celui qui suit ses comptes : ce qui bloque et ce qui est en cours d'abord.
  business_manager: ['chainBlockers', 'criticalRisks', 'runningJobs', 'actions'],
  // Le directeur : les écarts transverses, puis les comptes, puis ses actions.
  directeur_bu: ['criticalRisks', 'chainBlockers', 'accountsToWatch', 'actions'],
  // Le dirigeant : la synthèse d'activité et les risques avant le détail.
  fondateur: ['activity', 'criticalRisks', 'accountsToWatch', 'actions'],
  // Le recruteur : les rendez-vous à préparer et les alertes Découvrir.
  recrutement_staffing: ['preparations', 'agenda', 'discoverAlerts'],
}

/** Les rangées d'ouverture : la combinaison rôle × stade, sinon le rôle seul, sinon aucune. */
function leadsFor(
  userRole: string | null | undefined,
  consultantSize: string | null | undefined,
): readonly BriefingBlockId[] {
  const combination = resolveRoleStageCell(userRole, consultantSize)
  if (combination) return combination.cell.briefingLeads
  const persona = personaFromUserRole(userRole)
  return persona ? BRIEFING_LEADS[persona] : []
}

export function orderBriefingBlocks(
  userRole: string | null | undefined,
  consultantSize?: string | null,
): readonly BriefingBlockId[] {
  const leads = leadsFor(userRole, consultantSize)
  if (leads.length === 0) return BRIEFING_BLOCK_IDS
  return [...leads, ...BRIEFING_BLOCK_IDS.filter(id => !leads.includes(id))]
}

/**
 * #3386 (reste du lot E18) — LE MÊME ORDRE DE RÔLE SOUS 768 px.
 *
 * Le mobile rend une liste linéaire (#2097) : chaque section y est une entrée, et
 * `block` dit de QUELLE rangée du bureau elle relève (la rangée « actions » porte
 * deux sections, « agenda » aussi). Le rôle fait passer devant les sections des
 * rangées d'avant-garde — dans l'ordre de `BRIEFING_LEADS` — toutes les autres
 * gardent l'ordre numéroté d'origine. Aucune n'est retirée ni dupliquée.
 *
 * Les sources restent TOUJOURS en dernier (elles ne sont pas dans cette liste), et
 * les blocs fixes au-dessus (analyse en cours, décisions,
 * modes rapides) restent en tête pour tous : tranché sans Louis (recette 05/10) —
 * ils sont les mêmes pour tout le monde, c'est le bloc du rôle qui ouvre juste après.
 */
export const BRIEFING_MOBILE_SECTIONS = [
  { id: 'actions', block: 'actions' },
  { id: 'agenda', block: 'agenda' },
  { id: 'preparations', block: 'preparations' },
  { id: 'sinceLastVisit', block: 'sinceLastVisit' },
  { id: 'dailyGestures', block: 'dailyGestures' },
  { id: 'runningJobs', block: 'runningJobs' },
  { id: 'chainBlockers', block: 'chainBlockers' },
  { id: 'criticalRisks', block: 'criticalRisks' },
  { id: 'mail', block: 'agenda' },
  { id: 'waitingOnOthers', block: 'waitingOnOthers' },
  { id: 'tasks', block: 'actions' },
  { id: 'discoverAlerts', block: 'discoverAlerts' },
  { id: 'slotProposalPriorityAccounts', block: 'slotProposalPriorityAccounts' },
  { id: 'accountsToWatch', block: 'accountsToWatch' },
  { id: 'activity', block: 'activity' },
] as const satisfies readonly { id: string; block: BriefingBlockId }[]

export type BriefingMobileSectionId = (typeof BRIEFING_MOBILE_SECTIONS)[number]['id']

export function orderMobileBriefingSections(
  userRole: string | null | undefined,
  consultantSize?: string | null,
): readonly BriefingMobileSectionId[] {
  const blockRank = new Map(orderBriefingBlocks(userRole, consultantSize).map((id, rank) => [id as string, rank]))
  const leads = leadsFor(userRole, consultantSize)
  const inLead = (block: string) => leads.includes(block as BriefingBlockId)
  const original = BRIEFING_MOBILE_SECTIONS.map((section, index) => ({ ...section, index }))
  return original
    .sort((a, b) => {
      const aLead = inLead(a.block)
      const bLead = inLead(b.block)
      if (aLead !== bLead) return aLead ? -1 : 1
      if (aLead && bLead) return (blockRank.get(a.block) ?? 0) - (blockRank.get(b.block) ?? 0) || a.index - b.index
      return a.index - b.index
    })
    .map(section => section.id)
}
