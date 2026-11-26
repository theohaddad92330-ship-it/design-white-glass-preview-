import { KpiTile } from '@/ui'
import { getLang, makeT, type TKey } from '@/lib/i18n'
import { fetchQueueJobs, fetchQueues, QUEUE_JOB_STATES, type QueueJobState, type QueueSummary } from '@/lib/queues'
import { LangToggle } from '@/app/monitoring/_components/lang-toggle'
import { ActionButton } from './_components/action-button'
import { JobsTable } from './_components/jobs-table'
import { QueueAgeFilter } from './_components/queue-age-filter'
import { compterAgeInconnu, compterParAnciennete, libelleAgeInconnu } from './_components/job-age-filter.logic'
import {
  confirmationDePurge,
  laPlusVieilleAttente,
  libelleAttente,
  tonDeLaFile,
  totauxDesFiles,
  type TonFile,
} from './queues.logic'
import styles from './queues.module.css'

/**
 * LES FILES BULLMQ — l'écran d'incident de l'opérateur (#1662).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE LOT A CHANGÉ, ET CE QU'IL N'A PAS TOUCHÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * TOUTE la logique est restée : mêmes routes (`clean`, `jobs/:id/retry`,
 * `jobs/:id/remove`), même pagination, même liste blanche de champs, même
 * rendu serveur (le secret interne ne quitte pas le serveur). Ce qui a changé
 * est l'AFFICHAGE, passé au design system (#1642 : `KpiTile`, `DataTable`,
 * `EmptyState`), et UNE chose de fond a été ajoutée : l'ancienneté du job le
 * plus vieux par file.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ L'ANCIENNETÉ — ET LES DEUX PHRASES QU'ON NE CONFOND PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Une profondeur ne dit pas depuis quand elle dure : `waiting: 40` ne
 * distingue pas un pic de trois minutes d'un blocage de trois jours, et c'est
 * pourtant la seule question qu'on se pose devant une file qui monte.
 *
 * Mais « aucun job en attente » et « le plus vieux attend depuis 0 minute »
 * sont deux phrases DIFFÉRENTES, et écrire la seconde à la place de la
 * première est exactement ce que ce dépôt interdit. Et Redis injoignable n'est
 * pas non plus une file vide : une panne ne rend pas une file saine, elle rend
 * un état inconnu, qui se dit.
 *
 * L'API porte donc les trois états dans son TYPE (`QueueOldestWaiting` :
 * `vide` | `inconnu` | `mesure`), et l'écran ne peut pas les confondre : la
 * branche « vide » n'a aucun nombre à sa disposition. On retire le MOYEN
 * d'écrire le zéro, pas seulement l'occasion.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST HORS DE CET ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * La règle « un job bloqué depuis plus d'une heure remonte dans la file de
 * décision » n'est PAS implémentée ici. Elle appartient à la file de décision
 * (#1647), qui porte la nature `queue_stuck` et son seuil. Cet écran expose
 * l'ancienneté ; c'est la file de décision qui la qualifie. Deux dérivations
 * du même seuil divergeraient — et c'est la loi « une dérivation vit à un seul
 * endroit ».
 */
export const dynamic = 'force-dynamic'

const PAGE_LIMIT = 50

// Browsable states, failed first (the incident state). Each maps to a numeric
// field on the queue summary so the tab can show its depth.
const STATE_TABS: { value: QueueJobState; key: TKey }[] = [
  { value: 'failed', key: 'stFailed' },
  { value: 'waiting', key: 'stWaiting' },
  { value: 'active', key: 'stActive' },
  { value: 'delayed', key: 'stDelayed' },
  { value: 'completed', key: 'stCompleted' },
]

/** Le mot de l'état d'une file, et la classe qui le colore. La COULEUR ne
 *  porte jamais l'information seule — le mot est toujours là. */
const TON: Record<TonFile, { classe: string; cle: TKey }> = {
  incident: { classe: 'etatIncident', cle: 'tonIncident' },
  attente: { classe: 'etatAttente', cle: 'tonAttente' },
  repos: { classe: 'etatRepos', cle: 'tonRepos' },
}

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

function toState(v: string): QueueJobState {
  return (QUEUE_JOB_STATES as readonly string[]).includes(v) ? (v as QueueJobState) : 'failed'
}

export default async function QueuesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const lang = await getLang()
  const t = makeT(lang)

  const state = toState(first(searchParams.state))
  const offset = Math.max(0, Number.parseInt(first(searchParams.offset), 10) || 0)

  let summaries: QueueSummary[]
  try {
    summaries = await fetchQueues()
  } catch (err) {
    // ⚠️ Une panne ne s'affiche pas comme un écran vide : un tableau vide se
    // lirait « aucune file, tout va bien », qui est le pire mensonge possible.
    return (
      <main className="wrap">
        <h1>{t('queuesTitle')}</h1>
        <p className="subtitle">{t('queuesSubtitle')}</p>
        <div className="error">
          Impossible de joindre l&apos;endpoint admin de l&apos;API.
          <br />
          {err instanceof Error ? err.message : String(err)}
          <br />
          Vérifie <code>API_BASE_URL</code> + <code>INTERNAL_API_SECRET</code>, que l&apos;API tourne et que Redis est
          joignable.
        </div>
      </main>
    )
  }

  const queueNames = summaries.map(s => s.name)
  const requested = first(searchParams.queue)
  const queue = queueNames.includes(requested) ? requested : (queueNames[0] ?? 'analysis')
  const summary = summaries.find(s => s.name === queue)

  // #1672.7 — une panne SPÉCIFIQUE à cette requête (indépendante de
  // `fetchQueues`, déjà traitée plus haut) n'a plus le droit de faire
  // planter toute la page : elle emprunte le `status='error'` de `DataTable`
  // — jusqu'ici du code mort, jamais atteint par aucun appelant réel.
  let jobsPage: Awaited<ReturnType<typeof fetchQueueJobs>> | undefined
  let jobsError: string | null = null
  try {
    jobsPage = await fetchQueueJobs(queue, state, PAGE_LIMIT, offset)
  } catch (err) {
    jobsError = err instanceof Error ? err.message : String(err)
  }

  // #1673.3 — l'ancre de temps du filtre « ancienneté », calculée UNE fois
  // ici (Server Component) et transmise en DONNÉE : ni `JobsTable` ni
  // `QueueAgeFilter` ne lisent l'horloge eux-mêmes (voir `job-age-filter.
  // logic.ts`, l'en-tête sur #418/#423/#425).
  const now = Date.now()
  const ageCounts = jobsPage ? compterParAnciennete(jobsPage.jobs, now) : null
  const ageInconnuLabel = jobsPage ? libelleAgeInconnu(compterAgeInconnu(jobsPage.jobs, now), lang) : null

  const href = (next: { queue?: string; state?: QueueJobState; offset?: number }) => {
    const qs = new URLSearchParams({
      queue: next.queue ?? queue,
      state: next.state ?? state,
      // Un OFFSET absent vaut bien zéro : c'est le début de la liste, pas une
      // mesure manquante. La question de la doctrine se répond ici par OUI.
      offset: String(next.offset ?? 0),
    })
    return `/queues?${qs.toString()}`
  }

  const totaux = totauxDesFiles(summaries)
  const attenteGlobale = libelleAttente(laPlusVieilleAttente(summaries), lang)

  return (
    <main className="wrap">
      <div className={styles['entete']}>
        <div>
          <h1>{t('queuesTitle')}</h1>
          <p className="subtitle">{t('queuesSubtitle')}</p>
        </div>
        <LangToggle lang={lang} />
      </div>

      {/* Les quatre chiffres de tête. Les trois premiers sont des COMPTEURS —
          zéro y est une vraie mesure. Le quatrième est une ANCIENNETÉ, et il
          n'affiche un chiffre que lorsqu'il y en a un à afficher. */}
      <section className="kpi-grid">
        <KpiTile label={t('kpiWaiting')} value={totaux.enAttente} period={`${totaux.files} ${t('kpiQueuesRead')}`} />
        <KpiTile label={t('kpiFailed')} value={totaux.enEchec} period={t('stFailed')} />
        <KpiTile label={t('kpiActive')} value={totaux.actifs} period={t('stActive')} />
        <KpiTile
          label={t('oldestWaitingLabel')}
          // ⚠️ « aucun » / « inconnue » / une durée — jamais « 0 ». La valeur
          // et la phrase des puces ci-dessous sortent de la MÊME dérivation.
          value={attenteGlobale.valeur}
          period={
            totaux.filesInconnues > 0
              ? `${totaux.filesInconnues} ${t('kpiQueuesUnknown')}`
              : (attenteGlobale.detail ?? t('oldestWaitingPeriod'))
          }
        />
      </section>

      {/* Le sélecteur de file : une puce par file, qui dit son nom, son état en
          un MOT, ses profondeurs, et depuis quand son plus vieux job attend. */}
      <section className={styles['files']} aria-label={t('queueLabel')}>
        {summaries.map(s => {
          const attente = libelleAttente(s.oldestWaiting, lang)
          const ton = TON[tonDeLaFile(s)]
          const active = s.name === queue
          return (
            <a
              key={s.name}
              href={href({ queue: s.name, offset: 0 })}
              aria-current={active ? 'page' : undefined}
              className={active ? `${styles['file']} ${styles['fileActive']}` : styles['file']}
            >
              <span className={styles['fileNom']}>
                <span className="mono">{s.name}</span>
                <span className={`${styles['etat']} ${styles[ton.classe]}`}>
                  <span className={styles['puce']} aria-hidden="true" />
                  {t(ton.cle)}
                </span>
              </span>
              <span className={styles['fileLigne']}>
                <span>
                  {s.waiting} {t('stWaiting')}
                </span>
                <span className={s.failed > 0 ? styles['compteIncident'] : undefined}>
                  {s.failed} {t('stFailed')}
                </span>
              </span>
              <span
                className={
                  attente.ton === 'inconnu' ? `${styles['attente']} ${styles['attenteInconnue']}` : styles['attente']
                }
              >
                {attente.texte}
              </span>
              {/* La raison d'un inconnu est NOMMÉE : une panne Redis et un
                  désaccord entre deux lectures n'appellent pas le même geste. */}
              {attente.detail ? <span className={styles['attenteDetail']}>{attente.detail}</span> : null}
            </a>
          )
        })}
      </section>

      {/* Les onglets d'état — échoués en premier, chacun avec sa profondeur. */}
      <nav className={styles['onglets']} aria-label={t('status')}>
        {STATE_TABS.map(tab => {
          // `summary` peut manquer si l'API renomme une file sous nos pieds :
          // on n'invente pas de compte dans ce cas, on ne l'affiche pas.
          const count = summary ? summary[tab.value] : null
          const active = tab.value === state
          const incident = tab.value === 'failed' && count !== null && count > 0
          return (
            <a
              key={tab.value}
              href={href({ state: tab.value, offset: 0 })}
              aria-current={active ? 'page' : undefined}
              className={active ? `${styles['onglet']} ${styles['ongletActif']}` : styles['onglet']}
            >
              {t(tab.key)}
              <span className={incident ? `${styles['compte']} ${styles['compteIncident']}` : styles['compte']}>
                ({count === null ? '—' : count})
              </span>
            </a>
          )
        })}
      </nav>

      <div className={styles['barre']}>
        <span className={styles['total']}>{jobsPage ? `${jobsPage.total} ${t('jobsTotal')}` : '—'}</span>
        {state === 'failed' && jobsPage && jobsPage.total > 0 ? (
          /* ⚠️ La confirmation NOMME la conséquence : combien de jobs, dans
             quelle file, ce qui est perdu avec eux, et que rien ne les
             rattrape. « Purger TOUS les jobs échoués ? » ne disait ni combien
             ni quoi. */
          <ActionButton
            endpoint={`/api/admin/queues/${encodeURIComponent(queue)}/clean?state=failed`}
            label={t('cleanFailed')}
            confirmText={confirmationDePurge({ file: queue, etatLibelle: t('stFailed'), total: jobsPage.total }, lang)}
            workingText={t('working')}
            tone="danger"
          />
        ) : null}
      </div>

      {/* #1673.3 — le filtre « ancienneté », absent avant ce lot. Uniquement
          quand `jobsPage` existe : sans lecture réussie, il n'y a aucun compte
          honnête à afficher (pas de pilules à zéro fabriqué). */}
      {ageCounts ? (
        <QueueAgeFilter
          counts={ageCounts}
          inconnuLabel={ageInconnuLabel}
          labels={{
            clear: t('filterClear'),
            advanced: t('filterAdvanced'),
            all: t('ageAll'),
            recent: t('ageRecent'),
            today: t('ageToday'),
            old: t('ageOld'),
            scope: t('ageFilterScope'),
            section: t('ageFilterLabel'),
          }}
        />
      ) : null}

      {/* #1672.4 — pagination serveur, désormais dans `DataTable` lui-même
          (props `total`/`offset`/`limit`, `JobsTable` construit le geste) :
          ce bloc ne recalcule plus sa PROPRE pagination à côté. */}
      <JobsTable
        queue={queue}
        state={state}
        jobs={jobsPage?.jobs ?? []}
        // #1672.7 — l'API des jobs peut échouer indépendamment de
        // `fetchQueues` : ce cas branche `status='error'` sur `DataTable`
        // plutôt que de faire planter toute la page.
        error={jobsError}
        // #1672.4 / GA-19 — « je n'ai pas pu compter » ne devient PAS « zéro job ».
        // Quand la lecture a échoué, `total` reste absent : `DataTable` exige ses
        // quatre props de pagination ENSEMBLE, donc le pagineur ne s'affiche pas,
        // ce qui est la vérité — plutôt qu'un « 1–0 sur 0 » qui a l'air mesuré.
        total={jobsPage?.total}
        offset={offset}
        limit={PAGE_LIMIT}
        langue={lang}
        // #1673.3 — la même ancre que `QueueAgeFilter` : filtrer un job à
        // 23h59 et l'afficher « > 24 h » une seconde plus tard serait deux
        // mesures pour la même question.
        now={now}
        libelles={{
          pagerPrevious: t('pagerPrevious'),
          pagerNext: t('pagerNext'),
          pagerRange: t('pagerRange'),
          colJob: t('colJob'),
          colData: t('colData'),
          colAttempts: t('colAttempts'),
          colCreated: t('colCreated'),
          colFinished: t('colFinished'),
          colFailure: t('colFailure'),
          actions: t('actions'),
          retry: t('retry'),
          retryConfirm: t('retryConfirm'),
          remove: t('remove'),
          working: t('working'),
          failureReasonNone: t('failureReasonNone'),
          noJobs: t('noJobs'),
        }}
      />
    </main>
  )
}
