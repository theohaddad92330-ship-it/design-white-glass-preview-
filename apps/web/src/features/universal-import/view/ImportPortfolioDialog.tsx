import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { FileText, Plug, Upload } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImportTargetListDialog } from '@/features/target-lists/view/ImportTargetListDialog'
import { UniversalImportDialog } from './UniversalImportDialog'

type Kind = 'account' | 'contact' | 'targetList'
const KINDS: readonly Kind[] = ['account', 'contact', 'targetList']

type Opened = { kind: 'file'; type: 'account' | 'contact'; sample: boolean } | { kind: 'targetList' } | null

/**
 * Théo A comptes-import.R1 — « Importer dans le portefeuille » : UNE modale,
 * trois portes (fichier d'exemple · document local · CRM), au lieu d'un
 * assistant d'écrans. Le choix « Ce fichier contient… » (A3) fait des contacts
 * et d'une liste de cibles la même modale que les comptes. La vérification
 * (colonnes, doublons, rapport) reste celle de l'import universel : rien n'est
 * écrit avant le contrôle, rien n'est écrasé.
 */
export function ImportPortfolioDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('importWizard')
  const [kind, setKind] = useState<Kind>('account')
  const [opened, setOpened] = useState<Opened>(null)

  const open = (sample: boolean) => {
    // Une liste de cibles n'a pas de fichier d'exemple : la porte « exemple » reste sur les comptes.
    if (kind === 'targetList' && !sample) return setOpened({ kind: 'targetList' })
    setOpened({ kind: 'file', type: kind === 'contact' ? 'contact' : 'account', sample })
  }

  if (opened?.kind === 'file') {
    return <UniversalImportDialog fixedType={opened.type} startWithSample={opened.sample} onClose={onClose} />
  }
  if (opened?.kind === 'targetList') {
    return <ImportTargetListDialog open onOpenChange={next => (next ? undefined : onClose())} />
  }

  return (
    <Dialog open onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('portfolio.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('portfolio.title')}</DialogTitle>
          <DialogDescription>{t('portfolio.intro')}</DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2 px-1">
          <legend className="mb-1 text-xs text-[var(--bellum-text-secondary)]">{t('portfolio.contains')}</legend>
          {KINDS.map(value => (
            <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="import-kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
              />
              {t(`portfolio.kinds.${value}`)}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-2 px-1 pb-1">
          <Button variant="outline" icon={FileText} onClick={() => open(true)} disabled={kind === 'targetList'}>
            {t('portfolio.sample')}
          </Button>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('portfolio.sampleHint')}
          </Text>
          <Button variant="black" icon={Upload} onClick={() => open(false)}>
            {t('portfolio.local')}
          </Button>
          <Button asChild variant="outline" icon={Plug}>
            <Link to="/settings/mes-donnees" search={{ tab: 'imports' }}>
              {t('portfolio.crm')}
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
