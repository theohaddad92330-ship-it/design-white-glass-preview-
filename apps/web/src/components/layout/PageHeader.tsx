import { Link, useLocation } from '@tanstack/react-router'
import { sectionForPath } from '@/components/navigation/sections'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  TabNav,
  Text,
  type TabNavItem,
} from '@bellum/ui'
import { ChevronRight } from 'lucide-react'
import { Fragment, memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveBreadcrumbs, resolveTitle, type PageBreadcrumb } from '@/components/shell/shell-trail'
import { capitalize } from '@bellum/utils'
import { useBrand } from '@/features/brand/brand-context'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'

// Coque Théo — le titre et le fil se dérivent à UN endroit (`shell-trail.ts`), lu aussi par la
// barre du haut. Réexporté pour les écrans qui importaient le type d'ici.
export type { PageBreadcrumb } from '@/components/shell/shell-trail'

type PageHeaderProps = {
  tabs?: TabNavItem[]
  activeTab?: string
  onTabChange?: (key: string) => void
  /**
   * Right-side slot for page-contextual controls (filters, sort, view actions).
   * Renders nothing if omitted, mirroring Linear's per-view header.
   */
  actions?: ReactNode
  /**
   * Overrides the auto-resolved title / final breadcrumb crumb. Useful for
   * detail pages where the entity name (e.g. company) should appear in the
   * header instead of the generic route title.
   */
  pageTitle?: string
  /** Inline accessory rendered next to the title (e.g. a count badge). */
  pageTitleBadge?: ReactNode
  /** Coque Théo — la phrase sous le titre (`.page-head p`), 70 caractères de large au plus (GA-34). */
  pageSubtitle?: string
  /**
   * Coque Théo — le fil d'Ariane est dans la barre du haut (`ShellTopbar`, bureau) : l'en-tête
   * ne le répète pas. Faux sur mobile, où cette barre n'existe pas et où le fil reste ici.
   */
  trailInTopbar?: boolean
  /** Explicit breadcrumb trail, overriding the route-based auto-resolution.
   *  Used by detail pages that need the parent entity in the chain (e.g. a
   *  contact under its account: Comptes › Account › Contacts › Name). */
  breadcrumbs?: PageBreadcrumb[]
  /**
   * #2456 — « cet écran écrit son titre LUI-MÊME, ne lui en donne pas un second ».
   *
   * Son DÉFAUT (`false`) est le comportement SÛR : sans rien déclarer, un écran
   * reçoit son titre de l'entête, donc aucun écran ne peut se retrouver muet par
   * oubli. Un écran ne pose ce drapeau que pour ÉVITER un doublon, jamais pour
   * se dispenser d'un titre — et la garde GA-347 refuse les deux cas de travers
   * (aucun titre, et deux titres).
   */
  titleInScreen?: boolean
  /**
   * #4578 — le lien d'aide de l'écran (`ScreenGuideLink`), rangé AVANT les actions : un seul rang pour le
   * lien et les gestes, le geste principal restant le plus à droite. Absent, l'en-tête ne change pas.
   */
  guideLink?: ReactNode
}

export const PageHeader = memo<PageHeaderProps>(function PageHeader({
  tabs,
  activeTab,
  onTabChange,
  actions,
  pageTitle,
  pageTitleBadge,
  pageSubtitle,
  trailInTopbar = false,
  breadcrumbs: breadcrumbsOverride,
  titleInScreen = false,
  guideLink,
}) {
  const { t } = useTranslation('nav')
  const location = useLocation()
  const brand = useBrand()

  const title = resolveTitle(location.pathname, t, brand.name, pageTitle)
  const trail: PageBreadcrumb[] = breadcrumbsOverride ?? resolveBreadcrumbs(location.pathname, t, pageTitle)
  // Sur bureau le fil vit dans la barre du haut : ici, il ne compte plus pour rien.
  const breadcrumbs = trailInTopbar ? [] : trail

  /**
   * L'entête ne RÉPÈTE pas l'onglet de section actif.
   *
   * Mesuré à l'écran : la barre d'onglets affichait « Ma journée · Messagerie ·
   * Tableau de bord » avec le premier actif, et la ligne juste en dessous
   * répétait « Ma journée ». Sur Comptes, sur Projets, sur Pilotage — partout où
   * une section a plusieurs onglets, en desktop comme en mobile.
   *
   * C'est la loi 4 du tome 7 : « si un élément apparaît deux fois sous la même
   * forme et avec le même contenu, l'un des deux est en trop ». Ici c'est le
   * titre : l'onglet, lui, sert à naviguer.
   *
   * ⚠️ TROISIÈME version, et c'est un ÉLARGISSEMENT. Les deux premières
   * comparaient le titre à un libellé ; la comparaison ratait dès que le titre
   * était une paraphrase. Mesuré à l'écran le 23/08 : l'onglet actif disait
   * « Actions » et la ligne en dessous « Actions et automatisations » — ce
   * n'est pas le même texte, c'est la même information, et il y avait par
   * ailleurs TROIS rangées d'onglets empilées sur cet écran.
   *
   * La règle est donc devenue positive au lieu d'être une exception : **quand
   * une section a une barre d'onglets, c'est elle qui nomme l'endroit.** Le
   * titre ne se rend pas, quel que soit son libellé. Le badge, lui, reste —
   * « 3 alertes » n'est pas une redite, c'est la seule information de cette
   * ligne, et la retirer ferait disparaître un compteur qu'on ne retrouverait
   * nulle part ailleurs.
   *
   * ⚠️ DEUX fausses pistes avant l'élargissement, et elles se ressemblent.
   *
   * La première comparait `breadcrumbs[0]` : `resolveBreadcrumbs` rend `[]`
   * partout sauf sur un dossier de compte ou de contact, donc la condition
   * n'était jamais vraie. La seconde excluait les écrans qui passent un
   * `pageTitle` — or c'est PRÉCISÉMENT par là que « Ma journée » et
   * « Pilotage » arrivent, puisqu'aucun des deux n'est dans `pageTitleKeys`.
   *
   * Le titre affiché, quelle que soit sa provenance, est donc le seul terme à
   * comparer. Les deux versions précédentes passaient les tests : elles
   * mesuraient une branche morte.
   */
  const section = sectionForPath(location.pathname)
  const nameLivesInTabs = trail.length === 0 && !breadcrumbsOverride && (section?.section.tabs.length ?? 0) > 1

  /**
   * Une entête vide ne réserve pas sa hauteur.
   *
   * Depuis que le titre cesse de répéter l'onglet actif, la barre restait là,
   * haute de 48 px, avec une bordure et rien dedans — un liseré qui ne sépare
   * plus rien et une bande blanche entre les onglets et le contenu. Ce qui
   * était une répétition serait devenu un trou : les deux se remarquent.
   */
  /**
   * #2456 — LE TITRE QUE SEUL UN LECTEUR D'ÉCRAN ENTEND.
   *
   * Mesuré en production au SHA `3993b432b` le 16/09/2026 à 10 h 04 : sur
   * `/discover`, `document.querySelectorAll('h1').length` rendait **0** sur 255
   * éléments lus. La cause est juste au-dessus : quand la barre d'onglets nomme
   * l'endroit, l'entête ne redit pas le mot, `hasContent` devient faux, et
   * l'entête disparaît ENTIÈREMENT — avec le seul `h1` du document. « Lis-moi le
   * titre de cette page » ne rendait donc rien sur toutes les sections à onglets.
   *
   * ⚠️ À QUI VOUDRAIT LE RETIRER AU NOM DE LA LOI 4 DU TOME 7 : la loi interdit
   * qu'un élément apparaisse DEUX FOIS **sous la même forme**, c'est-à-dire
   * visiblement. Ce titre-ci n'est pas visible — `sr-only` le sort du flux et ne
   * réserve aucun pixel — et il ne répète rien pour l'œil. Un onglet est un
   * `role="tab"` dans un `tablist` : il n'entre dans aucun plan de titres, et
   * aucun lecteur d'écran ne le rend quand on demande le titre de la page. La
   * décision du 23/08/2026 n'est donc pas re-litigée : elle est tenue, et le
   * trou qu'elle avait laissé pour l'accessibilité est refermé.
   *
   * Décision de Louis, 16/09/2026, sur l'option recommandée du lot #2456.
   */
  const screenNamesItself = titleInScreen
  // Une page de détail se nomme dans la barre du haut (son fil) et dans son corps : sur bureau,
  // l'en-tête ne lui ajoute pas de titre — c'était le fil qui l'y nommait.
  const detailNamedByTopbar = trailInTopbar && trail.length > 0
  const headerNamesItVisibly = !nameLivesInTabs && !screenNamesItself && !detailNamedByTopbar && Boolean(title)
  const headerNamesItForScreenReaders = nameLivesInTabs && !screenNamesItself && Boolean(title)

  const hasContent =
    (tabs && tabs.length > 0) ||
    (breadcrumbs.length > 0 && !nameLivesInTabs) ||
    headerNamesItVisibly ||
    (Boolean(pageSubtitle) && !screenNamesItself) ||
    Boolean(pageTitleBadge) ||
    Boolean(actions) ||
    Boolean(guideLink)
  // Une entête vide ne réserve toujours pas sa hauteur — mais elle laisse
  // derrière elle le titre que le document doit porter.
  if (!hasContent) {
    return headerNamesItForScreenReaders ? (
      <Text element="h1" size="sm" weight="medium" className="sr-only">
        {title}
      </Text>
    ) : null
  }

  return (
    // #1788 — `z-nav` (40) : coïncidait avec `z-40` en valeur aujourd'hui,
    // mais un `z-40` brut ne suit pas l'échelle nommée si elle bouge un jour.
    <header
      className={`relative flex items-center justify-between gap-5 min-h-12 ${guideLink ? 'max-md:flex-wrap' : ''} ${headerNamesItVisibly ? 'pt-7 pb-2' : 'py-1'} ${PAGE_GUTTER_X} shrink-0 top-0 z-nav`}
    >
      {/* `overflow-x-auto` : les onglets d'un dossier de compte sont treize.
          Sur un téléphone ils débordent, et sans défilement horizontal les
          derniers sont simplement inatteignables — on ne peut pas ouvrir un
          onglet qu'on ne peut pas faire venir à l'écran. */}
      <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs && tabs.length > 0 ? (
          <TabNav
            tabs={tabs}
            activeTab={activeTab ?? tabs[0]?.key ?? ''}
            onTabChange={onTabChange}
            size="sm"
            className="border-b-0"
            renderLink={({ to, className, children }) => (
              <Link to={to} className={className}>
                {children}
              </Link>
            )}
          />
        ) : breadcrumbs.length > 0 && !nameLivesInTabs ? (
          <Breadcrumb>
            <BreadcrumbList className="text-sm font-medium gap-1.5 sm:gap-1.5">
              {breadcrumbs.map((crumb, i) => {
                const Icon = crumb.icon
                const content = (
                  <span className="flex items-center gap-1.5">
                    {Icon && <Icon className="size-3.5 shrink-0 text-[var(--bellum-text-secondary)]" />}
                    {capitalize(crumb.label)}
                  </span>
                )
                return (
                  <Fragment key={i}>
                    {i > 0 && (
                      <BreadcrumbSeparator className="text-[var(--bellum-text-secondary)]">
                        <ChevronRight className="size-3.5" />
                      </BreadcrumbSeparator>
                    )}
                    <BreadcrumbItem>
                      {crumb.onClick ? (
                        <BreadcrumbLink asChild className=" transition-colors duration-150">
                          <button type="button" onClick={crumb.onClick} className="cursor-pointer">
                            {content}
                          </button>
                        </BreadcrumbLink>
                      ) : crumb.to ? (
                        <BreadcrumbLink asChild className="transition-colors duration-150">
                          <Link to={crumb.to}>{content}</Link>
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{content}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                )
              })}
            </BreadcrumbList>
          </Breadcrumb>
        ) : nameLivesInTabs ? (
          // Le mot est déjà dans l'onglet actif, juste au-dessus. On ne le
          // répète pas — mais le BADGE reste : « 3 alertes » n'est pas une
          // redite, c'est la seule information de cette ligne, et la retirer
          // ferait disparaître un compteur que personne ne retrouverait
          // ailleurs.
          <>
            {/* #2456 — invisible à l'œil, lu par les lecteurs d'écran. Voir la
                note au-dessus de `headerNamesItForScreenReaders` : la loi 4
                porte sur la répétition VISIBLE, et celle-ci n'en est pas une. */}
            {headerNamesItForScreenReaders && (
              <Text element="h1" size="sm" weight="medium" className="sr-only">
                {title}
              </Text>
            )}
            {pageTitleBadge ? <div className="flex items-center gap-2">{pageTitleBadge}</div> : null}
          </>
        ) : (
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              {/* Coque Théo — `.page-head h1` : 30 px, graisse forte, approche serrée. */}
              {headerNamesItVisibly ? (
                <h1 className="text-3xl font-semibold leading-tight tracking-tight text-[var(--bellum-text-primary)]">
                  {title}
                </h1>
              ) : null}
              {pageTitleBadge}
            </div>
            {pageSubtitle && !screenNamesItself ? (
              // `Text` porte la largeur de lecture (70 caractères, GA-34) : elle n'est écrite qu'à cet endroit.
              <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                {pageSubtitle}
              </Text>
            ) : null}
          </div>
        )}
      </div>

      {actions || guideLink ? (
        // #4578 — sous 768 px le repli en colonne reste permis (GA-28/29/30) : trois commandes ne tiennent pas côte à côte.
        <div data-shell="header-actions" className="flex items-center gap-3 shrink-0 max-md:flex-wrap max-md:shrink">
          {guideLink}
          {actions}
        </div>
      ) : null}
    </header>
  )
})
