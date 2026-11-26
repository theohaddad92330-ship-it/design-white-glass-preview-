import { z } from 'zod'
import type { CreditedAction } from '../billing/credit-weights.js'
import { toolFamilySchema, type ToolFamily } from './tool-registry.js'

/**
 * LA BIBLIOTHÈQUE DE COMMANDES (PDF 6 §9, ticket BEL-AUT-505, dette T6.1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE N'A PAS PU ÊTRE ÉCRITE PLUS TÔT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le chantier du PDF 6 l'a différée pour une raison précise : elle annonce ce
 * que le copilote SAIT FAIRE, et au moment de l'écrire, personne ne le savait —
 * deux des vingt requêtes prioritaires étaient exécutables. Un catalogue écrit
 * à ce moment-là aurait surtout listé des promesses.
 *
 * Il est écrit maintenant parce que la mesure existe : chaque commande nomme
 * les outils qu'elle appelle, et ces outils sont ceux du catalogue réel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI PORTE LE RESTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une commande dit ce qu'elle EXIGE (`requires`), et l'écran calcule si c'est
 * disponible ICI, pour CET utilisateur. Une commande indisponible reste
 * VISIBLE, avec le nom de ce qui manque — la cacher ferait croire qu'elle
 * n'existe pas, et l'afficher comme prête ferait cliquer sur un mur.
 *
 * `requires: []` veut dire « aucune connexion externe » : les données sont
 * celles de Bellum. C'est le cas de la majorité, et c'est le point du §9 —
 * l'essentiel de ce qu'un commercial demande ne dépend d'aucun connecteur.
 */

// `access` est ajouté EN FIN de liste (tome 1 §16) : l'ordre est celui de
// l'affichage, et insérer au milieu déplacerait les six autres familles sous
// les yeux de gens qui savent où chercher.
export const COMMAND_CATEGORIES = [
  'mailbox',
  'agenda',
  'accounts',
  'talent',
  'delivery',
  'rfp',
  'steering',
  'access',
] as const
export const commandCategorySchema = z.enum(COMMAND_CATEGORIES)
export type CommandCategory = z.infer<typeof commandCategorySchema>

/**
 * #1913.2 → .10 — LES MOMENTS MÉTIER.
 *
 * Le retour bêta : « Le catalogue sert à découvrir les usages, pas à afficher
 * l'inventaire technique des outils. » Les catégories ci-dessus rangent par
 * DOMAINE (messagerie, vivier…) ; un commercial, lui, arrive avec un MOMENT —
 * « je commence ma journée », « je prépare un rendez-vous ». Le moment devient
 * le rangement par défaut de l'écran ; la catégorie reste, pour la vue par
 * domaine.
 *
 * L'ordre est celui du retour ET celui de l'affichage.
 *
 * ⚠️ Un moment peut n'avoir AUCUNE commande : l'écran ne l'affiche pas, et on
 * n'invente pas de commande pour le remplir. Au 13/09/2026, c'est le cas de
 * `find_contact` (« Trouver un interlocuteur ») — aucune commande du catalogue
 * ne cherche une personne à contacter.
 */
export const COMMAND_MOMENTS = [
  'start_day',
  'prepare_meeting',
  'open_account',
  'find_contact',
  'position_consultant',
  'handle_need',
  'follow_up',
  'track_mission',
  'steer_team',
  // #2392 — la CLÔTURE de fin de journée, pendant du brief du matin. EN FIN de
  // liste : l'ordre est celui de l'affichage, et la journée finit par elle.
  'end_day',
] as const
export const commandMomentSchema = z.enum(COMMAND_MOMENTS)

const localised = z.object({ fr: z.string().min(1), en: z.string().min(1) })

export const commandDefinitionSchema = z
  .object({
    key: z.string().min(1).max(60),
    category: commandCategorySchema,
    /** #1913 — le moment métier sous lequel l'écran range la commande. */
    moment: commandMomentSchema,
    /** Ce que l'utilisateur lit dans la bibliothèque. */
    label: localised,
    /**
     * #1913.11 — « résultat attendu » : ce que la réponse rend, tel que les
     * outils appelés savent le servir. Facultatif : un résultat qu'on ne sait
     * pas décrire est ABSENT de l'écran, jamais remplacé par un tiret.
     */
    outcome: localised.optional(),
    /**
     * La phrase RÉELLEMENT envoyée au copilote.
     *
     * Elle est stockée et non reconstruite depuis le libellé : ce qui part au
     * modèle doit être relisible tel quel, et un libellé d'écran se raccourcit
     * au fil des revues d'interface sans que personne ne pense au prompt.
     */
    prompt: localised,
    /** Les outils que la commande appelle. Sert de preuve, pas de décor. */
    tools: z.array(z.string().min(1)).min(1),
    /** Les familles de connecteur exigées. Vide = données Bellum seules. */
    requires: z.array(toolFamilySchema),
  })
  .strict()
export type CommandDefinition = z.infer<typeof commandDefinitionSchema>

/**
 * #1913.11 — LES DONNÉES DE L'ESPACE qu'une commande lit (« À partir de »).
 *
 * Ce sont des données, pas des connecteurs : « ta messagerie » est une
 * CONNEXION (`requires`, `families.*` à l'écran) ; « tes fils de messagerie »
 * est ce qu'on y lit. Les deux champs ne disent donc pas deux fois la même
 * chose.
 */
export const COMMAND_DATA_SOURCES = [
  'mail_threads',
  'meetings',
  'accounts',
  'account_dossiers',
  'needs',
  'bench',
  'missions',
  'timesheets',
  'tenders',
  'references',
  'interventions',
  /**
   * #2470 — LA SEULE SOURCE PUBLIQUE DE CETTE LISTE, et c'est pour ça qu'elle
   * est nommée à part. Les onze au-dessus sont des données de l'ESPACE ; le
   * registre des entreprises n'appartient à personne et se lit sans rien
   * connecter. Le champ « À partir de » doit quand même le DIRE : une commande
   * qui interroge le registre lit quelque chose, et `[]` prétendrait le
   * contraire.
   *
   * ⚠️ AJOUTÉE EN FIN DE LISTE (GA-08) : l'ordre est celui de l'affichage.
   */
  'registry',
  // #2392 — les TÂCHES de la personne (la clôture de fin de journée les lit).
  // ⚠️ AJOUTÉE EN FIN DE LISTE (GA-08) : l'ordre est celui de l'affichage.
  'tasks',
] as const
type CommandDataSource = (typeof COMMAND_DATA_SOURCES)[number]

/**
 * Ce que LIT chaque outil du copilote appelé par le catalogue — d'après la
 * description de l'outil dans `apps/ia/app/services/chat_tools.py`.
 *
 * La donnée d'une commande se DÉRIVE de ses outils ({@link commandReads}) au
 * lieu d'être recopiée sur chaque commande : le jour où une commande change
 * d'outil, sa donnée suit. Une liste vide est une déclaration (« ne lit aucune
 * donnée de l'espace »), pas un oubli : `find_accounts` prépare des critères,
 * et la recherche part de Découvrir après le clic.
 *
 * ⚠️ #2470 — `find_accounts` GARDE sa liste vide, et son voisin
 * `run_account_search` ne l'a pas : le second EXÉCUTE le tour d'horizon dans la
 * conversation, donc il lit le registre et il le DIT. Deux outils, deux gestes,
 * deux lignes — pas un outil qui lit ou ne lit pas selon un drapeau.
 */
export const COMMAND_TOOL_READS: Readonly<Record<string, readonly CommandDataSource[]>> = {
  search_mailbox: ['mail_threads'],
  prepare_mail_draft: ['mail_threads'],
  prepare_day_brief: ['meetings'],
  find_free_slots: ['meetings'],
  get_daily_briefing: ['meetings', 'mail_threads', 'accounts'],
  list_accounts_to_act: ['accounts'],
  get_account_briefing: ['account_dossiers'],
  compare_accounts: ['account_dossiers'],
  // #3246 — compare le compte à des cas gagnés/perdus déjà au dossier : même
  // donnée que les deux lignes au-dessus, pas une source de plus.
  find_similar_cases: ['account_dossiers'],
  find_accounts: [],
  run_account_search: ['registry'],
  find_needs: ['needs'],
  search_talents: ['bench'],
  list_reactivation_pool: ['bench'],
  run_matching: ['bench', 'needs'],
  search_missions: ['missions'],
  get_mission_risks: ['missions', 'timesheets'],
  get_timesheets: ['timesheets'],
  get_invoice_blockers: ['missions', 'timesheets'],
  search_rfps: ['tenders'],
  search_proofs: ['references'],
  get_interventions: ['interventions'],
  // #2392 — la clôture lit les tâches et les fils sortants sans réponse.
  compile_day_closure: ['tasks', 'mail_threads'],
}

/**
 * #1913.11 — les données qu'une commande lit, dans l'ordre de ses outils.
 *
 * `null` dès qu'UN outil n'est pas déclaré : la donnée est alors INCONNUE, et
 * l'écran tait le champ plutôt que d'afficher une liste partielle comme si
 * elle était complète.
 */
export function commandReads(command: Pick<CommandDefinition, 'tools'>): CommandDataSource[] | null {
  const reads: CommandDataSource[] = []
  for (const tool of command.tools) {
    const declared = COMMAND_TOOL_READS[tool]
    if (declared === undefined) return null
    for (const source of declared) if (!reads.includes(source)) reads.push(source)
  }
  return reads
}

/**
 * #1913.11 — ce qu'une commande COÛTE : une ligne de la grille, jamais un
 * littéral.
 *
 * Une commande pré-remplit une question ; l'envoyer, c'est UN message à Laura.
 * Aucun outil du catalogue ne propose de geste payant — une garde du catalogue
 * serveur (`command-catalog.spec.ts`) le vérifie en lisant le dispatcher. Le
 * jour où une commande en appellerait un, c'est cette garde qui tombe, et
 * l'annonce « inclus » ne pourra plus mentir en silence.
 */
export const COMMAND_BILLED_ACTION: CreditedAction = 'copilot_message'

/**
 * L'état d'une commande pour un utilisateur donné.
 *
 * `degraded` existe parce que « partiellement disponible » est le cas le plus
 * fréquent et le plus mal rendu ailleurs : une commande qui lit l'agenda ET la
 * messagerie reste utile quand une seule des deux répond. La refuser en bloc
 * priverait l'utilisateur de ce qui marche.
 */
export const COMMAND_STATES = ['ready', 'degraded', 'unavailable'] as const
export const commandStateSchema = z.enum(COMMAND_STATES)
export type CommandState = z.infer<typeof commandStateSchema>

export interface CommandAvailability {
  state: CommandState
  /** Les familles exigées qui ne sont pas connectées ici. Jamais devinées. */
  missing: ToolFamily[]
}

/**
 * Ce qu'une commande peut faire, ici et maintenant.
 *
 * `connected` est la liste des familles RÉELLEMENT opérationnelles, telle que
 * le registre d'outils la calcule. On ne raisonne pas sur « une connexion
 * existe » mais sur « elle fonctionne » : un jeton expiré est une connexion qui
 * existe et qui ne répond pas.
 */
export function commandAvailability(command: CommandDefinition, connected: readonly ToolFamily[]): CommandAvailability {
  const missing = command.requires.filter(family => !connected.includes(family))
  if (missing.length === 0) return { state: 'ready', missing: [] }
  // Tout manque ⇒ indisponible. Une partie manque ⇒ dégradé : ce qui reste
  // lisible se lit quand même, et l'écran dit ce qui manquera dans la réponse.
  if (missing.length === command.requires.length) return { state: 'unavailable', missing }
  return { state: 'degraded', missing }
}

/**
 * Les problèmes de forme d'un catalogue, avant qu'il ne serve.
 *
 * Une commande dont l'outil n'existe pas est le défaut le plus coûteux ici :
 * l'écran la propose, le modèle appelle un outil inconnu, et l'utilisateur
 * reçoit « je n'ai pas pu ». Il se voit à la lecture du catalogue, pas à
 * l'usage — d'où cette fonction, appelée par un test.
 */
export function commandLibraryProblems(
  commands: readonly CommandDefinition[],
  knownTools: readonly string[],
): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const command of commands) {
    if (seen.has(command.key)) problems.push(`Commande en double : ${command.key}`)
    seen.add(command.key)
    for (const tool of command.tools) {
      if (!knownTools.includes(tool)) problems.push(`${command.key} appelle un outil inconnu : ${tool}`)
    }
  }
  return problems
}
