import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { overlayDialogClassName, overlayFootClassName, overlayHeadClassName, overlaySideClassName } from './overlay'

/**
 * THEO-REFONTE-COMPOSANTS — les surcouches globales parlent UNE grammaire (`overlay.ts`), lue dans les
 * maquettes appliquées (`dialog`, `.dialog-head/-body/-footer`, `dialog.t-side`). La garde LIT les fichiers.
 */
const OVERLAYS = [
  'features/global-search/GlobalSearchDialog.tsx',
  'features/notifications/components/NotificationBell.tsx',
  'components/sidebar/background-tasks/BackgroundTasksSheet.tsx',
  'features/guide/GuideHelpCenter.tsx',
  'features/launcher/AccountLaunchSurface.tsx',
  'features/feedback/FeedbackWidget.tsx',
] as const

const SRC = resolve(__dirname, '../..')

describe('grammaire des surcouches', () => {
  it('la tête porte son filet bas, le pied son filet haut et ses gestes à droite', () => {
    expect(overlayHeadClassName).toContain('border-b')
    expect(overlayFootClassName).toContain('border-t')
    expect(overlayFootClassName).toContain('justify-end')
    expect(overlayDialogClassName).toContain('rounded-overlay')
    expect(overlaySideClassName).toContain('sm:max-w-[27.5rem]')
  })

  it.each(OVERLAYS)('%s compose la grammaire commune', file => {
    const source = readFileSync(resolve(SRC, file), 'utf8')
    expect(source).toContain("from '@/components/layout/overlay'")
    // L'ancien en-tête shadcn centré (`DialogHeader`) ne revient pas dans une surcouche refaite.
    expect(source).not.toMatch(/<DialogHeader\b/)
  })

  it('sait dire NON : une surcouche restée sur `DialogHeader` est attrapée', () => {
    const legacy = `import { DialogHeader } from '@bellum/ui'\n<DialogHeader><DialogTitle/></DialogHeader>`
    expect(legacy).not.toContain("from '@/components/layout/overlay'")
    expect(legacy).toMatch(/<DialogHeader\b/)
  })
})
