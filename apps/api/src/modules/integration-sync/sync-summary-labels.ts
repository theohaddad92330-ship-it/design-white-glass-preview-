import type { SyncSummaryDomain, SyncSummaryLine } from '@bellum/contracts'

/**
 * Le vocabulaire du résumé post-synchronisation (#2207.26 à #2207.32) —
 * choisi UNE fois, ici, jamais recomposé par l'écran (`SyncSummary.tsx` ne
 * connaît aucun domaine, voir son docblock).
 *
 * Chaque fonction rend `null` quand `count` est nul : la doctrine « on
 * n'affiche pas ce qu'on n'a pas » interdit de construire une ligne à zéro,
 * et le seul endroit sûr pour l'appliquer est celui qui a le compte SOUS LA
 * MAIN — un appelant qui filtrerait après coup pourrait l'oublier une fois.
 *
 * Une fonction par domaine, ajoutée avec son APPELANT dans `IntegrationSyncService.summarize`
 * — jamais avant : « du code juste, calculé, testé, que personne n'appelle »
 * est exactement le défaut que ce dépôt se répète de ne pas refaire.
 */
function line(domain: SyncSummaryDomain, count: number, fr: string, en: string): SyncSummaryLine | null {
  if (count <= 0) return null
  return { domain, count, label: { fr, en } }
}

/** #2207.26 — les comptes touchés par cette synchronisation. */
export function accountsSummaryLine(count: number): SyncSummaryLine | null {
  return line(
    'accounts',
    count,
    count === 1 ? '1 compte mis à jour' : `${count} comptes mis à jour`,
    count === 1 ? '1 account updated' : `${count} accounts updated`,
  )
}

/** #2207.27 — les contacts retrouvés ou confirmés présents chez le fournisseur. */
export function contactsSummaryLine(count: number): SyncSummaryLine | null {
  return line(
    'contacts',
    count,
    count === 1 ? '1 contact retrouvé' : `${count} contacts retrouvés`,
    count === 1 ? '1 contact found' : `${count} contacts found`,
  )
}

/** #2207.28 — les rendez-vous retrouvés (`activities.kind = 'meeting'`). */
export function meetingsSummaryLine(count: number): SyncSummaryLine | null {
  return line(
    'meetings',
    count,
    count === 1 ? '1 rendez-vous retrouvé' : `${count} rendez-vous retrouvés`,
    count === 1 ? '1 meeting found' : `${count} meetings found`,
  )
}

/** #2207.29 — les échanges retrouvés (e-mails, appels, LinkedIn). */
export function exchangesSummaryLine(count: number): SyncSummaryLine | null {
  return line(
    'exchanges',
    count,
    count === 1 ? '1 échange retrouvé' : `${count} échanges retrouvés`,
    count === 1 ? '1 exchange found' : `${count} exchanges found`,
  )
}

/** #2207.30 — les actions enregistrées (`user_actions`). */
export function actionsSummaryLine(count: number): SyncSummaryLine | null {
  return line(
    'actions',
    count,
    count === 1 ? '1 action enregistrée' : `${count} actions enregistrées`,
    count === 1 ? '1 action logged' : `${count} actions logged`,
  )
}

/**
 * #2207.31 — les AMBIGUÏTÉS, en langage clair pour un lecteur final.
 *
 * Reprend un concept qui n'existait jusqu'ici que côté serveur
 * (`CreateContactFromCrmResult['status'] === 'ambiguous'`, `contacts.service.ts`) :
 * plusieurs fiches qui pourraient être la même personne. Jamais le mot
 * technique (« ambigu », « doublon ») — la phrase nomme le GESTE qui reste à
 * faire, jamais l'algorithme qui l'a trouvé.
 */
export function ambiguitiesSummaryLine(count: number): SyncSummaryLine | null {
  return line(
    'ambiguities',
    count,
    count === 1 ? '1 fiche à confirmer avant de la rapprocher' : `${count} fiches à confirmer avant de les rapprocher`,
    count === 1 ? '1 record to confirm before merging it' : `${count} records to confirm before merging them`,
  )
}

/**
 * #2388.42 — les rendez-vous à VENIR dans les 36 prochaines heures, à
 * préparer. Domaine distinct de {@link meetingsSummaryLine} (rendez-vous
 * RETROUVÉS pendant la fenêtre du run, au passé) : celui-ci regarde devant
 * l'utilisateur, jamais derrière.
 */
export function meetingsToPrepareSummaryLine(count: number): SyncSummaryLine | null {
  return line(
    'meetings_to_prepare',
    count,
    count === 1 ? '1 rendez-vous à préparer' : `${count} rendez-vous à préparer`,
    count === 1 ? '1 meeting to prepare' : `${count} meetings to prepare`,
  )
}

/**
 * #2207.32 — les PAGES ALIMENTÉES, dérivées de `rag_documents`. Jamais le mot
 * « RAG » ni un nom de fournisseur interne à l'écran : ce que Laura a appris
 * à lire pour ce compte, en pages.
 */
export function pagesSummaryLine(count: number): SyncSummaryLine | null {
  return line(
    'pages',
    count,
    count === 1 ? '1 page alimentée' : `${count} pages alimentées`,
    count === 1 ? '1 page indexed for Laura' : `${count} pages indexed for Laura`,
  )
}
