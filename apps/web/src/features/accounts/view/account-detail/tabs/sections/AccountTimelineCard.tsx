import type { AccountTimeline, TimelineEvent } from '@bellum/contracts'
import { Button, Card, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { GitCommitVertical, History, Send, Workflow } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '@/lib/api'
import { cardFade } from '../../motion'
import { collapseTimelineEvents } from './collapseTimelineEvents'

/**
 * « Qu'est-ce qu'on a déjà fait sur ce compte, et quand. »
 *
 * ⚠️ `GET /accounts/:id/timeline` est livrée depuis l'addendum p59-60 : elle
 * FUSIONNE trois tables déjà écrites ailleurs — actions journalisées,
 * mouvements d'opportunité, exécutions de workflow — et n'en crée aucune. Elle
 * n'avait **aucun appelant** côté web : la vue qu'on ouvre avant un rendez-vous
 * était calculée et jamais servie.
 *
 * Trois règles :
 *
 * - un échec de lecture le DIT. Le rendre comme « aucun historique » est la
 *   faute trouvée en production le 17/08 sur les notes, et elle est pire ici :
 *   un commercial en conclurait que personne n'a jamais touché ce compte ;
 * - un compte réellement sans historique le dit aussi, et distinctement ;
 * - la date affichée est celle de l'ÉVÉNEMENT, jamais celle de la lecture.
 */
/** Les lignes montrées d'emblée ; le reste se NOMME et s'ouvre (#3405 / #3546.5). */
const TIMELINE_VISIBLE = 12

/** #3405 (Y14 02/10) — un sous-titre qui répète le titre (« Analyse lancée » sous « Analyse lancée »,
 *  ou le code brut du journal) n'apprend rien : il fait deux lignes identiques d'une seule. */
function repeatsLabel(detail: string, shown: readonly string[]): boolean {
  const norm = (text: string) =>
    text
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ')
  return shown.some(text => norm(text) === norm(detail))
}

export function AccountTimelineCard({ accountId }: { accountId: string }) {
  const { t, i18n } = useTranslation('accountDetail')
  const [showAll, setShowAll] = useState(false)

  // #3532 — une exécution porte sa clé technique (`card_prepare_message`) : on la
  // traduit par le même dictionnaire que le centre d'actions, et une clé encore
  // inconnue est MISE EN FORME, jamais affichée brute.
  const eventLabel = (event: TimelineEvent): string =>
    event.kind === 'workflow'
      ? t(`actions:center.workflow.${event.label}`, { defaultValue: humanizeKey(event.label) })
      : event.kind === 'action' && event.label === event.type
        ? // #3405 / #3532 — le serveur retombe sur le code du journal quand l'action ne porte pas de
          // libellé : on le traduit, et un code encore inconnu est MIS EN FORME, jamais affiché brut.
          t(`timeline.actionTypes.${event.type}`, { defaultValue: humanizeKey(event.type) })
        : // #3416.4b — en anglais, le libellé anglais du journal ; repli français s'il est absent.
          i18n.language.startsWith('en') && event.labelEn
          ? event.labelEn
          : event.label

  const timeline = useQuery({
    queryKey: ['account-timeline', accountId],
    queryFn: () => apiFetch<AccountTimeline>({ path: `/accounts/${accountId}/timeline` }),
    select: response => response.events,
    staleTime: 30_000,
  })

  return (
    <motion.div variants={cardFade} className="p-1 mt-4">
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <div className="border-b border-[var(--bellum-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <History className="size-4 text-[var(--bellum-text-accent)]" />
            <Text element="h3" size="base" weight="semibold">
              {t('timeline.title')}
            </Text>
          </div>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('timeline.subtitle')}
          </Text>
        </div>

        <div className="px-5 py-4">
          {timeline.isLoading ? (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('common:states.loading')}
            </Text>
          ) : null}

          {timeline.isError ? (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('timeline.loadError')}
            </Text>
          ) : null}

          {timeline.data && timeline.data.length === 0 ? (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('timeline.empty')}
            </Text>
          ) : null}

          {timeline.data && timeline.data.length > 0 ? (
            <ol className="flex flex-col gap-3">
              {collapseTimelineEvents(timeline.data)
                .slice(0, showAll ? undefined : TIMELINE_VISIBLE)
                .map(({ event, count }) => (
                  <li key={event.id} className="flex gap-2">
                    <span className="mt-0.5 shrink-0">
                      <EventIcon kind={event.kind} />
                    </span>
                    <div className="min-w-0">
                      {/* ⚠️ Le libellé d'une opportunité est du TEXTE LIBRE écrit
                        par le pipeline : trouvé en recette le 25/08, un
                        paragraphe entier occupait la carte à lui seul et rendait
                        le fil illisible. On borne l'AFFICHAGE, jamais la donnée —
                        le texte complet reste dans l'infobulle. */}
                      <Text element="p" size="sm" className="line-clamp-2" title={eventLabel(event)}>
                        {eventLabel(event)}
                      </Text>
                      {event.kind === 'workflow' && event.steps && event.steps.total > 0 ? (
                        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                          {t('timeline.stepsDone', { count: event.steps.done, total: event.steps.total })}
                        </Text>
                      ) : null}
                      {event.detail &&
                      !repeatsLabel(event.detail, [eventLabel(event), event.type, event.label, event.labelEn ?? '']) ? (
                        <Text
                          element="p"
                          size="xs"
                          className="line-clamp-2 text-[var(--bellum-text-secondary)]"
                          title={event.detail}
                        >
                          {event.detail}
                        </Text>
                      ) : null}
                      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                        {new Date(event.at).toLocaleDateString(i18n.language)}
                        {count > 1 ? ` · ${t('timeline.repeat', { count })}` : ''}
                      </Text>
                    </div>
                  </li>
                ))}
            </ol>
          ) : null}

          {/* #3405 / #3546.5 — recette prod 02/10 : les ouvertures de fiche du 01/10
              « n'apparaissaient plus » parce que le fil s'arrêtait à 12 lignes SANS
              le dire. Une coupe se nomme, et s'ouvre au clic. */}
          {timeline.data && !showAll && hiddenCount(timeline.data) > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 pointer-coarse:min-h-11"
              onClick={() => setShowAll(true)}
            >
              {t('timeline.showOlder', { count: hiddenCount(timeline.data) })}
            </Button>
          ) : null}
        </div>
      </Card>
    </motion.div>
  )
}

function hiddenCount(events: readonly TimelineEvent[]): number {
  return Math.max(0, collapseTimelineEvents(events).length - TIMELINE_VISIBLE)
}

function EventIcon({ kind }: { kind: TimelineEvent['kind'] }) {
  if (kind === 'action') return <Send className="size-3.5 text-[var(--bellum-text-accent)]" />
  if (kind === 'workflow') return <Workflow className="size-3.5 text-[var(--bellum-text-accent)]" />
  return <GitCommitVertical className="size-3.5 text-[var(--bellum-text-secondary)]" />
}

function humanizeKey(key: string): string {
  const words = key.split(/[_-]+/).filter(Boolean)
  if (words.length === 0) return key
  return words.map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(' ')
}
