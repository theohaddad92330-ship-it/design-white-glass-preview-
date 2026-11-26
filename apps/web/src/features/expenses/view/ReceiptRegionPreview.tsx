import { Box, Button, Text } from '@bellum/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import '../i18n'
import type { ReceiptRegion } from '../receipt-extraction'

/**
 * #2433.4 — LA PREUVE VISUELLE d'un champ lu automatiquement : la zone de
 * l'image où le modèle l'a lu, surlignée. Le serveur ne rend une zone que pour
 * un champ DÉJÀ lu et validé (`services/vision_regions.py`) ; sans zone — ou
 * pour un PDF — ce composant ne rend RIEN : on n'affiche pas ce qu'on n'a pas.
 */
type RegionEntry = { label: string; region: ReceiptRegion }

const pct = (ratio: number) => `${Math.round(ratio * 10_000) / 100}%`

export function ReceiptRegionPreview({ file, regions }: { file: File; regions: RegionEntry[] }) {
  const { t } = useTranslation('expenses')
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const isImage = file.type.startsWith('image/')

  useEffect(() => {
    if (!open || !isImage) return undefined
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [open, isImage, file])

  if (!isImage || regions.length === 0) return null

  return (
    <Box className="mt-2">
      <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => setOpen(value => !value)}>
        {open ? t('editor.readRegionHide') : t('editor.readRegionShow')}
      </Button>
      {open && url ? (
        <Box className="mt-2">
          <Box className="relative inline-block max-w-full">
            <img src={url} alt={t('editor.readRegionAlt')} className="block max-h-[60dvh] max-w-full rounded-md" />
            {regions.map(({ label, region }) => (
              <Box
                key={label}
                data-testid={`receipt-region-${label}`}
                aria-hidden="true"
                className="pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/20"
                style={{ left: pct(region.x), top: pct(region.y), width: pct(region.w), height: pct(region.h) }}
              />
            ))}
          </Box>
          <Box className="mt-1 grid gap-1">
            {regions.map(({ label }) => (
              <Text key={label} element="p" size="xs" color="text-muted-foreground">
                {t('editor.readRegionField', { label })}
              </Text>
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}
