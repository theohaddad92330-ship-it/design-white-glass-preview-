import { Link, useLocation } from '@tanstack/react-router'
import {
  cn,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from '@bellum/ui'
import { ChevronRight, Lock } from 'lucide-react'
import type { PlanFeatureKey } from '@bellum/contracts'
import type { ReactNode } from 'react'
import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDefaultDiscover } from '@/features/discover/hooks/useDefaultDiscover'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { useHideLockedNav, useLockedNavFeatures } from '@/features/plan-features/useLockedNavFeatures'
import { useReadPreferences } from '@/features/preferences/preferences-provider'
/**
 * L'allumage n'est PLUS décidé ici — D51 (26/08/2026).
 *
 * Il l'était par PRÉFIXE D'URL, et neuf routes d'onglet (`/rfp`, `/contacts`,
 * `/mailbox`…) n'allumaient donc aucune entrée : leur chemin ne préfixe pas
 * celui de la section qui les accueille. La réponse vit désormais dans le
 * MODÈLE — `isNavEntryActive`, à un seul endroit (GA-26), la même dérivation
 * que `sectionForPath`, qui range déjà chaque chemin sous sa section.
 *
 * La règle `/dashboard` qui vivait ici a disparu avec elle : `/dashboard` n'est
 * plus une entrée depuis la réduction à neuf, c'est un ONGLET d'« Aujourd'hui »
 * — et c'est ce que le modèle répond maintenant, en allumant `/briefing`.
 */
import { activeNavFamily, isNavEntryActive, isNavTabActive, type NavEntry } from '@/components/navigation/sections'
import { ShortcutKeys } from '@/features/shortcuts/ShortcutKeys'
import { shortcutForRoute } from '@/features/shortcuts/shortcuts'
import { Badge } from '@bellum/ui'
import { COLLAPSED_ENTRY, COLLAPSED_GUTTER, HIDDEN_WHEN_COLLAPSED } from './collapsed'
import { ALWAYS_VISIBLE_NAV, type SidebarSection } from './items'
import { formatNavBadgeCount } from './nav-badge'
import { SidebarCollapseToggle } from './SidebarCollapseToggle'
import { useSidebarCollapsePreference } from './useSidebarCollapsePreference'

/**
 * #2155.24/.25 — un compteur de nav par ROUTE, jamais recopié dans `sections.ts`
 * (modèle PUR, lu par des tests) ni dans `items.ts` (dérivé une seule fois au
 * chargement du module, donc incapable de porter un chiffre qui vit en
 * requête). Il est lu ICI, à la présentation, keyed par la route qu'il compte.
 */
type NavBadges = Record<string, number | undefined>

/**
 * Contenu rendu SOUS une entrée de nav, quand cette entrée est active.
 *
 * Clé = la route de lentrée (`/chat`). Cest ce qui permet à Laura de déplier
 * ses conversations dans la barre latérale sans que le modèle de navigation
 * (`sections.ts`, PUR et lu par des tests) ait à connaître des titres
 * dynamiques : ses `children` attendent des clés i18n statiques, ce quun fil de
 * discussion nest pas.
 *
 * ⚠️ Le nœud nest monté QUE si lentrée est active — sinon la barre latérale,
 * qui vit sur tous les écrans, tirerait lhistorique du copilote sur chaque
 * page.
 */
type NavSlots = Record<string, ReactNode>

type AppSidebarProps = {
  topSection: SidebarSection
  slots?: NavSlots
  bottomSection?: SidebarSection
  /** Coque Théo — les entrées du PIED (Intégrations, Paramètres), au-dessus de `footer`. */
  footSection?: SidebarSection
  header?: ReactNode
  topAction?: ReactNode
  footer?: ReactNode
  /** #2155.24/.25 — voir `NavBadges` ci-dessus. */
  badges?: NavBadges
  /** #4492.1 — le compteur d'une sous-entrée (vues de la Messagerie), rendu seulement quand elle se déplie. */
  renderSubBadge?: (entryKey: string) => ReactNode
}

/**
 * `Link` a SA propre idée de « je suis actif », et elle est par PRÉFIXE.
 *
 * Elle pose `aria-current="page"` toute seule, et elle l'écrase en dernier —
 * un `aria-current={undefined}` explicite ne la retire pas. La barre
 * ANNONCERAIT donc une entrée qu'elle ne COLORE pas, dès que le modèle range
 * un chemin ailleurs que sous son préfixe d'URL : c'est exactement ce qui
 * arrive à `/pilotage/rex` le jour où il passe sous Missions.
 *
 * `exact` éteint cette seconde dérivation. Ce qui est annoncé est alors ce que
 * `isNavEntryActive` a décidé, et rien d'autre. Aucun style n'en dépend :
 * `data-status` et la classe `active` que `Link` pose au passage ne sont lus
 * nulle part dans le dépôt — c'est `data-active`, posé par `SidebarMenuButton`,
 * qui porte la couleur.
 */
const EXACT_MATCH_ONLY = { exact: true } as const

function NavSection({
  section,
  discoverPreparing = false,
  slots,
  badges,
  renderSubBadge,
}: {
  section: SidebarSection
  discoverPreparing?: boolean
  slots?: NavSlots
  badges?: NavBadges
  renderSubBadge?: (entryKey: string) => ReactNode
}) {
  const location = useLocation()
  const { t } = useTranslation('nav')
  const { t: tCommon } = useTranslation('common')
  const preferences = useReadPreferences()
  // Gating par offre : l'entrée reste visible, marquée d'un cadenas. Le clic
  // ouvre l'écran, qui explique la fonction et nomme l'offre qui l'inclut —
  // masquer l'entrée priverait le commercial de la raison de monter d'offre.
  const lockedFeatures = useLockedNavFeatures()
  const hideLocked = useHideLockedNav()
  // Sidebar customization (Préférences › Apparence): a user can hide nav items.
  // Essential entries (ALWAYS_VISIBLE_NAV — e.g. Settings, Aujourd'hui) can never
  // be hidden, so a customization mistake can never lock the user out of them.
  // Neither can the ACTIVE destination (#2144.29, épopée #2928): landing on a
  // screen you had hidden must not erase the one thing that tells you where you
  // are — it only stays hidden once you navigate away from it.
  const visibleItems = section.items.filter(item => {
    const path = String(item.to)
    if (ALWAYS_VISIBLE_NAV.includes(path)) return true
    if (isNavEntryActive(path, location.pathname)) return true
    if (preferences.hiddenNavItems.includes(path)) return false
    // Avant la première analyse, la barre latérale ne montre que ce qui est
    // UTILISABLE (§12). Les modules d'offre supérieure réapparaissent — avec
    // leur cadenas et leur argument — une fois le premier dossier livré, quand
    // « voici ce que l'offre supérieure ajoute » veut enfin dire quelque chose.
    if (hideLocked && item.feature != null && lockedFeatures.has(item.feature)) return false
    return true
  })
  /**
   * #3132 — le tiroir « Prospection » colorait son EN-TÊTE en repli de section
   * ENTIÈRE, sauf quand un de ses enfants (Comptes/Contacts/Mes cibles)
   * s'allumait plus précisément (`sectionActive && !(open && parentActive)`,
   * `CollapsibleNavItem` avant #3132). Aplatis, Comptes REJOUE ce rôle de
   * repli — il garde `isNavEntryActive` — mais doit se taire quand Contacts ou
   * Mes cibles (`promotedTab`) matchent leur onglet EXACT : sinon les deux
   * s'allumeraient ensemble, la même section au modèle sous deux entrées.
   */
  // #4491 / #4492 — où l'on est, à la vue près (`?vue=agenda`, `?lens=lists`) : la même réponse que la
  // barre du haut (`activeNavFamily`), jamais recalculée ici.
  const family = activeNavFamily(location.pathname, (location.search ?? {}) as Record<string, unknown>)
  return (
    <SidebarGroup className="px-0 py-0">
      {/* Coque Théo — la rubrique se NOMME à l'œil (« ESPACE DE TRAVAIL », `.nav-section`) :
          12 px (plancher GA-31), capitales espacées. Repliée, le rail n'a plus la place d'un mot. */}
      {section.labelKey ? (
        <div
          data-shell="nav-section"
          className={cn(
            'px-3.5 pb-2.5 pt-1.5 text-xs font-bold uppercase tracking-widest text-[var(--bellum-text-muted)]',
            HIDDEN_WHEN_COLLAPSED,
          )}
        >
          {t(section.labelKey)}
        </div>
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {visibleItems.map(item => {
            const active = isNavEntryActive(String(item.to ?? ''), location.pathname)
            if (item.children?.length) {
              return <CollapsibleNavItem key={item.labelKey} item={item} pathname={location.pathname} badges={badges} />
            }
            // While the default « Découvrir » run is prefetching, its entry is
            // greyed with a « Préparation… » hint, then un-greys when ready.
            const preparing = discoverPreparing && item.to === '/discover'
            const disabled = item.disabled === true || preparing
            const disabledReason = preparing ? t('preparing') : t(item.disabledReasonKey ?? 'comingSoon')
            // Verrouillée ≠ désactivée : on n'empêche pas le clic, on le
            // signale. L'écran d'arrivée fait la vente.
            const locked = item.feature != null && lockedFeatures.has(item.feature) && !disabled
            // Tome 7 §30 — « un raccourci qu'il faut découvrir n'existe pas ».
            // La séquence `G` + lettre existait depuis le 26/08 et n'était
            // écrite NULLE PART hors de la liste `⌘/`, elle-même atteignable
            // par un raccourci.
            //
            // ⚠️ Depuis le 30/08 elle n'apparaît QUE dans l'infobulle, que
            // `SidebarMenuButton` ne montre que barre REPLIÉE — là où le libellé
            // a disparu et où l'infobulle est de toute façon le seul moyen de
            // lire l'entrée. Dépliée, plus rien : la page `/settings/shortcuts`
            // est l'endroit où les raccourcis s'apprennent, et elle en dit plus.
            // Lue dans le registre, jamais recopiée.
            const shortcut = shortcutForRoute(String(item.to ?? ''))
            return (
              <SidebarMenuItem key={String(item.to)} className={item.separated ? 'mt-3 pt-3' : undefined}>
                <SidebarMenuButton
                  asChild={!disabled}
                  isActive={active && !disabled}
                  disabled={disabled}
                  aria-disabled={disabled}
                  title={disabled ? disabledReason : undefined}
                  // Repliée, l'entrée n'affiche plus que son icône : l'infobulle
                  // est le seul moyen de la lire à l'œil. `SidebarMenuButton` ne
                  // la montre QUE dans cet état — dépliée, elle doublerait un
                  // libellé déjà visible.
                  tooltip={
                    shortcut
                      ? {
                          children: (
                            <span className="flex items-center gap-2">
                              {t(item.labelKey)}
                              <ShortcutKeys shortcut={shortcut} />
                            </span>
                          ),
                        }
                      : t(item.labelKey)
                  }
                  className={cn(
                    // Coque Théo — `.nav-item` : 40 px, rayon 8, icône 20, actif sur l'aplat d'accent.
                    'h-auto min-h-10 gap-2.5 rounded-control px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                    COLLAPSED_ENTRY,
                    // Verrouillé par l'offre : GRISÉ comme un élément désactivé,
                    // mais toujours cliquable — la page d'arrivée vend le palier.
                    locked && 'opacity-50',
                    disabled
                      ? 'cursor-not-allowed text-[var(--bellum-text-muted)] opacity-50 hover:bg-transparent hover:text-[var(--bellum-text-muted)]'
                      : active
                        ? 'font-semibold hover:bg-[var(--bellum-accent-bg)] hover:text-[var(--bellum-text-accent)] data-[active=true]:font-semibold'
                        : 'text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
                  )}
                >
                  {disabled ? (
                    <>
                      <item.icon className="size-5 shrink-0 text-[var(--bellum-text-muted)]" />
                      <span>{t(item.labelKey)}</span>
                    </>
                  ) : (
                    <Link
                      to={item.to}
                      title={locked ? tCommon('planFeatures.locked.navLocked') : undefined}
                      /* « Où suis-je ? » ne se répond pas en couleur.
                         `SidebarMenuButton` ne pose que `data-active`, un crochet
                         de STYLE qu'aucun lecteur d'écran ne lit — et c'est
                         justement l'écran où savoir où l'on est se joue. */
                      aria-current={active ? 'page' : undefined}
                      activeOptions={EXACT_MATCH_ONLY}
                    >
                      <item.icon
                        className={cn(
                          'size-5 shrink-0',
                          active ? 'text-[var(--bellum-text-accent)]' : 'text-[var(--bellum-text-secondary)]',
                        )}
                      />
                      {/* `truncate` explicite : `SidebarMenuButton` le pose sur
                          `span:last-child`, place que le cadenas « verrouillé »
                          occupe quand il est là. Sans lui, un libellé long
                          déborderait au lieu de s'abréger. */}
                      <span className={cn('truncate', locked && 'text-[var(--bellum-text-muted)]')}>
                        {t(item.labelKey)}
                      </span>
                      {/* #2155.24/.25 — absent quand la mesure a échoué OU que la
                          population est vide : jamais un « 0 » qui prétendrait
                          avoir compté (`formatNavBadgeCount`). */}
                      {!locked &&
                        (() => {
                          const badgeText = formatNavBadgeCount(badges?.[String(item.to)])
                          return badgeText ? (
                            <Badge variant="primary" className={cn('ml-auto shrink-0', HIDDEN_WHEN_COLLAPSED)}>
                              {badgeText}
                            </Badge>
                          ) : null
                        })()}
                      {locked && (
                        <Lock
                          className={cn(
                            'ml-auto size-3 shrink-0 text-[var(--bellum-text-muted)]',
                            HIDDEN_WHEN_COLLAPSED,
                          )}
                          aria-label={tCommon('planFeatures.locked.navLocked')}
                        />
                      )}
                      {/* ⚠️ Aucun capuchon ici — retiré le 30/08. `G C` et ses
                          six voisins s'affichaient en permanence à droite du
                          libellé : sept capuchons sur huit lignes, dans la
                          colonne la plus étroite du produit, ouverte huit heures
                          par jour. « Plus que ça pollue l'interface. »

                          Le raccourci n'est pas effacé, il a DÉMÉNAGÉ : il vit
                          dans l'infobulle ci-dessus (barre repliée, à la
                          demande) et sur `/settings/shortcuts`, qui en dit plus
                          — sa portée, ce qu'il fait. Garde GA-95. */}
                    </Link>
                  )}
                </SidebarMenuButton>
                {active && slots?.[String(item.to)] ? slots[String(item.to)] : null}
                {active && !disabled && item.subEntries && item.subEntries.length > 1 && family ? (
                  <NavSubEntries
                    label={t('subnavLabel', { section: t(item.labelKey) })}
                    entries={item.subEntries}
                    activeKey={family.activeKey}
                    lockedFeatures={lockedFeatures}
                    renderBadge={renderSubBadge}
                  />
                ) : null}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

/**
 * #4492.1 (PR 12C, maquette V22 `.a14-navsub`) — les sous-entrées de la section ACTIVE : un trait vertical
 * à gauche, la sous-entrée active surlignée (aplat d'accent + `aria-current`), masquées barre repliée. Une
 * sous-entrée de palier non ouvert reste visible, verrouillée — même règle que les entrées.
 */
function NavSubEntries({
  label,
  entries,
  activeKey,
  lockedFeatures,
  renderBadge,
}: {
  label: string
  entries: NavEntry[]
  activeKey: string
  lockedFeatures: ReadonlySet<PlanFeatureKey>
  renderBadge?: (entryKey: string) => ReactNode
}) {
  const { t } = useTranslation('nav')
  const { t: tCommon } = useTranslation('common')
  return (
    <nav
      aria-label={label}
      data-shell="nav-sub"
      className={cn(
        'mb-3 ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--bellum-border)] pl-3',
        HIDDEN_WHEN_COLLAPSED,
      )}
    >
      {entries.map(entry => {
        const active = entry.key === activeKey
        const locked = entry.feature != null && lockedFeatures.has(entry.feature)
        return (
          <Link
            key={entry.key}
            to={entry.to}
            search={entry.search ?? {}}
            aria-current={active ? 'page' : undefined}
            activeOptions={EXACT_MATCH_ONLY}
            title={locked ? tCommon('planFeatures.locked.navLocked') : undefined}
            className={cn(
              'flex min-h-8 items-center gap-2 rounded-control px-2.5 py-1.5 text-xs transition-colors duration-immediate ease-bellum-out pointer-coarse:min-h-11',
              active
                ? 'bg-[var(--bellum-accent-bg)] font-semibold text-[var(--bellum-text-accent)]'
                : 'text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
              locked && 'opacity-50',
            )}
          >
            <span className="truncate">{t(entry.subLabelKey)}</span>
            {locked ? (
              <Lock className="ml-auto size-3 shrink-0" aria-label={tCommon('planFeatures.locked.navLocked')} />
            ) : (
              renderBadge?.(entry.key)
            )}
          </Link>
        )
      })}
    </nav>
  )
}

function CollapsibleNavItem({
  item,
  pathname,
  badges,
}: {
  item: SidebarSection['items'][number]
  pathname: string
  badges?: NavBadges
}) {
  const { t } = useTranslation('nav')
  // #2155.3 — le groupe se déplie quand UNE de ses pages est active ; la section
  // entière (Découvrir, Veille…) colore l'entête sans le déplier.
  const sectionActive = isNavEntryActive(String(item.to ?? ''), pathname)
  const parentActive = item.children?.some(child => isNavTabActive(String(child.to ?? ''), pathname)) ?? false
  const [open, setOpen] = useState(parentActive)
  // #2155.3 — arriver sur une page du groupe le DÉPLIE, y compris quand la barre
  // était déjà montée (navigation depuis un autre écran). Le replier reste un
  // geste de l'utilisateur : on n'écrase jamais `open` à `false`.
  useEffect(() => {
    if (parentActive) setOpen(true)
  }, [parentActive])

  return (
    <SidebarMenuItem key={String(item.to)} className={item.separated ? 'mt-3 pt-3' : undefined}>
      <SidebarMenuButton
        type="button"
        // Déplié sur la page active, c'est la sous-entrée qui porte l'état : colorer
        // aussi l'entête dirait deux fois « tu es ici ».
        isActive={sectionActive && !(open && parentActive)}
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        tooltip={t(item.labelKey)}
        className={cn(
          'rounded-lg text-sm transition-all duration-150 h-auto py-1',
          COLLAPSED_ENTRY,
          'text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
        )}
      >
        {/* #2155.1 — repliée, la barre ne montre que l'icône : le groupe en porte une,
            et son nom reste dans l'infobulle (GA-32). */}
        <item.icon className="size-4 shrink-0" />
        <span className={HIDDEN_WHEN_COLLAPSED}>{t(item.labelKey)}</span>
        <ChevronRight
          className={cn(
            'ml-auto size-3.5 transition-transform duration-150 ease-out',
            HIDDEN_WHEN_COLLAPSED,
            open && 'rotate-90',
          )}
        />
      </SidebarMenuButton>

      {open ? (
        <SidebarMenuSub className="mt-0.5">
          {item.children?.map(child => {
            const active = isNavTabActive(String(child.to ?? ''), pathname)
            return (
              <SidebarMenuSubItem key={String(child.to)} className="w-full">
                <SidebarMenuSubButton
                  asChild
                  isActive={active}
                  className={cn(
                    active
                      ? 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]'
                      : 'text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]',
                  )}
                >
                  {/* Même règle que les entrées de premier niveau : l'état actif
                      est ANNONCÉ, pas seulement coloré. */}
                  <Link to={child.to} aria-current={active ? 'page' : undefined} activeOptions={EXACT_MATCH_ONLY}>
                    <child.icon className="size-3.5" />
                    <span className="truncate">{t(child.labelKey)}</span>
                    {/* #2155.24/.25 — absent quand la mesure a échoué OU que la
                        population est vide : jamais un « 0 » qui prétendrait
                        avoir compté (`formatNavBadgeCount`). */}
                    {(() => {
                      const badgeText = formatNavBadgeCount(badges?.[String(child.to)])
                      return badgeText ? (
                        <Badge variant="primary" className="ml-auto shrink-0">
                          {badgeText}
                        </Badge>
                      ) : null
                    })()}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )
          })}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuItem>
  )
}

export const AppSidebar = memo<AppSidebarProps>(function AppSidebar({
  topSection,
  slots,
  bottomSection,
  footSection,
  header,
  topAction,
  footer,
  badges,
  renderSubBadge,
}) {
  // Fires the default « Découvrir » prefetch on entry (gated by `enabled: !!user`)
  // and drives the greyed « Préparation… » state on the Discover nav entry.
  const { isLoading: discoverPreparing } = useDefaultDiscover()
  // Restaure le choix de repli avant la première peinture, et l'enregistre à
  // chaque bascule — bouton comme raccourci ⌘/Ctrl+B.
  useSidebarCollapsePreference()
  /**
   * Sous 768 px, la barre reste `collapsible="none"` : le repli est une affaire
   * de bureau.
   *
   * Ce n'est pas un excès de prudence — `Sidebar` a sa PROPRE réponse au
   * mobile, un tiroir (`Sheet`) fermé par défaut. Sur un téléphone, une barre
   * en `collapsible="icon"` ne se replierait pas : elle DISPARAÎTRAIT, sans
   * rien pour la rouvrir. Les deux mécanismes ne doivent pas se croiser.
   */
  const isMobile = useIsMobile()
  return (
    <Sidebar collapsible={isMobile ? 'none' : 'icon'} className="w-[var(--sidebar-width)] shrink-0 h-full">
      {/* Coque Théo (23/10/2026) — `.sidebar` des maquettes appliquées : la marque, puis les
          commandes (`.nav-top`). La recherche globale a quitté cet en-tête pour la barre du haut
          (`ShellTopbar`) et le bouton de repli a rejoint le bloc d'identité, en bas : c'est là que
          la maquette les pose. */}
      <SidebarHeader className={cn('gap-0 px-3.5 pt-5', COLLAPSED_GUTTER)}>
        <div className={cn('flex min-w-0 items-center px-2.5 pb-5', HIDDEN_WHEN_COLLAPSED)}>{header}</div>
        <div className="mb-6 grid gap-2">{topAction}</div>
      </SidebarHeader>

      <SidebarContent className={cn('px-3.5 gap-0', COLLAPSED_GUTTER)}>
        <NavSection
          section={topSection}
          discoverPreparing={discoverPreparing}
          slots={slots}
          badges={badges}
          renderSubBadge={renderSubBadge}
        />

        <div className="flex-1" />

        {bottomSection && (
          <>
            <SidebarSeparator className="mx-0 my-3" />
            <NavSection section={bottomSection} />
            <SidebarSeparator className="mx-0 mt-3" />
          </>
        )}
      </SidebarContent>

      <SidebarFooter className={cn('gap-0 border-t border-[var(--bellum-border)] px-3.5 pb-3 pt-3', COLLAPSED_GUTTER)}>
        {footSection ? <NavSection section={footSection} /> : null}
        {footer}
        {/* #4520 — le pied ne porte plus l'identité : le compte vit sur l'avatar de la barre du haut
            (`ShellTopbar`), et la rangée « nom · rôle · espace » a disparu d'ici.
            #4575 — restait le bouton de repli : il n'est plus ici quand un `footer` le porte (il ferme la
            rangée des commandes, `SidebarFooterActions`). Une barre SANS `footer` (les Réglages) le garde
            ici, c'est alors son seul moyen de se redéplier — et il n'existe qu'une fois (GA-26). */}
        {footer ? null : (
          <div data-shell="collapse-toggle" className="ml-auto group-data-[collapsible=icon]:ml-0">
            <SidebarCollapseToggle />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  )
})
