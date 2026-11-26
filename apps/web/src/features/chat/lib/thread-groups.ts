import type { AgentChatHistoryItem } from '@/features/chat/api/agentChatApi'
import { startOfDay, startOfWeek } from '@/features/agenda/agenda-view'

/**
 * #1911.7 à #1911.10 — ranger les fils de Laura par date OU par compte.
 *
 * Décision de Louis du 13/09/2026 (batch 11), qui défait la liste plate écrite
 * le 30/08 dans `ConversationsPanel.tsx`. Ce fichier est le CALCUL, sans React :
 * ce que l'écran affirme en posant un intercalaire (« tu lui as parlé
 * aujourd'hui », « ce fil parle de LATECOERE ») se décide ici, et se teste aux
 * bornes dans `thread-groups.test.ts`.
 *
 * Deux règles qui ne se voient pas à l'écran, et qui sont les endroits où l'on
 * se trompe :
 *
 *  - **Le fuseau est celui du NAVIGATEUR**, et la semaine commence le LUNDI —
 *    exactement comme l'agenda, dont on reprend les deux bornes au lieu de les
 *    réécrire (une dérivation vit à un seul endroit). Un commercial en
 *    déplacement range ses fils dans SA journée, pas dans celle de Paris.
 *  - **Aucun groupe n'invente.** Une date illisible n'est pas « plus ancienne »
 *    (on ne sait pas), elle a son groupe. Un compte dont le nom est illisible
 *    n'est ni « sans compte » (il en a un) ni affiché par son identifiant : il
 *    va dans « compte introuvable ».
 *
 * L'ORDRE des fils n'est jamais recalculé ici : l'API les sert déjà du plus
 * récemment actif au plus ancien (`chat-messages.service.ts`, `listHistory`),
 * et chaque groupe garde cet ordre. Recalculer un tri côté écran ferait deux
 * classements qui divergent au premier cas limite.
 */

type DateBucket = 'today' | 'thisWeek' | 'older' | 'undated'

/** L'ordre d'affichage des intercalaires de date. */
const DATE_BUCKET_ORDER: readonly DateBucket[] = ['today', 'thisWeek', 'older', 'undated']

/**
 * Un groupe de fils, prêt à rendre.
 *
 * `label` ne porte QUE ce qui vient des données — le nom d'un compte. Les
 * libellés fixes (« Aujourd'hui », « Sans compte »…) sont traduits par l'écran
 * à partir de `kind` / `key` : un libellé d'affichage écrit dans un calcul
 * serait français pour toujours.
 */
export type ThreadGroup = {
  kind: 'date' | 'account' | 'unknownAccount' | 'noAccount'
  /** Unique dans la liste : clé React et ancre du nom accessible du groupe. */
  key: string
  label: string | null
  threads: AgentChatHistoryItem[]
}

/** La date qui range un fil : sa dernière activité, sinon son ouverture. */
export function activityIsoOf(thread: AgentChatHistoryItem): string | null {
  return thread.last_message_at ?? thread.created_at ?? null
}

/**
 * Dans quel intercalaire tombe un instant, vu depuis `now`, dans le fuseau du
 * navigateur.
 *
 * Bornes : minuit local ouvre « aujourd'hui » (inclus) ; le lundi à minuit
 * ouvre « cette semaine » (inclus). Une activité postérieure à `now` (horloge
 * du poste en retard sur le serveur) reste « aujourd'hui » — elle n'est pas
 * d'hier.
 */
export function dateBucketOf(iso: string | null | undefined, now: Date): DateBucket {
  if (!iso) return 'undated'
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return 'undated'
  if (at >= startOfDay(now).getTime()) return 'today'
  if (at >= startOfWeek(now).getTime()) return 'thisWeek'
  return 'older'
}

/** #1911.7 / #1911.8 / #1911.9 — les intercalaires de date. Un groupe vide n'existe pas. */
export function groupThreadsByDate(threads: readonly AgentChatHistoryItem[], now: Date): ThreadGroup[] {
  const buckets = new Map<DateBucket, AgentChatHistoryItem[]>()
  for (const thread of threads) {
    const bucket = dateBucketOf(activityIsoOf(thread), now)
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), thread])
  }
  return DATE_BUCKET_ORDER.flatMap(bucket => {
    const inBucket = buckets.get(bucket)
    return inBucket ? [{ kind: 'date' as const, key: bucket, label: null, threads: inBucket }] : []
  })
}

/** Un nom lisible, ou rien : un nom blanc n'en est pas un. */
function readableName(value: string | null | undefined): string | null {
  const name = value?.trim()
  return name ? name : null
}

/**
 * #1911.10 — un groupe par compte.
 *
 * Le nom vient de l'API (`account_name`, lu dans l'espace) ; à défaut, des
 * comptes que l'écran connaît déjà (`knownNames`) — la fenêtre de déploiement où
 * le front est neuf et l'API ancienne. Le groupe se fait sur l'IDENTIFIANT du
 * compte, jamais sur son nom : deux fiches homonymes restent deux groupes.
 *
 * Ordre : les comptes nommés dans l'ordre de leur fil le plus récent, puis
 * « compte introuvable » (UN seul groupe, quel que soit le nombre de comptes
 * concernés — deux intercalaires au même libellé ne se distinguent pas), puis
 * « sans compte », en dernier.
 */
export function groupThreadsByAccount(
  threads: readonly AgentChatHistoryItem[],
  knownNames: ReadonlyMap<string, string | null | undefined> = new Map(),
): ThreadGroup[] {
  const byAccount = new Map<string, AgentChatHistoryItem[]>()
  const withoutAccount: AgentChatHistoryItem[] = []
  for (const thread of threads) {
    if (!thread.account_id) {
      withoutAccount.push(thread)
      continue
    }
    byAccount.set(thread.account_id, [...(byAccount.get(thread.account_id) ?? []), thread])
  }

  const named: ThreadGroup[] = []
  const unnamedIds = new Set<string>()
  for (const [accountId, accountThreads] of byAccount) {
    const name =
      accountThreads.map(thread => readableName(thread.account_name)).find(Boolean) ??
      readableName(knownNames.get(accountId))
    if (name) named.push({ kind: 'account', key: `account:${accountId}`, label: name, threads: accountThreads })
    else unnamedIds.add(accountId)
  }

  // Filtré depuis la liste d'origine : l'ordre servi par l'API survit à la fusion.
  const unknown = threads.filter(thread => thread.account_id && unnamedIds.has(thread.account_id))
  return [
    ...named,
    ...(unknown.length
      ? [{ kind: 'unknownAccount' as const, key: 'unknown-account', label: null, threads: unknown }]
      : []),
    ...(withoutAccount.length
      ? [{ kind: 'noAccount' as const, key: 'no-account', label: null, threads: withoutAccount }]
      : []),
  ]
}
