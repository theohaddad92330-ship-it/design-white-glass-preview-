import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Button, SettingsRow } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { SettingsScreenHeader } from '@/features/settings/components/SettingsScreenHeader'
import { useTranslation } from 'react-i18next'
import { ImportWizard } from '@/features/import/view/ImportWizard'
import { ContextPackDropzone } from '@/features/universal-import/view/ContextPackDropzone'
import { UniversalImportHistory } from '@/features/universal-import/view/UniversalImportHistory'
import { UniversalImportLauncher } from '@/features/universal-import/view/UniversalImportLauncher'

/**
 * L'onglet « Imports » de Mes données (`/settings/mes-donnees?tab=imports`) — « Imports & sources » (Théo B C3) et
 * l'assistant de reprise de base (PDF 7 §7), ex-page `/settings/import` (#4533, Louis 24/10/2026).
 *
 * Les composants sont ceux de l'ancienne page, sans refonte. La carte « Exporter le vivier » n'y est PLUS : elle vit
 * dans l'onglet Exports (`VivierExportCard`, une seule fois — GA-26). Réservé aux gestionnaires (`MyDataTabs`).
 */
export function ImportsPanel() {
  const { t } = useTranslation('importWizard')
  return (
    <>
      <div className="mb-6">
        <SettingsScreenHeader scope="space" title={t('page.title')} description={t('page.subtitle')} />
      </div>
      {/* Théo D settings-outils (Imports) — trois entrées côte à côte : importer dans le vivier (la zone de dépôt, juste
          dessous), depuis un outil connecté, exporter le vivier. Chacune mène à l'écran qui porte le geste (GA-26). */}
      <div className="mb-6 grid gap-3 md:grid-cols-2" role="list" aria-label={t('page.entriesTitle')}>
        <ImportEntry
          title={t('page.vivierTitle')}
          description={t('page.vivierDescription')}
          action={
            <Button asChild variant="violet" size="sm" className="min-h-11">
              <a href="#import-dropzone">{t('page.vivierAction')}</a>
            </Button>
          }
        />
        <ImportEntry
          title={t('page.fromToolTitle')}
          description={t('page.fromToolDescription')}
          action={
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link to="/integrations">{t('page.fromToolAction')}</Link>
            </Button>
          }
        />
      </div>
      {/* #4426.1 — UNE zone d'import : « Dépose tes documents » (destination proposée, modifiable avant import).
          L'import universel (contacts, types du registre) y est un CHOIX ; l'assistant par outil est replié dessous. */}
      <div id="import-dropzone" className="scroll-mt-6">
        <ContextPackDropzone className="mb-6" moreChoices={<UniversalImportLauncher />} />
      </div>
      {/* Théo D settings-outils — « Ce qui sera vérifié » : la correspondance des champs, les doublons, et l'historique
          réel des imports (UniversalImportHistory), avec le renvoi vers le journal d'activité. */}
      <SettingsBlock label={t('page.checksTitle')} description={t('page.checksDescription')} className="mb-6">
        <SettingsRow title={t('page.checksFieldsTitle')} description={t('page.checksFieldsDescription')} />
        <SettingsRow title={t('page.checksDuplicatesTitle')} description={t('page.checksDuplicatesDescription')} />
        <div className="px-5 pb-4 sm:px-6">
          <UniversalImportHistory />
          {/* #4605.5 — le renvoi vers le journal prolonge l'historique des imports ; plus de ligne « Historique »
              qui le précédait sous le même nom. */}
          <Button asChild variant="ghost" size="sm" className="mt-3 min-h-11">
            <Link to="/settings/activity">{t('page.checksJournalLink')}</Link>
          </Button>
        </div>
      </SettingsBlock>
      {/* #4605.5 — un bloc nommé avec sa phrase visible : le titre n'est plus isolé au-dessus d'un contenu replié. */}
      <SettingsBlock
        label={t('byToolSummary')}
        description={t('byToolDescription')}
        className="mt-6"
        testId="import-by-tool"
      >
        <details className="px-5 py-3 sm:px-6">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium">
            {t('byToolOpen')}
          </summary>
          <ImportWizard />
        </details>
      </SettingsBlock>
    </>
  )
}

/** Une entrée d'import : une carte, son titre, sa phrase, son geste en pied (Théo `v12-settings-link`). */
function ImportEntry({ title, description, action }: { title: string; description: string; action: ReactNode }) {
  return (
    <article
      role="listitem"
      className="flex flex-col gap-2 rounded-card border border-[var(--bellum-border)] bg-card p-4"
    >
      <h3 className="text-sm font-semibold text-[var(--bellum-text-primary)]">{title}</h3>
      <p className="text-sm text-[var(--bellum-text-secondary)]">{description}</p>
      <div className="mt-auto pt-1">{action}</div>
    </article>
  )
}
