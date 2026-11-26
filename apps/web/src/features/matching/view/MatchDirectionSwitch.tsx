import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, FilterChips, Text } from '@bellum/ui'

type MatchDirection = 'need' | 'consultant'

/**
 * Théo C projects-rapprochement.HT-7 — UN interrupteur, DEUX sens, un écran.
 *
 * « Besoin → consultants » (les bons profils pour ce besoin) et « Consultant →
 * besoins » (où positionner ce profil) sont les deux faces du même
 * rapprochement. Le sens COURANT est celui de l'écran ; l'autre sens ne
 * recalcule rien ici : il propose les objets que l'écran connaît déjà (les
 * profils du run, ou les besoins du classement) et renvoie vers l'écran de
 * l'autre sens. `picker` = ces liens, écrits par l'appelant (routes typées).
 */
export function MatchDirectionSwitch({ current, picker }: { current: MatchDirection; picker: ReactNode }) {
  const { t } = useTranslation('matching')
  const other: MatchDirection = current === 'need' ? 'consultant' : 'need'
  const [open, setOpen] = useState(false)

  return (
    <Box className="flex flex-col gap-2" data-testid="match-direction-switch">
      <FilterChips
        ariaLabel={t('direction.aria')}
        options={[
          { value: 'need', label: t('direction.need') },
          { value: 'consultant', label: t('direction.consultant') },
        ]}
        value={open ? other : current}
        clearable
        onChange={next => setOpen(next === other)}
      />
      {open ? (
        <Box className="rounded-md border border-border p-3" data-testid="match-direction-picker">
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t(`direction.pick.${other}`)}
          </Text>
          <Box className="mt-2 flex flex-wrap gap-2">{picker}</Box>
        </Box>
      ) : null}
    </Box>
  )
}
