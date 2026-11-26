import {
  BRIEFING_DISMISS_REASONS,
  BRIEFING_POSTPONE_OPTIONS,
  briefingPostponeUntil,
  type BriefingAction,
  type BriefingCardDispositionRequest,
  type BriefingPostponeOption,
} from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import {
  trackPriorityAccepted,
  trackPriorityCorrected,
  trackPriorityRejected,
  trackPrioritySnoozed,
} from '@/lib/product-tracker'
import { useSetCardDisposition } from '../api'

/** #2108.49 — même convention que `PriorityCard.tsx` (`BRIEFING_SCREEN`). */
const BRIEFING_SCREEN = '/briefing/'

type Panel = 'none' | 'postpone' | 'dismiss'

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'
}

/**
 * #2099.17-.32 (épopée #2767) — LES GESTES SECONDAIRES D'UNE CARTE : Reporter,
 * Pas pertinent, Déjà traité. Chacun est PERSONNEL (le brief de la personne,
 * jamais l'objet source ni ce que voit un collègue — #2099.32) et fait
 * disparaître la carte au succès : le serveur la retire à la source
 * (`excludeDisposedBriefingActions`), l'écran ne la cache pas lui-même.
 *
 * La date du FAIT de la carte voyage avec le geste : un fait nouveau sur le
 * même objet est une raison de revenir (#2099.54), un refus sur le même fait
 * est respecté (#2099.52).
 */
export function CardDispositionControls({ action }: { action: BriefingAction }) {
  const { t } = useTranslation('briefing')
  const [panel, setPanel] = useState<Panel>('none')
  const [customOpen, setCustomOpen] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const dateInputId = useId()
  const mutation = useSetCardDisposition()
  const factObservedAt = action.fact?.provenance.observedAt ?? null

  // #2108.50-.53 — un seul point d'émission pour les trois gestes du menu
  // (GA-26) plutôt qu'un appel à chacun des cinq boutons qui y mènent : le
  // GESTE ENVOYÉ au serveur fait foi, jamais lequel des boutons a été cliqué.
  // `wrong_data` (« Donnée fausse ») est une CORRECTION, jamais compté aussi
  // comme un refus ordinaire — les deux mesures resteraient sinon la même
  // chose sous deux noms.
  const send = (request: BriefingCardDispositionRequest) => {
    if (request.disposition === 'done') trackPriorityAccepted(BRIEFING_SCREEN, action.kind)
    else if (request.disposition === 'postponed') trackPrioritySnoozed(BRIEFING_SCREEN, action.kind)
    else if (request.disposition === 'dismissed') {
      if (request.reason === 'wrong_data') trackPriorityCorrected(BRIEFING_SCREEN, action.kind)
      else trackPriorityRejected(BRIEFING_SCREEN, action.kind)
    }
    mutation.mutate(request)
  }
  const toggle = (next: Panel) => setPanel(current => (current === next ? 'none' : next))

  const postpone = (option: BriefingPostponeOption) => {
    if (option === 'custom') {
      setCustomOpen(true)
      return
    }
    const until = briefingPostponeUntil(option, new Date(), browserTimeZone())
    if (until) send({ actionId: action.id, disposition: 'postponed', until, factObservedAt })
  }
  const customUntil = customDate ? briefingPostponeUntil('custom', new Date(), browserTimeZone(), customDate) : null

  return (
    <Box className="flex w-full flex-col gap-2">
      <Box className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={panel === 'postpone'}
          disabled={mutation.isPending}
          onClick={() => toggle('postpone')}
        >
          {t('card.disposition.postpone')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={panel === 'dismiss'}
          disabled={mutation.isPending}
          onClick={() => toggle('dismiss')}
        >
          {t('card.disposition.dismiss')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => send({ actionId: action.id, disposition: 'done', factObservedAt })}
        >
          {t('card.disposition.done')}
        </Button>
      </Box>

      {panel === 'postpone' ? (
        <Box
          role="group"
          aria-label={t('card.disposition.postponeLegend')}
          className="flex flex-wrap items-center gap-2"
        >
          {BRIEFING_POSTPONE_OPTIONS.map(option => (
            <Button
              key={option}
              type="button"
              variant="secondary"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => postpone(option)}
            >
              {t(`card.disposition.postponeOptions.${option}`)}
            </Button>
          ))}
          {customOpen ? (
            <Box className="flex flex-wrap items-center gap-2">
              <label htmlFor={dateInputId} className="sr-only">
                {t('card.disposition.customDateLabel')}
              </label>
              <input
                id={dateInputId}
                type="date"
                value={customDate}
                onChange={event => setCustomDate(event.target.value)}
                className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-transparent px-2 text-sm"
              />
              <Button
                type="button"
                size="sm"
                disabled={!customUntil || mutation.isPending}
                onClick={() =>
                  customUntil &&
                  send({ actionId: action.id, disposition: 'postponed', until: customUntil, factObservedAt })
                }
              >
                {t('card.disposition.customConfirm')}
              </Button>
            </Box>
          ) : null}
        </Box>
      ) : null}

      {panel === 'dismiss' ? (
        <Box className="flex flex-col gap-2">
          <Box
            role="group"
            aria-label={t('card.disposition.reasonsLegend')}
            className="flex flex-wrap items-center gap-2"
          >
            {BRIEFING_DISMISS_REASONS.map(reason => (
              <Button
                key={reason}
                type="button"
                variant="secondary"
                size="sm"
                disabled={mutation.isPending}
                onClick={() => send({ actionId: action.id, disposition: 'dismissed', reason, factObservedAt })}
              >
                {t(`card.disposition.reasons.${reason}`)}
              </Button>
            ))}
          </Box>
          {/* #2099.51 — une donnée fausse se CORRIGE, là où elle vit : sa
              fiche. Sans objet à ouvrir, aucune ligne — jamais une fiche
              devinée. */}
          {action.businessObject ? (
            <Box className="flex flex-wrap items-center gap-1.5">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('card.disposition.wrongDataHint')}
              </Text>
              <ObjectMention
                kind={action.businessObject.kind}
                id={action.businessObject.id}
                name={action.businessObject.name}
              />
            </Box>
          ) : null}
        </Box>
      ) : null}

      {mutation.isError ? (
        <Text size="xs" role="alert" className="text-[var(--danger-soft-text)]">
          {t('card.disposition.error')}
        </Text>
      ) : null}
    </Box>
  )
}
