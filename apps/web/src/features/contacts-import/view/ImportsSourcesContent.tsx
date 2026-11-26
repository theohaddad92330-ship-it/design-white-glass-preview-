import { Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, ClipboardPaste, FileSpreadsheet, FileText, NotebookTabs, Plug, Sparkles } from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { UniversalImportDialog } from '@/features/universal-import/view/UniversalImportDialog'
import { ASSISTANT_SOURCE_KEYS, SOURCE_I18N_KEY, type ImportSourceKey } from '../model/sources'
import { ImportsHistoryBlock } from './ImportsHistoryBlock'
import { ImportTypeChooser } from './ImportTypeChooser'

const SOURCE_ICON: Record<ImportSourceKey, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  file: FileSpreadsheet,
  paste: ClipboardPaste,
  'address-book': NotebookTabs,
  crm: Plug,
  laura: Sparkles,
}

const CARD =
  'flex min-h-11 h-full flex-col gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-left hover:border-[var(--bellum-primary-500)] focus-visible:outline focus-visible:outline-2'

/**
 * Théo B c3-imports-sources — « Imports & sources » : le point d'entrée de tout ce qui entre dans le répertoire.
 * Cinq cartes de source (la sixième, la messagerie, n'a pas de lecture d'annuaire côté serveur : pas de carte), deux
 * renvois (documents de cadrage, CV en masse), ce que les données débloquent, puis l'historique.
 */
export function ImportsSourcesContent() {
  const { t } = useTranslation('importWizard')
  const [choosing, setChoosing] = useState(false)
  const [universalType, setUniversalType] = useState<'account' | 'need' | 'mission' | 'talent' | null>(null)
  return (
    <div data-testid="imports-sources">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Text element="h2" size="xl" weight="semibold" className="text-[var(--text-primary)]">
            {t('contactsImport.sources.heading')}
          </Text>
          <Text element="p" size="sm" className="mt-1 text-[var(--text-muted)]">
            {t('contactsImport.sources.lead')}
          </Text>
          <Text element="p" size="sm" className="mt-1 text-[var(--text-muted)]">
            {t('contactsImport.sources.guarantee')}
          </Text>
        </div>
        <Button variant="black" size="sm" onClick={() => setChoosing(true)}>
          {t('contactsImport.sources.newImport')}
        </Button>
      </div>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ASSISTANT_SOURCE_KEYS.map(key => {
          const Icon = SOURCE_ICON[key]
          const i18nKey = SOURCE_I18N_KEY[key]
          return (
            <li key={key}>
              <Link to="/contacts/import" search={{ source: key }} className={CARD}>
                <Icon className="size-5 text-[var(--text-muted)]" aria-hidden />
                <Text size="sm" weight="semibold" className="text-[var(--text-primary)]">
                  {t(`contactsImport.sources.${i18nKey}.title`)}
                </Text>
                <Text size="sm" className="text-[var(--text-secondary)]">
                  {t(`contactsImport.sources.${i18nKey}.hint`)}
                </Text>
                <Text size="xs" className="text-[var(--text-muted)]">
                  {t(`contactsImport.sources.${i18nKey}.meta`)}
                </Text>
              </Link>
            </li>
          )
        })}
        <li className={`${CARD} relative`}>
          <Sparkles className="size-5 text-[var(--text-muted)]" aria-hidden />
          <Text size="sm" weight="semibold" className="text-[var(--text-primary)]">
            {t('contactsImport.sources.laura.title')}
          </Text>
          <Text size="sm" className="text-[var(--text-secondary)]">
            {t('contactsImport.sources.laura.hint')}
          </Text>
          <Text size="xs" className="text-[var(--text-muted)]">
            {t('contactsImport.sources.laura.meta')}
          </Text>
          <AskLaura
            question={t('contactsImport.sources.laura.question')}
            label={t('contactsImport.sources.laura.title')}
            alwaysVisible
          />
        </li>
      </ul>

      <section aria-labelledby="imports-others" className="mt-6">
        <Text element="h3" id="imports-others" size="sm" weight="semibold" className="mb-2 text-[var(--text-primary)]">
          {t('contactsImport.sources.others')}
        </Text>
        <ul className="grid gap-3 sm:grid-cols-2">
          <li>
            <Link to="/settings/mes-donnees" search={{ tab: 'imports' }} className={CARD}>
              <FileText className="size-5 text-[var(--text-muted)]" aria-hidden />
              <Text size="sm" weight="semibold" className="text-[var(--text-primary)]">
                {t('contactsImport.sources.context.title')}
              </Text>
              <Text size="sm" className="text-[var(--text-secondary)]">
                {t('contactsImport.sources.context.hint')}
              </Text>
              <Text size="xs" className="text-[var(--text-muted)]">
                {t('contactsImport.sources.context.meta')}
              </Text>
            </Link>
          </li>
          <li>
            <Link to="/consultants" className={CARD}>
              <ArrowUpRight className="size-5 text-[var(--text-muted)]" aria-hidden />
              <Text size="sm" weight="semibold" className="text-[var(--text-primary)]">
                {t('contactsImport.sources.cv.title')}
              </Text>
              <Text size="sm" className="text-[var(--text-secondary)]">
                {t('contactsImport.sources.cv.hint')}
              </Text>
              <Text size="xs" className="text-[var(--text-muted)]">
                {t('contactsImport.sources.cv.meta')}
              </Text>
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="imports-unlocks" className="mt-8">
        <Text element="h3" id="imports-unlocks" size="sm" weight="semibold" className="mb-2 text-[var(--text-primary)]">
          {t('contactsImport.sources.unlocks.title')}
        </Text>
        <ul className="grid gap-3 sm:grid-cols-3">
          {(['portfolio', 'history', 'noDuplicate'] as const).map(key => (
            <li key={key} className="rounded-xl border border-[var(--border-subtle)] p-4">
              <Text size="sm" weight="semibold" className="text-[var(--text-primary)]">
                {t(`contactsImport.sources.unlocks.${key}.title`)}
              </Text>
              <Text size="sm" className="mt-1 text-[var(--text-muted)]">
                {t(`contactsImport.sources.unlocks.${key}.body`)}
              </Text>
            </li>
          ))}
        </ul>
      </section>

      <ImportsHistoryBlock />

      {choosing ? (
        <ImportTypeChooser
          onClose={() => setChoosing(false)}
          onUniversal={type => {
            setChoosing(false)
            setUniversalType(type)
          }}
        />
      ) : null}
      {universalType ? (
        <UniversalImportDialog fixedType={universalType} onClose={() => setUniversalType(null)} />
      ) : null}
    </div>
  )
}
