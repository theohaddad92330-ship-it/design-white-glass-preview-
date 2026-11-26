import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DUPLICATES_ANCHOR_ID } from '@/features/governance/model/duplicates-anchor'
import { revealTarget, revealTargetProps } from '@/lib/reveal-target'
import { useAutoMergedDuplicates, useDuplicates } from '../api'
import { DuplicatesPanel } from './DuplicatesPanel'

/**
 * « Doublons à trancher » — le panneau d'arbitrage, sur `/contacts`.
 *
 * Louis 14/10/2026, refonte Pilotage (L0a) : l'onglet « Qualité des données »
 * est supprimé ; ses doublons descendent là où l'on travaille les contacts. La
 * section n'existe que s'il y a AU MOINS UNE paire ouverte OU une fusion automatique à montrer
 * (la démo sème seulement celle-ci, #4016 L6 ; titre « fusionnés » sans paire ouverte) (on n'affiche pas ce
 * qu'on n'a pas — une absence ne fait aucune section). Le comportement du
 * panneau ne change pas : on PROPOSE une fusion, on ne fusionne jamais.
 *
 * `revealTargetProps` porte l'ancre (`#hygiene-doublons`) : le lien du contrôle
 * « Doublons non tranchés » de `/pilotage` et l'ancienne adresse
 * `/pilotage/qualite#hygiene-doublons` arrivent ici. Le navigateur ne sait pas
 * défiler vers une cible qui n'existe qu'après la lecture des paires : la
 * section amène elle-même l'ancre à l'écran quand elle apparaît.
 */
export function DuplicatesSection() {
  const { t } = useTranslation('governance')
  const { data: pairs } = useDuplicates()
  const { data: autoMerged } = useAutoMergedDuplicates()
  const hasOpenPair = pairs !== undefined && pairs.length > 0
  const hasAutoMerged = autoMerged !== undefined && autoMerged.length > 0
  const visible = hasOpenPair || hasAutoMerged
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (visible && window.location.hash === `#${DUPLICATES_ANCHOR_ID}`) {
      revealTarget(DUPLICATES_ANCHOR_ID)
      setOpen(true)
    }
  }, [visible])

  if (!visible) return null
  return (
    <section
      aria-labelledby="duplicates-section-title"
      // La gouttière vient du contenu de /contacts (`ContactContent`), qui place ce bandeau sous la synthèse.
      className="outline-none"
      {...revealTargetProps(DUPLICATES_ANCHOR_ID)}
    >
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-[var(--bellum-border)] bg-card px-4 py-3">
        {/* Théo `.t-banner` — bandeau neutre ; l'icône d'accent dit « à relire », jamais une alerte. */}
        <Copy className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="duplicates-section-title" className="text-sm font-semibold">
            {hasOpenPair ? t('duplicates.bannerOpen', { count: pairs.length }) : t('duplicates.sectionTitleAutoMerged')}
          </h2>
          <Text element="p" size="sm" color="text-muted-foreground">
            {t(hasOpenPair ? 'duplicates.bannerOpenHint' : 'duplicates.bannerAutoHint')}
          </Text>
        </div>
        <Button type="button" variant="soft" size="sm" className="min-h-11" onClick={() => setOpen(true)}>
          {t(hasOpenPair ? 'duplicates.reviewAction' : 'duplicates.autoMergedAction')}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t('duplicates.closeLabel')} className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t(hasOpenPair ? 'duplicates.sectionTitle' : 'duplicates.sectionTitleAutoMerged')}
            </DialogTitle>
            <DialogDescription>
              {t(hasOpenPair ? 'duplicates.bannerOpenHint' : 'duplicates.bannerAutoHint')}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70dvh] overflow-y-auto">
            <DuplicatesPanel />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
