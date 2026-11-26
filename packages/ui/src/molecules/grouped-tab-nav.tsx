import { memo, useEffect, useId, useRef, useState } from 'react'
import { Box } from '../atoms/box'
import { Text } from '../atoms/text'
import { cn } from '../lib/utils'

export type GroupedTabNavGroup = {
  key: string
  label: string
}

export type GroupedTabNavTab = {
  key: string
  label: string
  group: string
}

export type GroupedTabNavProps = {
  groups: GroupedTabNavGroup[]
  tabs: GroupedTabNavTab[]
  /** La clé de l'onglet OUVERT — c'est elle qui décide du groupe actif. */
  activeTab: string
  onTabChange: (key: string) => void
  className?: string
}

/**
 * La barre d'onglets GROUPÉE — option B, tranchée par Louis le 01/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * « Les onglets en général sont super moches […] et dans des cas comme
 * Missions, on a ce souci de barre d'onglets infinie. »
 *
 * Missions comptait TREIZE onglets. La barre défilait — c'était déjà le
 * correctif du 31/08 — mais un onglet qu'il faut aller chercher en glissant
 * n'est pas atteignable pour qui ne sait pas qu'il existe : « Paiements » et
 * « Suivi » sortaient du champ, et le dégradé du bord droit ne se remarque pas.
 *
 * Treize onglets ne sont pas treize sujets, ce sont quatre MOMENTS du mois. La
 * barre porte les moments, chacun ouvre les siens. Sa largeur ne dépend donc
 * plus du nombre d'écrans : elle est bornée par CONSTRUCTION, à toute taille
 * d'écran, et pas par une mesure qui devrait se refaire à chaque redimension.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EST NON NÉGOCIABLE ICI
 * ─────────────────────────────────────────────────────────────────────────
 * · **Le groupe actif NOMME l'écran ouvert.** Un groupe seulement souligné
 *   dirait « tu es quelque part dans Encaisser » — quatre écrans possibles.
 *   Le nom de l'écran est écrit à côté du groupe, en plus petit.
 * · **Un seul menu ouvert à la fois**, et Échap le referme : un menu ouvert
 *   recouvre le contenu qu'on vient lire.
 * · **L'écran ouvert est marqué DANS son menu** (`aria-current`), sinon
 *   rouvrir le menu ne dit plus où l'on est.
 * · Ce qui se clique se tabule : des `<button>`, jamais un `<div onClick>`.
 */
export const GroupedTabNav = memo<GroupedTabNavProps>(function GroupedTabNav({
  groups,
  tabs,
  activeTab,
  onTabChange,
  className,
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const active = tabs.find(tab => tab.key === activeTab)

  /* Un clic hors de la barre referme : sans ça, un menu resterait ouvert
     par-dessus le contenu qu'on essaie d'atteindre. */
  useEffect(() => {
    if (!openGroup) return
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpenGroup(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [openGroup])

  return (
    <Box
      ref={container}
      display="flex"
      className={cn('items-stretch gap-1 border-b border-[var(--bellum-border)]', className)}
    >
      {groups.map(group => {
        const members = tabs.filter(tab => tab.group === group.key)
        if (members.length === 0) return null

        /**
         * #1831 — un groupe à UN SEUL membre coûtait un clic pour rien : il
         * fallait ouvrir un menu (« Ouvrir », « Archives ») pour révéler son
         * unique destination (« Créer une mission », « Historique »), soit
         * deux libellés pour une seule route. Un groupe à un membre se rend
         * alors en simple bouton de navigation DIRECTE, portant le libellé de
         * l'ONGLET — jamais celui du groupe, qui deviendrait un doublon muet
         * — sans chevron ni `aria-haspopup` : il n'y a rien à déplier.
         */
        if (members.length === 1) {
          const only = members[0]
          const isOnlyActive = only.key === activeTab
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => onTabChange(only.key)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-2 transition-colors pointer-coarse:min-h-11',
                'border-b-2 -mb-px',
                isOnlyActive
                  ? 'border-[var(--bellum-primary-500)] text-[var(--bellum-text-primary)]'
                  : 'border-transparent text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
              )}
            >
              <Text element="span" size="sm" weight={isOnlyActive ? 'medium' : 'normal'} noWrap>
                {only.label}
              </Text>
            </button>
          )
        }

        const isActive = active?.group === group.key
        const isOpen = openGroup === group.key

        return (
          <Box key={group.key} className="relative shrink-0">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isOpen}
              aria-controls={isOpen ? `${menuId}-${group.key}` : undefined}
              onClick={() => setOpenGroup(current => (current === group.key ? null : group.key))}
              className={cn(
                'flex items-center gap-1.5 rounded-t-md px-3 py-2 transition-colors pointer-coarse:min-h-11',
                'border-b-2 -mb-px',
                isActive
                  ? 'border-[var(--bellum-primary-500)] text-[var(--bellum-text-primary)]'
                  : 'border-transparent text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
              )}
            >
              <Text element="span" size="sm" weight={isActive ? 'medium' : 'normal'} noWrap>
                {group.label}
              </Text>
              {/* L'écran ouvert, NOMMÉ. Un groupe seulement souligné laisserait
                  quatre écrans possibles. */}
              {isActive && active && (
                <Text element="span" size="xs" noWrap className="text-[var(--bellum-text-muted)]">
                  · {active.label}
                </Text>
              )}
              <svg viewBox="0 0 10 10" aria-hidden="true" className="size-2.5 shrink-0">
                <path d="M1 3.5 5 7l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>

            {isOpen && (
              <div
                id={`${menuId}-${group.key}`}
                role="menu"
                aria-label={group.label}
                tabIndex={-1}
                onKeyDown={event => {
                  if (event.key === 'Escape') setOpenGroup(null)
                }}
                /* #1867 — `z-picker` (90) et non `z-nav` (40).
                   Ce menu portait le jeton de la CHROME, comme `PageHeader`
                   (`components/layout/PageHeader.tsx`). À z-index ÉGAL, CSS
                   départage par l'ordre du DOM : l'entête est rendue APRÈS la
                   barre d'onglets par `CustomerPageContent`, donc elle gagnait
                   — et son `backdrop-blur-xl` sans fond floutait les 46 px
                   supérieurs du menu ouvert, mesurés sur la capture de
                   `/accounts/partners`. `z-picker` est le jeton des menus dans
                   l'échelle nommée : les onze autres panneaux surgissants du
                   dépôt le portent depuis #1788, celui-ci était le seul menu
                   habillé en chrome. Gardé par GA-289. */
                className="absolute left-0 top-full z-picker mt-1 flex min-w-56 flex-col gap-0.5 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-1.5 shadow-lg"
              >
                {members.map(member => {
                  const current = member.key === activeTab
                  return (
                    <button
                      key={member.key}
                      type="button"
                      role="menuitem"
                      aria-current={current}
                      onClick={() => {
                        setOpenGroup(null)
                        onTabChange(member.key)
                      }}
                      className={cn(
                        'rounded-md px-2.5 py-2 text-left transition-colors pointer-coarse:min-h-11',
                        current
                          ? 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-accent)]'
                          : 'text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
                      )}
                    >
                      <Text element="span" size="sm" weight={current ? 'medium' : 'normal'} noWrap>
                        {member.label}
                      </Text>
                    </button>
                  )
                })}
              </div>
            )}
          </Box>
        )
      })}
    </Box>
  )
})
