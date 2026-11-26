import { IMPORT_FILE_MAX_LABEL } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { Upload } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UniversalImportDialog } from './UniversalImportDialog'

/**
 * #4426.1 — ce n'est plus une entrée de PLUS sur la page : la zone « Dépose tes documents » l'héberge comme un choix
 * (fichier de contacts, ou d'un type déclaré au registre) — rien de la capacité n'est perdu.
 *
 * L'entrée « n'importe quel fichier, n'importe quel type » (Louis 27/09/2026),
 * posée au-dessus de l'assistant de reprise par source : un fichier qu'aucun
 * catalogue d'éditeur ne connaît s'importe quand même — comptes, contacts, et
 * les types déclarés au registre.
 */
export function UniversalImportLauncher() {
  const { t } = useTranslation('importWizard')
  const [open, setOpen] = useState(false)
  return (
    <section className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-4">
      <div className="min-w-0">
        <Text element="h3" size="sm" weight="semibold" className="text-[var(--text-primary)]">
          {t('universal.title')}
        </Text>
        <Text size="sm" className="text-[var(--text-muted)]">
          {t('universal.description')}
        </Text>
        {/* #3666.9 (R41) — la limite se lit SUR LA PAGE, avant le choix du fichier (pas seulement dans la fenêtre). */}
        <Text size="sm" className="text-[var(--text-muted)]" data-testid="import-size-limit">
          {t('universal.sizeLimit', { max: IMPORT_FILE_MAX_LABEL })}
        </Text>
      </div>
      <Button variant="black" size="sm" icon={Upload} onClick={() => setOpen(true)}>
        {t('universal.choose')}
      </Button>
      {open ? <UniversalImportDialog onClose={() => setOpen(false)} /> : null}
    </section>
  )
}
