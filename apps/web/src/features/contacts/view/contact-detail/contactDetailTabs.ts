import { NOTES_COMPOSER_ID } from '@/features/crm-core/view/NotesPanel'

/** Les plis de la fiche contact en zones (#3687) — chacun ne monte ses enfants qu'ouvert. */
export type ContactFoldKey = 'proofs' | 'journal' | 'protections'

/** Où un ancien `?tab=` retombe : un pli à ouvrir et/ou une ancre à amener à l'écran. */
type ContactSection = { fold: ContactFoldKey | null; anchor: string | null }

const TOP: ContactSection = { fold: null, anchor: null }

/** #3720.2 — clés `?tab=` de la fiche contact (onglets d'avant #3644, cinq
 *  onglets de #3644, alias) → l'emplacement qui porte leur contenu dans la fiche
 *  en ZONES (#3687). Mécanisme jumeau de `LEGACY_TAB_ALIASES` (fiche compte) : un
 *  lien partagé retrouve la fiche et sa section, jamais l'accueil. */
const LEGACY_CONTACT_TABS: Record<string, ContactSection> = {
  resume: TOP,
  apercu: TOP,
  overview: TOP,
  notes: { fold: null, anchor: NOTES_COMPOSER_ID },
  // #4585 — le bloc « Rôle & périmètre » est toujours déplié : ces anciens onglets mènent à son ancre.
  role: { fold: null, anchor: 'contact-role' },
  score: { fold: null, anchor: 'contact-score-breakdown' },
  scoring: { fold: null, anchor: 'contact-score-breakdown' },
  perimetre: { fold: null, anchor: 'contact-role' },
  relations: { fold: null, anchor: 'contact-relations' },
  influence: { fold: null, anchor: 'contact-relations' },
  organigramme: { fold: null, anchor: 'contact-relations' },
  signaux: { fold: null, anchor: 'contact-signals' },
  signals: { fold: null, anchor: 'contact-signals' },
  intelligence: { fold: null, anchor: 'contact-signals' },
  messages: { fold: null, anchor: 'contact-timeline' },
  activite: { fold: 'journal', anchor: null },
  activity: { fold: 'journal', anchor: null },
  historique: { fold: 'journal', anchor: null },
  introduction: { fold: null, anchor: 'contact-outreach' },
  'introduction-chaude': { fold: null, anchor: 'contact-outreach' },
  sequences: { fold: null, anchor: 'contact-outreach' },
  informations: { fold: 'proofs', anchor: null },
}

export function resolveContactTab(raw: string | undefined): ContactSection {
  if (!raw) return TOP
  return LEGACY_CONTACT_TABS[raw.toLowerCase()] ?? TOP
}

/** #3720.3 — amène l'ancre à l'écran et la focalise. `false` si elle n'est pas
 *  montée : l'appelant réessaie après le rendu puis se replie sur le haut de la
 *  fiche (voir `revealContactAnchorWhenMounted`). */
export function revealContactAnchor(id: string): boolean {
  const el = document.getElementById(id)
  if (!el) return false
  // #3640 / #3641 — la page défile dans un DIV en overflow, pas dans `window` :
  // `scrollIntoView` trouve le bon conteneur, là où `window.scrollTo` ne fait rien.
  // Le focus se pose SANS défiler (`preventScroll`), sinon il coupe le défilement
  // lissé en cours ; une cible non focalisable passe le focus à son premier champ.
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const focusable = el.matches('input,textarea,select,button,[tabindex]')
    ? el
    : el.querySelector<HTMLElement>('textarea,input,select,[tabindex]:not([tabindex="-1"])')
  focusable?.focus?.({ preventScroll: true })
  return true
}

/** L'ancre est-elle dans la fenêtre ? (jsdom : tout est à 0, donc « oui »). */
function isInViewport(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return r.bottom > 0 && r.top < window.innerHeight
}

const SETTLE_INTERVAL_MS = 250
const SETTLE_MAX_CHECKS = 12

/** #3641 / #3640 (R2 07/10) — R1 amenait l'ancre UNE fois, puis ne regardait plus. En prod
 *  (recette 07/10, +3,5 s) `#contact-signals` restait à 1803 px d'une fenêtre de 706 : le
 *  défilement lissé est coupé par la restauration de position du routeur et par les cartes
 *  du dessus qui finissent de charger et déplacent l'ancre. On VÉRIFIE donc, après coup,
 *  que l'ancre est à l'écran (et le focus posé) et on recommence sinon, quelques secondes
 *  durant, jusqu'à deux contrôles consécutifs satisfaits. */
function settleContactAnchor(id: string, checksLeft = SETTLE_MAX_CHECKS, okStreak = 0): void {
  if (checksLeft <= 0) return
  window.setTimeout(() => {
    const el = document.getElementById(id)
    if (!el) return
    if (!isInViewport(el)) {
      revealContactAnchor(id)
      return settleContactAnchor(id, checksLeft - 1, 0)
    }
    if (document.activeElement === document.body || document.activeElement === null) revealContactAnchor(id)
    if (okStreak + 1 >= 2) return
    settleContactAnchor(id, checksLeft - 1, okStreak + 1)
  }, SETTLE_INTERVAL_MS)
}

/** Réessaie quelques images (le pli cible vient d'être ouvert ou le bloc se monte après
 *  des données asynchrones — #3641 : ~1,5 s, plus 160 ms), puis appelle `onMissing` plutôt
 *  que de ne rien faire. Trouvée, l'ancre est GARDÉE à l'écran (`settleContactAnchor`). */
export function revealContactAnchorWhenMounted(id: string, onMissing: () => void, attemptsLeft = 90): void {
  requestAnimationFrame(() => {
    if (revealContactAnchor(id)) return settleContactAnchor(id)
    if (attemptsLeft <= 1) return onMissing()
    revealContactAnchorWhenMounted(id, onMissing, attemptsLeft - 1)
  })
}
