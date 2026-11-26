import type { ActionHistoryItem, SinceLastVisitLine } from '@bellum/contracts'
import { Badge, Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useActionHistory, useLastSeen } from '@/features/action-history/hooks/useActionHistory'
import { actionLabel, formatActionDate } from '@/features/action-history/view/actionHistoryPresentation'
import { useSinceLastVisit } from '../api'
import { SINCE_LAST_VISIT_MAX_ROWS, sinceLastVisitState } from './sinceLastVisit'
import { sinceLastVisitLineHref, sinceLastVisitLineText } from './sinceLastVisitLines'

/**
 * « Ce qui a bougé depuis ma dernière visite ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE BLOC
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est le levier de rétention le plus simple du produit : il donne une raison
 * d'ouvrir l'outil le matin. Le repère de dernière visite existait depuis des
 * mois (`POST /actions/mark-seen`) et n'avait qu'UN consommateur — un onglet du
 * Journal, où il faut déjà être allé pour le trouver. L'écran d'accueil, lui,
 * ne disait rien de ce qui s'était passé pendant la nuit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT, ET QU'UNE VÉRIFICATION N'AVAIT PAS VU
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bloc rendait le journal `user_actions` BRUT — « Analyse terminée · ACME »,
 * « Export généré · DELTA » — c'est-à-dire ce que L'UTILISATEUR a fait, pas ce
 * qui a BOUGÉ pendant son absence. Le 27/08/2026 l'item a été marqué « branché
 * et vu à l'écran » : c'était vrai du CONTENANT, et ça a masqué que son contenu
 * n'avait jamais existé. Les QUATRE LIGNES TYPÉES sont ce contenu — signaux,
 * réponses reçues, changements de poste, missions à échéance — servies par
 * `GET /briefing/since-last-visit` sur la même fenêtre.
 *
 * Le journal reste, EN DESSOUS : il répond à l'autre question (« qu'ai-je
 * fait ? »), et le retirer aurait perdu ce que les quatre lignes ne couvrent
 * pas — une analyse terminée, un export généré.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE REPÈRE S'ÉCRIT SANS EFFACER CE QU'ON MONTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `mark-seen` LIT et ÉCRIT dans le même appel — il n'existe pas de lecture seule
 * du repère. Ce qui rend la chose tenable est la règle du serveur
 * (`LastSeenService`) : le repère `previous_seen_at` n'avance QUE lorsque plus
 * de 30 minutes séparent deux présences. Un rechargement, une navigation ou un
 * refresh de jeton rafraîchissent la présence sans bouger la fenêtre — ce qu'on
 * vient d'afficher est donc toujours là au rechargement suivant, ce qui est
 * exactement la propriété qu'on voulait. `useLastSeen` ajoute la seconde moitié
 * côté client : `staleTime: Infinity`, donc UN appel par session et une fenêtre
 * qui ne bouge pas sous les yeux de celui qui la lit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE BLOC NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * ─────────────────────────────────────────────────────────────────────────────
 * #1393 — CE QUI A BOUGÉ SANS MOI, ET CE QUE MOI J'AI FAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux étaient empilés à la même hauteur, et le retour a nommé exactement
 * la gêne : « Export », « Message copié », « Action enregistrée » « correspondent
 * surtout à ce que MOI j'ai fait ». Ce ne sont pas des CHANGEMENTS — ce sont mes
 * propres gestes, qui répondent à une autre question, et qui poussaient les
 * quatre lignes typées vers le bas de l'écran les jours chargés.
 *
 * Le journal ne disparaît pas : il se REPLIE, sous son propre titre. Replié
 * plutôt que retiré parce qu'il porte ce que les quatre lignes ne couvrent pas
 * (une analyse terminée, un export généré), et parce que le retirer aurait
 * refait le défaut d'origine dans l'autre sens.
 *
 * ⚠️ Le compte est celui du serveur, replié comme déplié : un « et N autres »
 * qui changerait selon l'état d'un dépli serait un chiffre fabriqué ici.
 *
 * Il ne recompose RIEN et il n'écrit AUCUN zéro. Les quatre lignes sont celles
 * que le serveur rend ; celle qui n'a rien à dire ne s'affiche pas, celle qui
 * n'a pas pu être mesurée le DIT. Aucun compteur n'est dérivé côté client : le
 * « et N autres » se lit sur le total du serveur, pas sur la longueur de ce qui
 * est arrivé. Un chiffre fabriqué ici serait invérifiable, et le Journal — un
 * clic plus loin — le contredirait.
 */
export function SinceLastVisitBlock({
  now,
  openTasksCount,
}: {
  /** L'horloge du cockpit (`useNow()`, levée UNE fois dans `BriefingPage` —
   *  même convention que `AgendaCompact`) : c'est elle qui date l'absence. */
  now: Date
  /** #2106.32 — les tâches encore ouvertes, déjà lues par `BriefingPage`
   *  (`data.tasks`). `null` = non mesuré, jamais un zéro fabriqué. */
  openTasksCount: number | null
}) {
  const { t } = useTranslation('briefing')
  // Deux événements SYSTÈME du journal portent un libellé localisé côté web ;
  // tous les autres portent celui du serveur. `actionLabel` connaît la règle.
  const { t: tActions } = useTranslation('actions')

  const lastSeen = useLastSeen()
  const since = lastSeen.data?.since ?? null
  // Sans repère, il n'y a pas de fenêtre : la requête n'est pas seulement
  // inutile, elle rendrait TOUT l'historique de l'espace — ce qui n'est pas
  // « ce qui a bougé », mais « tout ce qui s'est jamais passé ».
  const history = useActionHistory(
    { since: since ?? undefined, limit: SINCE_LAST_VISIT_MAX_ROWS },
    { enabled: since !== null },
  )
  const digest = useSinceLastVisit(since)

  const state = sinceLastVisitState({ lastSeen, digest, history, now, openTasksCount })

  if (state.kind === 'loading') {
    return (
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('sinceLastVisit.loading')}
      </Text>
    )
  }

  // Première visite : il n'existe pas de « depuis ». Écrire « 0 changement » se
  // lirait « il ne se passe rien ici » — le pire message possible sur l'écran
  // qu'on ouvre pour la première fois.
  if (state.kind === 'first_visit') {
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('sinceLastVisit.firstVisit')}
      </Text>
    )
  }

  // « Je n'ai pas pu regarder » n'est pas « il ne s'est rien passé ». Le badge
  // reprend celui des autres blocs du brief : un état d'indisponibilité s'y lit
  // déjà de la même façon.
  if (state.kind === 'unreadable') {
    return (
      <Box className="flex flex-col gap-2">
        <Badge variant="outline" className="w-fit text-xs">
          {t('state.unavailable')}
        </Badge>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('sinceLastVisit.unreadable')}
        </Text>
      </Box>
    )
  }

  if (state.kind === 'up_to_date') {
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('sinceLastVisit.upToDate', { date: formatActionDate(state.since) })}
      </Text>
    )
  }

  return (
    <Box className="flex min-w-0 flex-col gap-2">
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('sinceLastVisit.window', { date: formatActionDate(state.since) })}
      </Text>

      {/* #2106.29/.32/.33 — le résumé condensé de longue absence (>= sept
          jours). Il ne REMPLACE rien : les quatre lignes ci-dessous restent
          affichées en entier, il se contente de NOMMER laquelle regarder en
          premier — jamais une troisième copie, jamais une liste d'items. */}
      {state.longAbsence ? <SinceLastVisitLongAbsence longAbsence={state.longAbsence} t={t} /> : null}

      {/* LES QUATRE LIGNES TYPÉES — ce qui a bougé SANS moi, donc en tête. Une
          ligne mesurée à zéro n'est pas là ; une ligne non mesurée est là et le
          dit, parce que c'est le moment précis où le silence mentirait. */}
      {state.lines.map(line => (
        <SinceLastVisitLineRow key={line.kind} line={line} t={t} />
      ))}

      {/* La lecture des quatre lignes est tombée alors que le journal, lui, a
          répondu. On le DIT plutôt que de laisser croire que rien n'a bougé. */}
      {state.failed.includes('digest') ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('sinceLastVisit.digestUnreadable')}
        </Text>
      ) : null}

      {/* MON ACTIVITÉ RÉCENTE — l'autre question : « qu'ai-je fait ? », repliée
          par défaut (#1393). */}
      {state.failed.includes('journal') ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('sinceLastVisit.journalUnreadable')}
        </Text>
      ) : (
        <MyRecentActivity items={state.items} hidden={state.hidden} />
      )}
    </Box>
  )
}

/**
 * #2106.29/.32/.33 — le résumé condensé de longue absence.
 *
 * Deux phrases au plus, jamais une liste : le nom de la ligne la plus
 * mesurée (jamais un score, le plus haut des comptes RÉELS déjà rendus par
 * les quatre lignes), et le compte de tâches encore ouvertes s'il y en a. Un
 * silence sur l'un des deux n'affiche RIEN pour lui — jamais un zéro
 * fabriqué, jamais un « rien à signaler » qui occuperait une ligne pour ne
 * rien dire (doctrine « on n'affiche pas ce qu'on n'a pas »).
 */
function SinceLastVisitLongAbsence({
  longAbsence,
  t,
}: {
  longAbsence: {
    topLine: SinceLastVisitLine | null
    openTasksCount: number | null
    expiredItemsCount: number | null
    treatedByColleagueCount: number | null
  }
  t: (key: string, vars?: Record<string, unknown>) => string
}) {
  const topLineText = longAbsence.topLine ? sinceLastVisitLineText(t, longAbsence.topLine) : null
  // Une ligne mesurée à zéro n'est déjà plus dans `state.lines` (elle se tait) :
  // `topLine` ne peut donc porter que du réel, jamais un zéro décoratif.
  const showTasks = longAbsence.openTasksCount !== null && longAbsence.openTasksCount > 0
  // #2106.30/.31 — mêmes règles : un zéro réel se tait, seul un compte
  // strictement positif apprend quelque chose à quelqu'un debout devant l'écran.
  const showExpired = longAbsence.expiredItemsCount !== null && longAbsence.expiredItemsCount > 0
  const showTreatedByColleague = longAbsence.treatedByColleagueCount !== null && longAbsence.treatedByColleagueCount > 0

  if (!topLineText && !showTasks && !showExpired && !showTreatedByColleague) return null

  return (
    <Box className="flex min-w-0 flex-col gap-1 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2">
      <Text size="xs" className="font-medium text-[var(--bellum-text-secondary)]">
        {t('sinceLastVisit.longAbsence.heading')}
      </Text>
      {topLineText ? <Text size="sm">{t('sinceLastVisit.longAbsence.topLine', { text: topLineText })}</Text> : null}
      {showTasks ? (
        <Text size="sm">{t('sinceLastVisit.longAbsence.openTasks', { count: longAbsence.openTasksCount })}</Text>
      ) : null}
      {showExpired ? (
        <Text size="sm">{t('sinceLastVisit.longAbsence.expiredItems', { count: longAbsence.expiredItemsCount })}</Text>
      ) : null}
      {showTreatedByColleague ? (
        <Text size="sm">
          {t('sinceLastVisit.longAbsence.treatedByColleague', { count: longAbsence.treatedByColleagueCount })}
        </Text>
      ) : null}
    </Box>
  )
}

const SINCE_LAST_VISIT_ROW_CLASS =
  'flex min-w-0 flex-col gap-0.5 rounded-lg border border-[var(--bellum-border)] px-3 py-2'

/**
 * #2106.22/.23/.24/.25 — UNE ligne, cliquable quand une page RÉELLEMENT
 * filtrée existe pour la recevoir (`sinceLastVisitLineHref`), un simple
 * constat sinon. Même règle que `GestureRow` (`DailyGesturesBlock.tsx`) :
 * une ligne sans destination est un CONSTAT, pas un lien mort.
 */
function SinceLastVisitLineRow({
  line,
  t,
}: {
  line: SinceLastVisitLine
  t: (key: string, vars?: Record<string, unknown>) => string
}) {
  const text = sinceLastVisitLineText(t, line)
  if (text === null) return null

  const body = (
    <>
      <Text size="sm">{text}</Text>
      {line.state !== 'ready' ? (
        <Badge variant="outline" className="w-fit text-xs">
          {t(line.state === 'partial' ? 'state.partial' : 'state.unavailable')}
        </Badge>
      ) : null}
    </>
  )

  const href = sinceLastVisitLineHref(line.kind)
  if (!href) return <Box className={SINCE_LAST_VISIT_ROW_CLASS}>{body}</Box>
  return (
    <Link to={href} className={`${SINCE_LAST_VISIT_ROW_CLASS} hover:bg-[var(--bellum-surface-2)]`}>
      {body}
    </Link>
  )
}

/**
 * Ce que J'AI fait pendant la fenêtre — replié, et sous son propre nom.
 *
 * ⚠️ Un `<button type="button">`, pas un `<div onClick>` : ce qui se clique se
 * tabule, s'active à Entrée et s'annonce (GA-35). `aria-expanded` porte l'état
 * pour un lecteur d'écran — sans lui, le chevron ne dit rien.
 *
 * Il n'apparaît pas quand le journal est vide : un titre repliable sur zéro
 * ligne est une porte qui ouvre sur rien.
 */
function MyRecentActivity({ items, hidden }: { items: ActionHistoryItem[]; hidden: number }) {
  const { t } = useTranslation('briefing')
  const { t: tActions } = useTranslation('actions')
  const [open, setOpen] = useState(false)
  if (!items.length && hidden === 0) return null

  return (
    <Box className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-fit items-center gap-1.5 rounded-md py-1 text-xs text-[var(--bellum-text-secondary)] underline underline-offset-2 pointer-coarse:min-h-11"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        {t('sinceLastVisit.myActivity')}
      </button>

      {open ? (
        <>
          {items.map(item => (
            <Box
              key={item.id}
              className="flex min-w-0 flex-col rounded-lg border border-[var(--bellum-border)] px-3 py-2"
            >
              <Text size="sm" className="truncate">
                {actionLabel(tActions, item)}
              </Text>
              {/* Chez QUI et par QUI. Sur un espace à plusieurs, « analyse
                  terminée » sans son auteur ne dit pas si c'est la mienne. Une
                  cible ou un auteur vide est SAUTÉ, jamais remplacé par un
                  tiret : un tiret se lit comme une valeur. */}
              <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
                {[item.target.label, item.actor.name].filter(Boolean).join(' · ')}
              </Text>
            </Box>
          ))}

          {/* Ce qui déborde n'est pas caché : il est compté, et le lien mène à
              l'endroit où il se lit en entier — le Journal, sur SA fenêtre. */}
          <Link
            to="/actions"
            search={{ category: 'since' as const }}
            className="text-xs text-[var(--bellum-text-secondary)] underline underline-offset-2"
          >
            {hidden > 0 ? t('sinceLastVisit.more', { count: hidden }) : t('sinceLastVisit.openJournal')}
          </Link>
        </>
      ) : null}
    </Box>
  )
}
