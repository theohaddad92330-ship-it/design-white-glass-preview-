import { useEffect, useState } from 'react'
import { isRunStale, useAnalysisStore } from '@/stores/analysisStore'
import { useBackgroundTasksStore } from '@/stores/backgroundTasksStore'
import { useDeclaredBusyStore } from '@/stores/lauraDeclaredBusyStore'

/**
 * « JAMAIS PENDANT UNE SAISIE, UN IMPORT, UNE ANALYSE, UNE VALIDATION »
 * — §3.2 du PDF 7, repris au §5.3 du PDF 10.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER CORRIGE (mesuré le 29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * La règle était écrite, gardée côté serveur (`canInterrupt`, qui refuse sur
 * `busy`) — et elle ne se déclenchait pratiquement JAMAIS. Le client la
 * calculait ainsi :
 *
 *     document.querySelector('form [aria-busy="true"], [data-analysis-running="true"]')
 *
 * Deux sélecteurs, deux morts :
 *
 *  · `[data-analysis-running]` n'était posé par **aucun composant du dépôt** —
 *    une seule occurrence dans tout le code, celle du sélecteur lui-même ;
 *  · `form [aria-busy="true"]` exige un `<form>` ANCÊTRE. Les trois seuls
 *    `aria-busy` du dépôt sont posés sur une `<section>`, un `<div>` et une
 *    `<div role="dialog">` — aucun n'est dans un formulaire. Ce sélecteur-là ne
 *    pouvait pas matcher non plus.
 *
 * Et surtout : il était évalué **une seule fois, au changement d'écran**. Une
 * analyse lancée sur l'écran courant — le cas le plus fréquent, puisqu'on la
 * lance depuis la barre de recherche et qu'on reste là pendant trois à six
 * minutes — n'était jamais vue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL LIT À LA PLACE : DES SIGNAUX QUI EXISTENT DÉJÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * Rien de neuf n'est collecté. Les trois sources sont celles que le produit
 * tient déjà pour son propre compte, et chacune est un ÉTAT — donc une valeur
 * qui change sous les yeux du hook, pas une photo :
 *
 *  1. **Une analyse** — `analysisStore`, le magasin que `/search`, la fiche de
 *     compte et « Tâches de fond » lisent tous les trois. Un run périmé
 *     (`isRunStale`) ne compte pas : un onglet fermé au milieu d'une analyse
 *     laisserait sinon Laura muette pour toujours.
 *  2. **Un import, une sauvegarde, une validation** — `backgroundTasksStore`,
 *     dont le docblock dit exactement ce qu'on cherche : « anything that is
 *     meaningful enough for the user to track — analyses, saves, exports ».
 *  3. **Une saisie** — le seul signal que ni l'un ni l'autre ne porte. On
 *     écoute l'événement `input`, qui est le fait lui-même : quelqu'un tape.
 *
 * ⚠️ La saisie se mesure sur la FRAPPE et non sur le focus. Un champ focalisé
 * mais vide — une barre de recherche auto-focalisée à l'ouverture d'un écran,
 * par exemple — tairait Laura sur cet écran pour toute la visite, sans que
 * personne n'ait rien tapé. Ce qu'on veut dire est « pendant une saisie », pas
 * « tant qu'un curseur clignote quelque part ».
 */

/**
 * Combien de temps une frappe rend Laura silencieuse.
 *
 * Assez long pour couvrir les pauses d'une phrase en cours (on hésite plus
 * d'une seconde entre deux mots), assez court pour qu'un champ abandonné ne
 * bâillonne pas Laura pour le reste de la visite.
 */
const TYPING_IDLE_MS = 3_000

/**
 * Quelqu'un est-il en train de taper, maintenant ?
 *
 * L'écoute est posée en CAPTURE sur le document : `input` remonte, mais la
 * capture attrape aussi ce qu'un composant arrêterait en route — et un seul
 * écouteur pour toute l'application coûte moins qu'un par champ.
 */
function useIsTyping(): boolean {
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    let idle: ReturnType<typeof setTimeout> | null = null
    const onInput = (): void => {
      setTyping(true)
      if (idle) clearTimeout(idle)
      idle = setTimeout(() => setTyping(false), TYPING_IDLE_MS)
    }
    document.addEventListener('input', onInput, true)
    return () => {
      document.removeEventListener('input', onInput, true)
      if (idle) clearTimeout(idle)
    }
  }, [])

  return typing
}

/**
 * #1937.7 — le rôle ARIA que Radix pose sur le contenu réellement ouvert d'une
 * boîte modale : `<Dialog>`/`<AlertDialog>` (`packages/ui`) ET `<Sheet>`, qui
 * partage le même primitif `@radix-ui/react-dialog` et porte donc `"dialog"`
 * lui aussi. Aucune modale de ce dépôt n'y échappe.
 */
const MODAL_ROLE_SELECTOR = '[role="dialog"], [role="alertdialog"]'

/**
 * Une modale (boîte de dialogue, alerte, tiroir) est-elle ouverte MAINTENANT ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI OBSERVER LE DOM ICI ALORS QUE LE DOCBLOC DU HAUT LE DÉCONSEILLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `useAnySheetOpen` (`packages/ui/src/components/sheet.tsx`) est l'état global
 * qui existe déjà — mais il ne compte que les `<Sheet>`. Une `<Dialog>` ou une
 * `<AlertDialog>` ordinaire (`packages/ui/src/components/dialog.tsx` et
 * `alert-dialog.tsx`) n'a AUCUN compteur : ce sont des ré-exports directs du
 * `Root` Radix, sans wrapper qui publierait un état. Se limiter à
 * `useAnySheetOpen` laisserait Laura parler PENDANT une boîte de confirmation
 * ordinaire — la moitié des surcouches du dépôt, pas un cas rare.
 *
 * L'observation reste BORNÉE, contrairement au sélecteur mort que ce fichier a
 * déjà remplacé une fois (voir le docblock au-dessus) :
 *
 *  · seuls les enfants DIRECTS de `document.body` sont surveillés
 *    (`childList`, jamais `subtree`) — c'est très exactement là qu'un `Portal`
 *    Radix ajoute son conteneur à l'ouverture et le retire à la fermeture
 *    (`@radix-ui/react-portal` : `ReactDOM.createPortal(<div/>, document.body)`).
 *    Un `subtree: true` réévaluerait la règle à CHAQUE mutation de
 *    l'application entière pour un signal qui ne bouge qu'à l'ouverture d'une
 *    surcouche ;
 *  · un seul observateur, posé une fois au montage et coupé au démontage —
 *    pas de minuteur, pas de sondage, aucune boucle.
 */
function useIsModalOpen(): boolean {
  const [open, setOpen] = useState(
    () => typeof document !== 'undefined' && document.body.querySelector(MODAL_ROLE_SELECTOR) !== null,
  )

  useEffect(() => {
    const check = (): void => setOpen(document.body.querySelector(MODAL_ROLE_SELECTOR) !== null)
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true })
    return () => observer.disconnect()
  }, [])

  return open
}

/**
 * #2403.15 / #2403.16 — déclare qu'un écran est occupé par quelque chose que
 * `useLauraBusy` ne peut pas observer lui-même : un mode vocal actif, une
 * action critique en ligne (pas de `[role=dialog]` à surveiller).
 *
 * `id` identifie la déclaration : deux appelants concurrents (le vocal ET un
 * règlement en cours, par exemple) se composent sans s'écraser. La
 * déclaration se retire automatiquement quand `active` retombe à `false` ET
 * au démontage — un écran qui disparaît pendant l'action (navigation, erreur)
 * ne laisse jamais Laura muette pour le reste de la visite.
 */
export function useDeclareLauraBusy(active: boolean, id: string): void {
  const begin = useDeclaredBusyStore(state => state.begin)
  const end = useDeclaredBusyStore(state => state.end)

  useEffect(() => {
    if (!active) return
    begin(id)
    return () => end(id)
  }, [active, id, begin, end])
}

/**
 * Y a-t-il quelque chose qu'on n'interrompt pas ?
 *
 * Le hook ne DÉCIDE rien : la valeur voyage jusqu'au serveur, qui reste le seul
 * à trancher (`canInterrupt`). C'est délibéré — le navigateur est le seul à
 * SAVOIR qu'une analyse tourne, le serveur le seul à pouvoir refuser sans
 * qu'on puisse le contourner.
 */
export function useLauraBusy(): boolean {
  const runs = useAnalysisStore(state => state.runs)
  const tasks = useBackgroundTasksStore(state => state.tasks)
  const typing = useIsTyping()
  // #1937.7 — une modale ouverte (Dialog/AlertDialog/Sheet) tait Laura, au même
  // titre qu'une saisie, un import, une analyse ou une validation.
  const modalOpen = useIsModalOpen()
  // #2403.15 / #2403.16 — le vocal actif et une action critique en ligne,
  // déclarés par ceux qui les voient (voir `useDeclareLauraBusy`).
  const declaredBusy = useDeclaredBusyStore(state => state.activeIds.size > 0)

  const now = Date.now()
  const analysing = Object.values(runs).some(
    run => (run.state === 'analyzing' || run.state === 'starting') && !isRunStale(run, now),
  )
  const working = Object.values(tasks).some(task => task.state === 'running')

  return analysing || working || typing || modalOpen || declaredBusy
}
