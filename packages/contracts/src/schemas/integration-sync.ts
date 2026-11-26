import { z } from 'zod'
import { localizedTextSchema } from './tool-registry.js'

/**
 * #3014 — l'amorçage de la première synchronisation (`/integrations`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE CONTRAT, ET PAS UN CHAMP DE PLUS SUR `ConnectedTool`
 * ─────────────────────────────────────────────────────────────────────────────
 * `ConnectedTool` (`tool-registry.ts`) décrit ce qu'un outil PEUT faire, à tout
 * instant — c'est un état, pas un événement. Une synchronisation est un
 * ÉVÉNEMENT daté, avec un début, une fin, et un résultat qui ne se redemande
 * jamais deux fois de la même façon. Les deux contrats ne se confondent pas :
 * le premier reste la source du périmètre annoncé AVANT de lancer (période,
 * objets, coût), celui-ci porte ce qui s'est PASSÉ pendant le lancement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI COMMANDE `syncSummaryLineSchema` — « ON N'AFFICHE PAS CE QU'ON
 * N'A PAS »
 * ─────────────────────────────────────────────────────────────────────────────
 * `count` est `positive()`, jamais `nonnegative()` : une ligne à zéro n'existe
 * PAS, elle ne s'affiche pas en « 0 » (doctrine, gardes GA-18/GA-19). Un domaine
 * sans résultat ne produit simplement AUCUNE entrée dans `summary` — c'est à
 * l'appelant de ne jamais construire de ligne à zéro, jamais à l'écran de la
 * masquer après coup.
 */

/**
 * Les états d'un run (épopée #2980, tranché sans Louis : les 10 valeurs de
 * #2110 — en attente/lecture des sources/rapprochement entreprises/
 * rapprochement contacts/détection d'événements/préparation du résumé/
 * terminé/partiel/échoué/annulé).
 *
 * `running` reste EN PREMIER et n'est JAMAIS retiré (GA-08 : une énumération
 * ne rétrécit pas, les ajouts vont en fin) — c'est la seule valeur qu'un run
 * lancé avant #2980 a pu écrire. Le job n'écrit plus jamais `running` : un
 * lancement neuf commence à `pending`, puis traverse les états ci-dessous un
 * par un pendant que le worker BullMQ avance réellement.
 */
export const SYNC_RUN_STATUSES = [
  'running',
  'completed',
  'failed',
  'pending',
  'reading_sources',
  'matching_accounts',
  'matching_contacts',
  'detecting_events',
  'preparing_summary',
  'partial',
  'canceled',
] as const
export const syncRunStatusSchema = z.enum(SYNC_RUN_STATUSES)
export type SyncRunStatus = z.infer<typeof syncRunStatusSchema>

/**
 * Les états TERMINAUX — un job qui les atteint ne bouge plus jamais. Tout le
 * reste (y compris l'historique `running`) est un job encore VIVANT : la
 * garde anti-double-lancement (#2110.81) refuse un nouveau départ tant qu'un
 * run non terminal existe pour ce (espace, connecteur).
 *
 * `partial` est un état RÉSERVÉ, non encore produit par aucun chemin de code :
 * le distinguer d'un échec complet demanderait de savoir QUELLE source a
 * échoué pendant qu'une autre réussissait, un signal que `IntegrationSyncService`
 * ne porte pas encore par source. L'inventer serait mentir sur l'origine —
 * la contrainte SQL et cette énumération sont élargies AVANT ce code (GA-11),
 * exactement pour ce cas : le jour où une source échoue seule, rien à
 * modifier ici.
 */
export const SYNC_RUN_TERMINAL_STATUSES = ['completed', 'partial', 'failed', 'canceled'] as const
export function isSyncRunTerminal(status: SyncRunStatus): boolean {
  return (SYNC_RUN_TERMINAL_STATUSES as readonly string[]).includes(status)
}

/**
 * Les sept domaines du résumé post-synchronisation (#2207.26 à #2207.32).
 *
 * `ambiguities` reprend, pour un LECTEUR final, un concept qui n'existait
 * jusqu'ici que côté serveur (`CreateContactFromCrmResult['status'] ===
 * 'ambiguous'`, `contacts.service.ts`) : plusieurs fiches qui pourraient être
 * la même personne. Jamais le mot technique — la ligne nomme le geste qui
 * reste à faire, jamais l'algorithme qui l'a trouvé.
 *
 * `pages` est dérivé de `rag_documents` — jamais nommé « RAG » à l'écran :
 * ce que Laura a appris à lire pour ce compte, en pages.
 *
 * `meetings_to_prepare` (#2388.42) est un domaine DISTINCT de `meetings` :
 * `meetings` compte les rendez-vous RETROUVÉS pendant la fenêtre du run
 * (passé), `meetings_to_prepare` compte ceux qui ARRIVENT dans les 36
 * prochaines heures pour l'utilisateur qui a lancé la synchro — le même
 * horizon que l'alerte d'engagement (`engagement-alerts.service.ts`,
 * `MEETING_HORIZON_MS`). Une lecture agenda live, jamais une estimation :
 * absente de `summary` si l'agenda n'est pas branché ou ne répond pas.
 */
export const SYNC_SUMMARY_DOMAINS = [
  'accounts',
  'contacts',
  'meetings',
  'meetings_to_prepare',
  'exchanges',
  'actions',
  'ambiguities',
  'pages',
] as const
export const syncSummaryDomainSchema = z.enum(SYNC_SUMMARY_DOMAINS)
export type SyncSummaryDomain = z.infer<typeof syncSummaryDomainSchema>

export const syncSummaryLineSchema = z.object({
  domain: syncSummaryDomainSchema,
  /** Jamais zéro (voir le docblock du fichier) : une ligne existe seulement si
   *  elle a quelque chose à dire. */
  count: z.number().int().positive(),
  /** Phrase FR+EN complète, prête à afficher — jamais un gabarit reconstruit
   *  côté client à partir du seul compte : « 3 rendez-vous » ne se dit pas
   *  avec le même vocabulaire que « 3 fiches à confirmer avant de les
   *  rapprocher », et c'est le contrat qui choisit ce vocabulaire une fois,
   *  jamais l'écran qui le recompose. */
  label: localizedTextSchema,
})
export type SyncSummaryLine = z.infer<typeof syncSummaryLineSchema>

export const integrationSyncRunSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  status: syncRunStatusSchema,
  started_at: z.string().datetime(),
  finished_at: z.string().datetime().nullable(),
  /** `null` tant que le run n'est pas `completed` — jamais un tableau vide
   *  qui se confondrait avec « terminé, et rien trouvé sur aucun domaine ». */
  summary: z.array(syncSummaryLineSchema).nullable(),
  /** Motif d'échec FR+EN, `null` hors `status: 'failed'`. Jamais un texte
   *  technique — l'erreur claire que la doctrine exige. */
  error: localizedTextSchema.nullable(),
})
export type IntegrationSyncRun = z.infer<typeof integrationSyncRunSchema>

/** `POST /tools/:provider/sync-runs` — le geste qui déclenche (#2207.19). */
export const startSyncRunResponseSchema = integrationSyncRunSchema
export type StartSyncRunResponse = IntegrationSyncRun

/**
 * #2110.47 à .53 — la restitution à 5 blocs (« ce que j'ai retrouvé / rapproché
 * / pas compris / ce que ça change / ce que je conseille »), au-dessus du
 * résumé plat existant. Le groupement d'un domaine dans un bloc est une
 * métadonnée STATIQUE (`SYNC_SUMMARY_DOMAIN_BLOCK`) — le vocabulaire de
 * chaque LIGNE reste choisi une seule fois côté serveur
 * (`sync-summary-labels.ts`), cette fonction RANGE des lignes déjà écrites,
 * elle n'en recompose jamais le texte (même règle que le docblock de
 * `SyncSummary.tsx` : l'écran ne connaît toujours aucun domaine).
 *
 * ⚠️ `confiance` par résultat (le second volet de #2110.47) RESTE hors
 * périmètre, nommé plutôt que deviné : aucun `COUNT` SQL agrégé ne porte de
 * signal de confiance par ligne à ce jour — l'inventer violerait « jamais de
 * donnée fictive » (voir le commentaire de #2980 du 25/09/2026). `source` et
 * `périmètre` sont déjà portés par la provenance de chaque compte/contact
 * (#2110.42-.46, `déjà là`), pas par ce résumé agrégé.
 */
export const SYNC_SUMMARY_BLOCKS = ['found', 'matched', 'unclear', 'impact', 'advice'] as const
export const syncSummaryBlockSchema = z.enum(SYNC_SUMMARY_BLOCKS)
export type SyncSummaryBlock = z.infer<typeof syncSummaryBlockSchema>

/** Un domaine appartient à UN SEUL bloc, jamais `advice` — réservé aux
 *  recommandations DÉRIVÉES (voir `groupSyncSummaryByBlock`), qui ne sont pas
 *  un domaine du résumé. */
export const SYNC_SUMMARY_DOMAIN_BLOCK: Record<SyncSummaryDomain, Exclude<SyncSummaryBlock, 'advice'>> = {
  meetings: 'found',
  exchanges: 'found',
  pages: 'found',
  accounts: 'matched',
  contacts: 'matched',
  ambiguities: 'unclear',
  actions: 'impact',
  meetings_to_prepare: 'impact',
}

export interface SyncSummaryBlockGroup {
  block: SyncSummaryBlock
  lines: readonly SyncSummaryLine[]
}

const SYNC_SUMMARY_DOMAIN_BLOCK_ORDER = ['found', 'matched', 'unclear', 'impact'] as const

/**
 * Range les lignes déjà écrites dans leurs 5 blocs, dans un ORDRE fixe — un
 * bloc sans ligne n'apparaît PAS (« on n'affiche pas ce qu'on n'a pas »).
 * Pure, sans i/o : `SyncSummary.tsx` l'appelle directement.
 */
export function groupSyncSummaryByBlock(lines: readonly SyncSummaryLine[]): SyncSummaryBlockGroup[] {
  const byBlock = new Map<(typeof SYNC_SUMMARY_DOMAIN_BLOCK_ORDER)[number], SyncSummaryLine[]>()
  for (const line of lines) {
    const block = SYNC_SUMMARY_DOMAIN_BLOCK[line.domain]
    const existing = byBlock.get(block)
    if (existing) existing.push(line)
    else byBlock.set(block, [line])
  }
  const groups: SyncSummaryBlockGroup[] = SYNC_SUMMARY_DOMAIN_BLOCK_ORDER.map(block => ({
    block,
    lines: byBlock.get(block) ?? [],
  })).filter(group => group.lines.length > 0)
  const advice = adviceLinesFor(lines)
  if (advice.length > 0) groups.push({ block: 'advice', lines: advice })
  return groups
}

/**
 * Les recommandations du bloc « ce que je conseille » — jamais un contenu
 * inventé : chaque phrase REPREND le compte déjà écrit ailleurs dans le même
 * résumé (`ambiguities`, `meetings_to_prepare`), elle ne calcule ni ne lit
 * rien de neuf. Limité aux deux domaines qui appellent un GESTE concret —
 * `accounts`/`contacts`/`pages` sont des faits, pas des invites à agir.
 */
function adviceLinesFor(lines: readonly SyncSummaryLine[]): SyncSummaryLine[] {
  const advice: SyncSummaryLine[] = []
  const ambiguities = lines.find(l => l.domain === 'ambiguities')
  if (ambiguities) {
    advice.push({
      domain: 'ambiguities',
      count: ambiguities.count,
      label: {
        fr:
          ambiguities.count === 1
            ? 'Confirmer la fiche en attente avant de la rapprocher.'
            : `Confirmer les ${ambiguities.count} fiches en attente avant de les rapprocher.`,
        en:
          ambiguities.count === 1
            ? 'Confirm the pending record before merging it.'
            : `Confirm the ${ambiguities.count} pending records before merging them.`,
      },
    })
  }
  const meetingsToPrepare = lines.find(l => l.domain === 'meetings_to_prepare')
  if (meetingsToPrepare) {
    advice.push({
      domain: 'meetings_to_prepare',
      count: meetingsToPrepare.count,
      label: {
        fr:
          meetingsToPrepare.count === 1
            ? 'Préparer le rendez-vous à venir.'
            : `Préparer les ${meetingsToPrepare.count} rendez-vous à venir.`,
        en:
          meetingsToPrepare.count === 1
            ? 'Prepare the upcoming meeting.'
            : `Prepare the ${meetingsToPrepare.count} upcoming meetings.`,
      },
    })
  }
  return advice
}
