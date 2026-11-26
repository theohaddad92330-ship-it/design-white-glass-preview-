import { useId, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { cn, MOTION, Text } from '@bellum/ui'

type CollapsedSectionProps = {
  /**
   * Le titre du disclosure. C'est AUSSI le nom accessible du bouton — le
   * patron ARIA « disclosure » standard n'a besoin de rien de plus : un
   * lecteur d'écran annonce « {titre}, bouton, replié/déplié » depuis
   * `aria-expanded` seul, sans libellé caché séparé.
   */
  title: string
  /**
   * Une ligne de contexte, visible MÊME repliée. C'est ce qui donne la « vue
   * d'ensemble » que #1809 demande sans obliger à tout ouvrir : un compte, un
   * état, un décompte.
   */
  description?: string
  /** Contenu affiché à droite du titre, toujours visible (ex. un compte). */
  badge?: ReactNode
  /**
   * Identifiant DOM optionnel. Pose-le quand un `revealTarget` externe doit
   * pouvoir amener CETTE section à l'écran (`lib/reveal-target.ts`) : l'en-tête
   * reste monté que la section soit ouverte ou non, donc la cible existe
   * toujours — seul le CONTENU se (dé)monte.
   */
  id?: string
  /**
   * À poser avec `id`, typiquement via `{...revealTargetProps(anchorId)}`, pour
   * que `revealTarget` puisse aussi donner le FOCUS à cette section (jamais
   * `0` : ce n'est pas un contrôle, c'est un endroit où l'on arrive).
   */
  tabIndex?: number
  /**
   * Toujours `false` par défaut — c'est l'invariant que #1795, #1808, #1809 et
   * #1813 demandent tous les quatre : replié à l'arrivée ET après un
   * rafraîchissement, jamais restauré ouvert depuis `localStorage` ni l'URL.
   * Ne change cette valeur qu'avec une raison écrite à l'appel.
   *
   * Ignoré quand `open` (mode contrôlé, ci-dessous) est fourni.
   */
  defaultOpen?: boolean
  /**
   * #1796.1 — MODE CONTRÔLÉ, FACULTATIF.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI
   * ─────────────────────────────────────────────────────────────────────────
   * Découvrir doit refermer son rail de recherche depuis `runSearch` — un
   * geste qui vit EN DEHORS du bouton d'en-tête. Le `useState` interne ne
   * peut pas être piloté depuis l'extérieur, donc un appelant qui a besoin de
   * refermer la section programmatiquement pose `open` (et `onOpenChange` pour
   * suivre les clics de l'utilisateur) ; les quatre écrans qui ne posent NI
   * l'un NI l'autre gardent exactement le `useState(defaultOpen)`
   * d'aujourd'hui — c'est ce que `CollapsedSection.test.tsx` prouve
   * (troisième preuve d'une garde : ne pas attraper ce qu'on ne vise pas).
   *
   * `open === undefined` ⇒ non contrôlé. Poser `open` SANS `onOpenChange`
   * rendrait le bouton d'en-tête inerte (il appellerait un `onOpenChange`
   * absent) : les deux se posent ensemble.
   */
  open?: boolean
  /**
   * #4965.3 — REVIENT SUR #4399 (arbitrage Louis 31/10/2026), POUR LES SECTIONS QUI LE DEMANDENT SEULEMENT : avec
   * `persistKey`, l'état plié/déplié est mémorisé dans `localStorage` (une clé par section) et retrouvé au retour.
   * Sans `persistKey`, rien n'est lu ni écrit : le contrat « jamais restauré, jamais persisté » tient partout ailleurs.
   * Ignoré en mode contrôlé (l'appelant porte alors l'état).
   */
  persistKey?: string
  /** Appelé avec le PROCHAIN état à chaque clic ou touche Entrée sur l'en-tête. */
  onOpenChange?: (open: boolean) => void
  /**
   * #3376 — TRIGGER EXTERNE, FACULTATIF. Requiert le mode contrôlé (`open` +
   * `onOpenChange`) : sans bouton d'en-tête interne, rien d'autre ne peut
   * piloter l'ouverture. Le geste empêché : Contacts avait sa carte
   * « Filtres » (bouton 44 px pleine largeur, sa propre bordure) coincée
   * ENTRE l'entête et la barre d'outils — « ça prend de la place pour rien »
   * (retour bêta, 30/09/2026). Le déclencheur vit désormais à côté de
   * « Traiter les contacts prêts » (`ContactsIntro`), petit, sans carte ; ce
   * qui reste ici n'est que le CONTENU, sous le même `id` que le déclencheur
   * cible via `aria-controls` — jamais deux boutons « Filtres » sur l'écran.
   */
  hideTrigger?: boolean
  /**
   * #2958.109 — appelé quand l'ouverture a FINI de s'animer. Une destination
   * révélée (`revealTarget`) pendant l'expansion part d'une hauteur nulle : le
   * défilement vise sa place d'avant l'ouverture et le contenu la repousse
   * hors de l'écran. Qui révèle un contenu de section attend ce signal.
   */
  onExpanded?: () => void
  children: ReactNode
  className?: string
}

/**
 * LE PATRON PARTAGÉ DE REPLI PAR DÉFAUT (GA-26 — un réglage vit à un seul
 * endroit).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * D'OÙ IL VIENT
 * ─────────────────────────────────────────────────────────────────────────
 * Quatre retours en trente minutes (#1795 `/accounts`, #1808
 * `/pilotage/qualite`, #1809 `/team`, #1813 `/dashboard`) demandaient la même
 * chose : voir la structure d'un écran d'un coup d'œil avant de choisir où
 * entrer, au lieu de tout dérouler et de faire défiler pour comprendre. Un
 * seul patron, ici, plutôt que quatre `useState(false)` qui auraient divergé
 * en trois semaines — copié sur `showSimilar` de Découvrir
 * (`features/discover/view/Discover.tsx:147`), qui est EXACTEMENT cette forme :
 * fermé à l'arrivée, ouvert par un geste, jamais persisté.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LE RENDU CONDITIONNEL JSX, ET PAS `hidden` NI `display: none`
 * ─────────────────────────────────────────────────────────────────────────
 * Le piège mesuré ailleurs dans ce dépôt : l'attribut `hidden` ne masque RIEN
 * dès qu'une classe pose un `display` — le composant croit cacher, la feuille
 * de style rouvre. `{open && <motion.div>…}` est sûr PAR CONSTRUCTION : le
 * contenu n'est simplement pas dans le DOM tant que `open` est faux, il n'y a
 * aucune classe CSS à faire gagner.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE MOUVEMENT
 * ─────────────────────────────────────────────────────────────────────────
 * `MOTION.expand` (M4 — « il y a plus à voir. Hauteur automatique, pas de
 * saut. ») : c'est le mouvement écrit pour exactement ce geste, et il n'était
 * encore utilisé nulle part dans le dépôt avant ce lot. Rien n'est réglé à la
 * main : aucune durée, aucune courbe ne s'ajoute au compte que GA-25 tient.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REPLIÉ N'EST PAS RETIRÉ
 * ─────────────────────────────────────────────────────────────────────────
 * L'en-tête reste TOUJOURS monté, avec son `id` s'il en porte un : un
 * `revealTarget` (`lib/reveal-target.ts`) qui viserait cette section la
 * trouve toujours, replié ou non — c'est explicitement l'un des cas que ce
 * module documente déjà (« section repliée » comme raison légitime pour
 * laquelle une cible plus profonde peut manquer).
 */
/**
 * #2947.R16 (recette prod 15/10, Doctolib : « Angles » déplié, ~400 px de vide) — le contenu d'une section
 * dépliée est monté APRÈS l'animation de la page. Un enfant `variants={cardFade}` hérite alors `initial="hidden"`
 * du parent `stagger` mais ne reçoit plus jamais `visible` : invisible, hauteur réservée (reproduit en
 * Chromium). Poser ici les deux étiquettes, UNE fois, rend visible toute carte à variants dépliée — sans
 * rien changer à celles qui portent leurs propres `initial` / `animate`.
 */
const MOUNTED_LATE = { initial: 'visible', animate: 'visible' } as const

const PERSIST_PREFIX = 'bellum.collapsed.'

// #4965.3 — lecture/écriture protégées : le stockage peut manquer ou lever (navigation privée, site bloqué).
function readPersisted(key: string | undefined): boolean | null {
  if (!key) return null
  try {
    const raw = window.localStorage.getItem(PERSIST_PREFIX + key)
    return raw === 'open' ? true : raw === 'closed' ? false : null
  } catch {
    return null
  }
}

function writePersisted(key: string | undefined, open: boolean): void {
  if (!key) return
  try {
    window.localStorage.setItem(PERSIST_PREFIX + key, open ? 'open' : 'closed')
  } catch {
    // Sans stockage, la section marche, elle ne se souvient simplement pas.
  }
}

export function CollapsedSection({
  title,
  description,
  badge,
  id,
  tabIndex,
  defaultOpen = false,
  open: openProp,
  persistKey,
  onOpenChange,
  hideTrigger = false,
  onExpanded,
  children,
  className,
}: CollapsedSectionProps) {
  // #1796.1 — mode contrôlé facultatif : `openProp === undefined` reprend
  // EXACTEMENT le comportement d'avant (un `useState` interne, jamais lu
  // depuis l'extérieur). `internalOpen` existe même en mode contrôlé — les
  // Hooks ne peuvent pas être conditionnels — mais n'est alors jamais lu.
  const [internalOpen, setInternalOpen] = useState(() => readPersisted(persistKey) ?? defaultOpen)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : internalOpen
  const contentId = useId()

  const toggle = () => {
    const next = !open
    if (!isControlled) {
      setInternalOpen(next)
      writePersisted(persistKey, next)
    }
    onOpenChange?.(next)
  }

  // #3376 — déclencheur externe : pas de bouton d'en-tête ici, donc rien à
  // replier VISUELLEMENT quand `open` est faux — une carte vide, bordée,
  // posée sur rien, serait pire que ce qu'elle remplace.
  if (hideTrigger) {
    if (!open) return null
    return (
      <motion.div
        id={id ?? contentId}
        role="region"
        aria-label={title}
        tabIndex={tabIndex}
        {...MOTION.expand}
        onAnimationComplete={onExpanded}
        className={cn(
          'overflow-hidden rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]',
          className,
        )}
      >
        <motion.div {...MOUNTED_LATE} className="px-4 py-4">
          {children}
        </motion.div>
      </motion.div>
    )
  }

  return (
    <section
      id={id}
      tabIndex={tabIndex}
      className={cn(
        'overflow-hidden rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] focus:outline-none',
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        // Le nom accessible reste le TITRE seul — sans ce `aria-label`, une
        // `description` posée s'ajouterait au nom du bouton (tout le texte
        // descendant y entre par défaut), et un lecteur d'écran annoncerait
        // le titre ET la phrase de contexte à chaque fois qu'on tabule
        // jusqu'ici.
        aria-label={title}
        // `min-h-11` = 44 px (GA-30, cible tactile en pointeur grossier).
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-[var(--bellum-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {title}
          </Text>
          {description ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {description}
            </Text>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge}
          <ChevronDown
            aria-hidden
            className={cn(
              // #2484 — aucune durée à la main : celle de `transition-*`
              // (150 ms) tombe dans le palier `immediate` de `motion.ts`.
              'size-4 shrink-0 text-[var(--bellum-text-muted)] transition-transform',
              open ? 'rotate-180' : '',
            )}
          />
        </span>
      </button>
      {open ? (
        <motion.div
          id={contentId}
          role="region"
          aria-label={title}
          {...MOTION.expand}
          onAnimationComplete={onExpanded}
          className="overflow-hidden"
        >
          <motion.div {...MOUNTED_LATE} className="border-t border-[var(--bellum-border)] px-4 py-4">
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </section>
  )
}
