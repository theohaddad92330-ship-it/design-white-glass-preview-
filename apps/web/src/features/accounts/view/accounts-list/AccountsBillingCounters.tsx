import { Box, Text, Tooltip, TooltipContent, TooltipTrigger, cn } from '@bellum/ui'
import { AlertTriangle, Briefcase, Building2, CircleCheck, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PortfolioTile, PortfolioTileKey } from './accountsPortfolioTiles'
import { useAccountsPortfolioBand } from './useAccountsPortfolioBand'

/**
 * LE BANDEAU À SIX TUILES DU PORTEFEUILLE (maquette 11, 31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIX, ET DEUX D'ENTRE ELLES ÉTAIENT INTERDITES IL Y A UNE JOURNÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lot du 30/08 n'en affichait que deux, et avait ÉCARTÉ « missions en
 * cours » et « freelances en mission » pour une raison juste :
 * `GET /delivery/expansion` calculait `expertsOnSite` comme le nombre de
 * missions, donc le même chiffre sous deux noms. La jointure d'affectation est
 * réparée (`COUNT(DISTINCT consultant_id)` sur la fenêtre couvrante), les deux
 * tuiles sont deux mesures, et elles reviennent.
 *
 * ⚠️ La seconde porte une condition que la première n'a pas : quand AUCUNE
 * mission active ne porte d'affectation enregistrée, elle se tait au lieu
 * d'annoncer « 0 ». Ce zéro-là compterait des lignes que personne n'a écrites,
 * et se lirait « bench complet » chez une agence qui tourne à plein.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE DÉCIDE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Rien. La valeur, son absence, sa raison, sa variation et son périmètre
 * viennent tous de `buildPortfolioTiles` (pur, testé). Un `?? 0` glissé dans du
 * JSX est la façon exacte dont « non mesuré » redevient « 0 » — la seule parade
 * est de retirer au JSX le droit de décider.
 *
 * ⚠️ Le mot « Organisations » n'apparaît nulle part : le produit dit COMPTES.
 * Le vocabulaire des maquettes est celui d'un autre outil.
 */

/** L'icône de chaque tuile. Décorative — le libellé porte le sens (GA-32). */
const TILE_ICON: Readonly<Record<PortfolioTileKey, typeof Building2>> = {
  total: Building2,
  withBillingEntity: Building2,
  activeMissions: Briefcase,
  consultantsOnMission: Users,
  ready: CircleCheck,
  alerts: AlertTriangle,
}

/**
 * La teinte de chaque tuile.
 *
 * ⚠️ Aucune couleur hexadécimale, aucune classe de la palette Tailwind en
 * couleur de texte : tout passe par les jetons du thème, donc les deux thèmes
 * restent à parité AA. Un fond à OPACITÉ se compose sur le fond du THÈME, et
 * son texte suit — d'où `*-soft-text` et jamais `--bellum-warning` nu, qui fait
 * 1,84:1 en clair.
 */
const TILE_TONE: Readonly<Record<PortfolioTileKey, { bg: string; fg: string }>> = {
  total: { bg: 'bg-[var(--bellum-surface-2)]', fg: 'text-[var(--bellum-text-secondary)]' },
  withBillingEntity: { bg: 'bg-[var(--accent-soft-bg)]', fg: 'text-[var(--accent-soft-text)]' },
  activeMissions: { bg: 'bg-[var(--info-soft-bg)]', fg: 'text-[var(--info-soft-text)]' },
  consultantsOnMission: { bg: 'bg-[var(--warning-soft-bg)]', fg: 'text-[var(--warning-soft-text)]' },
  ready: { bg: 'bg-[var(--success-soft-bg)]', fg: 'text-[var(--success-soft-text)]' },
  alerts: { bg: 'bg-[var(--danger-soft-bg)]', fg: 'text-[var(--danger-soft-text)]' },
}

export function AccountsBillingCounters({
  accountIds,
  followed,
  className,
}: {
  accountIds: readonly string[]
  /** Le compteur SERVEUR des comptes suivis. `undefined` = pas encore lu — et
   *  la tuile le dit, plutôt que d'afficher « 0 compte ». */
  followed?: number
  className?: string
}) {
  const tiles = useAccountsPortfolioBand({ followed, accountIds })
  return (
    // Pleine largeur et grille responsive : un bandeau de tableau de bord a
    // besoin de ses colonnes (D81). Deux tuiles au téléphone, six au grand
    // écran — jamais un défilement horizontal du corps de page.
    <Box className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6', className)}>
      {tiles.map(tile => (
        <PortfolioTileCard key={tile.key} tile={tile} />
      ))}
    </Box>
  )
}

function PortfolioTileCard({ tile }: { tile: PortfolioTile }) {
  const { t } = useTranslation('accounts')
  const Icon = TILE_ICON[tile.key]
  const tone = TILE_TONE[tile.key]

  return (
    <Box className="flex items-center gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 py-2.5">
      <span aria-hidden className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tone.bg, tone.fg)}>
        <Icon className="size-4" />
      </span>
      <Box className="flex min-w-0 flex-col">
        <Text element="span" size="xs" className="truncate text-[var(--bellum-text-muted)]">
          {t(`band.tiles.${tile.key}`)}
        </Text>
        <TileValue tile={tile} />
        <TileFooter tile={tile} />
      </Box>
    </Box>
  )
}

/**
 * LA VALEUR, OU LA RAISON DE SON ABSENCE — jamais un zéro de remplacement.
 *
 * Les trois absences ne se réparent pas de la même façon, donc elles ne se
 * disent pas de la même façon : un chargement passe tout seul, un échec se
 * réessaie, un staffing non saisi se saisit.
 */
function TileValue({ tile }: { tile: PortfolioTile }) {
  const { t } = useTranslation('accounts')
  if (tile.value === null) {
    const reason = t(`band.gaps.${tile.gap ?? 'loading'}`)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex cursor-help outline-none">
            <Text element="span" size="sm" className="text-[var(--bellum-text-muted)]">
              {t('band.unmeasured')}
            </Text>
          </span>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Text element="span" size="xl" weight="semibold" className="text-[var(--bellum-text-primary)] tabular-nums">
      {tile.value}
    </Text>
  )
}

/**
 * Sous la valeur : la variation du mois, ou le périmètre.
 *
 * ⚠️ Une tuile dont la population n'est PAS photographiée (`delta === null`)
 * n'écrit aucune ligne de variation — pas « non mesuré » non plus. Quatre
 * « non mesuré » alignés sous six tuiles ne se lisent plus, et feraient
 * conclure que le produit ne sait rien mesurer. L'absence de photo se dit une
 * fois, au survol du périmètre.
 */
function TileFooter({ tile }: { tile: PortfolioTile }) {
  const { t } = useTranslation('accounts')

  if (tile.delta?.measured) {
    const sign = tile.delta.change > 0 ? '+' : ''
    return (
      <Text element="span" size="xs" className="text-[var(--bellum-text-muted)] tabular-nums">
        {t('band.deltaThisMonth', { change: `${sign}${tile.delta.change}` })}
      </Text>
    )
  }
  if (tile.delta && !tile.delta.measured) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex cursor-help outline-none">
            <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('band.deltaUnmeasured')}
            </Text>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t(`band.deltaGaps.${tile.delta.gap}`)}</TooltipContent>
      </Tooltip>
    )
  }
  // La population qui rend le chiffre lisible passe AVANT le périmètre : « sur
  // 37 missions actives » dit ce que « 128 » vaut, ce que « tout l'espace » ne
  // dit pas.
  if (tile.denominator !== null) {
    return (
      <Text element="span" size="xs" className="text-[var(--bellum-text-muted)] tabular-nums">
        {t('band.denominator', { count: tile.denominator })}
      </Text>
    )
  }
  return (
    <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
      {t(`band.scope.${tile.scope}`)}
    </Text>
  )
}
