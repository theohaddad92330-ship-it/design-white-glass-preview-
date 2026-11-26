import type { PilotageLevelReport, ReviewSignals } from '@bellum/contracts'
import { Box, Card, CardContent, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePistesToReview } from '@/features/crm-counters/usePistesToReview'
import { apiFetch } from '@/lib/api'
import { revealTarget } from '@/lib/reveal-target'
import { isReachable, knownDestinations } from '../quality/lib/destinations'
import { alertingLevels, chainLevelAnchor } from './chain-alerts'

/**
 * CE QUI ATTEND UNE DÉCISION — #1322.1.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE REPROCHE
 * ─────────────────────────────────────────────────────────────────────────
 * *« je ne comprends pas pourquoi je dois venir ici plutôt que dans Comptes,
 * Actions, Missions ou Finance »* — et l'entête de l'écran promettait déjà
 * l'inverse : « Bellum te montre uniquement les endroits où une décision est
 * nécessaire ». La promesse était écrite, la page ne la tenait pas : elle
 * ouvrait sur huit cartes de mesure, puis six panneaux.
 *
 * Le retour donne la forme : *« 3–4 cartes maximum »*, *« chaque carte doit
 * être cliquable vers la vraie page de travail »*.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS CARTES, ET POURQUOI PAS QUATRE
 * ─────────────────────────────────────────────────────────────────────────
 * Le retour en propose quatre. La quatrième est *« 1 décision recommandée
 * aujourd'hui »* — elle supposerait un moteur de recommandation qui n'existe
 * pas. L'écrire reviendrait à présenter comme un conseil ce qui serait, au
 * mieux, la première ligne d'une liste triée. On n'invente pas une
 * recommandation ; les trois autres sont des FAITS, chacun déjà calculé
 * ailleurs et simplement rassemblé ici.
 *
 * ⚠️ **Une carte à zéro ne s'affiche pas**, et ce n'est pas de la coquetterie :
 * la bande répond à « qu'est-ce qui attend une décision ». « 0 alerte » n'est
 * pas une décision qui attend — c'est une bonne nouvelle, et sa place est la
 * mosaïque en dessous, qui la porte déjà. Une bande entièrement vide disparaît
 * plutôt que d'annoncer trois zéros.
 *
 * ⚠️ **Une valeur NON MESURÉE ne devient pas une carte non plus.** Un compte à
 * `null` dans la contribution veut dire « on n'a pas lu », pas « il n'y en a
 * pas » : en faire une carte à zéro serait le mensonge que ce dépôt refuse
 * partout ailleurs.
 */
export function DecisionStrip({
  levels,
  max = DECISION_STRIP_MAX_CARDS,
}: {
  levels: PilotageLevelReport[]
  max?: number
}) {
  // L'arbre de routes RÉEL de ce navigateur : le serveur peut être livré avant
  // le web, et un lien mort est pire qu'une absence de lien. Même précaution
  // que `ContributionPanel`, et le même module.
  const router = useRouter()
  const known = useMemo(() => knownDestinations(router.routesByPath as unknown as Record<string, unknown>), [router])
  const { t } = useTranslation('pilotage')
  const [expanded, setExpanded] = useState(false)
  const capped = capDecisionCards(useDecisionCards(levels), max)
  if (capped.length === 0) return null

  // Théo D pilotage.R4/A4 — « Trois décisions à prendre » : trois cartes d'abord, les autres derrière
  // « Voir toutes les décisions · N ». Rien n'est retiré, seulement replié.
  const visible = expanded ? capped : capped.slice(0, DECISION_STRIP_VISIBLE_CARDS)
  const hidden = capped.length - DECISION_STRIP_VISIBLE_CARDS

  return (
    <div className="mb-4">
      <Box as="section" aria-label={t('decisions.title')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(card => (
          <DecisionCardView key={card.key} card={card} known={known} />
        ))}
      </Box>
      {hidden > 0 ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(open => !open)}
          className="mt-2 inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] underline"
        >
          {expanded ? t('theo.decisions.fold') : t('theo.decisions.seeAll', { count: capped.length })}
        </button>
      ) : null}
    </div>
  )
}

/** Théo D pilotage.R4 — les cartes visibles d'emblée ; les autres sont derrière « Voir toutes les décisions ». */
const DECISION_STRIP_VISIBLE_CARDS = 3

/**
 * Toutes les décisions qui attendent, dans l'ordre où la bande les range — LA
 * source des cartes : la bande en montre cinq, le cockpit Théo en montre trois
 * et compte le reste (« Voir toutes les décisions · N »). Une seule dérivation
 * (GA-26), jamais un second décompte.
 */
export function useDecisionCards(levels: PilotageLevelReport[]): DecisionCard[] {
  const { t } = useTranslation('pilotage')
  // #3262.24-28 (épopée #3262, lot R11 29/09) — les signaux de revue, la
  // même requête pour les quatre cartes qui suivent (jamais quatre appels).
  const { data: reviewSignals } = useQuery({
    queryKey: ['pilotage', 'review-signals'],
    queryFn: () => apiFetch<ReviewSignals>({ path: '/pilotage/review-signals' }),
  })

  const alerting = alertingLevels(levels)
  // #4197 (L6) — « besoins détectés » lit `pistes_to_review` de `GET /crm-counters`
  // (#4193) : le MÊME compteur que les Pistes, donc la carte et l'écran qu'elle
  // ouvre ne se contredisent plus. Avant, le nombre venait de la ligne
  // `needs_from_signal` du panneau de contribution — une autre définition.
  // `measured: false` (valeur `null`) n'est pas « 0 » : aucune carte (#1322.5).
  // `?.counters?.` : une réponse partielle ne doit pas faire tomber l'écran entier.
  const pistesToReview = usePistesToReview()

  const cards: DecisionCard[] = []

  if (alerting.length > 0) {
    cards.push({
      key: 'alerts',
      label: t('decisions.alerts', { count: alerting.length }),
      hint: t('decisions.alertsHint'),
      tone: 'alert',
      anchors: alerting.map(level => chainLevelAnchor(level.level)),
    })
  }

  if (pistesToReview !== null && pistesToReview > 0) {
    cards.push({
      key: 'needs',
      label: t('decisions.needs', { count: pistesToReview }),
      hint: t('decisions.needsHint'),
      tone: 'neutral',
      to: '/projects?pistes=1', // #4545 — le panneau des pistes du Pipe (Signaux ne les porte plus)
    })
  }

  // Ce que la mosaïque ne peut PAS mesurer. Ce n'est pas une alerte — c'est un
  // trou de branchement, et il appelle un autre geste : brancher, pas corriger.
  const unmeasured = levels.filter(level => level.status === 'non_mesure').length
  if (unmeasured > 0) {
    cards.push({
      key: 'unmeasured',
      label: t('decisions.unmeasured', { count: unmeasured }),
      hint: t('decisions.unmeasuredHint'),
      tone: 'muted',
      to: '/integrations',
    })
  }

  // #3262.24-28 (épopée #3262/#3284) — cinq faits déjà calculés ailleurs
  // (`PilotageService.reviewSignals`), jamais un score de plus. Une valeur
  // `null` (lecture en échec) ne devient jamais une carte à zéro
  // (GA-18/GA-19) : seul un compte MESURÉ et positif pousse une carte.
  const reviewSignalCards: Array<{ key: string; count: number | null | undefined; labelKey: string; to: string }> = [
    { key: 'stale_focus', count: reviewSignals?.staleFocusCount, labelKey: 'staleFocus', to: '/accounts?lens=effort' },
    // #3407.5 — une veille à réveiller : un signal est arrivé depuis l'entrée
    // en veille. Une PROPOSITION (le geste reste au board d'effort), jamais
    // une bascule automatique.
    {
      key: 'watch_to_wake',
      count: reviewSignals?.watchToWakeCount,
      labelKey: 'watchToWake',
      to: '/accounts?lens=effort',
    },
    {
      key: 'no_go_to_revisit',
      count: reviewSignals?.noGoToRevisitCount,
      labelKey: 'noGoToRevisit',
      to: '/accounts?gate=parked',
    },
    {
      key: 'accounts_without_movement',
      count: reviewSignals?.accountsWithoutMovementCount,
      labelKey: 'accountsWithoutMovement',
      to: '/accounts?lens=effort',
    },
    {
      key: 'accounts_without_owner',
      count: reviewSignals?.accountsWithoutOwnerCount,
      labelKey: 'accountsWithoutOwner',
      to: '/accounts',
    },
    {
      key: 'accounts_without_date',
      count: reviewSignals?.accountsWithoutDateCount,
      labelKey: 'accountsWithoutDate',
      to: '/accounts',
    },
    // #3277.5 (épopée #3277, lot E22 30/09) — Pilotage lit la MÊME readiness
    // AccountStrategy5P que la fiche Compte et Laura (#3277.1), agrégée par
    // `PilotageService.reviewSignals`, jamais un second calcul. Pas de filtre
    // `readiness` sur `/accounts` (`AccountListQuery` ne le porte pas) — même
    // destination nue que `accountsWithoutOwner`/`accountsWithoutDate`
    // ci-dessus, pas un paramètre de requête deviné.
    {
      key: 'strategy_no_go',
      count: reviewSignals?.strategyNoGoCount,
      labelKey: 'strategyNoGo',
      to: '/accounts',
    },
    {
      key: 'strategy_blocked',
      count: reviewSignals?.strategyBlockedCount,
      labelKey: 'strategyBlocked',
      to: '/accounts',
    },
  ]
  for (const { key, count, labelKey, to } of reviewSignalCards) {
    if (count === null || count === undefined || count <= 0) continue
    cards.push({
      key,
      label: t(`decisions.${labelKey}`, { count }),
      hint: t(`decisions.${labelKey}Hint`),
      tone: 'neutral',
      to,
    })
  }

  return cards
}

/**
 * #2206.6 — « cinq décisions maximum affichées ». Trois sources existent
 * aujourd'hui (`alerts`, `needs`, `unmeasured`) ; la borne protège l'écran le
 * jour où une quatrième ou cinquième s'ajoute, sans qu'une carte de plus
 * n'entraîne une sixième — jamais un moteur de recommandation qui trierait
 * laquelle garder (doctrine : aucune probabilité, rien d'inventé).
 */
export const DECISION_STRIP_MAX_CARDS = 5

export function capDecisionCards(cards: readonly DecisionCard[], max = DECISION_STRIP_MAX_CARDS): DecisionCard[] {
  return cards.slice(0, max)
}

export type DecisionCard = {
  key: string
  label: string
  hint: string
  tone: 'alert' | 'neutral' | 'muted'
  /** Une page de travail. */
  to?: string
  /** Ou des maillons de CETTE page, montrés l'un après l'autre. */
  anchors?: string[]
}

/**
 * ⚠️ Les noms de tokens sont ceux de `styles/tokens.css` — `--danger-soft-*`,
 * SANS le préfixe `--bellum-`. Un token qui n'existe pas ne rougit nulle part :
 * la classe est écrite, la couleur ne s'applique pas, et la carte d'alerte
 * ressemble à une carte neutre. C'est un défaut déjà payé dans ce dépôt.
 *
 * Et le fond d'alerte est une couleur SÉMANTIQUE : son texte passe par
 * `*-soft-text`, jamais par la nuance elle-même — `--bellum-warning` fait
 * 9,47:1 en sombre et 1,84:1 en clair.
 */
const TONE_CLASS: Record<DecisionCard['tone'], string> = {
  alert: 'border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)]',
  neutral: 'border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]',
  muted: 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]',
}

/**
 * Une carte de décision — et sa porte.
 *
 * Deux destinations possibles, et elles n'appellent pas le même élément :
 * une PAGE se rejoint par un `<Link>` (ça s'ouvre dans un onglet, ça se copie,
 * ça s'annonce), un maillon de CET écran par un `<button>` qui le fait défiler
 * jusqu'à lui. Rendre le second en `<a href="#…">` casserait le retour arrière.
 *
 * ⚠️ Le pluriel des ancres est tenu, comme pour la pastille d'alertes : le clic
 * suivant mène au maillon SUIVANT, puis boucle. Mener toujours au même rendrait
 * la carte inutile dès le deuxième clic alors qu'elle en annonce trois.
 */
export function DecisionCardView({
  card,
  known,
  variant = 'compact',
}: {
  card: DecisionCard
  known: ReadonlySet<string>
  /** `theo` : la carte du Cockpit — titre, phrase, et le verbe d'action en lien d'accent. */
  variant?: 'compact' | 'theo'
}) {
  const { t } = useTranslation('pilotage')
  const cursor = useRef(0)
  const theo = variant === 'theo'
  const body = (
    <>
      <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {card.label}
      </Text>
      <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
        {card.hint}
      </Text>
      {theo ? (
        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--bellum-text-accent)]">
          {t('decisions.open')}
          <ArrowRight aria-hidden className="size-4" />
        </span>
      ) : null}
    </>
  )
  const padding = theo ? 'p-5' : 'p-4'

  if (card.anchors) {
    const goToNext = () => {
      for (let step = 0; step < card.anchors!.length; step += 1) {
        const index = (cursor.current + step) % card.anchors!.length
        const anchor = card.anchors![index]
        if (anchor && revealTarget(anchor)) {
          cursor.current = (index + 1) % card.anchors!.length
          return
        }
      }
    }
    return (
      <Card className={TONE_CLASS[card.tone]}>
        <CardContent className="p-0">
          <button type="button" onClick={goToNext} className={`w-full ${padding} text-left`}>
            {body}
          </button>
        </CardContent>
      </Card>
    )
  }

  // Une destination que CE navigateur ne connaît pas ne devient pas un lien
  // mort : la carte reste, sans porte. L'information ne disparaît jamais.
  if (!card.to || !isReachable(card.to, known)) {
    return (
      <Card className={TONE_CLASS[card.tone]}>
        <CardContent className={padding}>
          {theo ? (
            <>
              <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                {card.label}
              </Text>
              <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                {card.hint}
              </Text>
            </>
          ) : (
            body
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={TONE_CLASS[card.tone]}>
      <CardContent className="p-0">
        <Link to={card.to} className={`block ${padding}`}>
          {body}
        </Link>
      </CardContent>
    </Card>
  )
}
