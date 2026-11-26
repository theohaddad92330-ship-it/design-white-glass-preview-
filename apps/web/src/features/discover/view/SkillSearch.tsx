import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, ExternalLink, Search } from 'lucide-react'
import { readSkillSearch, skillSearchLabel } from '@bellum/contracts'
import { EVIDENCE_OFFERS_MAX } from '@bellum/contracts'
import type {
  DiscoverEmployerCandidate,
  DiscoverSkillEvidence,
  DiscoverSkillEvidenceOffer,
  DiscoverSkillPendingEmployer,
} from '@bellum/contracts'
import { formatDate } from '@/lib/locale'
import { useDeclaredOfferContractLabel } from '@/lib/offer-contract-label'
import { completePlace } from '@/features/discover/lib/discover-other-actors'

/**
 * COMPETENCE-TROUVE (Louis 20/10/2026) — une compétence posée TROUVE les comptes par leurs offres.
 *
 * - `SkillEvidenceLine` : la preuve sur la carte, « 2 offres SAP · la plus récente : <intitulé>, <ville>,
 *   <date> » avec son lien. La source de l'offre reste dans la donnée, JAMAIS à l'écran (doctrine).
 * - (#4746.2) les cabinets et ESN qui recrutent vivent dans l’onglet « Autres acteurs » (`OtherActorsTab`),
 *   repliés et à part — les clients finaux d'abord.
 * - `SkillSearchEmptyCause` : un zéro dit sa cause en mots simples (`query.skillSearch.emptyCause`).
 *
 * - `SkillSearchNotices` (#4419.6) : chaque filtre qui retire des comptes LE DIT, avec un geste pour l'enlever.
 *
 * Rien à montrer → rien de rendu (« on n'affiche pas ce qu'on n'a pas », GA-18/19).
 */

const OFFER_DATE_FORMAT: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }

export function SkillEvidenceLine({ evidence }: { evidence: DiscoverSkillEvidence | undefined }) {
  const { t } = useTranslation('discoverSkill')
  // #5000.2 — le contrat déclaré de l'offre, même libellé que la fiche compte ; non déclaré ⇒ omis (jamais deviné).
  const declaredContract = useDeclaredOfferContractLabel()
  if (!evidence) return null
  const latest = evidence.latestOffer
  const date = latest.date ? (formatDate(latest.date, OFFER_DATE_FORMAT) ?? latest.date) : null
  const where = [latest.city, declaredContract(latest.contractType), date]
    .filter((part): part is string => Boolean(part))
    .join(', ')
  return (
    <p
      data-testid="skill-evidence"
      className="flex flex-wrap items-center gap-x-1 text-xs"
      style={{ color: 'var(--text-secondary)' }}
    >
      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
        {t('evidence.count', { count: evidence.offerCount, skill: evidence.skill })}
      </span>
      {latest.title && (
        <>
          <span aria-hidden="true">·</span>
          <span>{t('evidence.latest')}</span>
          {latest.url ? (
            <a
              href={latest.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-sm py-1 text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
            >
              {latest.title}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : (
            <span>{latest.title}</span>
          )}
          {where && <span>({where})</span>}
          {latest.foundIn === 'description' && <span>· {t('evidence.foundInDescription')}</span>}
        </>
      )}
    </p>
  )
}

function offerWhere(offer: DiscoverSkillEvidenceOffer, contract: string | null): string {
  const date = offer.date ? (formatDate(offer.date, OFFER_DATE_FORMAT) ?? offer.date) : null
  return [offer.city, contract, date].filter((part): part is string => Boolean(part)).join(', ')
}

/**
 * #4664 — le détail des offres qui ont fait sortir le compte (tiroir « Aperçu du compte ») : une ligne chacune,
 * intitulé (lien vers l'annonce, nouvel onglet, le tiroir reste ouvert), ville, date. Une offre sans intitulé ne
 * fait aucune ligne ; sans ville, date ou lien, le champ manque, il n'est jamais vide (GA-18/19). Au-delà de
 * `EVIDENCE_OFFERS_MAX`, `offerCount` dit le vrai total et le détail ne prétend pas être exhaustif.
 */
export function SkillEvidenceOffers({ evidence }: { evidence: DiscoverSkillEvidence | undefined }) {
  const { t } = useTranslation('discoverSkill')
  const declaredContract = useDeclaredOfferContractLabel()
  const offers = (evidence?.offers ?? []).filter(offer => Boolean(offer.title))
  if (!evidence || offers.length === 0) return null
  return (
    <section data-testid="skill-evidence-offers" className="flex flex-col gap-1">
      <h4 className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
        {t('evidence.detailTitle', { skill: evidence.skill })}
      </h4>
      <ul className="flex flex-col gap-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {offers.map((offer, index) => {
          const where = offerWhere(offer, declaredContract(offer.contractType))
          return (
            <li key={`${offer.url ?? offer.title}-${index}`} className="flex flex-wrap items-center gap-x-1">
              {offer.url ? (
                <a
                  href={offer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-sm py-1 text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
                >
                  {offer.title}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : (
                <span>{offer.title}</span>
              )}
              {where && <span>({where})</span>}
            </li>
          )
        })}
      </ul>
      {evidence.offerCount > EVIDENCE_OFFERS_MAX && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('evidence.detailPartial', { shown: offers.length, count: evidence.offerCount })}
        </p>
      )}
    </section>
  )
}

type CompactRow = {
  id: string
  name: string
  kind: string
  city: string | null
  evidence: DiscoverSkillEvidence
}

type CompactSort = 'offers' | 'date'

const latestDate = (row: CompactRow): string => row.evidence.latestOffer.date ?? ''

/**
 * #4419.10 — LE tableau compact des deux listes à part (employeurs sans SIREN, cabinets et ESN) : nom · type ·
 * ville · offres · offre la plus récente (lien) · date. Triable (offres, date), pleine largeur (D81), défilement
 * horizontal sur mobile plutôt qu'une colonne coupée. Une ligne d'aide au plus, jamais un pavé par ligne.
 * Une cellule sans valeur reste vide : jamais « 0 » d'une non-mesure (GA-18/19).
 */
function SkillCompactTable({
  rows,
  caption,
  renderAction,
}: {
  rows: readonly CompactRow[]
  caption: string
  renderAction?: (row: CompactRow) => React.ReactNode
}) {
  const { t } = useTranslation('discoverSkill')
  const [sort, setSort] = useState<CompactSort>('offers')
  const [descending, setDescending] = useState(true)
  const sorted = [...rows].sort((left, right) => {
    const order =
      sort === 'offers'
        ? left.evidence.offerCount - right.evidence.offerCount
        : latestDate(left).localeCompare(latestDate(right))
    return descending ? -order : order
  })
  const toggle = (next: CompactSort) => {
    if (next === sort) setDescending(!descending)
    else {
      setSort(next)
      setDescending(true)
    }
  }
  const sortHeader = (key: CompactSort, label: string) => (
    <th
      scope="col"
      aria-sort={sort === key ? (descending ? 'descending' : 'ascending') : 'none'}
      className="px-2 py-1 text-left font-medium"
    >
      <button
        type="button"
        onClick={() => toggle(key)}
        className="inline-flex items-center gap-1 rounded-sm py-1 pointer-coarse:min-h-11"
      >
        {label}
        {sort === key &&
          (descending ? (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
          ))}
      </button>
    </th>
  )
  return (
    <div className="w-full overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[40rem] text-left text-xs" style={{ color: 'var(--text-secondary)' }}>
        <caption className="sr-only">{caption}</caption>
        <thead style={{ color: 'var(--text-muted)' }}>
          <tr>
            <th scope="col" className="px-2 py-1 font-medium">
              {t('table.name')}
            </th>
            <th scope="col" className="px-2 py-1 font-medium">
              {t('table.type')}
            </th>
            <th scope="col" className="px-2 py-1 font-medium">
              {t('table.city')}
            </th>
            {sortHeader('offers', t('table.offers'))}
            <th scope="col" className="px-2 py-1 font-medium">
              {t('table.latest')}
            </th>
            {sortHeader('date', t('table.date'))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => {
            const latest = row.evidence.latestOffer
            const date = latest.date ? (formatDate(latest.date, OFFER_DATE_FORMAT) ?? latest.date) : null
            return (
              <tr
                key={row.id}
                data-testid="skill-compact-row"
                className="border-t border-[var(--border-subtle)] align-top"
              >
                <th scope="row" className="px-2 py-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {row.name}
                </th>
                <td className="px-2 py-1">{row.kind}</td>
                <td className="px-2 py-1">{completePlace(row.city)}</td>
                <td className="px-2 py-1">{row.evidence.offerCount}</td>
                <td className="px-2 py-1">
                  {latest.title ? (
                    latest.url ? (
                      <a
                        href={latest.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-sm py-1 text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
                      >
                        {latest.title}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ) : (
                      latest.title
                    )
                  ) : null}
                </td>
                <td className="px-2 py-1">{date}</td>
                {renderAction ? <td className="px-2 py-1">{renderAction(row)}</td> : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * #4674 / #4419.10 — les employeurs PROUVÉS par une offre dont le registre n'a pas (encore) dit le SIREN : un tableau
 * compact REPLIÉ par défaut avec son compte. Sans SIREN, l'analyse, les contacts, l'enrichissement et l'ajout au CRM
 * restent fermés (une ligne d'aide). #4419.8 — sur une homonymie, « Choisir l'entreprise » ouvre les 2 à 5
 * candidats ; le choix est gardé pour l'espace et la ligne rejoint la liste des comptes à la recherche suivante.
 */
export function SkillPendingEmployersSection({
  pending,
  onChoose,
  choosingId,
}: {
  pending: readonly DiscoverSkillPendingEmployer[]
  /** #4419.8 — absent, aucun geste n'est offert (lecture seule). */
  onChoose?: (employerName: string, candidate: DiscoverEmployerCandidate) => void
  choosingId?: string | null
}) {
  const { t } = useTranslation('discoverSkill')
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const listId = useId()
  if (pending.length === 0) return null
  // #4712 — un motif FINAL se nomme (« plusieurs entités du groupe recrutent ici ») ; sinon l'état d'identité.
  const pendingLabel = (item: DiscoverSkillPendingEmployer) =>
    t(`pending.reason.${item.identityReason ?? ''}`, { defaultValue: t(`pending.state.${item.identity}`) })
  const byId = new Map(pending.map(item => [item.id, item]))
  const rows: CompactRow[] = pending.map(item => ({
    id: item.id,
    name: item.name,
    kind: pendingLabel(item),
    city: item.city ?? null,
    evidence: item.skillEvidence,
  }))
  const title = t('pending.title', { count: pending.length })
  const picked = picking ? byId.get(picking) : undefined
  return (
    <section
      data-testid="skill-pending-employers"
      aria-label={title}
      className="flex flex-col gap-2 rounded-md border border-[var(--border-subtle)] p-3"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={listId}
        className="flex items-center gap-1 self-start rounded-sm py-1 text-sm font-medium text-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
      >
        {title}
        {open ? (
          <ChevronUp className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div id={listId} className="flex flex-col gap-2">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('pending.locked')}
          </p>
          <SkillCompactTable
            rows={rows}
            caption={title}
            renderAction={row => {
              const item = byId.get(row.id)
              if (!onChoose || !item?.candidates || item.candidates.length < 2) return null
              return (
                <button
                  type="button"
                  onClick={() => setPicking(picking === item.id ? null : item.id)}
                  aria-expanded={picking === item.id}
                  className="rounded-sm py-1 text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
                >
                  {t('pending.choose')}
                </button>
              )
            }}
          />
          {picked?.candidates && onChoose && (
            <div data-testid="skill-employer-candidates" className="flex flex-col gap-1">
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                {t('pending.chooseTitle', { name: picked.name })}
              </p>
              <ul className="flex flex-col gap-1">
                {picked.candidates.map(candidate => (
                  <li
                    key={candidate.siren}
                    className="flex flex-wrap items-center gap-x-2 text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span>
                      {[
                        candidate.name,
                        candidate.city,
                        candidate.sector ?? candidate.nafCode,
                        candidate.headcountTranche,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <button
                      type="button"
                      disabled={choosingId === picked.id}
                      onClick={() => onChoose(picked.name, candidate)}
                      className="rounded-sm py-1 text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
                    >
                      {t('pending.chooseThis', { name: candidate.name })}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

const EMPTY_CAUSES = [
  'no_offers',
  // Recette 21/10 B.3 — des offres existent dans le département, aucune dans la VILLE demandée.
  'no_offers_in_city',
  'only_intermediaries',
  'no_employer_identified',
  'sources_unavailable',
  'outside_headcount',
] as const
type EmptyCause = (typeof EMPTY_CAUSES)[number]

function skillSearchOf(query: Record<string, unknown>): { skill: string; cause: EmptyCause | null } | null {
  const search = query.skillSearch
  if (!search || typeof search !== 'object') return null
  const { skills, emptyCause } = search as { skills?: unknown; emptyCause?: unknown }
  // #4419.6 — « Java, Vue » : une virgule ET une espace, même quand une compétence arrive collée.
  const skill = Array.isArray(skills) ? skillSearchLabel(skills.map(String)) : ''
  if (!skill) return null
  const cause = EMPTY_CAUSES.find(known => known === emptyCause) ?? null
  return { skill, cause }
}

/** La compétence cherchée dans `query.skillSearch`, ou `null` hors tirage par compétence. */
function searchedSkill(query: Record<string, unknown>): string | null {
  return skillSearchOf(query)?.skill ?? null
}

/**
 * #5009.1 — trois libellés : « 30 offres lues sur 192 trouvées » (chaque source lue a publié son total), « 30 offres lues
 * sur au moins 192 trouvées » (borne basse : `offersTotalIsLowerBound`, le mot « au moins » est obligatoire), « 30 offres
 * lues » seul (aucun total publié : on ne l'estime pas, non mesuré ≠ 0). Le mot « crédit » n'y figure jamais.
 */
export function SkillOffersReadLine({ query }: { query: Record<string, unknown> }) {
  const { t } = useTranslation('discoverSkill')
  const search = query.skillSearch
  if (!search || typeof search !== 'object') return null
  const { offersRead, offersTotal, offersTotalIsLowerBound } = search as {
    offersRead?: unknown
    offersTotal?: unknown
    offersTotalIsLowerBound?: unknown
  }
  if (typeof offersRead !== 'number' || !Number.isFinite(offersRead) || offersRead < 1) return null
  const total =
    typeof offersTotal === 'number' && Number.isFinite(offersTotal) && offersTotal >= offersRead ? offersTotal : null
  return (
    <p data-testid="skill-offers-read" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
      {total === null
        ? t('offersRead.only', { count: offersRead })
        : t(offersTotalIsLowerBound === true ? 'offersRead.atLeast' : 'offersRead.ofTotal', {
            count: offersRead,
            total,
          })}
    </p>
  )
}

export function SkillSearchEmptyCause({ query }: { query: Record<string, unknown> }) {
  const { t } = useTranslation('discoverSkill')
  const search = skillSearchOf(query)
  if (!search?.cause) return null
  return (
    <p data-testid="skill-empty-cause" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
      {t(`empty.${search.cause}`, { skill: search.skill })}
    </p>
  )
}

/**
 * Ce qu'une recherche par compétence ajoute à la liste : la cause d'un zéro, puis les intermédiaires —
 * APRÈS les clients finaux. Hors tirage par compétence : rien.
 */
export function SkillSearchFooter({
  query,
  pending,
  onChooseEmployer,
  choosingId,
}: {
  query: Record<string, unknown> | undefined
  /** #4674 — employeurs prouvés par une offre, identité en cours (sans SIREN : aucune action). */
  pending?: readonly DiscoverSkillPendingEmployer[] | undefined
  /** #4419.8 — le geste « Choisir l'entreprise » ; absent, les lignes restent en lecture seule. */
  onChooseEmployer?: (employerName: string, candidate: DiscoverEmployerCandidate) => void
  choosingId?: string | null
}) {
  const skill = searchedSkill(query ?? {})
  if (!skill) return null
  return (
    <div className="mt-3 flex flex-col gap-2">
      <SkillOffersReadLine query={query ?? {}} />
      <SkillSearchEmptyCause query={query ?? {}} />
      <SkillPendingEmployersSection pending={pending ?? []} onChoose={onChooseEmployer} choosingId={choosingId} />
    </div>
  )
}

const NOTICE_BUTTON =
  'rounded-full border border-[var(--bellum-border)] px-3 py-1.5 text-sm text-[var(--bellum-text-secondary)] transition-colors pointer-coarse:min-h-11 hover:border-[var(--bellum-primary-500)] hover:text-[var(--bellum-text-primary)]'

/**
 * #4419.6 — ce que la recherche par compétence a retiré ou n'a pas pu finir, en nombres, chacun avec son geste :
 * les cabinets et ESN (listés à part : « Voir »), la taille (« Retirer la taille »), les employeurs que le registre
 * n'identifie pas (un fait, pas un filtre : aucun geste), la coupure par le délai (« Relancer »). Même grammaire que
 * la taille du profil (`ProfileSizeNotice`). Un compteur nul ne fait aucune ligne ; aucune source n'est nommée.
 */
export function SkillSearchNotices({
  query,
  onShowIntermediaries,
  onRemoveHeadcount,
  onRetry,
}: {
  query: Record<string, unknown> | undefined
  onShowIntermediaries: () => void
  onRemoveHeadcount: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation('discoverSkill')
  const search = readSkillSearch(query)
  if (!search) return null
  const skill = skillSearchLabel(search.skills)
  const lines: { key: string; text: string; action?: { label: string; onClick: () => void } }[] = []
  if (search.intermediaries > 0) {
    lines.push({
      key: 'intermediaries',
      text: t('notices.intermediaries', { count: search.intermediaries, skill }),
      action: { label: t('notices.showIntermediaries'), onClick: onShowIntermediaries },
    })
  }
  if (typeof search.outsideHeadcount === 'number' && search.outsideHeadcount > 0) {
    lines.push({
      key: 'headcount',
      text: t('notices.outsideHeadcount', { count: search.outsideHeadcount }),
      action: { label: t('notices.removeHeadcount'), onClick: onRemoveHeadcount },
    })
  }
  // #4420.4 — les entreprises écartées parce que leur secteur n'est pas celui de la recherche ; absent ou 0 = rien.
  if (typeof search.outsideSector === 'number' && search.outsideSector > 0) {
    lines.push({ key: 'sector', text: t('notices.outsideSector', { count: search.outsideSector }) })
  }
  if (search.unresolvedEmployers > 0) {
    lines.push({ key: 'unresolved', text: t('notices.unresolved', { count: search.unresolvedEmployers }) })
  }
  if (search.deadlineCut === true) {
    lines.push({
      key: 'deadline',
      text: t('notices.deadlineCut', { count: search.notAttempted ?? 0 }),
      action: { label: t('notices.retry'), onClick: onRetry },
    })
  }
  if (lines.length === 0) return null
  return (
    <div
      role="status"
      data-testid="skill-search-notices"
      className="mb-4 flex flex-col gap-2 rounded-lg p-3"
      style={{
        background: 'var(--surface-raised, rgba(148,163,184,0.06))',
        border: '1px solid rgba(148,163,184,0.22)',
      }}
    >
      {lines.map(line => (
        <div key={line.key} className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
            <Search className="h-[13px] w-[13px]" aria-hidden />
            {line.text}
          </p>
          {line.action && (
            <button type="button" onClick={line.action.onClick} className={NOTICE_BUTTON}>
              {line.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
