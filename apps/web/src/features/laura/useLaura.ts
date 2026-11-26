import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import type {
  AccountSuggestion,
  InterventionDefinition,
  InterventionReaction,
  MissionStartAnnouncement,
  OverdueFollowUp,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { trackInterventionOutcome } from '@/lib/product-tracker'
import { setLauraSilenced } from './laura-silence-signal'
import { useLauraBusy } from './useLauraBusy'
import { useDeferredEnabled } from '@/lib/hooks/use-deferred-enabled'

/**
 * `useLaura` — la seule porte vers l'assistante (Tome 7 §48).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RISQUE QU'ELLE ÉVITE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tome le nomme deux fois, et le qualifie de « risque technique n°1 du
 * programme » : **si chaque écran implémente sa propre logique d'interruption,
 * le budget de trois messages par jour ne tiendra pas une semaine.** Laura doit
 * apparaître sur plusieurs surfaces (une carte, un bloc dans un écran, une
 * bulle) ; le jour où la deuxième surface arrive, la tentation est de recopier
 * les vingt lignes de la première. Deux compteurs, deux budgets, et l'écran le
 * plus bavard gagne.
 *
 * Ce hook est donc le seul endroit qui parle à `/laura/*`. Une garde le
 * vérifie (`laura-single-door.test.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE DÉCIDE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Rien de ce qui compte. Le budget d'interruption, le retrait après fermeture,
 * la priorité, la détection : tout vit côté serveur, testé. Un navigateur qui
 * choisirait ses propres interventions choisirait ce qui l'interrompt — et un
 * client peut envoyer n'importe quoi. Le hook demande, affiche, et rapporte la
 * réaction.
 *
 * `surface` voyage jusqu'au serveur pour qu'il puisse, plus tard, plafonner par
 * surface plutôt que globalement. Aujourd'hui il ne s'en sert pas ; l'envoyer
 * dès maintenant évite d'avoir à retoucher les appelants ce jour-là.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL DÉCIDE QUAND MÊME : QUAND DEMANDER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le navigateur est le seul à SAVOIR qu'une analyse tourne ou que quelqu'un est
 * en train de taper — le serveur, lui, est le seul à pouvoir le REFUSER sans
 * qu'on puisse le contourner. Le hook rapporte donc `busy` (voir
 * `useLauraBusy`), et le serveur tranche.
 *
 * Deux conséquences, et la deuxième est la moitié qui manquait :
 *
 *  · un refus pour cause d'occupation **ne clôt pas la question** — rien n'a
 *    été consommé côté serveur, donc la demande repart quand le travail est
 *    fini, sur le MÊME écran ;
 *  · une intervention DÉJÀ affichée n'est pas retirée quand une analyse démarre.
 *    Elle a été posée avant, elle n'interrompt plus rien, et la retirer
 *    brûlerait silencieusement une intervention du plafond du jour.
 */

type LauraSurface = 'card' | 'block' | 'bubble'

/**
 * Le coût de l'intercontrat de `long_bench`, tel que le rend
 * `computeBenchCost` (`apps/api/src/modules/consultants/bench-cost.ts`) — un
 * montant en CENTIMES, ou une raison NOMMÉE. Dupliqué à la main plutôt
 * qu'importé de `@bellum/contracts`, pour la même raison que `LauraPlan`
 * lui-même juste en dessous : ce type décrit ce que RENVOIE `/laura/plan`, pas
 * un objet métier partagé, et `laura.service.ts:70-95` en porte la version
 * canonique.
 */
export type BenchCostDetail =
  | { measurable: true; amountCents: number }
  | { measurable: false; reason: 'tjm_missing' | 'duration_unknown' }

type LauraPlan =
  | { speaks: false; reason: string }
  | {
      speaks: true
      intervention: InterventionDefinition
      priority: number
      traceId: string
      /**
       * Le coût de l'intercontrat, présent uniquement pour `long_bench`
       * (voir `laura.service.ts:70-95`). Le RÉSULTAT, jamais une phrase : c'est
       * ce composant — pas le serveur — qui connaît la langue à parler, donc
       * c'est lui qui compose le texte (`LauraCard.tsx`).
       */
      benchCost?: BenchCostDetail
      /**
       * Les faits qui ont produit la suggestion posée sur un DOSSIER de compte
       * — présent uniquement pour les deux clés du dossier (recrutement et,
       * #3939.3, douleur sourcée ; voir `laura.service.ts`). Importé de `@bellum/contracts` et non recopié :
       * contrairement à `BenchCostDetail`, c'est un objet DÉCRIT par un schéma
       * partagé, que le serveur valide et que l'écran décompose.
       */
      accountSuggestion?: AccountSuggestion
      /** #2409.8 — les manques NOMMÉS du démarrage, présents seulement pour `mission_start_not_ready`. */
      missionStart?: MissionStartAnnouncement
      /** #3398.4a — la relance la plus en retard, NOMMÉE, présente seulement pour `follow_up_overdue`. */
      overdueFollowUp?: OverdueFollowUp
    }

type LauraHandle = {
  /** L'intervention à rendre, ou `null` quand Laura se tait. « Rien » est le
   *  format le plus important : pas d'espace réservé, pas de « tout va bien ». */
  intervention: InterventionDefinition | null
  /**
   * Le coût de l'intercontrat de l'intervention courante, quand le serveur en
   * a mesuré un — `null` sinon (le reste du catalogue reste sa seule phrase
   * statique). Le RÉSULTAT, pas une phrase : `LauraCard` la compose dans SA
   * langue plutôt que de relayer un texte déjà écrit côté serveur.
   */
  benchCost: BenchCostDetail | null
  /**
   * Ce qui a produit la suggestion du dossier ouvert — les faits, leurs
   * sources, la ressource croisée. `null` pour les trente-cinq autres
   * interventions, qui restent leur seule phrase de catalogue.
   *
   * C'est ce que rend « Pourquoi cette suggestion ? ». Une suggestion qu'on ne
   * peut pas décomposer est une boîte noire.
   */
  accountSuggestion: AccountSuggestion | null
  /**
   * #2409.8 — la mission la plus proche d'un démarrage incomplet et ses
   * manques (clés) ; `null` pour les autres interventions. `LauraCard` compose
   * la phrase dans la langue active.
   */
  missionStart: MissionStartAnnouncement | null
  /** #3398.4a — la relance en retard nommée ; `null` pour toute autre intervention. */
  overdueFollowUp: OverdueFollowUp | null
  /** L'utilisateur a agi : on ouvre la route ET on l'enregistre. */
  act: () => void
  /** « Pas maintenant » — un refus de PROPOSITION, qui ne revient pas avant
   *  trente jours. À ne pas confondre avec `dismiss`. */
  refuse: () => void
  /** Fermeture sans lecture — un GESTE, qui met Laura en retrait sept jours. */
  dismiss: () => void
}

/**
 * Où en est la demande pour l'écran courant.
 *
 *  · `in_flight` — partie, pas revenue. On n'en envoie pas une deuxième.
 *  · `settled` — le serveur a tranché. La question est close pour cet écran.
 *  · `due_when_free` — le serveur a refusé **parce qu'on travaillait**, et ce
 *    refus-là ne clôt rien : `canInterrupt` sort AVANT d'écrire la trace, donc
 *    rien n'a été consommé — ni le plafond du jour, ni la règle « une
 *    intervention par écran ». La demande reste DUE, et repart dès que le
 *    travail en cours est fini.
 */
type AskStatus = 'in_flight' | 'settled' | 'due_when_free'

/**
 * `accountId` — le DOSSIER que la surface a sous les yeux, quand elle en a un.
 *
 * ⚠️ Ce n'est pas un raccourci de confort : c'est ce qui empêche deux surfaces
 * de se voler l'intervention. `LauraCard` est montée globalement
 * (`routes/__root.tsx`) ; sur `/accounts/<identifiant>`, elle et le panneau
 * contextuel demandent leur plan sur le MÊME chemin. Seul le panneau connaît le
 * compte, donc seul lui l'envoie, donc seul lui reçoit la suggestion — la carte
 * ne trouve aucune candidate et le serveur rend `nothing_to_say` sans écrire de
 * trace, ce qui laisse le budget du jour intact.
 *
 * `undefined` sur toutes les autres surfaces, et c'est la valeur qui va de soi :
 * un écran qui ne parle d'aucun compte n'en nomme aucun.
 */
export function useLaura(surface: LauraSurface, accountId?: string): LauraHandle {
  const location = useLocation()
  const [plan, setPlan] = useState<LauraPlan | null>(null)
  const ask = useRef<{ key: string; status: AskStatus } | null>(null)
  /** Relance immédiate quand le refus « occupé » arrive alors que le travail
   *  est DÉJÀ fini — sans elle, la demande attendrait un changement de `busy`
   *  qui a déjà eu lieu. */
  const [retry, setRetry] = useState(0)
  /**
   * L'écran pour lequel cette relance immédiate a DÉJÀ servi.
   *
   * ⚠️ Sans ce verrou, un serveur qui répond « occupé » alors que le navigateur
   * se croit libre — désynchronisation, réponse d'une instance en retard, règle
   * serveur qu'on n'a pas — relance à l'infini. Mesuré : 223 requêtes en une
   * seconde de test. La relance sert à rattraper UNE course, pas à négocier.
   */
  const retriedFor = useRef<string | null>(null)

  const screen = location.pathname
  const busy = useLauraBusy()
  // perf P3 (29/09/2026) — `/laura/plan` coûtait 0,8-2,5 s sur 100 % des pages,
  // en concurrence avec les requêtes de la page. La carte proactive (montée au
  // root) attend que la page soit calme ; DIFFÉRÉ, pas supprimé. Exceptions qui
  // partent tout de suite : les surfaces qui sont l'écran lui-même (`block`,
  // `bubble`), et `/chat` — `lauraOpener` y lit le verdict de silence
  // (`laura-silence-signal.ts`) avant de parler, il doit donc le connaître.
  const calm = useDeferredEnabled(surface !== 'card' || screen.startsWith('/chat'))
  // `busy` au moment où la RÉPONSE arrive, et non au moment où la demande est
  // partie : entre les deux, une analyse a pu se terminer.
  const busyNow = useRef(busy)
  busyNow.current = busy

  useEffect(() => {
    if (!calm) return
    // La clé identifie la demande, pas le rendu : c'est elle qui tient « une
    // seule demande par écran et par visite ». L'envoyer à chaque rendu de
    // React ferait une requête par frappe au clavier.
    // Le compte fait partie de la clé : le chemin le porte déjà aujourd'hui,
    // mais un écran qui changerait de dossier sans changer d'URL demanderait
    // sinon un plan périmé — et ce serait silencieux.
    const key = `${surface} ${screen} ${accountId ?? ''}`
    const current = ask.current
    if (current?.key === key) {
      if (current.status !== 'due_when_free') return
      // Toujours occupé : on attend. C'est cet effet qui repartira, parce que
      // `busy` est un vrai état et non une photo prise au changement d'écran.
      if (busy) return
    }

    ask.current = { key, status: 'in_flight' }
    setPlan(null)
    void apiFetch<LauraPlan>({
      path: '/laura/plan',
      method: 'POST',
      body: { screen, busy, surface, ...(accountId ? { accountId } : {}) },
    })
      .then(result => {
        // Une réponse qui n'est plus celle de la demande en cours ne s'affiche
        // pas : l'écran a changé, ou une relance l'a remplacée.
        if (ask.current?.key !== key) return
        if (!result.speaks && result.reason === 'busy') {
          ask.current = { key, status: 'due_when_free' }
          if (!busyNow.current && retriedFor.current !== key) {
            retriedFor.current = key
            setRetry(attempt => attempt + 1)
          }
          return
        }
        ask.current = { key, status: 'settled' }
        // #2427.10 — deux des raisons de silence disent « l'utilisateur a dit
        // stop » (coupé, D49 ; en retrait, §5.3) ; les autres (`busy`,
        // `cap_reached`, `screen_already_served`, `too_soon`,
        // `nothing_to_say`) ne le disent pas. `lauraOpener` (Chat.tsx) lit ce
        // verdict avant de parler — voir `laura-silence-signal.ts`.
        setLauraSilenced(!result.speaks && (result.reason === 'disabled' || result.reason === 'retreat'))
        setPlan(result)
      })
      .catch(() => {
        // Laura qui échoue ne dit rien. Un bandeau « l'assistante est
        // indisponible » interromprait pour annoncer qu'elle ne va pas
        // interrompre. Et l'échec CLÔT la question pour cet écran : rejouer un
        // réseau en panne à chaque battement de `busy` en ferait une boucle.
        if (ask.current?.key === key) ask.current = { key, status: 'settled' }
      })
  }, [screen, surface, busy, retry, accountId, calm])

  const react = useCallback(
    (reaction: InterventionReaction) => {
      if (!plan?.speaks) return
      const { traceId, intervention } = plan
      setPlan(null)
      void apiFetch({ path: `/laura/interventions/${traceId}/reaction`, method: 'POST', body: { reaction } }).catch(
        () => {
          // Le geste de l'utilisateur a déjà eu lieu à l'écran. Ne pas avoir pu
          // l'enregistrer retarde un retrait, ça ne casse rien.
        },
      )
      // #1946.10 — tranché sans toi (decisions-louis-22-09-soir.md §12, aucune
      // recommandation écrite dans la ligne de registre) : la NATURE nommée est
      // `intervention.key`, la clé de catalogue déjà lue par `LauraCard.tsx`
      // (`t('interventions.${intervention.key}')`) — jamais son destinataire,
      // jamais sa phrase rendue. L'ENDROIT où l'issue se conclut est ICI, le
      // SEUL endroit qui parle à `/laura/*` (Tome 7 §48) : les trois gestes que
      // l'écran offre RÉELLEMENT (`act`/`refuse`/`dismiss`, voir `LauraCard.tsx`)
      // sont les trois seules valeurs jamais passées à `react` — `ignored` (un
      // silence, sans geste) n'atteint jamais cette fonction, donc ne s'émet
      // jamais d'ici.
      if (reaction === 'acted') trackInterventionOutcome(intervention.key, 'suivie')
      else if (reaction === 'refused') trackInterventionOutcome(intervention.key, 'rejetee')
      else if (reaction === 'closed_unread') trackInterventionOutcome(intervention.key, 'ignoree')
      // #2409.8 — quand la carte nomme UNE mission, le geste ouvre cette mission
      // (son panneau « Prête à démarrer ? »), pas le tableau entier.
      const target = plan.missionStart ? `/missions/${plan.missionStart.missionId}` : intervention.route
      if (reaction === 'acted' && target) window.location.assign(target)
    },
    [plan],
  )

  return {
    intervention: plan?.speaks ? plan.intervention : null,
    benchCost: plan?.speaks ? (plan.benchCost ?? null) : null,
    accountSuggestion: plan?.speaks ? (plan.accountSuggestion ?? null) : null,
    missionStart: plan?.speaks ? (plan.missionStart ?? null) : null,
    overdueFollowUp: plan?.speaks ? (plan.overdueFollowUp ?? null) : null,
    act: () => react('acted'),
    refuse: () => react('refused'),
    dismiss: () => react('closed_unread'),
  }
}

/**
 * L'état du catalogue — « je ne sais pas encore » n'est PAS « rien ».
 *
 * Trois états et non un tableau qui commencerait vide : un « 0 intervention »
 * de chargement se lit comme un vrai zéro, et un catalogue qu'on n'a pas pu
 * lire ressemble alors à une assistante qui ne sait rien faire. C'est le défaut
 * « un zéro de chargement ment », et il coûte une question de support à chaque
 * fois.
 */
type LauraCatalogueState =
  | { status: 'loading' }
  | { status: 'ready'; interventions: InterventionDefinition[] }
  | { status: 'failed' }

/**
 * Ce que Laura sait dire.
 *
 * Il vit ICI et pas dans l'écran qui l'affiche : `laura-single-door.test.ts`
 * (GA-39) interdit à tout autre fichier d'appeler `/laura/*`, et la raison vaut
 * autant pour une lecture que pour une interruption — le jour où un deuxième
 * écran veut le catalogue, il passe par ce hook plutôt que de refaire l'appel.
 *
 * ⚠️ Le catalogue est lu au SERVEUR et non depuis la constante partagée. Les
 * deux existent — `LAURA_INTERVENTIONS` voyage dans `@bellum/contracts` — mais
 * s'appuyer sur la copie du navigateur ferait deux vérités le jour où le
 * serveur filtrera (par offre, par espace, par droit). La route existe pour
 * cela ; c'est elle qui décide.
 */
export function useLauraCatalogue(): LauraCatalogueState {
  const [state, setState] = useState<LauraCatalogueState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    void apiFetch<{ interventions: InterventionDefinition[] }>({ path: '/laura/catalogue' })
      .then(result => {
        if (!cancelled) setState({ status: 'ready', interventions: result.interventions })
      })
      .catch(() => {
        // Un catalogue illisible se DIT. Le rendre vide ferait passer une panne
        // de lecture pour une assistante qui n'a rien à proposer.
        if (!cancelled) setState({ status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
