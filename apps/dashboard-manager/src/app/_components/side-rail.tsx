'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BellumMark } from './bellum-mark'
import { estUnEcranProprietaire, type Role } from '@/lib/roles'
import { COCKPIT, NAV_SECTIONS, resolveEnvironment, type Environment } from './nav-sections'
import { openGlobalSearch } from './global-search'
import { openGuidedTour } from './guided-tour'

const OPEN_KEY = 'bellum-mgr-rail-open'
const COLLAPSED_KEY = 'bellum-mgr-rail-collapsed'

/** Le chemin d'un href, sans sa query — pour comparer à `usePathname`. */
function pathOf(href: string): string {
  const [path] = href.split('?')
  return path ?? href
}

/**
 * La section qui contient la page courante.
 *
 * Le `view=` compte : /clients, /clients?view=users et /clients?view=esn sont
 * trois destinations rangées dans deux sections différentes. Sans lui, ouvrir
 * « Utilisateurs » déplierait « Revenus » — la section active serait fausse la
 * moitié du temps.
 */
function activeSectionId(pathname: string, view: string | null): string | null {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathOf(item.href) !== pathname) continue
      const itemView = new URLSearchParams(item.href.split('?')[1] ?? '').get('view')
      if (itemView === null || itemView === view) return section.id
    }
  }
  return null
}

function isCurrent(href: string, pathname: string, view: string | null): boolean {
  if (pathOf(href) !== pathname) return false
  const itemView = new URLSearchParams(href.split('?')[1] ?? '').get('view')
  return itemView === null ? view === null : itemView === view
}

/**
 * Le rail latéral à 6 sections (#1644) et l'identité de l'environnement (#1675).
 *
 * Composant client parce que trois choses le sont : le repli persisté, la
 * section active dépliée, et le raccourci d'un rail réduit aux icônes. Le SHA et
 * l'environnement, eux, sont lus côté serveur et passés en props — `process.env`
 * n'existe pas dans le navigateur pour les variables non préfixées, et les
 * passer explicitement rend le composant testable sans navigateur.
 */
export function SideRail({
  environmentValue,
  commitSha,
  operateur,
}: {
  environmentValue?: string
  commitSha?: string
  /** `null` quand la couche d'identité est éteinte : le rail est alors celui d'avant. */
  operateur?: { email: string; role: Role } | null
}) {
  const pathname = usePathname()
  const view = useSearchParams().get('view')
  const active = activeSectionId(pathname, view)
  const environment: Environment | null = resolveEnvironment(environmentValue)

  const [collapsed, setCollapsed] = useState(false)
  // `null` tant qu'on n'a pas lu localStorage : le premier rendu client doit
  // être identique au rendu serveur, sinon React signale une divergence.
  const [open, setOpen] = useState<string[] | null>(null)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1')
      const stored = localStorage.getItem(OPEN_KEY)
      setOpen(stored ? (JSON.parse(stored) as string[]) : [])
    } catch {
      /* mode privé / stockage coupé — le rail marche, il ne se souvient pas */
    }
  }, [])

  function persist(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* idem */
    }
  }

  function toggleSection(id: string): void {
    const current = open ?? []
    const next = current.includes(id) ? current.filter(entry => entry !== id) : [...current, id]
    setOpen(next)
    persist(OPEN_KEY, JSON.stringify(next))
  }

  function toggleCollapsed(): void {
    const next = !collapsed
    setCollapsed(next)
    persist(COLLAPSED_KEY, next ? '1' : '0')
  }

  // La section active est TOUJOURS dépliée (#1644), qu'on l'ait repliée ou non :
  // une page dont l'entrée est cachée donne un rail qui ne dit pas où on est.
  const isOpen = (id: string): boolean => id === active || (open ?? []).includes(id)

  /**
   * Ce qu'un rôle ne peut pas OUVRIR ne s'affiche pas (#1669).
   *
   * ⚠️ C'est du confort, pas la porte : la porte est dans le middleware (les
   * écrans) et dans `exigerCapacite` (les gestes). Un rail qui cache un lien
   * n'empêche personne de taper l'URL — et c'est précisément pourquoi la
   * vérification ne peut pas vivre ici.
   */
  const visible = (href: string): boolean =>
    !operateur || operateur.role === 'owner' || !estUnEcranProprietaire(pathOf(href))

  return (
    <nav className={collapsed ? 'siderail siderail--collapsed' : 'siderail'} aria-label="Navigation du back-office">
      <div className="siderail__brand">
        <BellumMark size={28} />
        {collapsed ? null : <span className="siderail__wordmark">BellumAI · Manager</span>}
        {environment ? (
          <span
            className="siderail__env"
            style={{ background: environment.token }}
            title={`Environnement servi : ${environment.label}`}
          >
            {collapsed ? environment.label.slice(0, 1) : environment.label}
          </span>
        ) : null}
      </div>

      <a
        className={isCurrent(COCKPIT.href, pathname, view) ? 'siderail__item is-current' : 'siderail__item'}
        href={COCKPIT.href}
        data-tour="cockpit"
      >
        <span className="siderail__icon" aria-hidden>
          {COCKPIT.icon}
        </span>
        {collapsed ? null : <span>{COCKPIT.label}</span>}
      </a>

      {/* #1673.6 — la recherche globale. Un bouton, pas un lien : elle
          n'ouvre aucune page, elle ouvre une palette par-dessus celle-ci. */}
      <button
        type="button"
        className="siderail__item"
        onClick={openGlobalSearch}
        aria-label={collapsed ? 'Rechercher (⌘K)' : undefined}
        title="Rechercher (⌘K)"
      >
        <span className="siderail__icon" aria-hidden>
          ⌕
        </span>
        {collapsed ? null : <span>Rechercher · ⌘K</span>}
      </button>

      {NAV_SECTIONS.map(section => (
        <div key={section.id} className="siderail__section" data-tour={`section-${section.id}`}>
          <button
            type="button"
            className="siderail__toggle"
            onClick={() => toggleSection(section.id)}
            aria-expanded={isOpen(section.id)}
            aria-label={collapsed ? section.label : undefined}
            title={collapsed ? section.label : undefined}
          >
            <span className="siderail__icon" aria-hidden>
              {section.icon}
            </span>
            {collapsed ? null : (
              <>
                <span>{section.label}</span>
                <span className="siderail__chevron" aria-hidden>
                  {isOpen(section.id) ? '▾' : '▸'}
                </span>
              </>
            )}
          </button>
          {isOpen(section.id) && !collapsed ? (
            <div className="siderail__items">
              {section.items
                .filter(item => visible(item.href))
                .map(item => (
                  <a
                    key={item.href}
                    className={isCurrent(item.href, pathname, view) ? 'siderail__item is-current' : 'siderail__item'}
                    href={item.href}
                  >
                    {item.label}
                  </a>
                ))}
            </div>
          ) : null}
        </div>
      ))}

      {operateur && !collapsed ? (
        <div className="siderail__identite">
          <span className="siderail__email" title={operateur.email}>
            {operateur.email}
          </span>
          <span className="siderail__role">{operateur.role}</span>
          <button
            type="button"
            className="link-muted"
            onClick={() => {
              // « Déconnexion explicite disponible » (#1668). Le cookie est la
              // seule trace de la session : le serveur le retire, on recharge.
              void fetch('/api/auth/logout', { method: 'POST' }).finally(() => window.location.assign('/login'))
            }}
          >
            Se déconnecter
          </button>
        </div>
      ) : null}

      <div className="siderail__foot">
        {/* #1678.2 — rejoue la visite guidée sans quitter la page courante. */}
        {collapsed ? null : (
          <button type="button" className="link-muted" onClick={openGuidedTour} title="Visite guidée">
            Visite guidée
          </button>
        )}
        <button
          type="button"
          className="siderail__collapse"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Déplier le rail' : 'Replier le rail'}
        >
          {collapsed ? '»' : '« Replier'}
        </button>
        {commitSha && !collapsed ? (
          <a
            className="siderail__sha"
            href={`https://github.com/Bellum-AI/belllum-monorepo/commit/${commitSha}`}
            target="_blank"
            rel="noreferrer"
            title={`Commit servi : ${commitSha}`}
          >
            {commitSha.slice(0, 7)}
          </a>
        ) : null}
      </div>
    </nav>
  )
}
