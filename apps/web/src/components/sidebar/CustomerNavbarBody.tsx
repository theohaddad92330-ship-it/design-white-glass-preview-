import { Link, useRouterState } from '@tanstack/react-router'
import { Button, LauraFace, cn } from '@bellum/ui'
import { Compass, ScanSearch } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { hasPermission, type SessionUser } from '@bellum/contracts'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useWorkspaceProfile } from '@/features/profile/hooks/useWorkspaceProfile'
import { useContactsReadyToProcessCount } from '@/features/contacts/hooks/useContactsBadgeCounters'
import { useBackgroundTurnsStore } from '@/features/chat/lib/background-turns'
import { LauraReadyDot } from '@/features/chat/view/LauraReadyDot'
import { SidebarConversations } from '@/features/chat/view/SidebarConversations'
import { shortcutAriaKeys, useShortcutLabel } from '@/features/shortcuts/shortcut-format'
import { shortcutById } from '@/features/shortcuts/shortcuts'
import { hasBackofficeRole } from '@/utils/role'
import { AppSidebar } from './AppSidebar'
import { BrandHeader } from './BrandHeader'
import { HIDDEN_WHEN_COLLAPSED } from './collapsed'
import { askLauraSidebarSearch } from './ask-laura-scope'
import { NavUser } from './NavUser'
import { BACKOFFICE_SECTION, PLATFORM_FOOT_SECTION, PLATFORM_SECTIONS } from './items'
import { MIN_ACTIVE_MEMBERS_FOR_TEAM, gateNavItems } from './gate-nav-items'
import { MailboxViewCount } from './MailboxViewCount'
import { orderNavItems } from './order-nav-items'

type CustomerNavbarBodyProps = {
  user: SessionUser | null
}

/** #4492.1 — les compteurs des vues de la Messagerie, sous son entrée (`?vue=drafts|scheduled|history`). */
const MAILBOX_SUB_VIEWS = {
  '/mailbox?vue=drafts': 'drafts',
  '/mailbox?vue=scheduled': 'scheduled',
  '/mailbox?vue=history': 'history',
} as const

function renderMailboxSubBadge(entryKey: string) {
  const view = MAILBOX_SUB_VIEWS[entryKey as keyof typeof MAILBOX_SUB_VIEWS]
  return view ? <MailboxViewCount view={view} /> : null
}

export const CustomerNavbarBody = memo<CustomerNavbarBodyProps>(function CustomerNavbarBody({ user }) {
  const { t } = useTranslation('nav')
  const { team } = useTeam()
  const role = team?.workspace.role ?? 'member'
  // Même règle que `SettingsNavbarBody`, qui l'appliquait déjà : la permission,
  // jamais le rôle. Un test de rôle en dur ignore par construction les
  // permissions accordées membre par membre.
  const canManage = hasPermission(role, 'team:manage')
  // Les conversations se déplient sous le BOUTON, et seulement quand Laura est
  // à l'écran. Sans cette condition, la barre — qui vit sur toutes les pages —
  // tirerait l'historique du copilote sur chaque écran du produit.
  const onLaura = useRouterState({ select: state => state.location.pathname.startsWith('/chat') })
  // #2144.11-14 / #2144.15-16 (épopée #2928) — mêmes repères « où suis-je »
  // que Laura pour les deux autres commandes du rail.
  // #3215 — sur la fiche d'un compte, la porte de Laura cadre le fil neuf sur CE compte.
  // Louis 21/10 — cette porte-ci ouvre Laura EN GRAND (/chat). La bulle sur place de F1-FIX #4345
  // reste aux boutons « Demander à Laura » DANS les écrans, qu'elle visait.
  const backgroundTurns = useBackgroundTurnsStore(state => state.turns)
  const lauraSearch = askLauraSidebarSearch(
    useRouterState({ select: state => state.location.pathname }),
    backgroundTurns,
  )
  const onAnalyser = useRouterState({ select: state => state.location.pathname.startsWith('/search') })
  const onDiscover = useRouterState({ select: state => state.location.pathname.startsWith('/discover') })
  const laura = shortcutById('laura')
  const lauraKeys = useShortcutLabel(laura)
  // #2155.24/.25 — le badge de nav « Contacts » : strictement le prêt à
  // traiter, jamais un volume total (`useContactsReadyToProcessCount`).
  const contactsReadyToProcess = useContactsReadyToProcessCount()
  const [rawTop, platformBottom] = PLATFORM_SECTIONS
  // Effectif inconnu ⇒ pas d'entrée « Équipe » (jamais un « 0 » replié).
  const memberCount = team?.workspace.memberCount
  const hasTeam = typeof memberCount === 'number' && memberCount >= MIN_ACTIVE_MEMBERS_FOR_TEAM
  // #4270.2 (18/10) — en espace forfait / conseil, le staffing passe au second plan (c76 : l'ordre seul).
  const workspaceProfile = useWorkspaceProfile()
  const topSection = orderNavItems(gateNavItems(rawTop, { canManage, hasTeam }), workspaceProfile)
  // D34 (Louis, 28/08/2026) — l'entrée back-office S'AJOUTE à cette barre au
  // lieu de s'y substituer. Elle atterrit dans la section BASSE : `AppSidebar`
  // l'y détache par un séparateur, ce qui dit visuellement « ceci n'est pas ton
  // espace de travail » sans retirer une seule entrée de celui-ci.
  //
  // Le rôle, pas une permission : `backoffice` n'est pas un rôle d'ESPACE
  // (`owner`/`admin`/`member`, où la garde `nav-gates-on-permission` impose
  // `hasPermission`) — c'est un rôle de PLATEFORME, posé dans
  // `app_metadata.roles` par l'opérateur. Il n'existe aucune permission
  // d'espace qui puisse l'exprimer.
  const bottomSection = hasBackofficeRole(user?.roles) ? BACKOFFICE_SECTION : platformBottom
  return (
    <AppSidebar
      header={<BrandHeader />}
      topAction={
        /* La SEULE porte vers Laura.

           Le bouton s'appelait « Nouvelle analyse » et menait à `/search`, qui
           ne sait faire qu'UNE chose sur UN objet. Il mène désormais à l'écran
           de Laura, où vivent les cinq runs du produit ET la conversation.
           L'entrée de nav « Laura » a disparu avec lui : deux entrées empilées
           pour le même interlocuteur, chacune avec sa liste de conversations.

           Le libellé suit la convention unanime des outils qui ont une
           assistante (« Ask AI », « Ask Copilot », « Ask Glean ») : elle dit
           qu'on va vers QUELQU'UN. D82 la rend légale ici — Laura est un NOM.

           Il mène à `/chat` NU, sans identifiant de fil : on retombe sur la
           conversation en cours, qu'on VOIT avant d'écrire. C'est ce qui rend
           l'absence de choix acceptable ici alors qu'elle ne l'était pas dans
           une modale, où la question partait sans qu'on ait vu où. */
        <>
          {/* Un vrai LIEN, pas un bouton qui navigue : c'est ce que gardait le
              test d'intégration de l'entrée de nav, et c'est ce qui rend le
              clic-milieu et le ⌘-clic possibles. `asChild` prête le style du
              bouton au lien — l'icône se rend DANS l'enfant, `icon` n'étant
              pas composable dans ce mode. */}
          <Button
            asChild
            variant="violet"
            size="xs"
            fullWidth
            /* 44 px, comme une entrée de nav : ce n'en est pas une (c'est un
               `Button`, pas un `SidebarMenuButton`), donc il déclare sa taille
               lui-même — mais il tombe dans le même rail et doit s'y aligner.

               #2144.10 — état actif : `onLaura` existait déjà (il pilote
               `SidebarConversations` juste en dessous) mais ne touchait jamais
               le bouton lui-même. Un anneau, pas un second fond : le bouton
               est déjà plein (`variant="violet"`), foncer encore son propre
               fond ne se verrait pas. */
            className={cn(
              'h-11 rounded-control text-sm font-semibold',
              'group-data-[collapsible=icon]:!size-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!px-0',
              onLaura && 'ring-2 ring-[var(--bellum-primary-700)] ring-offset-1 ring-offset-[var(--bellum-bg)]',
            )}
          >
            {/* Repliée, la porte de Laura n'est plus qu'un logo : elle porte donc
                son nom (GA-32) et le redit en infobulle native. Le libellé, lui,
                sort du rail — 56 px ne le contiennent pas.

                ⚠️ `⌘K` menait à Laura depuis le 26/08 sans qu'AUCUN écran ne le
                dise (tome 7 §30 : « un raccourci qu'il faut découvrir n'existe
                pas »). Le capuchon posé le 29/08 à droite du libellé a été
                RETIRÉ le 30/08 : il était visible en permanence, comme les sept
                de la navigation, et « ça pollue l'interface ».

                Il n'est pas effacé pour autant — il vit dans les deux surfaces
                qui ne coûtent rien tant qu'on ne les demande pas : l'infobulle
                native (`title`), la seule qui survive au rail replié où le
                libellé disparaît, et l'annonce `aria-keyshortcuts`. Et il
                s'apprend sur `/settings/shortcuts`. Garde GA-95. */}
            {/* #1947 — « chaque fois que je clique sur "demander à laura" […] que
                ça ouvre une nouvelle discussion et pas systématiquement la même
                en mémoire ». `?fresh=1` et non `/chat` nu : depuis `/chat`, la
                même URL ne déclencherait rien. `Chat` le consomme et le retire. */}
            <Link
              to="/chat"
              search={lauraSearch}
              className="gap-2"
              aria-label={t('askLaura')}
              title={`${t('askLaura')} · ${lauraKeys}`}
              /* Annoncé au lecteur d'écran SANS entrer dans le nom du lien,
                 qui doit rester « Demander à Laura ». */
              aria-keyshortcuts={shortcutAriaKeys(laura)}
              /* #2144.10 — « où suis-je ? » ne se répond pas en couleur seule
                 (`active-entry.test.tsx`) : le même repère que le reste de la
                 barre, posé ici puisque ce lien-ci n'est pas une entrée de
                 `AppSidebar`. */
              aria-current={onLaura ? 'page' : undefined}
            >
              {/* Le VISAGE de Laura (D137) : la porte principale vers elle
                  portait le glyphe du produit, donc promettait autre chose. */}
              <LauraFace size={22} decorative />
              <span className={HIDDEN_WHEN_COLLAPSED}>{t('askLaura')}</span>
              <LauraReadyDot />
            </Link>
          </Button>
          {onLaura && (
            <div className={cn('min-w-0', HIDDEN_WHEN_COLLAPSED)}>
              <SidebarConversations />
            </div>
          )}
          {/* Coque Théo (23/10/2026) — `.nav-top` des maquettes appliquées : Laura en aplat primaire, puis
              Découvrir et Analyser sous le MÊME traitement (`.tool-nav`, contour discret) et dans cet ordre.
              Les trois traitements distincts de #2144.18 cèdent à la maquette ; l'état actif reste annoncé
              (`aria-current`) et se VOIT (aplat d'accent). */}
          {/* #2144.1/.3/.15-.16/.18 — Découvrir : le trio lavande
              (`--accent-soft-bg/-border/-text`) déjà en usage DANS la page
              qu'ce bouton ouvre (`DiscoverMethod.tsx`, `AutopilotPanel.tsx`) —
              la même couleur porte déjà ce sens ailleurs, on ne l'invente pas
              ici. Icône d'exploration (Compass). Lien direct vers
              `/discover`, la page de découverte transverse. */}
          <Button
            asChild
            variant="ghost"
            size="xs"
            fullWidth
            className={cn(
              'group-data-[collapsible=icon]:!size-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!px-0',
              'h-11 justify-start gap-2.5 rounded-control border border-[var(--bellum-border)] bg-transparent px-3 text-sm font-semibold text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
              onDiscover &&
                'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]',
            )}
          >
            <Link
              to="/discover"
              className="gap-2"
              aria-label={t('commands.discover')}
              title={t('commands.discover')}
              aria-current={onDiscover ? 'page' : undefined}
            >
              <Compass size={19} aria-hidden="true" />
              <span className={HIDDEN_WHEN_COLLAPSED}>{t('commands.discover')}</span>
            </Link>
          </Button>
          {/* #2144.1/.3/.11-.14/.18 (épopée #2928) — Analyser : bouton CLAIR à
              bordure violette, distinct du remplissage plein de Laura et du
              lavande de Découvrir juste en dessous (même famille de couleur,
              trois traitements — la cohérence que #2144.18 demande, pas trois
              produits). Icône de recherche approfondie (#2144.12), libellé
              orienté action (#2144.13, verbe nu — même convention que
              « Découvrir »). Un LIEN vers `/search`, jamais une modale
              (#2144.14) : la page s'ouvre directement, comme Laura juste
              au-dessus. */}
          <Button
            asChild
            variant="outline"
            size="xs"
            fullWidth
            className={cn(
              'group-data-[collapsible=icon]:!size-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!px-0',
              'h-11 justify-start gap-2.5 rounded-control border border-[var(--bellum-border)] bg-transparent px-3 text-sm font-semibold text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
              onAnalyser &&
                'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]',
            )}
          >
            <Link
              to="/search"
              className="gap-2"
              aria-label={t('commands.analyze')}
              title={t('commands.analyze')}
              aria-current={onAnalyser ? 'page' : undefined}
            >
              <ScanSearch size={19} aria-hidden="true" />
              <span className={HIDDEN_WHEN_COLLAPSED}>{t('commands.analyze')}</span>
            </Link>
          </Button>
        </>
      }
      topSection={topSection!}
      bottomSection={bottomSection}
      footSection={PLATFORM_FOOT_SECTION}
      footer={<NavUser />}
      badges={{ '/contacts': contactsReadyToProcess }}
      renderSubBadge={renderMailboxSubBadge}
    />
  )
})
