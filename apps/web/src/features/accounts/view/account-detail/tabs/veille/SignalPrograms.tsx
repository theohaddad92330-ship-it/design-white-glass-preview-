import type { Account, ProgramName } from '@bellum/contracts'
import { useEffect, useRef, useState } from 'react'
import { resolveLegacyTabNotice } from '../../accountDetailSearch'
import { ItProgramsCard } from '../sections/ItProgramsCard'
import { useAccountOverviewData } from '../useAccountOverviewData'
import { arrivedByProgramsLinkAtScreenOpen } from './programsArrival'

/**
 * #3677 — LES PROGRAMMES SE LISENT AVEC LES SIGNAUX, PAS DANS PÉRIMÈTRES.
 *
 * Périmètres parle de structure (sites, entités, filiales) ; un programme n'a
 * de sens commercial qu'à côté du signal ou du projet qui explique pourquoi
 * travailler le compte. Le sous-onglet « Programmes » est retiré (son ancienne
 * URL `?tab=programs` mène ici, voir `LEGACY_TAB_ALIASES`) ; la carte, elle,
 * est la MÊME (`ItProgramsCard`) et `raw_analysis.program_names` n'est ni
 * modifié ni dupliqué — les 5P et les messages le lisent toujours.
 *
 * Aucune carte vide : sans programme exploitable, ce composant ne rend RIEN
 * (une absence ne fait pas de ligne). Et il ne fabrique aucun besoin ni
 * opportunité — c'est une lecture.
 */
export function SignalPrograms({ account, embedded = false }: { account: Account; embedded?: boolean }) {
  const overview = useAccountOverviewData(account)
  const programs = usableSignalPrograms(overview.program_names ?? [])
  const anchorRef = useRef<HTMLDivElement>(null)
  const hasPrograms = programs.length > 0

  // #3677.2 (recette prod 09/10, top=6063px, AUCUN défilement) — `isProgramsEntryLink()`
  // relisait `window.location.search` EN DIRECT au moment où l'effet s'exécute. En
  // démo, les données sont synchrones : l'effet tourne avant que le routeur (ancêtre,
  // `AccountDetail`) n'ait réécrit l'URL en `?tab=veille`, donc ça « marchait ». En prod
  // réelle, `program_names` arrive avec la requête de compte (asynchrone, souvent
  // après la réécriture d'URL) : `hasPrograms` passe à `true` plus tard, l'effet
  // rejoue, mais l'URL dit déjà `veille` — le signal « on vient de l'ancien lien » est
  // perdu avant même d'avoir pu servir. Même piège que `legacyTabNotice`
  // (`AccountDetailTabContent.tsx:117-136`) : capturé UNE SEULE FOIS, au premier rendu,
  // avant que quiconque n'ait pu réécrire l'URL.
  // #3677 (recette prod 10/10, Sanofi, scrollY=0) — ET ce composant se monte APRÈS la réécriture
  // d'URL (compte chargé, onglet veille affiché) : l'URL ne dit plus rien à son montage. Le
  // verdict de l'ÉCRAN, pris à son tout premier rendu (`programsArrival`), fait foi aussi.
  const [cameFromProgramsLink] = useState(() => isProgramsEntryLink() || arrivedByProgramsLinkAtScreenOpen())

  useEffect(() => {
    if (!hasPrograms || !cameFromProgramsLink) return
    // #3677.2 (4e recette prod 09/10, scrollY=0 à 15 s) — INSTANTANÉ, pas doux : le défilement
    // `smooth` est abandonné en silence par certains environnements (mesuré sur /chat, voir
    // `Chat.tsx` : `smooth` → reste à 0, `auto` → agit). Le geste d'arrivée n'a pas besoin
    // d'animation, il a besoin d'avoir lieu.
    const scroll = () => anchorRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
    scroll()
    // #3677.2 — `scrollRestoration` du routeur remet la page à 0 APRÈS la réécriture d'URL
    // (`?tab=programs` → `?tab=veille`), donc après notre premier retour. Tant que
    // l'utilisateur n'a rien touché, un retour à 0 pendant la fenêtre d'arrivée est rattrapé ;
    // un geste (molette, tactile, clavier) rend la main : on ne contrarie jamais la lecture.
    let userTookOver = false
    const takeOver = () => {
      userTookOver = true
    }
    const rescrollIfReset = () => {
      if (!userTookOver && window.scrollY < 1) scroll()
    }
    const removeUserListeners = () => {
      window.removeEventListener('scroll', rescrollIfReset)
      window.removeEventListener('wheel', takeOver)
      window.removeEventListener('touchstart', takeOver)
      window.removeEventListener('keydown', takeOver)
    }
    window.addEventListener('scroll', rescrollIfReset, { passive: true })
    window.addEventListener('wheel', takeOver, { passive: true })
    window.addEventListener('touchstart', takeOver, { passive: true })
    window.addEventListener('keydown', takeOver)
    // #3709 (07/10, après ce correctif) a posé une bande « entonnoir + valeur
    // ajoutée » AU-DESSUS de cette carte, sur le même onglet — et sa carte de
    // valeur attend une lecture CRM asynchrone (`useCrmPresence`) qui peut
    // finir de charger bien après un délai fixe, poussant la carte « Projets et
    // transformations » plus bas APRÈS le seul retour que ce correctif posait.
    // Recette prod 08/10 (puis régression recette prod 08/10, Q #3899) : encore
    // en haut de page à +4 s, puis toujours en haut à +9 s — la fenêtre fixe de
    // 4 s coupait l'observateur avant que les requêtes voisines (missions,
    // besoins, pistes à qualifier) aient fini de résoudre, SANS qu'aucune
    // mutation n'ait eu lieu avant leur résolution tardive : un chrono qui
    // repousserait son arrêt à chaque mutation ne les aurait pas davantage
    // couvertes (silence total jusqu'à cette résolution). Il n'y a ici aucun
    // signal de chargement partagé à attendre (`useAccountOverviewData` est
    // synchrone) : la seule correction honnête est une fenêtre GÉNÉREUSE,
    // jamais un délai qui devine la latence d'une requête voisine.
    const container = anchorRef.current?.closest('section') ?? document.body
    const observer = new MutationObserver(scroll)
    observer.observe(container, { childList: true, subtree: true })
    // #3677.2 (recette prod 09/10, code aef69661e9 — AUCUN défilement, top=6063 px,
    // identique à la recette précédente malgré ce `MutationObserver`) — un bloc
    // voisin peut grandir SANS poser ni retirer un nœud : une image (logo du
    // compte, fiche ouverte dans l'en-tête) qui finit de charger, une police qui
    // bascule, un graphique qui mesure son conteneur — chacun déplace l'ancre par
    // un simple changement de TAILLE, jamais capté par `childList`/`subtree`. Un
    // `ResizeObserver` sur le même conteneur couvre ce second chemin ; les deux
    // observateurs partagent le même `scroll()` et la même fenêtre d'arrêt.
    const resizeObserver = new ResizeObserver(scroll)
    resizeObserver.observe(container)
    const stop = window.setTimeout(() => {
      observer.disconnect()
      resizeObserver.disconnect()
      removeUserListeners()
    }, 20000)
    return () => {
      window.clearTimeout(stop)
      removeUserListeners()
      observer.disconnect()
      resizeObserver.disconnect()
    }
  }, [hasPrograms, cameFromProgramsLink])

  if (!hasPrograms) return null
  return (
    <div id="dossier-programs" ref={anchorRef} className="scroll-mt-24">
      <ItProgramsCard programs={programs} analyzedAt={account.last_analyzed_at ?? null} embedded={embedded} />
    </div>
  )
}

/**
 * #3677.6 — « voir le détail unique » depuis la stratégie de compte : ouvre
 * « Signaux et besoins » puis défile jusqu'à la carte (qui se monte après le
 * changement de sous-partie, d'où le second passage).
 */
export function openProgramsDetail(openTab: (tab: 'veille') => void) {
  openTab('veille')
  // Un second clic remplace les passages du premier au lieu de s'y ajouter.
  cancelProgramsDetailScroll()
  const scroll = () => document.getElementById('dossier-programs')?.scrollIntoView({ block: 'start', behavior: 'auto' })
  pendingScrolls = [window.setTimeout(scroll, 400), window.setTimeout(scroll, 1200)]
}

/** Les passages de défilement encore en attente de `openProgramsDetail`. */
let pendingScrolls: number[] = []

/**
 * #4845 — annule les passages en attente. Une tâche qui survit au démontage de l'environnement de test lève
 * `document is not defined` APRÈS le dernier test vert : vitest sort en 1 avec 0 test rouge. Les tests qui cliquent
 * le CTA l'appellent à leur sortie ; en production, le défilement doit au contraire survivre au changement d'onglet.
 */
export function cancelProgramsDetailScroll() {
  for (const id of pendingScrolls) window.clearTimeout(id)
  pendingScrolls = []
}

/** L'URL est-elle l'ancien lien vers le sous-onglet « Programmes » ? */
function isProgramsEntryLink(): boolean {
  const notice = resolveLegacyTabNotice(new URLSearchParams(window.location.search).get('tab'))
  return notice?.value === 'programs' || notice?.value === 'programmes'
}

/**
 * Un titre vague (« Climat ») n'est pas transféré tel quel : un nom d'un seul
 * mot, sans entité porteuse, sans description ni budget, ne dit rien qu'on
 * puisse travailler. Il reste dans la donnée (contexte secondaire pour les 5P),
 * il n'est simplement pas présenté ici comme un programme.
 */
export function usableSignalPrograms(programs: readonly (ProgramName | null | undefined)[]): ProgramName[] {
  return programs.filter((program): program is ProgramName => {
    const name = (program?.name ?? '').trim()
    if (!program || name.length === 0) return false
    const isSingleWord = !/\s/.test(name)
    const hasContext = [
      program.entity,
      program.description,
      program.budget,
      program.objective,
      program.scope,
      program.horizon,
    ].some(value => (value ?? '').trim() !== '')
    return !(isSingleWord && !hasContext)
  })
}
