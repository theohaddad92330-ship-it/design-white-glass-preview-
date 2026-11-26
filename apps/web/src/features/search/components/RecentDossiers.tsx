import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { formatDate } from '@/lib/locale'

/**
 * Théo B r1-recherche.R11/N4 — « Ou essaie un dossier » (accès direct à des dossiers DÉJÀ présents dans l'espace) et le
 * bloc « Récemment » (le dernier dossier analysé + « Préparer une approche », « Tout voir » vers le portefeuille).
 * Les dossiers viennent de l'espace — jamais d'exemple inventé : un espace sans dossier n'affiche ni pastille ni bloc.
 * Un clic sur une pastille PRÉREMPLIT le champ, il ne lance rien.
 */
/**
 * #4512 (décision Louis 23/10) — en salle de démonstration, « Ou essaie un dossier » nomme les dossiers SEMÉS à partir de
 * vraies analyses (`apps/api/src/modules/demo/demo-analysed-accounts.ts`), dans cet ordre. Ce sont des comptes réels de
 * la salle, lus par la même liste que partout ailleurs : un nom absent de la salle ne fait aucune pastille.
 */
export const DEMO_TRY_DOSSIERS = ['Airbus', 'EDF', 'Renault', 'Thales'] as const

/** Les dossiers semés d'abord (dans l'ordre de `DEMO_TRY_DOSSIERS`), puis les autres dans l'ordre reçu. */
export function demoDossiersFirst<T extends { company_name: string }>(dossiers: readonly T[]): T[] {
  const rank = (name: string) => {
    const index = DEMO_TRY_DOSSIERS.findIndex(demo => demo.toLowerCase() === name.trim().toLowerCase())
    return index < 0 ? DEMO_TRY_DOSSIERS.length : index
  }
  return [...dossiers].sort((a, b) => rank(a.company_name) - rank(b.company_name))
}

export function useRecentDossiers() {
  const { user } = useSession()
  const isDemo = useIsDemo()
  // Une seule page de quatre dossiers : pas de défilement infini pour une rangée de pastilles. Une réponse absente
  // (réseau, espace vide) = aucune pastille, jamais une erreur d'écran. En démo, une page large pour retrouver les
  // dossiers semés quelle que soit leur date.
  const recents = useQuery({
    queryKey: [...accountKeys.list(user?.id), 'search-recents', isDemo],
    queryFn: () => accountsApi.list({ status: 'completed', sort: 'date_desc', limit: isDemo ? 100 : 4, offset: 0 }),
    enabled: Boolean(user),
    staleTime: 60_000,
  })
  const dossiers = recents.data?.data ?? []
  return isDemo ? demoDossiersFirst(dossiers).slice(0, 4) : dossiers
}

export function TryDossierChips({
  dossiers,
  onPick,
}: {
  dossiers: readonly { id: string; company_name: string }[]
  onPick: (name: string) => void
}) {
  const { t } = useTranslation('search')
  if (dossiers.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('frame.tryDossier')}
      </Text>
      {dossiers.slice(0, 3).map(dossier => (
        <button
          key={dossier.id}
          type="button"
          onClick={() => onPick(dossier.company_name)}
          className="min-h-9 max-w-full truncate rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-1 text-sm font-medium text-[var(--bellum-text-secondary)] transition-colors hover:bg-[var(--bellum-surface-1)] hover:text-[var(--bellum-text-primary)] pointer-coarse:min-h-11"
        >
          {dossier.company_name}
        </button>
      ))}
    </div>
  )
}

export function RecentBlock({
  dossier,
}: {
  dossier: { id: string; company_name: string; last_analyzed_at?: string | null } | undefined
}) {
  const { t } = useTranslation('search')
  if (!dossier) return null
  const analysedOn = dossier.last_analyzed_at ? formatDate(dossier.last_analyzed_at) : null
  return (
    <section
      aria-label={t('frame.recent.title')}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-4 py-3"
    >
      <History className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
      <Text size="sm" weight="medium">
        {t('frame.recent.title')}
      </Text>
      <Text size="sm" className="min-w-0 truncate text-[var(--bellum-text-secondary)]">
        {dossier.company_name}
        {analysedOn ? ` · ${analysedOn}` : ''}
      </Text>
      <Link
        to="/accounts/$id"
        params={{ id: dossier.id }}
        className="inline-flex min-h-9 items-center text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
      >
        {t('frame.recent.prepare')}
      </Link>
      <Link
        to="/accounts"
        className="ml-auto inline-flex min-h-9 items-center text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
      >
        {t('frame.recent.seeAll')}
      </Link>
    </section>
  )
}
