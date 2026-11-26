import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UniversalImportLauncher } from './UniversalImportLauncher'

vi.mock('./UniversalImportDialog', () => ({ UniversalImportDialog: () => null }))

// #3666.9 (R41) — /settings/import n'affichait AUCUNE limite : « 1 Go » doit se lire sur la page AVANT le choix du fichier.
describe('UniversalImportLauncher — #3666.9 (R41)', () => {
  it('la limite de taille est visible avant d’ouvrir la fenêtre de choix du fichier', () => {
    render(<UniversalImportLauncher />)
    expect(screen.getByTestId('import-size-limit')).toHaveTextContent('1 Go')
  })
})
