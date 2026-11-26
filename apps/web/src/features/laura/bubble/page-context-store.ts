import { useEffect, useSyncExternalStore } from 'react'
import { lauraPageContextSchema, type LauraPageContext } from '@bellum/contracts'

/**
 * CE QUE L'ÉCRAN COURANT DÉCLARE À LAURA — un magasin, pas un contexte React.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MAGASIN EXTERNE ET PAS UN `createContext`
 * ─────────────────────────────────────────────────────────────────────────────
 * La bulle est montée à la RACINE du routeur, à côté de `<Outlet />` — c'est le
 * seul endroit d'où elle est présente sur tous les écrans. Un `Provider` qui
 * envelopperait l'`Outlet` marcherait, et rendrait l'application entière à
 * chaque frappe au clavier dans la bulle : le fil de conversation vit dans le
 * même composant, et un `useState` qui change au-dessus de l'`Outlet` re-rend
 * tout ce qui est en dessous.
 *
 * Le dépôt a déjà résolu ce problème une fois, exactement de cette façon :
 * `useAnySheetOpen` (`packages/ui/src/components/sheet.tsx`) est un compteur de
 * module lu par `useSyncExternalStore`. On suit le même motif plutôt que d'en
 * inventer un second.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RÈGLES QUE CE FICHIER TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Un contexte qui ne valide pas n'est PAS un contexte.** Il est publié à
 *    `null` plutôt que transmis tel quel. Un libellé de 900 caractères ou une
 *    précision hors bornes serait refusé par le serveur de toute façon ; le
 *    laisser partir ferait échouer le tour entier au lieu de le faire partir
 *    sans contexte. Le sens de la dégradation est choisi : **Laura sans
 *    contexte plutôt que Laura muette**.
 * 2. **Le dernier écran monté gagne, et il nettoie derrière lui.** Deux écrans
 *    imbriqués qui déclareraient tous les deux (un onglet dans une fiche) sont
 *    un cas réel ; le plus profond est monté en dernier, donc c'est lui qui
 *    parle — ce qui est aussi le plus précis. Au démontage, l'écran ne remet à
 *    `null` que **s'il est encore celui qui est publié** : sans ce test, quitter
 *    un écran vers un autre effacerait la déclaration du suivant, qui vient
 *    d'être posée (l'effet de nettoyage du sortant court APRÈS l'effet du
 *    entrant dans une transition de route).
 */

type Listener = () => void

/** L'état publié. `null` = aucun écran ne déclare quoi que ce soit. */
let published: LauraPageContext | null = null
/** L'empreinte de ce qui est publié — voir la règle 2. */
let publishedKey: string | null = null
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

function snapshot(): LauraPageContext | null {
  return published
}

/**
 * DÉCLARER ce que cet écran montre.
 *
 * ⚠️ L'objet est sérialisé pour servir de dépendance : un écran écrit
 * naturellement `useLauraContext({ kind: 'account', … })`, c'est-à-dire un objet
 * NEUF à chaque rendu. Le passer en dépendance d'effet republierait à chaque
 * frappe au clavier de l'écran — et un magasin qui notifie sans changer de
 * valeur est un rendu par battement de cœur.
 */
export function useLauraContext(context: LauraPageContext): void {
  const key = JSON.stringify(context)
  useEffect(() => {
    const parsed = lauraPageContextSchema.safeParse(JSON.parse(key) as unknown)
    // Règle 1 : un contexte invalide n'est pas transmis « au cas où ».
    published = parsed.success ? parsed.data : null
    publishedKey = parsed.success ? key : null
    emit()
    return () => {
      // Règle 2 : ne nettoyer QUE si c'est encore nous qui sommes publiés.
      if (publishedKey !== key) return
      published = null
      publishedKey = null
      emit()
    }
  }, [key])
}

/** Ce que Laura voit de l'écran courant. `null` = l'écran ne déclare rien. */
export function useCurrentLauraContext(): LauraPageContext | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/**
 * Remettre le magasin à zéro entre deux tests.
 *
 * Un état de module survit à `cleanup()` de Testing Library : sans cette porte,
 * un test qui déclare un contexte le laisserait au test suivant, et l'ordre des
 * fichiers déciderait du résultat.
 */
export function resetLauraPageContext(): void {
  published = null
  publishedKey = null
  emit()
}
