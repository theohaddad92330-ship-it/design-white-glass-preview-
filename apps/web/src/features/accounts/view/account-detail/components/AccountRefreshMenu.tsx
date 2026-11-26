import { DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent } from '@bellum/ui'
import { refreshDimensionSchema, type RefreshDimension } from '@bellum/contracts'
import {
  Building2,
  Compass,
  FolderKanban,
  Landmark,
  Network,
  RadioTower,
  RefreshCw,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useRefreshDimension } from '@/features/accounts/hooks/useRefreshDimension'
import { DossierCtaMenuItem, DossierCtaSubTrigger } from '@/features/accounts/view/account-detail/cta/DossierCta'

/** Icon per dimension — mirrors the account-detail tab iconography.
 *
 * #2318.2 — les six alias produit reprennent l'icône de la phase qu'ils
 * recouvrent (`identity_group`/`ecosystem`/`projects` → celle de `signals`,
 * `subsidiaries`/`positions` → celle de `entities`) SAUF quand un pictogramme
 * plus précis existe déjà dans la bibliothèque (groupe, réseau, dossier) —
 * la précision du nom ne doit pas se perdre dans une icône dupliquée. */
const DIMENSION_ICON: Record<RefreshDimension, LucideIcon> = {
  signals: RadioTower,
  contacts: Users,
  entities: Building2,
  strategy: Target,
  identity_group: Landmark,
  subsidiaries: Building2,
  positions: Network,
  ecosystem: Compass,
  buying_path: Target,
  projects: FolderKanban,
}

type AccountRefreshMenuProps = {
  accountId: string
}

/**
 * "Rafraîchir" (Théo P1 : « Refresh signaux / contacts / entités / stratégie
 * séparément, avec coût/crédits »). Each item re-runs ONLY that dimension of
 * the dossier — far cheaper than a full re-analysis — and spends a single
 * enrichment credit, surfaced inline so the cost is never a surprise.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1816 (troisième tour) — DESCENDU dans le menu « … », pas retiré
 * ─────────────────────────────────────────────────────────────────────────
 * Ce bloc portait sa propre racine `DropdownMenu` + son propre bouton
 * déclencheur. Louis a tranché : un rafraîchissement PAR AXE est un geste
 * occasionnel (le geste quotidien reste « Actualiser l'analyse », au premier
 * niveau) — il rejoint donc le menu « … » existant COMME SOUS-MENU
 * (`DropdownMenuSub`), plutôt que de garder son propre bouton à côté. Un seul
 * menu « … » sur la barre (loi 4 du tome 7 : rien n'apparaît deux fois sous
 * la même forme) ; ce composant n'est donc plus une racine autonome — il
 * DOIT être monté à l'intérieur du `<DropdownMenuContent>` d'un menu parent
 * (voir `AccountDetailMoreActionsMenu`). Chaque item reste un vrai
 * `menuitem` Radix — atteignable au clavier, annoncé, avec son propre nom
 * accessible (GA-32, GA-35) — exactement comme avant, juste un niveau plus
 * bas.
 */
export function AccountRefreshMenu({ accountId }: AccountRefreshMenuProps) {
  const { t } = useTranslation('accounts')
  const refresh = useRefreshDimension(accountId)
  const pendingDimension = refresh.isPending ? (refresh.variables ?? null) : null

  return (
    <DropdownMenuSub>
      <DossierCtaSubTrigger cta="dossier.refresh.menu" className="gap-1.5" busy={refresh.isPending}>
        <RefreshCw className="size-4" />
        {t('refreshMenu.trigger')}
      </DossierCtaSubTrigger>
      <DropdownMenuSubContent className="w-60">
        <DropdownMenuLabel>{t('refreshMenu.label')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {refreshDimensionSchema.options.map(dimension => {
          const Icon = DIMENSION_ICON[dimension]
          const isThisPending = pendingDimension === dimension
          return (
            <DossierCtaMenuItem
              key={dimension}
              // #2116.28-37 — UN contrat (`dossier.refresh.dimension`) pour les
              // quatre axes : c'est le même bouton rendu quatre fois.
              cta="dossier.refresh.dimension"
              className="flex items-center justify-between gap-2"
              busy={refresh.isPending}
              // Keep the menu semantics clean: fire the mutation, let the toast
              // report the outcome (and the debited credit).
              onClick={() => refresh.mutate(dimension)}
            >
              <span className="flex items-center gap-2">
                <Icon className="size-4" />
                {/* i18n keys: refreshDimension.signals | refreshDimension.contacts | refreshDimension.entities | refreshDimension.strategy */}
                {t(`refreshDimension.${dimension}`)}
              </span>
              <span className="text-xs text-[var(--bellum-text-muted)]">{isThisPending ? '…' : null}</span>
            </DossierCtaMenuItem>
          )
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
