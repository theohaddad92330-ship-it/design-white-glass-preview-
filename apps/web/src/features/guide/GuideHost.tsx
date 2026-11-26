import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouterState } from '@tanstack/react-router'
import { findGuideAnchorElement } from './guide-anchors'
import { GuideSpotlight } from './GuideSpotlight'
import { useGuideStore, type GuideStepAction } from './guide-store'
import { guideViewportFromWindow, useGuideTarget } from './use-guide-target'
import type { GuideStepContext } from './guide-step-gate'

/**
 * #2212.2/.26/.37/.38 — LE POINT D'ENTRÉE DU GUIDE, MONTÉ À LA RACINE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI À LA RACINE, ET POURQUOI IL NE REND RIEN LA PLUPART DU TEMPS
 * ─────────────────────────────────────────────────────────────────────────────
 * Même raison que `LauraDock` et `ProductTour` (voir `routes/__root.tsx`) : un
 * pas de guide peut désigner n'importe quel écran, et un parcours peut traverser
 * une navigation. Un composant qui se démonte en changeant de route ne peut pas
 * tenir le fil jusque-là.
 *
 * Il ne rend RIEN tant que personne n'a démarré une aide — et rien non plus
 * pendant la recherche de la cible : un halo sur du vide est pire qu'un guide
 * muet, parce qu'il se voit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FAIT D'UNE CIBLE ABSENTE (#2212.37) — ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ÉCARTE le pas en nommant la raison, et passe au suivant. Il n'affiche pas
 * d'erreur, il ne réessaie pas en boucle, et il n'invente SURTOUT pas une cible
 * de remplacement : « on n'affiche pas ce qu'on n'a pas ». Une cible absente est
 * un fait ; la raison part au journal du fil (`skipped`), agrégeable par écran
 * et par fonction — jamais par personne (GA-240/241).
 *
 * ⚠️ Ce composant ne NAVIGUE pas. Un pas dont la route ne correspond pas est
 * écarté pour la raison `route`, il n'emmène personne : le socle montre, il ne
 * déplace pas la personne sans qu'elle l'ait demandé. Emmener d'écran en écran
 * est le travail du niveau 3 (#2214.4), et il viendra avec son propre geste
 * explicite.
 */
export function GuideHost() {
  const { t } = useTranslation('guide')
  const session = useGuideStore(state => state.session)
  const next = useGuideStore(state => state.next)
  const previous = useGuideStore(state => state.previous)
  const stop = useGuideStore(state => state.stop)
  const skipCurrent = useGuideStore(state => state.skipCurrent)

  // #2212.26 — la route courante. Elle est une ENTRÉE du jugement, pas un effet
  // de bord : c'est elle qui fait rejuger l'étape quand elle change.
  const route = useRouterState({ select: state => state.location.pathname })

  const step = session?.steps[session.index]

  /**
   * Le contexte des portes (#2212.32-.35).
   *
   * ⚠️ Il ne porte AUCUNE identité — pas d'`userId`, pas d'e-mail, rien qui
   * désigne quelqu'un. L'analytique produit mesure le produit, jamais la
   * personne (GA-240/241/264/266/267), et un contexte qui transporterait une
   * identité la ferait fuiter dans chaque trace d'absence.
   *
   * Les permissions et les drapeaux sont vides dans ce socle, et c'est une
   * ABSENCE ASSUMÉE, pas un oubli : le dépôt n'a pas de système de drapeaux
   * générique (mesuré le 21/09 — #2212.35 le note), et les permissions
   * effectives de la session se branchent avec le premier pas de guide qui en
   * exige une. Un tableau vide ferme la porte plutôt que de l'ouvrir : un pas
   * qui exige une permission ne s'affichera pas, ce qui est le bon défaut.
   */
  const context = useMemo<GuideStepContext>(
    () => ({
      route,
      permissions: [],
      viewportWidth: typeof window === 'undefined' ? 0 : window.innerWidth,
      availableData: [],
      enabledFlags: [],
    }),
    [route],
  )

  const target = useGuideTarget(step, context)

  // #2212.37 — une cible absente écarte le pas, en nommant la raison.
  //
  // La raison est extraite en variable plutôt que lue dans le tableau de
  // dépendances : une expression conditionnelle y est invérifiable
  // statiquement, et c'est précisément le genre d'effet qui se met à tourner
  // une fois de trop sans que personne ne le voie.
  const absentReason = target.status === 'absent' ? target.reason : null
  useEffect(() => {
    if (!step || !absentReason) return
    skipCurrent(absentReason)
  }, [step, absentReason, skipCurrent])

  /**
   * #2212.5/#2212.11 — LE MODE `action-guidee` AVANCE SUR LE CLIC RÉEL.
   *
   * ⚠️ Cet écouteur n'intercepte RIEN : pas de `preventDefault`, pas de
   * `stopPropagation`, pas de phase de capture. Il OBSERVE le même clic que
   * celui qui déclenche le vrai geste métier (GA-371 — le guide montre, il ne
   * prend jamais la main), et fait simplement avancer le fil — `next()` sait
   * déjà terminer au dernier pas (`guide-store.ts`).
   *
   * #2212.12 — un pas qui déclare `awaitsResult` n'avance PAS ici : le clic
   * seul ne dit rien de l'issue d'une écriture asynchrone. C'est l'effet
   * suivant qui avance, sur l'événement réel.
   */
  const mode = session?.mode
  const resolvedAnchor = target.status === 'resolved' ? target.anchor : null
  const awaitsResultEvent = step?.awaitsResult?.event
  useEffect(() => {
    if (mode !== 'action-guidee' || !resolvedAnchor || awaitsResultEvent) return
    const element = findGuideAnchorElement(resolvedAnchor)
    if (!element) return
    element.addEventListener('click', next)
    return () => element.removeEventListener('click', next)
  }, [mode, resolvedAnchor, awaitsResultEvent, next])

  /**
   * #2212.12 — LE RÉSULTAT RÉEL AVANT POURSUITE.
   *
   * Le clic déclenche le vrai geste métier sans qu'on y touche (ci-dessus) ;
   * ce guide-ci attend séparément la CONSÉQUENCE de ce geste — l'événement DOM
   * que le code métier dispatche quand il connaît l'issue (`useAnalysis.ts`,
   * par exemple). Zéro minuterie, zéro sondage : une seule source de vérité,
   * l'événement lui-même.
   */
  useEffect(() => {
    if (mode !== 'action-guidee' || !awaitsResultEvent) return
    const onResult = () => next()
    window.addEventListener(awaitsResultEvent, onResult)
    return () => window.removeEventListener(awaitsResultEvent, onResult)
  }, [mode, awaitsResultEvent, next])

  // #2212.15 — LE CHOIX D'UN CONTENU DE DÉCLENCHEMENT : `advance`, seule nature qui reste, avance (`next`).
  // (`fill-and-advance` retiré — garde #3646, plus de saisie libre à remplir.)

  if (!session || !step) return null
  if (target.status !== 'resolved') return null

  return (
    <GuideSpotlight
      target={target.rect}
      keepClear={target.keepClear}
      viewport={guideViewportFromWindow()}
      title={t(step.titleKey)}
      body={t(step.bodyKey)}
      step={{ current: session.index + 1, total: session.steps.length }}
      mode={session.mode}
      actions={step.actions}
      onNext={next}
      onPrevious={previous}
      onClose={stop}
      onSelectAction={next}
    />
  )
}
