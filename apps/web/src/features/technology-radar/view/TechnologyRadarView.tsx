import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { RADAR_POCKETS, type TechnologyRadar } from '@bellum/contracts'
import { Badge, Card } from '@bellum/ui'
import { LibraryTitle } from '@/components/page/LibrarySection'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { formatDate } from '@/lib/locale'

type RadarAccount = TechnologyRadar['accounts'][number]
type Freshness = TechnologyRadar['prescribers'][number]['freshness']
type PocketTone = 'success' | 'primary' | 'info'

/** La poche dit l'état de l'opportunité par la couleur ; le rang reste un RANG, jamais un score. */
const POCKET_TONE: Record<RadarAccount['pocket'], PocketTone> = {
  immediate: 'success',
  programs: 'primary',
  rank_2: 'info',
}

/** Le statut d'un besoin historique : un fait teinté, jamais un chiffre. */
function statusTone(status: string): 'success' | 'danger' | 'info' | 'primary' | 'default' {
  switch (status) {
    case 'GAGNE':
      return 'success'
    case 'PERDU':
      return 'danger'
    case 'TERMINE':
      return 'info'
    case 'EN_COURS':
      return 'primary'
    default:
      return 'default'
  }
}

/**
 * #4282 — les SEPT blocs du radar par technologie, dans l'ordre de l'issue, rendus
 * tels que la sortie commune les livre : aucun retri ici (mêmes comptes, même
 * ordre que Laura). Une valeur absente se DIT (« TJM non affiché »), jamais « 0 »
 * (GA-18/19) ; la priorité est un RANG, jamais un pourcentage ; aucune source
 * n'est nommée. Pur : la donnée arrive en prop, testable sans réseau.
 *
 * Refonte Théo (PR12) : la grammaire « bibliothèque » de Découvrir — titre de section
 * et son compte à droite, listes en lignes dans un seul cadre (missions, comptes),
 * tableau COMMUN pour les faits (historique, prescripteurs, empreinte), les trois
 * poches en cartes côte à côte ; poche et statut en pastilles teintées.
 */
export function TechnologyRadarView({ radar }: { radar: TechnologyRadar }) {
  const { t } = useTranslation('technologyRadar')
  const accounts = radar.accounts
  const immediate = accounts.filter(a => a.pocket === 'immediate')
  const programs = accounts.filter(a => a.pocket === 'programs')
  const rank2 = accounts.filter(a => a.pocket === 'rank_2')
  const missions = immediate.flatMap(a => a.missions.map(m => ({ ...m, targetIsPublisher: a.targetIsPublisher })))

  return (
    <div className="flex flex-col gap-8" data-testid="technology-radar">
      <Block
        title={t('blocks.missions')}
        count={missions.length > 0 ? t('count.missions', { count: missions.length }) : null}
        empty={missions.length === 0 ? t('empty.missions') : null}
      >
        <RunList>
          {missions.map(mission => (
            <li key={mission.url} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:px-5">
              <div className="min-w-0 flex-1 basis-60">
                <p className="text-sm font-semibold text-[var(--bellum-text-primary)]">{mission.title}</p>
                <p className="mt-1 text-xs text-[var(--bellum-text-secondary)]">
                  {[
                    t('mission.publisher', { publisher: mission.publisher }),
                    mission.location,
                    mission.tjmEur ? t('mission.tjm', { tjm: mission.tjmEur }) : t('mission.noTjm'),
                    t('mission.publishedAt', { date: formatDate(mission.publishedAt) ?? mission.publishedAt }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {mission.targetIsPublisher ? (
                  <p className="mt-1 text-xs text-[var(--bellum-text-muted)]">{t('mission.publisherIsTarget')}</p>
                ) : null}
              </div>
              <ProofLink href={mission.url} label={t('mission.open')} />
            </li>
          ))}
        </RunList>
      </Block>

      <Block
        title={t('blocks.hotAccounts')}
        count={programs.length > 0 ? t('count.accounts', { count: programs.length }) : null}
        empty={programs.length === 0 ? t('empty.hotAccounts') : null}
      >
        <AccountList accounts={programs} />
      </Block>

      <Block
        title={t('blocks.rank2')}
        count={rank2.length > 0 ? t('count.accounts', { count: rank2.length }) : null}
        empty={rank2.length === 0 ? t('empty.rank2') : null}
      >
        <AccountList accounts={rank2} />
      </Block>

      <Block
        title={t('blocks.history')}
        count={radar.historicalNeeds.length > 0 ? t('count.needs', { count: radar.historicalNeeds.length }) : null}
        empty={radar.historicalNeeds.length === 0 ? t('empty.history') : null}
        table
      >
        <ResponsiveTable
          dense
          rows={radar.historicalNeeds}
          rowKey={need => `${need.accountName}-${need.title}-${need.date ?? ''}-${need.status}`}
          scrollLabel={t('blocks.history')}
          columns={[
            {
              key: 'account',
              header: t('columns.account'),
              mobile: 'title',
              render: need => <span className="font-semibold">{need.accountName}</span>,
            },
            { key: 'need', header: t('columns.need'), mobile: 'meta', render: need => need.title },
            {
              key: 'status',
              header: t('columns.status'),
              render: need => <Badge variant={statusTone(need.status)}>{t(`status.${need.status}`)}</Badge>,
            },
            {
              key: 'date',
              header: t('columns.date'),
              render: need => (need.date ? (formatDate(need.date) ?? need.date) : t('history.noDate')),
            },
            {
              key: 'tjm',
              header: t('columns.tjm'),
              render: need => (need.tjmEur ? t('history.tjm', { tjm: need.tjmEur }) : null),
            },
            {
              key: 'prescriber',
              header: t('columns.prescriber'),
              render: need => (need.prescriberRole ? t('history.prescriber', { role: need.prescriberRole }) : null),
            },
          ]}
        />
      </Block>

      <Block
        title={t('blocks.prescribers')}
        count={radar.prescribers.length > 0 ? t('count.prescribers', { count: radar.prescribers.length }) : null}
        empty={radar.prescribers.length === 0 ? t('empty.prescribers') : null}
        table
      >
        <ResponsiveTable
          dense
          rows={radar.prescribers}
          rowKey={p => `${p.accountName}-${p.name ?? p.role}-${p.role}`}
          scrollLabel={t('blocks.prescribers')}
          columns={[
            {
              key: 'account',
              header: t('columns.account'),
              mobile: 'title',
              render: p => <span className="font-semibold">{p.accountName}</span>,
            },
            { key: 'name', header: t('columns.prescriber'), mobile: 'meta', render: p => p.name },
            { key: 'role', header: t('columns.role'), render: p => p.role },
            {
              key: 'freshness',
              header: t('columns.freshness'),
              render: p => (
                <Badge variant={p.freshness.kind === 'dated' ? 'success' : 'warning'}>
                  {freshnessText(t, p.freshness)}
                </Badge>
              ),
            },
          ]}
        />
      </Block>

      <Block
        title={t('blocks.footprint')}
        count={radar.footprints.length > 0 ? t('count.accounts', { count: radar.footprints.length }) : null}
        note={t('footprint.caveat')}
        empty={radar.footprints.length === 0 ? t('empty.footprint') : null}
        table
      >
        <ResponsiveTable
          dense
          rows={radar.footprints}
          rowKey={f => f.accountName}
          scrollLabel={t('blocks.footprint')}
          columns={[
            {
              key: 'account',
              header: t('columns.account'),
              mobile: 'title',
              render: f => <span className="font-semibold">{f.accountName}</span>,
            },
            {
              key: 'profiles',
              header: t('columns.profiles'),
              render: f => t('footprint.line', { count: f.observedProfiles }),
            },
          ]}
        />
      </Block>

      <Block title={t('blocks.pockets')} empty={null} bare>
        {/* Les trois poches côte à côte (une colonne sous 768 px) : une carte par poche,
            ses comptes par RANG — une poche vide le dit, jamais un « 0 ». */}
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {RADAR_POCKETS.map(pocket => {
            const inPocket = accounts.filter(a => a.pocket === pocket)
            return (
              <li
                key={pocket}
                className="flex flex-col gap-2 rounded-card border border-[var(--bellum-border)] bg-card p-4"
              >
                <Badge variant={POCKET_TONE[pocket]}>{t(`pocket.${pocket}`)}</Badge>
                {inPocket.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-sm text-[var(--bellum-text-primary)]">
                    {inPocket.map(a => (
                      <li key={a.accountName}>{`${t('rank', { rank: a.rank })} · ${a.accountName}`}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--bellum-text-muted)]">{t('empty.pocket')}</p>
                )}
              </li>
            )
          })}
        </ol>
      </Block>

      {radar.notEvaluated.length > 0 ? (
        <section
          aria-label={t('notEvaluatedTitle')}
          className="rounded-card border border-dashed border-[var(--bellum-border)] px-4 py-3"
        >
          <p className="text-xs font-semibold text-[var(--bellum-text-secondary)]">{t('notEvaluatedTitle')}</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-[var(--bellum-text-secondary)]">
            {radar.notEvaluated.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/**
 * Un bloc du radar, dans la grammaire « bibliothèque » de Théo : un titre de
 * section (h2) et son repère discret à droite, puis le contenu — une liste en
 * lignes (`RunList`), un tableau commun dans sa carte (`table`), ou nu (`bare`).
 */
function Block({
  title,
  count = null,
  note,
  empty,
  table = false,
  bare = false,
  children,
}: {
  title: string
  count?: string | null
  note?: string
  empty: string | null
  table?: boolean
  bare?: boolean
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <LibraryTitle id={id} title={title} aside={count ?? undefined} />
      {note && !empty ? <p className="text-xs text-[var(--bellum-text-secondary)]">{note}</p> : null}
      {empty ? (
        <p className="rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-4 py-3 text-sm text-[var(--bellum-text-secondary)]">
          {empty}
        </p>
      ) : bare ? (
        children
      ) : table ? (
        <Card className="p-2 sm:p-3">{children}</Card>
      ) : (
        children
      )}
    </section>
  )
}

/** `.d3-run-list` — une liste en lignes dans un seul cadre, séparées d'un trait. */
function RunList({ children }: { children: ReactNode }) {
  return (
    <ul className="flex flex-col divide-y divide-[var(--bellum-border)] overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card">
      {children}
    </ul>
  )
}

function AccountList({ accounts }: { accounts: RadarAccount[] }) {
  const { t } = useTranslation('technologyRadar')
  return (
    <RunList>
      {accounts.map(account => (
        <li key={account.accountName} className="flex flex-col gap-1 p-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={POCKET_TONE[account.pocket]}>{t('rank', { rank: account.rank })}</Badge>
            <p className="text-sm font-semibold text-[var(--bellum-text-primary)]">{account.accountName}</p>
          </div>
          {account.program ? (
            <p className="text-sm text-[var(--bellum-text-primary)]">
              {t('account.program', { program: account.program })}
            </p>
          ) : null}
          {account.awardedTender ? (
            <p className="text-sm text-[var(--bellum-text-primary)]">
              {t('account.awarded', { tender: account.awardedTender })}
            </p>
          ) : null}
          {account.profiles.length > 0 ? (
            <p className="text-xs text-[var(--bellum-text-secondary)]">
              {t('account.profiles', { profiles: account.profiles.join(', ') })}
            </p>
          ) : null}
          {account.proofs.length > 0 ? (
            <ul className="mt-1 flex flex-col">
              {account.proofs.map(proof => (
                <li
                  key={`${proof.kind}-${proof.label}-${proof.date}`}
                  className="text-xs text-[var(--bellum-text-muted)]"
                >
                  {t(`proof.kind.${proof.kind}`)} · {proof.label} · {formatDate(proof.date) ?? proof.date}
                  {proof.url ? <ProofLink href={proof.url} label={t('proof.open')} /> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </RunList>
  )
}

function ProofLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-1 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-[var(--bellum-text-accent)] underline underline-offset-2"
    >
      {label}
      <ExternalLink aria-hidden="true" className="h-3 w-3" />
    </a>
  )
}

function freshnessText(t: (key: string, opts?: Record<string, unknown>) => string, freshness: Freshness): string {
  if (freshness.kind === 'dated') return t('freshness.dated', { date: formatDate(freshness.date) ?? freshness.date })
  return freshness.date
    ? t('freshness.toRevalidateSince', { date: formatDate(freshness.date) ?? freshness.date })
    : t('freshness.toRevalidate')
}
