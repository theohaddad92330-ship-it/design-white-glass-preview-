import { create } from 'zustand'
import { PRODUCT_TOUR_STEPS } from './tour-steps'

/**
 * #1863.3 — LE FIL DE LA VISITE, HORS DE L'ÉCRAN QUI L'AFFICHE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI SE PASSAIT AVANT, MESURÉ
 * ─────────────────────────────────────────────────────────────────────────
 * L'état de la visite (`open`, `index`) vivait dans un `useState` de
 * `ChangelogMenu`, monté dans le PIED DE LA BARRE LATÉRALE. « Ouvrir cet
 * écran » appelait `onOpenChange(false)` puis naviguait : mesuré, après le
 * clic, `queryByRole('dialog')` rendait `false` et le DOM ne portait plus
 * AUCUNE trace de la visite. On arrivait sur l'écran demandé, seul, sans rien
 * qui dise qu'une visite était en cours ni comment la reprendre — il fallait
 * retrouver l'icône Nouveautés du pied de la barre, ouvrir le panneau,
 * descendre, et cliquer « Revoir la visite guidée ». Trois gestes, dont aucun
 * n'est suggéré par l'écran. C'est ça, « perdre le fil ».
 *
 * ⚠️ Et le rang se perdait AUSSI, une fois sur deux : fermer par Échap ou par
 * la croix passait par l'enveloppe qui rappelle `setIndex(0)` ; sortir par
 * « Ouvrir cet écran » ne la traversait pas. Le seul chemin qui gardait le rang
 * était donc celui qui n'offrait aucun moyen de revenir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN STORE, ET PAS UN `useState` REMONTÉ D'UN CRAN
 * ─────────────────────────────────────────────────────────────────────────
 * La visite est LANCÉE depuis la barre latérale (« Nouveautés », bureau
 * uniquement) et, depuis #2731, depuis Réglages › Démarrage — deux PORTES qui
 * appellent le même `start()`, jamais deux mécaniques. Elle doit être
 * AFFICHÉE par-dessus n'importe quel écran, y compris dans la coque mobile où
 * la barre latérale n'existe pas. Les surfaces qui la lancent n'ont aucun
 * ancêtre commun autre que la racine ; remonter l'état jusque-là obligerait à
 * faire traverser deux props à toute la chrome. Le dépôt tient déjà ses états
 * d'interface transverses en zustand (`uiStore`, `backgroundTasksStore`) —
 * c'est le même besoin.
 *
 * ⚠️ **Rien n'est persisté, et c'est une décision.** Reprendre un tour fermé il
 * y a une semaine ferait perdre le fil plus que ça n'aiderait, et la visite
 * reste courte : recommencer coûte onze écrans, pas cinquante-six. `uiStore`
 * persiste parce qu'un repli de barre latérale est une PRÉFÉRENCE ; une visite
 * en cours est une SESSION.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE STORE NE NAVIGUE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Il ne connaît ni le routeur ni les routes : il tient un rang et une phase.
 * C'est le composant qui a le routeur qui navigue. Un store qui appellerait
 * `navigate` ne serait plus testable sans monter un routeur, et le rang
 * deviendrait un effet de bord de la navigation plutôt que sa cause.
 */
type ProductTourPhase =
  /** Aucune visite en cours. */
  | 'off'
  /** La modale est ouverte : on LIT l'étape, en détail. */
  | 'reading'
  /** On est SUR l'écran de l'étape : la visite tient le fil depuis une barre. */
  | 'visiting'

type ProductTourState = {
  phase: ProductTourPhase
  /** Rang de l'étape courante, base 0. Toujours dans les bornes de la visite. */
  index: number
  /**
   * La visite a-t-elle DÉJÀ emmené sur un écran ?
   *
   * C'est ce qui distingue les deux fermetures de la modale, et la distinction
   * n'est pas cosmétique : fermer le détail qu'on vient d'ouvrir DEPUIS la
   * barre doit rendre la main à la barre, pas terminer la visite — sinon le
   * geste « je regarde à nouveau ce que dit cette étape » reperd le fil, ce que
   * ce lot corrige précisément. Fermer la toute première modale, en revanche,
   * signifie « non merci » : personne n'a encore rien visité.
   */
  hasVisited: boolean
  /** Démarrer une visite neuve — toujours au premier écran. */
  start: () => void
  /** Quitter. Le rang repart à zéro : une visite est une session, pas un signet. */
  stop: () => void
  /** Revenir à la lecture détaillée de l'étape courante, sans changer de rang. */
  read: () => void
  /** Passer sur l'écran : la modale s'efface, la barre prend le relais. */
  visit: () => void
  /**
   * Fermer le DÉTAIL (Échap, la croix). La décision vit ici et pas dans le
   * composant : deux surfaces ferment cette modale, et deux chemins qui
   * referaient la même dérivation divergeraient (GA-26).
   */
  closeDetails: () => void
  /** Changer d'étape. Hors bornes, rien ne bouge — jamais de rang impossible. */
  goTo: (index: number) => void
}

const IDLE = { phase: 'off', index: 0, hasVisited: false } as const

export const useProductTourStore = create<ProductTourState>(set => ({
  ...IDLE,
  start: () => set({ phase: 'reading', index: 0, hasVisited: false }),
  stop: () => set({ ...IDLE }),
  read: () => set(state => (state.phase === 'off' ? state : { ...state, phase: 'reading' })),
  visit: () => set(state => (state.phase === 'off' ? state : { ...state, phase: 'visiting', hasVisited: true })),
  closeDetails: () => set(state => (state.hasVisited ? { ...state, phase: 'visiting' } : { ...state, ...IDLE })),
  goTo: index =>
    set(state => {
      if (!Number.isInteger(index) || index < 0 || index >= PRODUCT_TOUR_STEPS.length) return state
      return { ...state, index }
    }),
}))
