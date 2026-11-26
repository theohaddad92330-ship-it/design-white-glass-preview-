import { useEffect, useId, useSyncExternalStore } from 'react'
import { useLauraIntroScope } from './laura-intro-scope'

/**
 * #1812 — LE CANAL : UN ÉCRAN DÉPOSE UNE AMORCE, LA BULLE LA LIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, ET POURQUOI IL RESSEMBLE À `page-context-store.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * Louis (#1812) : au lieu d'un bouton « Demander à {{copilot}} » qui prend de
 * la place sur chaque écran, il veut que la bulle elle-même s'agrandisse à
 * l'arrivée avec la question déjà écrite, prête à envoyer. Ça suppose qu'un
 * écran quelconque (`AskLaura`, monté à 30 endroits) puisse faire parvenir une
 * phrase à `LauraDock`, monté UNE fois à la racine du routeur — et rien
 * aujourd'hui ne relie les deux.
 *
 * Le dépôt a déjà résolu exactement ce problème une fois : `page-context-store`
 * (même dossier) est un magasin externe, lu par `useSyncExternalStore`, pour la
 * même raison qu'ici — un `Provider` React entre `LauraDock` et `<Outlet />`
 * re-rendrait toute l'application à chaque frappe dans la bulle. On suit le
 * MÊME patron plutôt que d'en inventer un second : deux mécanismes qui
 * déposent-puis-lisent une valeur d'écran divergeraient en trois semaines.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE MAGASIN N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est PAS `page-context-store` lui-même : celui-ci dit à Laura ce que
 * l'écran MONTRE (pour répondre en connaissance de cause) ; celui-ci dit à
 * Laura ce qu'un écran voudrait qu'on lui DEMANDE (pour amorcer une
 * conversation). Les fusionner ferait qu'un écran qui déclare son contexte
 * (`useLauraContext`) et un autre qui pose une amorce (`AskLaura`) se
 * marcheraient dessus sans le vouloir — deux intentions, deux magasins.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1847 — DE « UN SEUL EMPLACEMENT » À UN REGISTRE DE DÉPÔTS VIVANTS
 * ─────────────────────────────────────────────────────────────────────────────
 * La première version ne gardait qu'UNE amorce publiée : le dernier déposant
 * écrasait la précédente, et son démontage remettait tout à `null`. Deux
 * défauts mesurés en production le 10/09/2026, tous deux invisibles en CI
 * parce qu'aucun test ne montait DEUX écrans l'un au-dessus de l'autre :
 *
 *  1. **Une surcouche refermée ne rendait rien.** La modale de `/watchlist`
 *     écrasait l'amorce de la liste en s'ouvrant, puis publiait `null` en se
 *     fermant. Le dépôt de la page ne se rejoue qu'au changement de son
 *     contenu — donc jamais : après un seul aller-retour dans la modale,
 *     l'écran n'avait plus AUCUNE amorce jusqu'à un rechargement.
 *  2. **Un dépôt de page qui se rejoue reprenait la main sur une surcouche
 *     ouverte** (une ligne de liste dont le contenu change republie).
 *
 * Le magasin garde donc désormais TOUS les dépôts vivants, et il DÉRIVE le
 * gagnant : la portée la plus profonde d'abord (`scopeDepth`, voir
 * `laura-intro-scope.tsx`), puis, à portée égale, le dernier enregistré. Un
 * départ quelconque — celui du gagnant compris — laisse simplement le reste
 * du registre décider : c'est ce qui fait qu'une surcouche REND la portée en
 * se fermant, sans qu'aucun écran n'ait à re-déposer quoi que ce soit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES REPRISES TELLES QUELLES DE `page-context-store.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **La portée la plus profonde gagne, puis le dernier enregistré** — un
 *    écran avec plusieurs `<AskLaura>` (ex. `MyDataView`, trois CTA sur la même
 *    page) ne peut pas tous les montrer dans une bulle qui n'a qu'une ligne :
 *    un seul est celui que la bulle propose, les autres restent des liens sur
 *    la page (voir la valeur de retour de `useAskLauraIntro`, plus bas).
 *    ⚠️ Depuis #1847, un déposant n'a plus besoin de « nettoyer seulement s'il
 *    est encore publié » : il se retire du registre, et le gagnant se
 *    recalcule. C'est la même intention, tenue par une structure au lieu
 *    d'une précaution — et cette structure-là survit à n'importe quel ordre
 *    de démontage, ce que la précaution ne faisait pas.
 * 2. **Un identifiant PAR INSTANCE, pas par CONTENU.** Le magasin de contexte
 *    compare des objets sérialisés ; celui-ci compare des identités
 *    (`useId()`), parce que deux `<AskLaura>` peuvent poser MOT POUR MOT la
 *    même question (deux comptes différents demandant « Prépare une reprise »)
 *    sans être la même instance, et chacune doit pouvoir se retirer sans
 *    effacer l'autre par erreur si leur contenu coïncidait.
 * 3. **Aucun écrit HORS d'un effet.** Publier pendant le rendu ferait tourner
 *    `LauraDock` en re-render depuis un composant qu'il ne connaît pas —
 *    exactement le défaut que `useEffect` évite ici comme dans le magasin
 *    voisin.
 */

/** Ce qu'un écran dépose : la phrase, son libellé (accessibilité du bouton
 *  d'envoi), et le compte à mettre en portée quand l'écran en désigne un. */
export type LauraIntro = {
  /** Identité de l'instance déposante — jamais du contenu (règle 2 ci-dessus). */
  id: string
  /** La question, RÉDIGÉE pour cet écran. Pré-remplie, jamais envoyée seule. */
  question: string
  /** Ce que porte le bouton d'envoi de la bulle une fois agrandie. */
  label: string
  accountId?: string
  /**
   * #1847 — la PROFONDEUR de surcouche du déposant. `0` = la page ; `1` et
   * au-delà = à l'intérieur d'une modale, d'un tiroir ou d'un panneau.
   *
   * Elle voyage jusqu'à la bulle parce que celle-ci en a besoin : sous une
   * surcouche ouverte, la bulle est inerte (voir `LauraDock.tsx`), et c'est la
   * surcouche qui porte le contrôle visible.
   */
  scopeDepth: number
}

type Listener = () => void

/** Un dépôt vivant, plus son rang d'enregistrement — l'arbitre à portée égale. */
type Deposit = { intro: LauraIntro; seq: number }

/** Tous les dépôts VIVANTS, dans l'ordre où ils se sont enregistrés. */
let deposits: Deposit[] = []
/** Le gagnant DÉRIVÉ du registre. `null` = aucun écran ne dépose rien. */
let published: LauraIntro | null = null
/** Rang d'enregistrement, monotone : « le dernier enregistré » a le plus grand. */
let sequence = 0
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot(): LauraIntro | null {
  return published
}

/**
 * Le dépôt que la bulle doit porter : la portée la plus PROFONDE, puis, à
 * portée égale, le dernier enregistré.
 *
 * ⚠️ La comparaison de portée passe AVANT celle du rang. C'est tout le lot
 * #1847 : sans elle, une ligne de page qui republie pendant qu'une modale est
 * ouverte lui reprendrait la portée, parce qu'elle serait « la dernière ».
 */
function winner(): Deposit | null {
  let best: Deposit | null = null
  for (const candidate of deposits) {
    if (best === null) {
      best = candidate
      continue
    }
    if (candidate.intro.scopeDepth > best.intro.scopeDepth) {
      best = candidate
      continue
    }
    if (candidate.intro.scopeDepth === best.intro.scopeDepth && candidate.seq > best.seq) best = candidate
  }
  return best
}

/**
 * Recalcule le gagnant et n'émet QUE s'il a changé d'identité.
 *
 * ⚠️ L'identité de l'objet compte : `useSyncExternalStore` compare les
 * instantanés par référence et boucle si `snapshot()` en fabrique un nouveau à
 * chaque appel. On republie donc l'objet `intro` du dépôt, jamais une copie.
 */
function refresh(): void {
  const next = winner()?.intro ?? null
  if (next === published) return
  published = next
  emit()
}

function register(intro: LauraIntro): void {
  sequence += 1
  deposits = [...deposits, { intro, seq: sequence }]
  refresh()
}

function unregister(id: string): void {
  const remaining = deposits.filter(deposit => deposit.intro.id !== id)
  if (remaining.length === deposits.length) return
  deposits = remaining
  refresh()
}

/**
 * DÉPOSER une amorce pour cet écran, tant que le composant appelant reste
 * monté. Retourne `true` quand CETTE instance est celle que la bulle
 * s'apprête à montrer (règle 1) — c'est ce qui permet à `AskLaura` de savoir
 * s'il doit s'effacer de la page ou rester un lien visible.
 *
 * Patron identique à `useLauraContext` (`page-context-store.ts`) : une clé
 * sérialisée comme dépendance d'effet, pour qu'un contenu qui change RE-publie
 * (même instance, même `id`), et qu'un contenu qui NE change pas ne republie
 * pas à chaque rendu de l'écran hôte.
 */
export function useAskLauraIntro(intro: Omit<LauraIntro, 'id' | 'scopeDepth'>): boolean {
  const id = useId()
  // #1847 — la portée est lue ICI, à l'endroit du dépôt : c'est la position du
  // `<AskLaura>` dans l'arbre qui dit s'il parle au nom d'une surcouche.
  const scopeDepth = useLauraIntroScope()
  const key = JSON.stringify({ id, scopeDepth, ...intro })

  useEffect(() => {
    const parsed = JSON.parse(key) as LauraIntro
    register(parsed)
    return () => {
      unregister(parsed.id)
    }
  }, [key])

  const current = useCurrentLauraIntro()
  return current?.id === id
}

/** Ce que la bulle propose à l'arrivée. `null` = aucun écran ne dépose rien. */
export function useCurrentLauraIntro(): LauraIntro | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/**
 * Remettre le magasin à zéro entre deux tests — un état de module survit à
 * `cleanup()` de Testing Library, sans quoi l'ordre des fichiers déciderait
 * du résultat (même mise en garde que `resetLauraPageContext`).
 */
export function resetLauraIntro(): void {
  deposits = []
  published = null
  sequence = 0
  openRequest = null
  openSequence = 0
  emit()
}

/**
 * #4309.1 / #4345.1 — OUVRIR LA BULLE SUR PLACE, SANS QUITTER LA PAGE.
 *
 * Un `<AskLaura>` qui ne se retire pas (CTA d'en-tête, perdant de la course)
 * rendait un `<Link to="/chat">` : cliquer emmenait hors de l'écran. Il demande
 * maintenant à la bulle de s'ouvrir avec la question PRÉ-REMPLIE (jamais
 * envoyée) ; `LauraDock` lit cette demande. Un numéro de séquence fait qu'une
 * même question redemandée rouvre la bulle.
 */
type LauraOpenRequest = { question: string; seq: number }

let openRequest: LauraOpenRequest | null = null
let openSequence = 0

function openSnapshot(): LauraOpenRequest | null {
  return openRequest
}

export function requestLauraOpen(question: string): void {
  openSequence += 1
  openRequest = { question, seq: openSequence }
  emit()
}

export function useLauraOpenRequest(): LauraOpenRequest | null {
  return useSyncExternalStore(subscribe, openSnapshot, openSnapshot)
}
