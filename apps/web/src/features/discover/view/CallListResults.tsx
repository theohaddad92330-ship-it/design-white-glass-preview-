import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@bellum/ui'
import {
  filterCallListRows,
  MAX_CONTACTS_PER_CALL_LIST_COMPANY,
  type DiscoverCallListFilters,
  type DiscoverCallListFunnel,
  type DiscoverCallListRow,
} from '@/features/discover/lib/discover-call-list'
import { ProspectingSessionDialog } from '@/features/prospecting-session/view/ProspectingSessionDialog'
import { EnrichConfirmDialog } from '@/features/contacts/components/EnrichConfirmDialog'
import type { FindPeopleProgress } from '@/features/discover/hooks/useFindCallListPeople'

/* ------------------------------------------------------------------ */
/*  #2545.1-.4 — LE TABLEAU D'APPELS.                                    */
/*                                                                     */
/*  Un tableau, pas des cartes (D81) : les trois autres lectures        */
/*  (`ProjectionResults.tsx`) empilent des lignes-cartes, celle-ci est   */
/*  la seule que le client a demandée comme un TABLEAU exportable —      */
/*  d'où `@bellum/ui`'s `Table` (pleine largeur, défilement horizontal   */
/*  dans SON conteneur, jamais le corps de la page).                     */
/* ------------------------------------------------------------------ */

/**
 * #2613 — un étage NON MESURÉ de la chute ne s'écrit plus, LIBELLÉ COMPRIS.
 *
 * Décision de Louis du 20/09/2026 : « on affiche pas ce qu'on a pas ». Ne
 * retirer que la valeur laisserait « Détectées » au-dessus d'un vide, ce qui
 * est pire que la phrase qu'on supprime. L'étage entier disparaît, et les
 * étages mesurés restent dits.
 *
 * ⚠️ `0` n'est pas ce qui se passe ici : un étage mesuré à zéro affiche bien
 * « 0 », parce qu'on a compté. C'est `null` — « je n'ai pas pu regarder » —
 * qui se tait. Les deux ne se confondent pas (GA-19).
 */
function FunnelStat({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>
        {label}
      </span>
      <span className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  )
}

/**
 * #2613 — une cellule sans valeur reste VIDE.
 *
 * Elle écrivait « Non mesuré » en italique. La cellule demeure (l'alignement
 * du tableau en dépend) ; son contenu, lui, ne prétend plus rien. Une cellule
 * vide et un « 0 » ne se disent pas la même chose : la première n'affirme
 * rien, le second affirme une mesure.
 */
function Cell({ value }: { value: string | null }) {
  if (value === null || value === '') return null
  return <>{value}</>
}

interface CallListResultsProps {
  rows: DiscoverCallListRow[]
  filters: DiscoverCallListFilters
  funnel: DiscoverCallListFunnel
  truncatedCompanies: number
  excludedCompanies: number
  /** LUDOVIC-C LC.3 — entreprises hors du pack (administrations, distribution) écartées, comptées. */
  outOfPackCompanies?: number
  isFetching: boolean
  isError: boolean
  onRetry: () => void
  followed: ReadonlySet<string>
  onToggleFollow: (row: DiscoverCallListRow) => void
  onDismiss: (siren: string) => void
  /** #2081.14 — absent quand la règle d'espace réserve l'export aux administrateurs : le bouton est MASQUÉ. */
  onExport?: (rows: DiscoverCallListRow[]) => void
  /** #2081.14 — absent quand la règle d'espace réserve l'export aux administrateurs : le bouton est MASQUÉ. */
  onExportSelection?: (rows: DiscoverCallListRow[]) => void
  /** #2375.8 — même règle #2081.14 que les deux exports ci-dessus : absent = bouton d'export de la session MASQUÉ. */
  onExportSession?: (csv: string, filename: string) => void
  /**
   * #2545 / #3819 — « Trouver 10 personnes à appeler » pour une entreprise sans
   * contact connu, ou pour toute la liste. Absent = geste masqué (ex. lecture
   * seule). Annoncé GRATUIT avant de partir (`EnrichConfirmDialog free`).
   */
  findPeople?: {
    pending: ReadonlySet<string>
    progress: FindPeopleProgress | null
    onFindForCompany: (row: DiscoverCallListRow) => void
    onFindForAll: (rows: DiscoverCallListRow[]) => void
  }
}

/** Les lignes « entreprise sans personne », une par SIREN. */
function companiesWithoutPeople(rows: readonly DiscoverCallListRow[]): DiscoverCallListRow[] {
  const seen = new Set<string>()
  return rows.filter(row => {
    if (row.contactId !== null || seen.has(row.siren)) return false
    seen.add(row.siren)
    return true
  })
}

export function CallListResults({
  rows,
  filters,
  funnel,
  truncatedCompanies,
  excludedCompanies,
  outOfPackCompanies = 0,
  isFetching,
  isError,
  onRetry,
  followed,
  onToggleFollow,
  onDismiss,
  onExport,
  onExportSelection,
  onExportSession,
  findPeople,
}: CallListResultsProps) {
  const { t } = useTranslation('discover')
  const visible = useMemo(() => filterCallListRows(rows, filters), [rows, filters])
  const withoutPeople = useMemo(() => companiesWithoutPeople(visible), [visible])
  // #3819 — le geste part après une confirmation qui annonce son coût (gratuit).
  const [findTarget, setFindTarget] = useState<{ kind: 'one'; row: DiscoverCallListRow } | { kind: 'all' } | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const selectedRows = useMemo(() => visible.filter(row => selected.has(row.key)), [visible, selected])
  // #2375.1 — « Prépare-moi une heure de prospection » transforme CETTE
  // liste déjà filtrée en session exécutable, sans nouvel appel réseau.
  const [sessionOpen, setSessionOpen] = useState(false)

  if (isError) {
    return (
      <div className="space-y-2">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('states.errorTitle')}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm"
          style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          {t('states.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {t('callList.scope')}
      </p>

      {/* #2545.4 — la chute expliquée : détectés → vérifiés → pertinents → enrichis. */}
      <div
        className="flex flex-wrap items-center gap-6 rounded-xl px-4 py-3"
        style={{ background: 'var(--bg-surface)' }}
      >
        <FunnelStat label={t('callList.funnel.detected')} value={funnel.detected} />
        <FunnelStat label={t('callList.funnel.verified')} value={funnel.verified} />
        <FunnelStat label={t('callList.funnel.relevant')} value={funnel.relevant} />
        <FunnelStat label={t('callList.funnel.enriched')} value={funnel.enriched} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('resultType.count', { count: visible.length })}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {/* #4634 — Entreprise, Fonction, Niveau, Expertise et Joignable se posent dans le volet de recherche
              (`ProjectionSearchFields`) : le tableau ne rend plus aucun contrôle de filtre, il les lit. */}
          {onExport ? (
            <button
              type="button"
              onClick={() => onExport(visible)}
              className="inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm font-medium"
              style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              {t('callList.export')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setSessionOpen(true)}
            className="inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm font-medium"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            {t('prospectingSession.trigger')}
          </button>
          {findPeople && withoutPeople.length > 0 ? (
            <button
              type="button"
              onClick={() => setFindTarget({ kind: 'all' })}
              disabled={findPeople.progress !== null}
              className="inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm font-medium"
              style={{ background: 'var(--accent-soft-bg)', color: 'var(--accent-soft-text)' }}
            >
              {findPeople.progress
                ? t('callList.findPeople.progress', {
                    done: findPeople.progress.done,
                    total: findPeople.progress.total,
                  })
                : t('callList.findPeople.all', { count: withoutPeople.length })}
            </button>
          ) : null}
        </div>
      </div>

      {/* #2545.2 — traitement par lot : les gestes existent déjà ailleurs
          (Suivre / Écarter, `useDiscoverShortlist`) — cette barre les applique
          à la sélection de lignes plutôt que d'en inventer un troisième. */}
      {selectedRows.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl px-4 py-2"
          style={{ background: 'var(--accent-soft-bg)', border: '1px solid var(--accent-soft-border)' }}
        >
          <span className="text-sm" style={{ color: 'var(--accent-soft-text)' }}>
            {t('selection.count', { count: selectedRows.length })}
          </span>
          <button
            type="button"
            onClick={() => {
              for (const row of selectedRows) onToggleFollow(row)
              setSelected(new Set())
            }}
            className="min-h-11 rounded-md px-3 py-1.5 text-sm font-medium"
            style={{ border: '1px solid var(--border-subtle)' }}
          >
            {t('actions.follow')}
          </button>
          <button
            type="button"
            onClick={() => {
              for (const row of selectedRows) onDismiss(row.siren)
              setSelected(new Set())
            }}
            className="min-h-11 rounded-md px-3 py-1.5 text-sm font-medium"
            style={{ border: '1px solid var(--border-subtle)' }}
          >
            {t('actions.dismiss')}
          </button>
          {onExportSelection ? (
            <button
              type="button"
              onClick={() => onExportSelection(selectedRows)}
              className="min-h-11 rounded-md px-3 py-1.5 text-sm font-medium"
              style={{ border: '1px solid var(--border-subtle)' }}
            >
              {t('callList.export')}
            </button>
          ) : null}
        </div>
      )}

      {/* #2545.1 — une entreprise qualifiée reste comptée même sans contact,
          et un excédent de contacts n'est jamais tu. */}
      {truncatedCompanies > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('callList.truncatedCompanies', { count: truncatedCompanies, max: MAX_CONTACTS_PER_CALL_LIST_COMPANY })}
        </p>
      )}
      {excludedCompanies > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('callList.excludedCompanies', { count: excludedCompanies })}
        </p>
      )}
      {outOfPackCompanies > 0 && (
        <p data-testid="call-list-out-of-pack" className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('callList.outOfPackCompanies', { count: outOfPackCompanies })}
        </p>
      )}

      {isFetching ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('states.loadingTitle')}
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('callList.empty')}
        </p>
      ) : (
        /* #3819 (recette prod 07/10) — 1144 px dans 926 : douze colonnes. Les cinq colonnes
           prioritaires (Nom, Fonction, E-mail, Téléphone, Entreprise) restent des colonnes ;
           site, raison, signal, lieu et confiance passent en ligne secondaire sous l'entreprise
           (rien d'absent n'est écrit). Sous 768 px, chaque ligne devient une carte (même balisage). */
        <Table scrollLabel={t('callList.title')} className="max-md:block">
          <TableHeader className="max-md:hidden">
            <TableRow>
              <TableHead className="md:w-10">
                <span className="sr-only">{t('selection.checkboxLabel', { name: '' })}</span>
              </TableHead>
              {/* LUDOVIC-C LC.9 — largeurs minimales : Nom tenait sur 109 px, E-mail sur 60 px.
                  SIMON-FIX S.10 — mais leur somme (768 px + Entreprise + Action) dépassait les 926 px du
                  conteneur : colonne Action hors champ, lignes de 245-329 px. Les planchers se resserrent
                  (le texte passe à la ligne) et l'Action s'empile : le tableau tient à 1 512 px.
                  LC.4 (Ludovic 20/10) — LUDOVIC-F F.2 : le plancher posé sur la CELLULE Entreprise (14 rem) s'ajoutait
                  à ceux des en-têtes — 1 120 px dans 926, boutons d'Action rognés. UN plancher par colonne, en-tête
                  seul ; la somme (case 2,5 + 10 + 6 + 12 + 8 + 10 + 7,5 = 56 rem) tient dans les 57,875 rem du conteneur. */}
              <TableHead className="md:min-w-[10rem]">{t('callList.columns.fullName')}</TableHead>
              <TableHead className="md:min-w-[6rem]">{t('callList.columns.title')}</TableHead>
              <TableHead className="md:min-w-[12rem]">{t('callList.columns.email')}</TableHead>
              <TableHead className="md:min-w-[8rem]">{t('callList.columns.phone')}</TableHead>
              <TableHead className="md:min-w-[10rem]">{t('callList.columns.company')}</TableHead>
              <TableHead className="md:min-w-[7.5rem]">{t('callList.columns.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="max-md:block">
            {visible.map((row, index) => {
              const site = row.city && row.department ? `${row.city} (${row.department})` : (row.city ?? row.department)
              // LUDOVIC-F F.3 (LC.1, Ludovic 20/10) — « Localisation : BELLEY (01) » sur les 9 lignes Enedis : c'était le
              // lieu de l'ENTREPRISE répété, présenté comme celui de la personne. Le lieu du CONTACT s'écrit sur sa
              // ligne quand on le connaît ; le site de l'entreprise s'écrit UNE fois, sur la 1re ligne de l'entreprise,
              // nommé « Site ». Absent = aucune ligne (on n'affiche pas ce qu'on n'a pas).
              const firstOfCompany = index === 0 || visible[index - 1].siren !== row.siren
              const secondary = [
                row.contactLocation ? `${t('callList.columns.location')} : ${row.contactLocation}` : null,
                site && firstOfCompany ? `${t('callList.columns.companySite')} : ${site}` : null,
                row.reason ? `${t('callList.columns.reason')} : ${row.reason}` : null,
                row.signal ? `${t('callList.columns.signal')} : ${row.signal.label} — ${row.signal.date}` : null,
                row.confidence === null ? null : `${t('callList.columns.confidence')} : ${row.confidence}`,
              ].filter((line): line is string => line !== null)
              return (
                <TableRow
                  key={row.key}
                  className="align-top max-md:mb-2 max-md:flex max-md:flex-col max-md:gap-1 max-md:rounded-xl max-md:border max-md:p-3"
                >
                  <TableCell className="align-top max-md:p-0">
                    <input
                      type="checkbox"
                      checked={selected.has(row.key)}
                      onChange={() => {
                        setSelected(prev => {
                          const next = new Set(prev)
                          if (next.has(row.key)) next.delete(row.key)
                          else next.add(row.key)
                          return next
                        })
                      }}
                      aria-label={t('selection.checkboxLabel', { name: row.fullName ?? row.company })}
                      className="size-4 shrink-0"
                    />
                  </TableCell>
                  <TableCell className="min-w-0 break-words align-top font-medium max-md:p-0">
                    {row.contactId === null ? (
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-normal italic" style={{ color: 'var(--text-ghost)' }}>
                          {t('callList.cell.noContact')}
                        </span>
                        {findPeople ? (
                          <button
                            type="button"
                            onClick={() => setFindTarget({ kind: 'one', row })}
                            disabled={findPeople.pending.has(row.siren)}
                            className="min-h-11 max-w-full rounded-md px-2 py-1 text-left text-xs font-medium whitespace-normal"
                            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                          >
                            {findPeople.pending.has(row.siren)
                              ? t('callList.findPeople.searching')
                              : t('callList.findPeople.one')}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      row.fullName
                    )}
                  </TableCell>
                  <TableCell className="min-w-0 break-words align-top max-md:p-0">
                    <Cell value={row.title} />
                  </TableCell>
                  <TableCell className="min-w-0 [overflow-wrap:anywhere] align-top max-md:p-0">
                    <Cell value={row.email} />
                    {row.email && row.emailVerified ? (
                      <span className="ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {t('callList.cell.emailVerified')}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="min-w-0 align-top max-md:p-0">
                    <Cell value={row.phone} />
                    {/* LUDOVIC-C LC.4 — une personne sans numéro le DIT, jamais un vide muet : la
                        recherche de personnes ne demande pas le mobile (révélation séparée, depuis la fiche). */}
                    {row.contactId !== null && !row.phone ? (
                      <span
                        data-testid="call-list-phone-missing"
                        className="text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {t('callList.cell.phoneNotFound')}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="min-w-0 break-words align-top max-md:p-0">
                    <div>{row.company}</div>
                    {row.website ? (
                      <a
                        href={row.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline underline-offset-2"
                        style={{ color: 'var(--bellum-text-accent)' }}
                      >
                        {t('callList.openWebsite')}
                      </a>
                    ) : null}
                    {secondary.map(line => (
                      <div key={line} className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {line}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="align-top max-md:p-0">
                    <div className="flex flex-col gap-1 max-md:flex-row max-md:flex-wrap">
                      <button
                        type="button"
                        onClick={() => onToggleFollow(row)}
                        className="min-h-11 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium"
                        style={{ border: '1px solid var(--border-subtle)' }}
                      >
                        {followed.has(row.siren) ? t('actions.unfollow') : t('actions.follow')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDismiss(row.siren)}
                        className="min-h-11 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium"
                        style={{ border: '1px solid var(--border-subtle)' }}
                      >
                        {t('actions.dismiss')}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <ProspectingSessionDialog
        open={sessionOpen}
        onOpenChange={setSessionOpen}
        rows={visible}
        onExport={onExportSession}
      />

      {findPeople ? (
        <EnrichConfirmDialog
          open={findTarget !== null}
          onOpenChange={open => {
            if (!open) setFindTarget(null)
          }}
          free
          // #3819 — la modale nomme l'entreprise visée (ou « N entreprises »).
          subject={
            findTarget?.kind === 'one'
              ? findTarget.row.company
              : findTarget?.kind === 'all'
                ? t('callList.findPeople.subjectMany', { count: withoutPeople.length })
                : undefined
          }
          onConfirm={() => {
            if (findTarget?.kind === 'one') findPeople.onFindForCompany(findTarget.row)
            else if (findTarget?.kind === 'all') findPeople.onFindForAll(withoutPeople)
            setFindTarget(null)
          }}
        />
      ) : null}
    </div>
  )
}
