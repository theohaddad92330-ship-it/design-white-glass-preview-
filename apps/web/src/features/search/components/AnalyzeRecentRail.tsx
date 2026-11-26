import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { formatShortDate } from '@bellum/utils'
import { Link } from '@tanstack/react-router'
import { ArrowRight, History, Info, Upload } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { lastAnalyzedDate } from '@/features/accounts/model/lastAnalyzed'
import type { AccountRow } from '@/features/accounts/view/accounts-list/types'
import { useAccountsCache } from '@/features/accounts/hooks/useAccountsInfiniteScroll'
import { ImportPortfolioDialog } from '@/features/universal-import/view/ImportPortfolioDialog'

const RECENT_LIMIT = 6
const DOSSIER_CHIPS = 3

/**
 * Refonte Théo (comptes-import) — les comptes que l'espace a analysés le plus récemment, servis par la
 * liste existante (`GET /accounts`, tri par date). Rien n'est inventé : sans compte, les trois rangées se
 * taisent (une absence ne fait aucune ligne).
 */
export function useRecentAnalysedAccounts(): AccountRow[] {
  const { data } = useAccounts({ sort: 'date_desc', limit: RECENT_LIMIT })
  return useAccountsCache(data)
}

const CHIP =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 text-sm text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-surface-2)]'

/** « Ou ouvre un dossier : » — les trois derniers dossiers, un clic ouvre la fiche. */
export function OpenDossierChips({ rows }: { rows: readonly AccountRow[] }) {
  const { t } = useTranslation('search')
  const chips = rows.filter(row => row.status === 'completed').slice(0, DOSSIER_CHIPS)
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="open-dossier-chips">
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('rail.openDossier')}
      </Text>
      {chips.map(row => (
        <Link key={row.id} to="/accounts/$id" params={{ id: row.id }} className={CHIP}>
          {row.company_name}
        </Link>
      ))}
    </div>
  )
}

/** Une ligne d'analyse : ce qu'elle est devenue, dit en mots, et le geste suivant (ouvrir ou relancer). */
function analysisLine(row: AccountRow, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (row.status === 'completed') {
    const on = lastAnalyzedDate(row)
    return on ? t('rail.doneOn', { date: formatShortDate(new Date(on)) }) : t('rail.done')
  }
  return t(`rail.status.${row.status}`, { defaultValue: '' }) || t('rail.status.other')
}

function MyAnalysesDialog({ rows, onClose }: { rows: readonly AccountRow[]; onClose: () => void }) {
  const { t } = useTranslation('search')
  return (
    <Dialog open onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('rail.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('rail.analysesTitle')}</DialogTitle>
          <DialogDescription>{t('rail.analysesIntro')}</DialogDescription>
        </DialogHeader>
        {rows.length === 0 ? (
          <Text size="sm" className="px-1 pb-2 text-[var(--bellum-text-secondary)]">
            {t('rail.analysesEmpty')}
          </Text>
        ) : (
          <ul className="flex flex-col gap-2 px-1 pb-2">
            {rows.map(row => {
              const open = row.status === 'completed'
              return (
                <li
                  key={row.id}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[var(--bellum-border)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <Text size="sm" weight="semibold" className="truncate text-[var(--bellum-text-primary)]">
                      {row.company_name}
                    </Text>
                    <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                      {analysisLine(row, t)}
                    </Text>
                  </div>
                  {open ? (
                    <Link
                      to="/accounts/$id"
                      params={{ id: row.id }}
                      onClick={onClose}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
                    >
                      {t('rail.open')}
                    </Link>
                  ) : row.status === 'analyzing' ? null : (
                    <Link
                      to="/search"
                      search={{ accountId: row.id }}
                      onClick={onClose}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
                    >
                      {t('rail.relaunch')}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Le bouton « Mes analyses » de l'en-tête : ouvre la liste des dernières analyses de l'espace. */
export function MyAnalysesButton({ rows: given }: { rows?: readonly AccountRow[] } = {}) {
  const { t } = useTranslation('search')
  const [open, setOpen] = useState(false)
  // Posé dans l'en-tête de la route (hors de `Search`) : il lit alors lui-même les analyses récentes.
  const fetched = useRecentAnalysedAccounts()
  const rows = given ?? fetched
  return (
    <>
      <Button variant="outline" size="sm" icon={History} className="min-h-11" onClick={() => setOpen(true)}>
        {t('rail.myAnalyses')}
      </Button>
      {open ? <MyAnalysesDialog rows={rows} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function WhatYouGetDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('search')
  return (
    <Dialog open onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('rail.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('rail.whatTitle')}</DialogTitle>
        </DialogHeader>
        <ul className="flex flex-col gap-2 px-1 pb-2 text-sm text-[var(--bellum-text-secondary)]">
          <li>{t('rail.what1')}</li>
          <li>{t('rail.what2')}</li>
          <li>{t('rail.what3')}</li>
        </ul>
      </DialogContent>
    </Dialog>
  )
}

/**
 * « Importer un fichier ou une liste » (la modale d'import des comptes), seul, sous le pied de la refonte
 * Analyser (lot analyser-laura) qui porte déjà Récemment et « Ce que tu retrouveras » : la fonction reste.
 */
export function AnalyzeImportEntry() {
  const { t } = useTranslation('search')
  const [importing, setImporting] = useState(false)
  return (
    <div className="mx-auto flex w-full max-w-5xl justify-end px-3" data-testid="analyze-import">
      <Button variant="ghost" size="sm" icon={Upload} className="min-h-11" onClick={() => setImporting(true)}>
        {t('rail.import')}
      </Button>
      {importing ? <ImportPortfolioDialog onClose={() => setImporting(false)} /> : null}
    </div>
  )
}

/**
 * Le pied de la page « Analyser un compte » : Récemment (relancer un compte récent), « Ce que tu retrouveras »
 * (ce que livre une analyse) et « Importer un fichier ou une liste » (la modale d'import des comptes).
 */
export function AnalyzeRecentRail({ rows }: { rows: readonly AccountRow[] }) {
  const { t } = useTranslation('search')
  const [what, setWhat] = useState(false)
  const [importing, setImporting] = useState(false)
  const [all, setAll] = useState(false)
  const recent = rows.filter(row => row.status === 'completed').slice(0, 2)
  return (
    // Refonte Théo (`.an21-bottom`) — sous le formulaire, à plat : « Récemment » (logo + nom, relancer un
    // cadrage) et « Tout voir » (Mes analyses) à gauche, « Ce que tu retrouveras » à droite, puis l'import.
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-3 pt-5" data-testid="analyze-rail">
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--bellum-border)] pt-4">
        <section aria-label={t('rail.recently')} className="flex flex-wrap items-center gap-2">
          {recent.length > 0 ? (
            <>
              <Text size="xs" className="flex items-center gap-1 text-[var(--bellum-text-secondary)]">
                <History className="size-3.5" aria-hidden />
                {t('rail.recently')}
              </Text>
              {recent.map(row => (
                <Link key={row.id} to="/search" search={{ accountId: row.id }} className={CHIP}>
                  <CompanyAvatar name={row.company_name} size="sm" logoUrl={row.logo_url} website={row.website} />
                  {row.company_name}
                  <ArrowRight className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden />
                </Link>
              ))}
              <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setAll(true)}>
                {t('rail.seeAll')}
              </Button>
            </>
          ) : null}
        </section>
        <Button variant="ghost" size="sm" icon={Info} className="min-h-11" onClick={() => setWhat(true)}>
          {t('rail.whatTitle')}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" icon={Upload} className="min-h-11" onClick={() => setImporting(true)}>
          {t('rail.import')}
        </Button>
      </div>
      {what ? <WhatYouGetDialog onClose={() => setWhat(false)} /> : null}
      {all ? <MyAnalysesDialog rows={rows} onClose={() => setAll(false)} /> : null}
      {importing ? <ImportPortfolioDialog onClose={() => setImporting(false)} /> : null}
    </div>
  )
}
