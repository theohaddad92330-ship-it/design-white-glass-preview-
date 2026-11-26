import type { RunTrace } from '@bellum/contracts'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'

/**
 * QUI A DÉCLENCHÉ, QUI A VALIDÉ, DEPUIS QUEL OBJET — la règle (#1498).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT VRAIMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * *« Chaque action importante doit permettre de comprendre : qui l'a déclenchée,
 * qui l'a validée, depuis quel objet, via quel outil, quel résultat a réellement
 * été confirmé. »*
 *
 * Les cinq réponses étaient DÉJÀ en base — `workflow_runs.user_id` et
 * `.trigger`, `action_approvals.decided_by` et `.decided_at`, `.account_id`, et
 * l'issue de chaque pas. Aucune n'arrivait jusqu'à l'écran, parce que la vue des
 * runs rendait l'entité telle quelle et que l'entité ne porte que des
 * identifiants. Ce n'est pas une donnée qui manquait, c'est un CHEMIN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EST SÉPARÉ DU CONTRÔLEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce qui est ici est une DÉCISION — quel nom va sur quelle ligne, et ce qui
 * reste inconnu. Enfouie dans une méthode privée de contrôleur, elle ne se teste
 * qu'en montant tout Nest ; donc elle ne se teste pas, donc elle dérive. Le
 * contrôleur garde les lectures, qui n'ont pas de règle.
 */

/**
 * `prénom nom` trimmé, sinon la partie locale de l'e-mail, sinon `null`.
 *
 * Exportée pour #2200/#2201 ACT2 (`crm.controller.ts`) : le nom d'un
 * propriétaire se calcule UNE fois, pas une deuxième façon qui diverge.
 */
export function personDisplayName(profile: ProfileEntity): string | null {
  const full = [profile.first_name, profile.last_name]
    .filter(part => part && part.trim())
    .join(' ')
    .trim()
  if (full) return full
  return profile.email?.split('@')[0] || null
}

/**
 * La trace d'un run dont on ne sait dire que le déclencheur.
 *
 * ⚠️ Ce n'est PAS un objet vide : `trigger` vient du run lui-même et il est
 * toujours vrai. Le reste est `null` parce qu'il n'a pas pu être lu, et l'écran
 * écrira « déclenchée automatiquement » plutôt qu'un nom inventé.
 */
export function emptyTrace(trigger: string): RunTrace {
  return { trigger, triggeredByName: null, approvedByName: null, approvedAt: null, accountName: null }
}

type TraceInput = {
  runs: readonly WorkflowRunEntity[]
  /** Les approbations DÉCIDÉES, triées de la plus récente à la plus ancienne. */
  approvals: readonly ApprovalRequestEntity[]
  profiles: readonly ProfileEntity[]
  accounts: readonly AccountEntity[]
}

/**
 * Construit la trace de chaque run.
 *
 * ⚠️ **Ce qui n'est pas lisible reste `null`.** Un profil effacé au titre du
 * droit à l'oubli, un compte supprimé, une routine sans utilisateur : la trace
 * écrit ce qu'elle sait. Un nom de remplissage sur une page de traçabilité
 * serait pire que l'absence — c'est précisément la ligne qu'on rouvrira le jour
 * où quelqu'un demandera qui a autorisé quoi.
 *
 * ⚠️ `approvedByName: null` ne veut PAS dire « personne n'a validé ». Un pas
 * auto-approuvé n'a jamais demandé de décision : il n'a pas d'approbation, donc
 * pas de nom, et l'écran n'écrit simplement rien plutôt que d'inventer un
 * validateur.
 */
export function buildRunTraces({ runs, approvals, profiles, accounts }: TraceInput): Map<string, RunTrace> {
  const nameOf = new Map(profiles.map(profile => [profile.user_id, personDisplayName(profile)]))
  const companyOf = new Map(accounts.map(account => [account.id, (account.company_name ?? null) as string | null]))

  // La PREMIÈRE décision rencontrée est la plus récente — l'appelant trie par
  // `decided_at DESC`. Un run réapprouvé après un rejet porte donc la décision
  // qui a compté, pas la première qu'on a croisée.
  const approvalOf = new Map<string, ApprovalRequestEntity>()
  for (const approval of approvals) if (!approvalOf.has(approval.run_id)) approvalOf.set(approval.run_id, approval)

  const traces = new Map<string, RunTrace>()
  for (const run of runs) {
    const approval = approvalOf.get(run.id)
    traces.set(run.id, {
      trigger: run.trigger,
      triggeredByName: nameOf.get(run.user_id) ?? null,
      approvedByName: approval?.decided_by ? (nameOf.get(approval.decided_by) ?? null) : null,
      approvedAt: approval?.decided_at ? approval.decided_at.toISOString() : null,
      accountName: run.account_id ? (companyOf.get(run.account_id) ?? null) : null,
    })
  }
  return traces
}
