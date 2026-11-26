import { hasPermission, orderNavForWorkspaceProfile } from '@bellum/contracts'
import { GroupedTabNav, TabNav, type GroupedTabNavTab, type TabNavItem } from '@bellum/ui'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useWorkspaceProfile } from '@/features/profile/hooks/useWorkspaceProfile'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { MIN_ACTIVE_MEMBERS_FOR_TEAM } from '@/components/sidebar/gate-nav-items'
import { trackTabOpened } from '@/lib/product-tracker'
import { guideAnchorProps } from '@/features/guide/guide-anchors'
import { offNavRoutes } from './off-nav-screens'
import { activeNavFamily, type NavEntry } from './sections'

/**
 * Les onglets d'une section — les surfaces absorbées par la réduction à neuf
 * entrées.
 *
 * Ils NAVIGUENT vers les routes existantes plutôt que de remonter les écrans
 * dans un conteneur : chaque écran garde son URL, ses tests, ses liens partagés
 * et son état de recherche. Une refonte qui déplace les écrans casserait tous
 * les liens qu'on a envoyés — la réduction devait retirer des entrées de menu,
 * pas des adresses.
 *
 * Rend `null` quand la route n'appartient à aucune section (connexion,
 * back-office) ou quand la section n'a qu'un écran : une barre d'onglets à un
 * seul onglet coûte une ligne et n'apprend rien.
 */
export function SectionTabs() {
  const { t } = useTranslation('nav')
  const navigate = useNavigate()
  const pathname = useLocation({ select: location => location.pathname })
  const rawSearch: unknown = useLocation({ select: location => location.search })
  const search = typeof rawSearch === 'object' && rawSearch !== null ? (rawSearch as Record<string, unknown>) : null
  const { team } = useTeam()
  const role = team?.workspace.role ?? 'member'
  /**
   * ⚠️ `hasPermission` et non un test de rôle en dur.
   *
   * Le 22/08, le serveur a ouvert le Pilotage à `team:manage` — donc à
   * `sales_ops`, dont la définition même est « commercial + gestion d'équipe ».
   * La navigation, elle, a continué de comparer le rôle à `owner`/`admin` : le
   * correctif s'est arrêté à l'API, et l'écran restait invisible pour ceux à qui
   * on venait de l'ouvrir. Un droit accordé côté serveur et caché côté menu ne
   * s'accorde à personne.
   */
  const manager = hasPermission(role, 'team:manage')
  const isMobile = useIsMobile()
  const memberCount = team?.workspace.memberCount
  const hasTeam = typeof memberCount === 'number' && memberCount >= MIN_ACTIVE_MEMBERS_FOR_TEAM

  /**
   * #4491 (PR 12C, contrat validé par Louis le 24/10/2026) — LA BARRE DE LA SECTION RACINE.
   *
   * Sur /team et /pilotage, c'est celle de Ma journée (Ma journée · Mon agenda · Équipe · Pilotage), avec
   * l'onglet de la section fille allumé ; la section fille garde, en seconde rangée, ses propres onglets
   * (Équipe › Vue d'ensemble…), comme la maquette V22 (`.a14-daynav` puis `.t8-tabs`). Une seule réponse
   * pour cette barre et pour les sous-entrées de la barre latérale (`activeNavFamily`, GA-26).
   */
  const family = useMemo(
    () => activeNavFamily(pathname, search ?? {}, { mobile: isMobile }),
    [pathname, search, isMobile],
  )
  const found = family?.inner ?? null

  // #4270.2 (18/10) — en espace forfait / conseil, l'onglet Staffing du pilotage
  // passe derrière les autres (c76 : l'ordre seul change, rien n'est masqué).
  const workspaceProfile = useWorkspaceProfile()

  // Un onglet réservé aux responsables disparaît pour les autres — il n'ouvrirait qu'un refus, et un onglet
  // qui refuse se lit comme une panne. #4158.9 : une entrée d'équipe n'existe pas dans un espace solo.
  const allowed = useCallback(
    (entry: { managerOnly?: boolean; requiresTeam?: boolean }) =>
      (!entry.managerOnly || manager) && (!entry.requiresTeam || hasTeam),
    [manager, hasTeam],
  )

  const visibleEntries = useMemo<readonly NavEntry[]>(() => {
    if (!family) return []
    // L'écran dessine lui-même ces onglets (`tabsInPage`) : la barre ne les recopie pas.
    const own = family.root.tabsInPage ? family.entries.filter(entry => entry.childSectionKey) : family.entries
    return orderNavForWorkspaceProfile(own.filter(allowed), workspaceProfile, entry => entry.to)
  }, [family, allowed, workspaceProfile])

  const visibleTabs = useMemo(() => {
    if (!found || !family || family.root === found.section || found.section.tabsInPage) return []
    if (found.section.tabsInPageAt?.includes(pathname)) return []
    return found.section.tabs.filter(allowed)
  }, [found, family, allowed, pathname])

  const tabs = useMemo<TabNavItem[]>(
    () =>
      visibleEntries.map(entry => ({
        key: entry.key,
        label: t(entry.labelKey),
        // #2112.13-16 — le RÔLE de la destination, LU dans `sections.ts` et
        // jamais recopié. Une section sans rôle déclaré n'en porte aucun : rien
        // n'est dérivé du libellé, qui n'apprendrait rien de plus.
        ...(entry.hintKey ? { hint: t(entry.hintKey) } : {}),
      })),
    [visibleEntries, t],
  )

  /**
   * #4158.53 — ÉQUIPE, atteignable sur mobile. La coque mobile n'a que quatre onglets en bas
   * (pas de cinquième) et pas de barre latérale : l'entrée de premier niveau « Équipe » n'aurait
   * aucune porte. Elle est rangée ici, dans la barre d'Actions, MOBILE seulement et dès deux
   * membres actifs (solo : absente). Ajout à la volée et non ligne de `sections.ts` : la route
   * `/team` reste dans UNE seule section (garde « jamais la même route dans deux sections »).
   * `/team` allume l'onglet Actions (`mobile-nav.ts`).
   */
  const withMobileTeam = useMemo<TabNavItem[]>(
    () =>
      isMobile && manager && hasTeam && family?.root.key === 'actions'
        ? [...tabs, { key: '/team', label: t('items.team') }]
        : tabs,
    [tabs, isMobile, manager, hasTeam, family, t],
  )

  /**
   * LA BARRE GROUPÉE (option B, tranchée par Louis le 01/09/2026).
   *
   * Une section groupe ses onglets dès qu'elle DÉCLARE des groupes — la
   * décision vit dans `sections.ts`, à un seul endroit, et pas dans un seuil
   * calculé ici. Elle retombe à plat si les droits ont vidé tous les groupes
   * sauf un : une barre à un seul menu coûterait un clic pour rien.
   */
  const groups = useMemo(() => {
    if (!family?.root.groups?.length) return null
    const tabGroup = new Map(family.root.tabs.map(tab => [tab.to, tab.group]))
    const present = new Set(visibleEntries.map(entry => tabGroup.get(entry.to)))
    const kept = family.root.groups.filter(group => present.has(group.key))
    if (kept.length < 2) return null
    return kept.map(group => ({ key: group.key, label: t(group.labelKey) }))
  }, [family, visibleEntries, t])

  const groupedTabs = useMemo<GroupedTabNavTab[]>(() => {
    const tabGroup = new Map(family?.root.tabs.map(tab => [tab.to, tab.group]) ?? [])
    return visibleEntries.flatMap(entry => {
      const group = tabGroup.get(entry.to)
      return group ? [{ key: entry.key, label: t(entry.labelKey), group }] : []
    })
  }, [family, visibleEntries, t])

  /**
   * #1123 — la barre disparaît DANS une fiche.
   *
   * « Quand je suis sur un compte et en exploration, je fais pas attention et
   * je vais cliquer sur cette barre qui me ramène au général et à la vision
   * tous les comptes / contacts. »
   *
   * Deux barres d'onglets empilées, même forme, deux portées : celle de la
   * SECTION (tous les comptes, tous les contacts) et celle de la FICHE ouverte
   * (Vue d'ensemble, Sites, Signaux…). C'est exactement ce que la loi 4 du
   * tome 7 interdit — « rien n'apparaît deux fois sous la même forme » — et le
   * prix est un clic qui sort du travail en cours sans prévenir.
   *
   * Comment on sait qu'on est DANS une fiche, sans liste à maintenir : la route
   * active est un PRÉFIXE STRICT du chemin. `/accounts/<id>` est plus profond
   * que l'onglet `/accounts` ; `/accounts/partners`, `/chat/commandes` ou
   * `/missions/board` sont des onglets DÉCLARÉS, donc `sectionForPath` les
   * choisit eux (match le plus long) et la barre reste. Le retour, lui, est
   * porté par le fil d'Ariane de la fiche — qui, lui, NOMME où il ramène.
   */
  // #4197 (L6) — un écran HORS BARRE (relevés, ADV, encaissements…) est lui aussi
  // « à l'intérieur » : il se joint depuis Facturation et porte son propre entête.
  // Sans cela, `/expenses` (qui ne préfixe aucun onglet) afficherait la barre de
  // Missions avec « En cours » allumé alors qu'on n'y est pas.
  const onOffNavScreen = offNavRoutes().some(route => pathname === route || pathname.startsWith(`${route}/`))
  const insideRecord =
    found != null && (onOffNavScreen || (found.activeTab !== pathname && pathname.startsWith(`${found.activeTab}/`)))

  if (!family || !found || insideRecord || (tabs.length <= 1 && visibleTabs.length <= 1)) return null
  // #3585.2 — la barre de Comptes disparaissait sur DESKTOP (ses pages étaient des entrées de la barre
  // latérale). Revient sur #3585.2 (décision Louis 24/10, #4491.2) : chaque section porte en haut SES
  // onglets V22, les mêmes que ses sous-entrées latérales — Contacts et Signaux sont désormais des sections.

  /**
   * #2155.26 — LE GROUPE « PROSPECTION », NOMMÉ SUR MOBILE.
   *
   * La coque mobile REMPLACE la barre latérale par la barre d'onglets du bas
   * (`MobileShell`) : le tiroir dépliable « Prospection » de `AppSidebar`
   * (#2155.1) ne s'y monte jamais, et rien d'autre ne nomme ce regroupement
   * pour un visiteur au doigt. Ce n'est PAS un cinquième onglet — la doctrine
   * mobile du dépôt en interdit un — c'est une étiquette au-dessus des trois
   * onglets déjà atteignables en deux gestes (`mobile-nav.ts`, `owns`).
   *
   * `mobileFamilyLabelKey` est LU depuis `sections.ts`, jamais recopié : le
   * jour où « Prospection » change de nom, cette étiquette suit sans qu'on y
   * touche (GA-26).
   */
  const groupLabel = isMobile && family.root.mobileFamilyLabelKey ? t(family.root.mobileFamilyLabelKey) : null

  /**
   * #1687 (trackTabOpened) — LA BARRE DE SECTION, PAS UNE FICHE.
   *
   * `SectionTabs` est monté par `CustomerPageContent` sur quasiment tout
   * l'écran client (`section.to` couvre les neuf sections) : câbler ici plutôt
   * que dans chaque écran couvre tous les changements d'onglet DE SECTION en
   * un seul appelant. `screen` = `found.section.to`, la route de la section
   * elle-même (déjà un motif du catalogue, ex. `/accounts`) ; `tab` = la route
   * de destination — jamais un identifiant de compte, ces onglets ne portent
   * que des routes déclarées dans `sections.ts`.
   */
  const onTabChange = (key: string) => {
    const entry = visibleEntries.find(candidate => candidate.key === key)
    trackTabOpened(family.root.to, key)
    void navigate(entry?.search ? { to: entry.to, search: entry.search } : { to: entry?.to ?? key })
  }
  const onInnerTabChange = (key: string) => {
    trackTabOpened(found.section.to, key)
    void navigate({ to: key })
  }
  const activeTab = family.activeKey
  // La seconde rangée : les onglets PROPRES d'une section fille (Équipe › Vue d'ensemble…).
  const innerBar =
    visibleTabs.length > 1 ? (
      <TabNav
        tabs={visibleTabs.map(tab => ({ key: tab.to, label: t(tab.labelKey) }))}
        activeTab={found.activeTab}
        onTabChange={onInnerTabChange}
        size="sm"
        className="overflow-x-auto"
      />
    ) : null

  if (groups) {
    return (
      <>
        {groupLabel && <SectionTabsGroupLabel>{groupLabel}</SectionTabsGroupLabel>}
        <GroupedTabNav groups={groups} tabs={groupedTabs} activeTab={activeTab} onTabChange={onTabChange} />
      </>
    )
  }

  const bar = (
    <>
      {groupLabel && <SectionTabsGroupLabel>{groupLabel}</SectionTabsGroupLabel>}
      {withMobileTeam.length > 1 ? (
        <TabNav
          tabs={withMobileTeam}
          activeTab={activeTab}
          onTabChange={onTabChange}
          size="sm"
          className="overflow-x-auto"
        />
      ) : null}
      {innerBar}
    </>
  )
  // #3283 / #2214.18 — les ancres des guides « Vues » (Affaires) et « Vivier »
  // (Talents) suivent la barre de section : #4197 a supprimé les deux barres
  // locales (lentilles, `VivierViewTabs`) qui les portaient.
  const anchor =
    family.root.key === 'projects'
      ? guideAnchorProps('projets.vues')
      : family.root.key === 'talents'
        ? guideAnchorProps('vivier.vues')
        : family.root.key === 'missions'
          ? guideAnchorProps('missions.vues')
          : null
  return anchor ? <div {...anchor}>{bar}</div> : bar
}

/** #2155.26 — l'étiquette de groupe mobile, au plancher typographique (D80). */
function SectionTabsGroupLabel({ children }: { children: string }) {
  return <p className="px-1 pb-1 text-xs font-medium text-[var(--bellum-text-muted)]">{children}</p>
}
