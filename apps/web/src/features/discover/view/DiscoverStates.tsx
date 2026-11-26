import { explainFlexibleQuery, skillSearchLabel } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { Info, Loader2, Radar, SearchX } from 'lucide-react'
import { DegradedLines } from './DegradedBanner'
import { discoverErrorHintKey } from '@/features/discover/lib/discover-error'
import type { DiscoverEmptyReason } from '@/features/discover/lib/discover-empty-reason'
import type { DiscoverDegradedSource } from '@/features/discover/lib/discover-types'

/* ------------------------------------------------------------------ */
/*  États de l'écran.                                                   */
/*                                                                     */
/*  Chacun propose une SORTIE : un état vide qui se contente de dire    */
/*  « aucun résultat » est un cul-de-sac. Ici l'utilisateur repart       */
/*  toujours avec une action (élargir la zone, changer de mode,          */
/*  réessayer).                                                        */
/* ------------------------------------------------------------------ */

function Shell({
  icon,
  tone,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode
  tone: string
  title: string
  hint: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-4 flex h-[64px] w-[64px] items-center justify-center rounded-2xl" style={{ background: tone }}>
        {icon}
      </div>
      <p className="text-base font-bold text-[color:var(--text-primary)]">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-snug" style={{ color: 'var(--text-muted)' }}>
        {hint}
      </p>
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm px-3 py-1.5 text-sm transition-colors hover:bg-[color:var(--bg-surface-hover)]"
      style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
    >
      {children}
    </button>
  )
}

/**
 * #4517 — UN seul indicateur de chargement : une ligne de progression, le bouton « Arrêter » et des squelettes
 * muets. Le titre, la liste d'étapes et les squelettes disaient trois fois la même chose (Louis, 24/10) ; la liste
 * n'apparaît ensuite qu'une fois, complète.
 */
export function DiscoverLoading({
  onStop,
}: {
  /** #4490.2 — « Arrêter » : absent = pas de bouton (chargement sans recherche à couper). */
  onStop?: () => void
}) {
  const { t } = useTranslation('discover')
  return (
    <div aria-busy="true">
      <p role="status" className="mb-3 flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>{t('states.loadingTitle')}</span>
        <span className="text-xs" style={{ color: 'var(--text-ghost)' }}>
          {t('states.loadingHint')}
        </span>
      </p>
      {onStop && (
        <div className="mb-3">
          <SecondaryButton onClick={onStop}>{t('states.stop')}</SecondaryButton>
        </div>
      )}
      {/* Même forme que les résultats qui vont s'y substituer : une carte pleine largeur par ligne. */}
      <div className="flex flex-col gap-4" aria-hidden="true">
        {[0, 1, 2].map(i => (
          // #4517.1 — squelette immobile : le spinner est le seul élément animé.
          <div key={i} className="skeleton h-44 rounded-xl [animation:none]" />
        ))}
      </div>
    </div>
  )
}

/* L'ancien état « Choisissez un périmètre » vivait ici. Il a été remplacé par
   les deux cartes de la maquette p.20 (`AutopilotCard` + `DiscoverMethod`) :
   un écran censé supprimer le besoin d'idée de départ ne pouvait pas ouvrir en
   exigeant d'en avoir une.
   #2493 (17/09/2026) — `AutopilotCard` est partie à son tour : elle disait
   presque la même chose que « Ta cible » de `DiscoverSidebar`, et lançait la
   recherche au clic sans repasser par le rail. Les deux ont fusionné dans le
   point de départ UNIQUE de la colonne de gauche ; ici, à l'arrivée, il ne
   reste que `DiscoverMethod`. */

/**
 * #4997 — « Sans le filtre « Taille » : 12 comptes » : le filtre qui étouffe la liste se NOMME. Rien ne s'affiche
 * quand aucun filtre n'est coupable (une absence ne fait aucune ligne).
 */
export function BlockingFiltersNote({ blocking }: { blocking: readonly { key: string; count: number }[] }) {
  const { t } = useTranslation('discover')
  if (blocking.length === 0) return null
  return (
    <ul data-testid="blocking-filters" className="w-full space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
      {blocking.map(item => (
        <li key={item.key}>
          {t('states.blockingFilters.line', {
            filter: t(`states.blockingFilters.filters.${item.key}`),
            count: item.count,
          })}
        </li>
      ))}
    </ul>
  )
}

/**
 * Zéro résultat : deux issues concrètes plutôt qu'un point final.
 *
 * #2550.1 / #3878.1 — « aucun résultat » distingue ses causes ; « source en
 * panne » est un état DISTINCT (`DiscoverUnverifiable`, rendu à SA place par
 * `Discover.tsx`). Ici, `reason` tranche les autres : un secteur que le
 * registre n'a pas su exprimer n'est pas « aucune entreprise ne correspond » ;
 * une incohérence RÉELLEMENT détectée entre deux critères (`inconsistentFilters`,
 * `discoverEmptyReason` → `detectInconsistentFilters`, jamais un heuristique
 * inventé sur le NOMBRE de critères actifs) non plus ; et des résultats qui
 * EXISTENT mais que les affinages d'écran masquent tous (`filtersNarrow`, posé
 * en dur par `Discover.tsx` — un FAIT, pas une déduction) non plus. Sans
 * `reason` (appelants existants, ou repli honnête), le message générique
 * d'origine reste inchangé.
 */
export function DiscoverEmpty({
  onWiden,
  onSwitchToSignals,
  reason = 'noMatch',
  skills = '',
  blocking = [],
  freelanceMissing = false,
  needsRemoved = 0,
}: {
  onWiden: () => void
  onSwitchToSignals: () => void
  reason?: DiscoverEmptyReason
  /** #4317.2 — les compétences posées, nommées dans la cause d'un zéro. */
  skills?: string
  /** #4997 — les filtres dont la levée rendrait des comptes (`blockingFilters`), nommés sous le message. */
  blocking?: readonly { key: string; count: number }[]
  /** #4999 — « Freelance seul » posé, mais aucune offre reçue ne porte le contrat de sa source. */
  freelanceMissing?: boolean
  /** Lot 786 (#5203) — combien de cartes le filtre « Besoins connus » a retirées. */
  needsRemoved?: number
}) {
  const { t } = useTranslation('discover')
  // #4400.1 — la recherche est souple (préfixes, abréviations du conseil IT) : le zéro DIT ce qui a été essayé en plus du tapé.
  const expanded = reason === 'skillsNoMatch' ? explainFlexibleQuery(skills).expanded : []
  // #4419.6 — « Java, Vue », jamais « Java,Vue » tel que tapé.
  const named = skillSearchLabel([skills])
  const copy =
    reason === 'needsFilter'
      ? { title: t('states.emptyNeedsTitle'), hint: t('states.emptyNeedsHint', { count: needsRemoved }) }
      : reason === 'skillsNoMatch'
        ? {
            title: t('states.emptySkillsTitle', { skills: named }),
            hint: t('states.emptySkillsHint', { skills: named }),
          }
        : reason === 'sectorUnsupported'
          ? { title: t('states.emptySectorTitle'), hint: t('states.emptySectorHint') }
          : reason === 'inconsistentFilters'
            ? { title: t('states.emptyInconsistentTitle'), hint: t('states.emptyInconsistentHint') }
            : reason === 'allSetAside'
              ? { title: t('states.emptySetAsideTitle'), hint: t('states.emptySetAsideHint') }
              : reason === 'filtersNarrow'
                ? { title: t('states.emptyFiltersTitle'), hint: t('states.emptyFiltersHint') }
                : reason === 'noCapitalIncrease'
                  ? { title: t('states.emptyCapitalTitle'), hint: t('states.emptyCapitalHint') }
                  : { title: t('states.emptyTitle'), hint: t('states.emptyHint') }
  return (
    <Shell
      icon={<SearchX className="h-9 w-[36px]" style={{ color: 'var(--text-ghost)' }} />}
      tone="var(--bg-elevated)"
      title={copy.title}
      hint={copy.hint}
    >
      {expanded.length > 0 ? (
        <p data-testid="empty-expanded-terms" className="w-full text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('states.emptySkillsExpanded', { terms: expanded.join(', ') })}
        </p>
      ) : null}
      <BlockingFiltersNote blocking={blocking} />
      {freelanceMissing ? (
        <p data-testid="freelance-signal-missing" className="w-full text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('rail.freelanceMissing')}
        </p>
      ) : null}
      <SecondaryButton onClick={onWiden}>{t('states.emptyWiden')}</SecondaryButton>
      <SecondaryButton onClick={onSwitchToSignals}>{t('states.emptySwitchSignals')}</SecondaryButton>
    </Shell>
  )
}

/**
 * #2490 / #2496 — rien de reconnu dans la demande, rien de coché : AUCUNE liste.
 *
 * Avant, la phrase partait telle quelle dans le plein-texte du registre et
 * l'écran montrait des entreprises sans rapport (CARGLASS, BNP Paribas, le CNRS
 * pour « ESN spécialisées cybersécurité à Toulouse », production du 17/09).
 * Ce n'est ni « aucune entreprise ne correspond » (on n'a rien cherché) ni une
 * panne : c'est une demande à préciser, et la sortie proposée est un exemple.
 */
export function DiscoverUnreadable() {
  const { t } = useTranslation('discover')
  return (
    <Shell
      icon={<Info className="h-9 w-[36px]" style={{ color: 'var(--info-soft-text)' }} />}
      tone="var(--info-soft-bg)"
      title={t('states.unreadableTitle')}
      hint={t('states.unreadableHint')}
    >
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {t('states.unreadableExamples')}
      </p>
    </Shell>
  )
}

/**
 * #1766 — LE TROISIÈME ÉTAT : zéro résultat, et rien n'a pu être vérifié.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST NI L'UN NI L'AUTRE DES DEUX ÉTATS EXISTANTS
 * ─────────────────────────────────────────────────────────────────────────────
 * · Ce n'est pas `DiscoverEmpty` (« aucune entreprise ne correspond ») : cette
 *   phrase-là est une RÉPONSE, et on n'a pas pu chercher. L'afficher accuse les
 *   filtres de l'utilisateur d'une panne de fournisseur, et le renvoie élargir
 *   une zone qui n'y est pour rien.
 * · Ce n'est pas `DegradedBanner` (« les entreprises ci-dessous restent exactes,
 *   mais la liste est incomplète ») : il n'y a rien ci-dessous, donc rien
 *   d'exact, et « incomplète » suppose une liste. C'est littéralement ce qu'un
 *   client a vu le 09/09/2026 — un message FAUX et RASSURANT au-dessus du vide.
 *
 * C'est « non mesuré n'est jamais 0 » sur un écran de recherche : zéro résultat
 * MESURÉ et zéro résultat FAUTE D'AVOIR PU MESURER sont deux affirmations
 * opposées, et les confondre est exactement ce que ce dépôt refuse ailleurs
 * depuis des mois.
 *
 * ⚠️ La seule sortie proposée est de RÉESSAYER. Pas « élargis tes filtres » :
 * une panne de fournisseur n'est pas une faute de l'utilisateur, et lui
 * suggérer de relâcher sa cible le ferait chercher au mauvais endroit — puis
 * conclure que le produit ne trouve rien sur son marché.
 *
 * ⚠️ Ce qui est tombé est NOMMÉ, ligne par ligne (`DegradedLines`, la même que
 * le bandeau) : « une source sur trois » et « tout est tombé » ne se décident
 * pas pareil, et l'utilisateur doit pouvoir faire la différence.
 */
export function DiscoverUnverifiable({
  entries,
  onRetry,
}: {
  /** Ce qui empêche de conclure : sources tombées ET homonymies non tranchées. */
  entries: readonly DiscoverDegradedSource[]
  onRetry: () => void
}) {
  const { t } = useTranslation('discover')
  // #2136 — un client bêta a lu cet état comme une panne : le point
  // d'interrogation sur fond d'avertissement (HelpCircle + warning-soft-bg)
  // parle le même langage visuel qu'une erreur. Rien n'a pourtant planté —
  // c'est `DiscoverError` plus bas qui garde ce langage-là. Ici, une icône et
  // un ton neutres (Info + info-soft) pour que ce résultat se lise comme ce
  // qu'il est : une réponse honnête, pas une alerte.
  return (
    <Shell
      icon={<Info className="h-9 w-[36px]" style={{ color: 'var(--info-soft-text)' }} />}
      tone="var(--info-soft-bg)"
      title={t('states.unverifiableTitle')}
      hint={t('states.unverifiableHint')}
    >
      <div className="w-full max-w-md text-left">
        <DegradedLines entries={entries} />
      </div>
      <SecondaryButton onClick={onRetry}>{t('states.retry')}</SecondaryButton>
    </Shell>
  )
}

/**
 * Panne : on assume l'absence de résultat plutôt que d'en fabriquer un.
 *
 * #2535.1 — le serveur classe déjà la VRAIE cause (`classifyDiscoverFailure`,
 * `apps/api/src/modules/ia-proxy/discover-failure.ts`) : délai dépassé à 45 s
 * (`discover_timeout`, mesuré en production le 17/09 — le budget suffit hors
 * charge : 11,9 s et 24 résultats moteur au repos), panne amont
 * (`discover_upstream_error`) ou critères refusés (`discover_invalid_filters`).
 * `error` (optionnel — un appelant sans erreur précise retombe sur le message
 * générique) porte ce `code` : voir `discoverErrorHintKey`.
 */
export function DiscoverError({ onRetry, error }: { onRetry: () => void; error?: unknown }) {
  const { t } = useTranslation('discover')
  return (
    <Shell
      icon={<Radar className="h-9 w-[36px]" style={{ color: 'var(--danger-soft-text)' }} />}
      tone="var(--danger-soft-bg)"
      title={t('states.errorTitle')}
      hint={t(discoverErrorHintKey(error))}
    >
      <SecondaryButton onClick={onRetry}>{t('states.retry')}</SecondaryButton>
    </Shell>
  )
}

/** #4490.2 — la recherche a été arrêtée avant toute réponse : rien à montrer, les critères sont gardés. */
export function DiscoverStopped() {
  const { t } = useTranslation('discover')
  return (
    <div role="status" className="rounded-lg border border-[var(--bellum-border)] p-4">
      <p className="text-sm font-medium">{t('states.stopped.title')}</p>
      <p className="text-xs text-[var(--bellum-text-secondary)]">{t('states.stopped.hint')}</p>
    </div>
  )
}

/** #4490.2 — des résultats sont arrivés avant l'arrêt : ils restent, nommés « recherche arrêtée ». */
export function DiscoverStoppedPartial() {
  const { t } = useTranslation('discover')
  return (
    <div role="status" className="mb-4 rounded-lg border border-[var(--bellum-border)] p-3">
      <p className="text-xs leading-snug text-[var(--bellum-text-secondary)]">{t('states.stopped.partial')}</p>
    </div>
  )
}
