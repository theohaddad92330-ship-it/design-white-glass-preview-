'use client'

import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DataTable, type DataTableColumn } from '@/ui'
import { readFilterFromSearch } from '@/ui/FilterBar.logic'
import { EmailEnClair } from '@/app/_components/email-en-clair'
import { jourEtHeurePrecise } from '@/lib/dates'
import type { QueueJob, QueueJobState } from '@/lib/queues'
import { confirmationDeSuppression, estUneAdresse } from '../queues.logic'
import { ActionButton } from './action-button'
import { AGE_BUCKET_KEYS, filtrerParAnciennete } from './job-age-filter.logic'
import styles from '../queues.module.css'

/**
 * LE TABLEAU DES JOBS D'UNE FILE (#1662) — l'affichage refait au design system,
 * la logique inchangée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN COMPOSANT CLIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `DataTable` (#1642) porte le tri, l'en-tête collant, la densité et le
 * zébrage — mais ses colonnes sont des FONCTIONS (`render`, `sortValue`), et
 * une fonction ne traverse pas la frontière serveur → client. La page reste
 * donc un Server Component (le secret interne ne bouge pas) et lui passe des
 * données sérialisables ; le tableau est client, comme `ClientsTable` sur
 * `/revenus/clients`.
 *
 * Les LIBELLÉS viennent en props : la page seule connaît la langue de
 * l'opérateur (`getLang()` lit un cookie, ce qu'un composant client ne fait
 * pas). C'est la convention déjà tenue par `ActionButton`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUI N'EST PAS RENDU, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * · La charge utile n'est JAMAIS rendue brute. Elle arrive déjà filtrée par la
 *   liste blanche stricte de l'API (`SAFE_DATA_KEYS`) — ni `profileData`, ni
 *   `userContext`, ni `otpCode`, ni `resetUrl` n'en sortent — et l'écran la
 *   rend paire par paire, jamais en bloc.
 * · Les ADRESSES de cette charge utile passent par `<EmailEnClair>` : masquées
 *   par défaut, révélées au clic, et le clic est journalisé (#1670.4). Le
 *   mailer en porte une (`to`). L'arbitrage D46 côté API — l'adresse voyage
 *   entière parce qu'elle est le seul moyen de rapprocher un job d'un envoi —
 *   tient toujours : l'API transmet, l'écran masque, l'opérateur révèle.
 * · ⚠️ PAS de `<a>` autour d'un `<EmailEnClair>` : le lien avalerait le clic de
 *   révélation, et un bouton dans un lien est du HTML invalide (mesuré en
 *   production le 06/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1672.7 — `status='error'` de `DataTable`, ATTEINT pour de vrai
 * ─────────────────────────────────────────────────────────────────────────────
 * `resolveTableState` (`DataTable.logic.ts`) sait rendre un état d'erreur
 * depuis #1672.6 (les cinq états) — mais jusqu'ici aucun appelant ne posait
 * `status='error'` : du code juste, jamais exécuté. `page.tsx` capture
 * désormais une panne de `fetchQueueJobs` (indépendante de `fetchQueues`, qui
 * a sa propre page d'erreur) et la passe ici en `error` : ce composant la
 * traduit en `status='error'` + `onRetry` (un `router.refresh()`, la
 * convention déjà tenue par `ActionButton`/`LangToggle`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1672.4 — PAGINATION SERVEUR, désormais dans `DataTable`
 * ─────────────────────────────────────────────────────────────────────────────
 * `page.tsx` gardait sa PROPRE pagination (des `<a href>` construits à la
 * main) à côté de `DataTable` — exactement le défaut mesuré. Elle vit
 * maintenant DANS `DataTable` (props `page`/`pageSize`/`total`/
 * `onPageChange`) ; `onPageChange` ici pousse une navigation CLIENT
 * (`router.push`) qui ne touche que `offset` dans l'URL courante — `queue` et
 * `state` restent ceux déjà présents dans les paramètres de recherche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1673.3 — LE FILTRE « ANCIENNETÉ », lu ici, écrit par `<QueueAgeFilter>`
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux composants ne se parlent PAS par prop : ils lisent tous les deux
 * la clé `age` de `useSearchParams()`, l'URL restant la seule source de
 * vérité (#1673.2). `now` vient du SERVEUR (`page.tsx`, un seul `Date.now()`
 * par requête) — jamais lu ici, pour la même raison que `ClientsTable` :
 * un composant client qui lirait l'horloge classerait un job différemment
 * au rendu serveur et à l'hydratation.
 */
export function JobsTable({
  queue,
  state,
  jobs,
  error,
  total,
  offset,
  limit,
  langue,
  now,
  libelles,
}: {
  queue: string
  state: QueueJobState
  jobs: readonly QueueJob[]
  /** #1672.7 — non nul = la requête a échoué ; `jobs` est alors vide. */
  error?: string | null
  /** #1672.4 — compte total côté serveur (au-delà de `jobs`, la page chargée).
   *  ABSENT quand la lecture a échoué : « non compté » n'est pas « zéro » (GA-19). */
  total?: number
  offset: number
  limit: number
  langue: 'fr' | 'en'
  /** #1673.3 — l'ancre de temps du filtre « ancienneté », calculée UNE fois
   *  côté serveur (voir l'en-tête de section ci-dessus). */
  now: number
  libelles: {
    pagerPrevious: string
    pagerNext: string
    pagerRange: string
    colJob: string
    colData: string
    colAttempts: string
    colCreated: string
    colFinished: string
    colFailure: string
    actions: string
    retry: string
    retryConfirm: string
    remove: string
    working: string
    failureReasonNone: string
    noJobs: string
  }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // #1673.3 — la même clé `age` que `<QueueAgeFilter>` écrit ; l'URL est la
  // seule chose que les deux composants partagent.
  const ageFiltre = readFilterFromSearch(searchParams.toString(), 'age', AGE_BUCKET_KEYS, 'tous')
  const jobsAffiches = useMemo(() => filtrerParAnciennete(jobs, ageFiltre, now), [jobs, ageFiltre, now])
  const colonnes = useMemo<DataTableColumn<QueueJob>[]>(() => {
    const base: DataTableColumn<QueueJob>[] = [
      {
        key: 'job',
        header: libelles.colJob,
        sortValue: job => job.id,
        render: job => (
          <div className={styles['cellulePrincipale']}>
            <span className={styles['identifiant']}>{job.id ?? '—'}</span>
            <span className={styles['secondaire']}>{job.name}</span>
          </div>
        ),
      },
      {
        key: 'data',
        header: libelles.colData,
        render: job => <ChargeUtile data={job.data} queue={queue} />,
      },
      {
        key: 'attempts',
        header: libelles.colAttempts,
        align: 'right',
        // Un nombre de tentatives est un COMPTEUR : zéro y est une vraie
        // mesure (« jamais tenté »), il ne se masque pas.
        sortValue: job => job.attemptsMade,
        render: job => job.attemptsMade,
      },
      {
        key: 'created',
        header: libelles.colCreated,
        sortValue: job => job.timestamp,
        render: job => <span className={styles['secondaire']}>{jourEtHeurePrecise(job.timestamp)}</span>,
      },
      {
        key: 'finished',
        header: libelles.colFinished,
        sortValue: job => job.finishedOn,
        render: job => <span className={styles['secondaire']}>{jourEtHeurePrecise(job.finishedOn)}</span>,
      },
    ]

    // La colonne d'échec n'existe que dans l'état `failed` — ailleurs, elle
    // n'aurait qu'un tiret à montrer, sur toute la hauteur du tableau.
    if (state === 'failed') {
      base.push({
        key: 'failure',
        header: libelles.colFailure,
        render: job => (
          <div className={styles['echec']}>
            <span className={styles['echecRaison']}>{job.failedReason ?? libelles.failureReasonNone}</span>
            {job.stackTail ? <span className={styles['echecPile']}>{job.stackTail}</span> : null}
          </div>
        ),
      })
    }

    base.push({
      key: 'actions',
      header: libelles.actions,
      render: job => {
        // Sans identifiant, aucune mutation ne peut viser ce job : on ne
        // propose pas un bouton qui ne partirait nulle part.
        if (!job.id) return <span className={styles['secondaire']}>—</span>
        const racine = `/api/admin/queues/${encodeURIComponent(queue)}/jobs/${encodeURIComponent(job.id)}`
        return (
          <span className={styles['actions']}>
            {state === 'failed' ? (
              <ActionButton
                endpoint={`${racine}/retry`}
                label={libelles.retry}
                confirmText={libelles.retryConfirm}
                workingText={libelles.working}
              />
            ) : null}
            {/* ⚠️ La confirmation NOMME la conséquence : quel job, quelle file,
                ce qui est perdu, et que rien ne le rattrape. « Êtes-vous
                sûr ? » ne disait aucun de ces quatre faits. */}
            <ActionButton
              endpoint={`${racine}/remove`}
              label={libelles.remove}
              confirmText={confirmationDeSuppression({ file: queue, job }, langue)}
              workingText={libelles.working}
              tone="muted"
            />
          </span>
        )
      },
    })

    return base
  }, [queue, state, langue, libelles])

  // #1672.4 — demande la page N : ne touche QUE `offset` dans l'URL courante,
  // `queue`/`state` restent ceux déjà posés par les liens de la page.
  function allerPage(nouvellePage: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('offset', String((nouvellePage - 1) * limit))
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <DataTable
      rows={jobsAffiches}
      columns={colonnes}
      rowKey={job => job.id ?? `${job.name}-${job.timestamp ?? 'sans-instant'}`}
      maxHeight="62vh"
      emptyMessage={libelles.noJobs}
      // #1672.7 — une panne de `fetchQueueJobs` emprunte cet état plutôt que
      // de faire planter la page ; `router.refresh()` est la convention déjà
      // tenue par `ActionButton`/`LangToggle` pour « recharger sans perdre
      // l'URL ».
      status={error ? 'error' : 'ready'}
      errorMessage={error ?? undefined}
      onRetry={() => router.refresh()}
      // #1672.4 — pagination serveur, portée par `DataTable` lui-même.
      page={Math.floor(offset / limit) + 1}
      pageSize={limit}
      total={total}
      onPageChange={allerPage}
      // #1672.4 — sans ces libellés, le pagineur rendrait « ← Précédent » sur un
      // écran affiché en anglais : `/queues` est le seul écran BILINGUE qui
      // utilise `DataTable`, et son ancien pagineur maison n'avait aucun mot.
      pagerLabels={{
        previous: libelles.pagerPrevious,
        next: libelles.pagerNext,
        range: (debut, fin, compte) => `${debut}–${fin} ${libelles.pagerRange} ${compte}`,
      }}
    />
  )
}

/**
 * La charge utile d'un job, paire par paire.
 *
 * Elle arrive déjà réduite par la liste blanche de l'API ; ce composant ne
 * fait que la RENDRE — et il masque ce qui, dedans, est une adresse.
 */
function ChargeUtile({ data, queue }: { data: Record<string, string>; queue: string }) {
  const paires = Object.entries(data)
  if (paires.length === 0) return <span className={styles['secondaire']}>—</span>
  return (
    <span className={styles['donnees']}>
      {paires.map(([cle, valeur]) => (
        <span key={cle} className={styles['donnee']}>
          <span className={styles['donneeCle']}>{cle}</span>
          {estUneAdresse(cle) ? (
            <EmailEnClair email={valeur} />
          ) : (
            <span className={styles['donneeValeur']}>{valeur}</span>
          )}
        </span>
      ))}
    </span>
  )
}
