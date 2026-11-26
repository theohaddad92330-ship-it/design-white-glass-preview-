import { COMMERCIAL_STATUSES_REQUIRING_REASON, type CommercialLifecycle } from '@bellum/contracts'
import {
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuItem,
  ContextMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@bellum/ui'
import { Check, MoveRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSetCommercialStatus } from '@/features/accounts/hooks/useSetCommercialStatus'

// « Écarté » (l'archivage du DOSSIER, `AccountRowActionsMenu` → « Archiver »)
// reste un item dédié : il flippe aussi le statut d'ANALYSE, ce qui n'est pas
// ce sous-menu. L'ordre suit le pipe commercial.
//
// #2117.19 — `opening` existe dans `COMMERCIAL_LIFECYCLE_VALUES` depuis le
// 15/09 (CHECK SQL élargi avant le code, account.ts:72), mais restait une
// valeur ATTEIGNABLE PAR RIEN : ce tableau est le SEUL endroit (GA-26) qui
// peuple le sous-menu, et il ne la listait pas. Ajoutée en fin, comme
// l'enum : aucune cible existante ne bouge.
const MOVE_TARGETS: CommercialLifecycle[] = ['inbox', 'watching', 'opportunity', 'customer', 'opening']

/**
 * #2117.23 — LES DEUX SORTIES DU PIPE, SOUS UNE SÉPARATION.
 *
 * « Hors priorité » et « En veille » sortent un compte du travail courant, et
 * `COMMERCIAL_STATUSES_REQUIRING_REASON` (`@bellum/contracts`, GA-26 — un
 * seul endroit) est la SEULE liste qui le sait. Les choisir ici n'écrit RIEN :
 * `onRequestReason` remonte la cible au parent, qui ouvre
 * `CommercialStatusReasonDialog` — rendu HORS de ce menu (voir son
 * commentaire : un menu Radix se démonte en se fermant). Le motif, LUI, mute.
 */
const EXIT_TARGETS: CommercialLifecycle[] = ['dormant', 'archived']

const TRIGGER_CLASS =
  'rounded-lg px-2.5 py-2 text-sm focus:bg-[var(--bellum-surface-2)] focus:text-[var(--bellum-text-primary)]'
const CONTENT_CLASS =
  'w-48 rounded-lg border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-1.5 text-[var(--bellum-text-primary)] shadow-md'

/**
 * DEUX PORTES, UNE SEULE RÈGLE.
 *
 * Radix sépare `ContextMenu*` et `DropdownMenu*` : les composants ne
 * s'interchangent pas, et le sous-menu doit exister dans les deux depuis que
 * les actions de ligne sont aussi offertes par le « … » de fin de ligne.
 *
 * Ce qui se dédouble ici est le JEU DE PRIMITIVES, rien d'autre : les cibles,
 * la mutation, l'état courant et le libellé restent écrits une fois. Un
 * `variant` plutôt que deux fichiers, précisément pour qu'« ajouter une cible »
 * ne puisse pas n'atteindre qu'une des deux portes.
 */
const PRIMITIVES = {
  context: {
    Sub: ContextMenuSub,
    SubTrigger: ContextMenuSubTrigger,
    SubContent: ContextMenuSubContent,
    Item: ContextMenuItem,
    Separator: ContextMenuSeparator,
  },
  dropdown: {
    Sub: DropdownMenuSub,
    SubTrigger: DropdownMenuSubTrigger,
    SubContent: DropdownMenuSubContent,
    Item: DropdownMenuItem,
    Separator: DropdownMenuSeparator,
  },
} as const

type Props = {
  accountId: string
  current: CommercialLifecycle | undefined
  /** Dans quel menu ce sous-menu est rendu. Le clic droit et le « … » de fin de
   *  ligne offrent les mêmes gestes ; seules leurs primitives diffèrent. */
  variant?: keyof typeof PRIMITIVES
  /** #2117.23 — un statut de SORTIE (`COMMERCIAL_STATUSES_REQUIRING_REASON`) a
   *  été choisi : le parent ouvre le dialogue de motif. Ce sous-menu ne mute
   *  JAMAIS un de ces statuts lui-même. */
  onRequestReason: (status: CommercialLifecycle) => void
}

/**
 * Sous-menu « Déplacer vers » (Théo p.39) — tri commercial manuel d'un compte
 * entre À trier / À suivre / Opportunité / Client. Alimente les onglets de la
 * liste des comptes.
 */
export function CommercialStatusSubmenu({ accountId, current, variant = 'context', onRequestReason }: Props) {
  const { t } = useTranslation('accounts')
  const setStatus = useSetCommercialStatus()
  const { Sub, SubTrigger, SubContent, Item, Separator } = PRIMITIVES[variant]

  const renderTarget = (target: CommercialLifecycle) => {
    const isCurrent = (current ?? 'inbox') === target
    return (
      <Item
        key={target}
        disabled={isCurrent || setStatus.isPending}
        onSelect={() => {
          // #2117.23 — un statut de SORTIE ne mute jamais depuis ce menu : il
          // remonte au parent, qui ouvre le dialogue de motif. Le seul endroit
          // qui sait lesquels (GA-26) est `COMMERCIAL_STATUSES_REQUIRING_REASON`.
          if (COMMERCIAL_STATUSES_REQUIRING_REASON.includes(target)) {
            onRequestReason(target)
            return
          }
          setStatus.mutate({ id: accountId, status: target })
        }}
        className={TRIGGER_CLASS}
      >
        {isCurrent ? <Check className="size-4 text-[var(--bellum-text-accent)]" /> : <span className="size-4" />}
        {/* i18n keys: commercialStatus.inbox | commercialStatus.watching | commercialStatus.opportunity | commercialStatus.customer | commercialStatus.opening | commercialStatus.archived | commercialStatus.dormant */}
        {t(`commercialStatus.${target}`)}
      </Item>
    )
  }

  return (
    <Sub>
      <SubTrigger className={TRIGGER_CLASS}>
        <MoveRight className="size-4 text-[var(--bellum-text-accent)]" />
        {t('list.moveTo')}
      </SubTrigger>
      <SubContent className={CONTENT_CLASS}>
        {MOVE_TARGETS.map(renderTarget)}
        <Separator className="my-1 bg-[var(--bellum-border)]" />
        {EXIT_TARGETS.map(renderTarget)}
      </SubContent>
    </Sub>
  )
}
