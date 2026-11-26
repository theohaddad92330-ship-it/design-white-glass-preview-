import { defaultMemoryScope } from '@bellum/contracts'
import { ActionDialog, Box, Input, Text } from '@bellum/ui'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { trackMemoryAdded } from '@/lib/product-tracker'
import { MEMORY_SETTINGS_GESTURE_SCREEN } from '../memory-gesture-screen'
import { usePinFact } from '../hooks/usePinFact'

/** Plafond serveur d'un fait épinglé (`pinFactSchema`, max 2000). */
const MAX_FACT_LENGTH = 2000

/** Fin de journée locale de la date choisie, en ISO — « à revérifier le 15 janv. » vaut toute cette journée. */
function endOfLocalDay(day: string): string {
  return new Date(`${day}T23:59:59`).toISOString()
}

/**
 * Réglages › Laura › Mémoire — « Ajouter un élément » (maquette `settings-laura`, N3, Louis 22/10/2026).
 *
 * Une mémoire CHOISIE : rien n'y entre à l'insu de la personne, et celle-ci peut y écrire elle-même. Le geste réutilise
 * l'épinglage existant (`POST /memory/facts`, `usePinFact`) — aucun second chemin d'écriture. L'élément est PERSONNEL
 * (portée dérivée par `defaultMemoryScope`, la même table que la carte Mémoire — GA-26) ; avec une date « à revérifier »
 * c'est un contexte temporaire qui expire ce jour-là, sans date une préférence durable.
 * La note le dit : l'ajout ne change ni le métier, ni les expertises, ni les faits d'un compte — et une actualité n'y
 * devient jamais un besoin confirmé.
 */
export function MemoryAddDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('knowledge')
  const pin = usePinFact()
  const [fact, setFact] = useState('')
  const [recheckOn, setRecheckOn] = useState('')
  const factId = useId()
  const dateId = useId()

  const trimmed = fact.trim()
  const kind = recheckOn === '' ? ('preference' as const) : ('temporary_context' as const)

  const close = () => {
    setFact('')
    setRecheckOn('')
    onOpenChange(false)
  }

  return (
    <ActionDialog
      open={open}
      onOpenChange={next => (next ? onOpenChange(true) : close())}
      title={t('memoryLedger.add.title')}
      description={t('memoryLedger.add.description')}
      validateButtonLabel={t('memoryLedger.add.confirm')}
      cancelButtonLabel={t('memoryLedger.add.cancel')}
      validateButtonDisabled={trimmed.length === 0 || trimmed.length > MAX_FACT_LENGTH}
      isLoading={pin.isPending}
      onConfirm={() =>
        pin.mutate(
          {
            fact: trimmed,
            kind,
            origin: 'manual',
            scope: defaultMemoryScope({ kind, accountId: null }),
            ...(recheckOn === '' ? {} : { expiresAt: endOfLocalDay(recheckOn) }),
          },
          {
            onSuccess: () => {
              trackMemoryAdded(MEMORY_SETTINGS_GESTURE_SCREEN)
              close()
            },
          },
        )
      }
      content={
        <Box className="flex flex-col gap-3">
          <Box className="flex flex-col gap-1">
            <label htmlFor={factId}>
              <Text element="span" size="sm" weight="medium">
                {t('memoryLedger.add.factLabel')}
              </Text>
            </label>
            <textarea
              id={factId}
              value={fact}
              maxLength={MAX_FACT_LENGTH}
              rows={3}
              onChange={event => setFact(event.target.value)}
              className="w-full rounded-md border border-[var(--bellum-border)] bg-transparent p-2 text-sm"
            />
          </Box>
          <Box className="flex flex-col gap-1">
            <label htmlFor={dateId}>
              <Text element="span" size="sm" weight="medium">
                {t('memoryLedger.add.recheckLabel')}
              </Text>
            </label>
            <Input id={dateId} type="date" value={recheckOn} onChange={event => setRecheckOn(event.target.value)} />
          </Box>
          <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('memoryLedger.add.note')}
          </Text>
        </Box>
      }
    />
  )
}
