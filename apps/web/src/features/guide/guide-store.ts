import { create } from 'zustand'
import type { GuideAbsenceReason, GuideHelpLevel, GuideMode, GuideStepRequirements } from '@bellum/contracts'

/**
 * #2213.18/.19/.20/.21 — UN SEUL FIL POUR LES TROIS MODES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN STORE PARTAGÉ PLUTÔT QU'UN PAR MODE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2213.21 demande que les trois modes partagent avatar, bulle et infrastructure.
 * Un store par mode donnerait trois fils indépendants — donc la possibilité que
 * deux d'entre eux soient ouverts en même temps, ce qui est exactement l'écran
 * que #2214.5 refuse (« pas de pop-up automatique sur chaque bouton »). Avec un
 * seul fil, deux aides ancrées simultanées sont structurellement impossibles :
 * démarrer remplace.
 *
 * ⚠️ RIEN N'EST PERSISTÉ, et c'est la même décision que
 * `product-tour-store.ts:24-33` : une aide en cours est une SESSION, pas une
 * préférence. Reprendre au troisième pas d'un parcours entamé la semaine
 * dernière ferait perdre le fil plus que ça n'aiderait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE STORE NE NAVIGUE PAS, NE CHERCHE PAS, N'AFFICHE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il tient un rang et une liste. C'est le composant qui a le routeur qui
 * navigue, et le moteur de résolution qui cherche la cible. Un store qui
 * appellerait `navigate` ou `querySelector` ne serait plus testable sans monter
 * un routeur et un DOM, et le rang deviendrait un effet de bord.
 */

/**
 * Un pas d'aide. C'est le STRICT nécessaire du socle : ce qu'on désigne, ce
 * qu'on dit, et ce qu'il faut pour que ça ait un sens.
 *
 * ⚠️ Ce n'est PAS le schéma d'un guide (#2212.45 : `id`, version, audience,
 * déclencheur…). Le corps de #2212 est coupé à cet endroit et la décision du
 * 19/09/2026 est « je complète moi-même » — ce fichier s'arrête donc au pas.
 */
/**
 * #2212.15 — LE CONTENU DE DÉCLENCHEMENT D'UN PAS : un choix, jamais un
 * « Suivant » qui avance tout seul.
 *
 * `advance` avance sans rien remplir ; l'INTENTION de la personne (« passer
 * cette étape »…) n'existe qu'au niveau du LIBELLÉ (i18n), pas de l'état.
 * #2212.15 (retrait) — `fill-and-advance` (remplir un champ d'EXEMPLE) est retiré : #3646 a ôté la saisie libre de
 * Découvrir, plus aucun pas ne remplit de champ. Garde #3646.
 */
export type GuideStepAction = { kind: 'advance'; labelKey: string }

export type GuideStep = {
  /** L'ancrage désigné, catalogué dans `guide-anchors.ts`. */
  anchor: string
  /** #2212.36 — la cible de secours, si le pas en déclare une. */
  fallbackAnchor?: string
  /** #2212.32-.35 — les portes de ce pas. */
  requirements?: GuideStepRequirements
  /** Clé i18n du titre — jamais du texte en dur (les DEUX langues, toujours). */
  titleKey: string
  /** Clé i18n du corps. */
  bodyKey: string
  /**
   * #2212.15 — un contenu de déclenchement. Quand il est présent, il
   * REMPLACE le « Suivant » par défaut : ce pas ne progresse QUE par un choix
   * explicite, jamais par un clic générique.
   */
  actions?: readonly GuideStepAction[]
  /**
   * #2212.12 — LE RÉSULTAT RÉEL, PAS LE CLIC LUI-MÊME.
   *
   * En mode `action-guidee`, un pas SANS `awaitsResult` avance dès le clic sur
   * la cible (#2212.14) — le clic EST le résultat pour un simple changement
   * d'écran. Un pas qui déclenche une écriture asynchrone (un lancement, une
   * création) ne peut pas se contenter du clic : `GuideHost` observe alors
   * l'événement DOM nommé ici, dispatché par le code métier RÉEL au moment où
   * il connaît l'issue — jamais une minuterie, jamais une supposition.
   * `GuideHost` n'écoute plus le clic lui-même sur ce pas : le geste métier
   * garde son comportement inchangé, le guide se contente d'observer sa
   * conséquence.
   */
  awaitsResult?: { event: string }
}

/**
 * Ce qu'on demande au guide de faire. Le niveau est forcément ANCRÉ : le niveau 1
 * (`tooltip`) est une primitive d'interface qui s'ouvre au survol, il n'a pas
 * besoin d'un fil et n'interrompt personne.
 */
export type GuideSessionRequest = {
  mode: GuideMode
  level: Exclude<GuideHelpLevel, 'tooltip'>
  steps: readonly GuideStep[]
}

/**
 * #2212.37 — CE QU'ON GARDE D'UN PAS QUI N'A PAS PU S'AFFICHER.
 *
 * L'ancrage et la raison. RIEN D'AUTRE, et c'est une contrainte, pas une
 * économie : l'analytique produit mesure le PRODUIT, jamais la personne
 * (GA-240/241/264/266/267). Un ancrage nomme un écran et une fonction —
 * `retour.bouton-declencheur` —, donc l'agrégat « quels pas n'arrivent pas à
 * s'afficher, et pourquoi » se fait par écran et par fonction, ce qui est
 * précisément ce que la doctrine autorise.
 */
type GuideSkippedStep = { anchor: string; reason: GuideAbsenceReason }

type GuideSession = GuideSessionRequest & {
  /** Rang du pas courant, base 0, toujours dans les bornes. */
  index: number
  /** Les pas écartés, avec leur raison (#2212.37). */
  skipped: readonly GuideSkippedStep[]
}

type GuideState = {
  session: GuideSession | null
  /**
   * Démarre une aide ancrée. Une seule vit à la fois : démarrer REMPLACE
   * (#2214.5). Une demande sans pas ne démarre rien — un fil vide afficherait
   * une bulle qui ne désigne rien.
   */
  start: (request: GuideSessionRequest) => void
  /** Avance. Au dernier pas, TERMINE — le fil ne boucle pas. */
  next: () => void
  /** Recule, jamais en dessous du premier pas. */
  previous: () => void
  /**
   * #2212.40 — la sortie, toujours disponible. C'est la seule action que l'écran
   * doit offrir sans condition : un guide dont on ne peut pas sortir est un
   * défaut plus grave que l'absence de guide.
   */
  stop: () => void
  /**
   * #2212.37 — écarte proprement le pas courant en NOMMANT la raison, et passe
   * au suivant. Ce n'est pas une erreur : c'est le comportement normal quand la
   * cible n'est pas là.
   */
  skipCurrent: (reason: GuideAbsenceReason) => void
}

export const useGuideStore = create<GuideState>(set => ({
  session: null,

  start: request => {
    if (request.steps.length === 0) return
    set({ session: { ...request, index: 0, skipped: [] } })
  },

  next: () =>
    set(state => {
      const session = state.session
      if (!session) return state
      const nextIndex = session.index + 1
      // Pas de boucle : au bout, on termine. Repartir au début ferait croire
      // à un parcours sans fin.
      if (nextIndex >= session.steps.length) return { session: null }
      return { session: { ...session, index: nextIndex } }
    }),

  previous: () =>
    set(state => {
      const session = state.session
      if (!session) return state
      return { session: { ...session, index: Math.max(0, session.index - 1) } }
    }),

  stop: () => set({ session: null }),

  skipCurrent: reason =>
    set(state => {
      const session = state.session
      if (!session) return state
      const current = session.steps[session.index]
      const skipped = current ? [...session.skipped, { anchor: current.anchor, reason }] : session.skipped
      const nextIndex = session.index + 1
      // Le dernier pas écarté termine le fil — mais la trace de l'absence part
      // avec lui : c'est le journal qui la garde, pas l'écran.
      if (nextIndex >= session.steps.length) return { session: null }
      return { session: { ...session, index: nextIndex, skipped } }
    }),
}))
