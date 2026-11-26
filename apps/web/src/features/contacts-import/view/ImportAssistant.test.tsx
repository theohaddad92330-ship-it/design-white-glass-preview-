import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

const api = vi.hoisted(() => ({
  uploadUniversalImport: vi.fn(),
  previewUniversalImport: vi.fn(),
  verifyUniversalImport: vi.fn(),
  startUniversalImport: vi.fn(),
  fetchUniversalImport: vi.fn(),
  resumeUniversalImport: vi.fn(),
  fetchUniversalImportReport: vi.fn(),
}))
vi.mock('@/features/universal-import/api', () => api)
vi.mock('@/lib/socket', () => ({ subscribeToImportJob: () => () => undefined }))
vi.mock('@/lib/data-exit', () => ({
  useDataExit: () => ({ grant: {} }),
  workspaceRuleRefusalText: () => null,
}))

import { ImportAssistant } from './ImportAssistant'

const JOB = {
  id: 'job-1',
  type: 'contact',
  status: 'uploading',
  filename: 'salon.csv',
  totalRows: null,
  processedRows: 0,
  imported: 0,
  duplicates: 0,
  rejected: 0,
  toReconcile: 0,
  error: null,
  scope: 'workspace',
  breakdown: {},
  queryableByLaura: 0,
  sourceSystem: null,
}
const PREVIEW = {
  headers: ['Nom', 'Poste', 'Email', 'Salon'],
  mapping: { Nom: 'full_name', Poste: 'title', Email: 'email', Salon: null },
  sample: [{ Nom: 'Camille Duval', Poste: 'Responsable Data', Email: 'camille@exemple.fr', Salon: '' }],
  fields: ['full_name', 'title', 'email', 'phone'],
}
const REPORT = {
  total: 4,
  toCreate: 2,
  toComplete: 1,
  discarded: 1,
  truncated: false,
  sensitiveColumns: ['Santé'],
  withoutLegalBasis: 2,
  rows: [
    { line: 2, verdict: 'create', label: 'Camille Duval', reason: null, existingId: null },
    { line: 3, verdict: 'complete', label: 'Claire Vasseur', reason: null, existingId: 'c-9' },
    { line: 4, verdict: 'create', label: 'Alex Martin', reason: null, existingId: null },
    { line: 5, verdict: 'invalid', label: null, reason: 'missing_required_field', existingId: null },
  ],
}

function file(name = 'salon.csv', body = 'Nom;Poste;Email;Salon\nCamille;DSI;c@exemple.fr;x') {
  return new File([body], name)
}

async function dropFile(f: File) {
  const input = await screen.findByLabelText('Choisir un fichier')
  fireEvent.change(input, { target: { files: [f] } })
}

// Théo B c4-assistant-import — quatre étapes : Source · Colonnes · Vérification · Résultat.
describe('ImportAssistant — Théo B c4', () => {
  beforeEach(async () => {
    Object.values(api).forEach(mock => mock.mockReset())
    resetTestQueryClient()
    api.uploadUniversalImport.mockResolvedValue(JOB)
    api.previewUniversalImport.mockResolvedValue(PREVIEW)
    api.verifyUniversalImport.mockResolvedValue(REPORT)
    api.startUniversalImport.mockResolvedValue({ ...JOB, status: 'queued' })
    await i18n.changeLanguage('fr')
  })

  it('R1 — quatre étapes nommées, la première en cours ; zone unique « Dépose tes documents »', async () => {
    renderWithRouter(<ImportAssistant source="file" />, '/contacts/import')
    const steps = await screen.findByRole('list', { name: 'Étapes de l’import' })
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map(li => li.textContent),
    ).toEqual([
      expect.stringContaining('Source'),
      expect.stringContaining('Colonnes'),
      expect.stringContaining('Vérification'),
      expect.stringContaining('Résultat'),
    ])
    expect(within(steps).getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Dépose tes documents')).toBeInTheDocument()
    expect(screen.getByText(/Rien n’est écrit avant ta validation/)).toBeInTheDocument()
  })

  it('R2 — après le dépôt, les colonnes sont proposées avec un exemple ; une cellule vide est dite', async () => {
    renderWithRouter(<ImportAssistant source="file" />, '/contacts/import')
    await dropFile(file())
    expect(await screen.findByText('Retrouver les bons champs')).toBeInTheDocument()
    expect(api.uploadUniversalImport.mock.calls[0]?.[1]).toBe('contact')
    expect(screen.getByText('Camille Duval')).toBeInTheDocument()
    expect(screen.getByText('Cellule vide dans la première ligne')).toBeInTheDocument()
    // Jamais d'import possible à cette étape : la vérification passe d'abord.
    expect(screen.queryByRole('button', { name: 'Importer la sélection' })).not.toBeInTheDocument()
  })

  it('A1 — un classeur à plusieurs onglets propose le choix de la feuille ; l’aperçu est relu', async () => {
    api.previewUniversalImport.mockResolvedValueOnce({
      ...PREVIEW,
      sheets: [
        { name: 'Contacts', rows: 6 },
        { name: 'Comptes', rows: 4 },
      ],
      sheet: 'Contacts',
    })
    renderWithRouter(<ImportAssistant source="file" />, '/contacts/import')
    await dropFile(file('plan.xlsx'))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('combobox', { name: 'Feuille' }))
    await user.click(await screen.findByRole('option', { name: /Comptes/ }))
    await waitFor(() => expect(api.previewUniversalImport).toHaveBeenLastCalledWith('job-1', 'Comptes'))
  })

  it('A5/A6 — qui voit les contacts et le CRM d’origine se disent à l’arrivée, sans fournisseur nommé', async () => {
    renderWithRouter(<ImportAssistant source="file" />, '/contacts/import')
    await dropFile(file())
    await screen.findByText('Organiser l’arrivée')
    fireEvent.click(screen.getByRole('radio', { name: 'Moi seul' }))
    fireEvent.change(screen.getByLabelText('CRM d’origine (facultatif)'), { target: { value: 'Mon outil' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier les contacts' }))
    await waitFor(() =>
      expect(api.verifyUniversalImport).toHaveBeenCalledWith('job-1', PREVIEW.mapping, null, {
        scope: 'personal',
        sourceSystem: 'Mon outil',
      }),
    )
  })

  it('R3/A2 — la vérification donne les compteurs, le détail ligne à ligne et les alertes RGPD', async () => {
    renderWithRouter(<ImportAssistant source="file" />, '/contacts/import')
    await dropFile(file())
    fireEvent.click(await screen.findByRole('button', { name: 'Vérifier les contacts' }))
    expect(await screen.findByText('Aucun écrasement automatique')).toBeInTheDocument()
    expect(screen.getByText('Données sensibles détectées dans le fichier')).toBeInTheDocument()
    expect(screen.getByText(/Santé/)).toBeInTheDocument()
    expect(screen.getByText('Contacts sans base légale')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Camille Duval')).toBeInTheDocument()
    expect(within(table).getByText('Champ obligatoire absent')).toBeInTheDocument()
    expect(within(table).getAllByText('Sans nom')).toHaveLength(1)
    expect(screen.getByText('1–4 sur 4 lignes contrôlées')).toBeInTheDocument()
  })

  it('A3 — « Pas la même personne » est proposé sur une fiche déjà connue', async () => {
    renderWithRouter(<ImportAssistant source="file" />, '/contacts/import')
    await dropFile(file())
    fireEvent.click(await screen.findByRole('button', { name: 'Vérifier les contacts' }))
    expect(await screen.findByRole('button', { name: 'Ce n’est pas la même personne' })).toBeInTheDocument()
  })

  it('R5/N1 — l’import exige la confirmation, honore « Ne pas importer » ligne à ligne, puis part', async () => {
    renderWithRouter(<ImportAssistant source="file" />, '/contacts/import')
    await dropFile(file())
    fireEvent.click(await screen.findByRole('button', { name: 'Vérifier les contacts' }))
    const importButton = await screen.findByRole('button', { name: 'Importer la sélection' })
    expect(importButton).toBeDisabled()
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Décision pour la ligne 4' }))
    await user.click(await screen.findByRole('option', { name: 'Ne pas importer' }))
    // 1 contact à créer (la ligne 4 est écartée) + 1 fiche complétée
    const confirm = screen.getByRole('checkbox', {
      name: /Je confirme l’ajout de 1 contact et la complétion de 1 fiche/,
    })
    fireEvent.click(confirm)
    expect(importButton).toBeEnabled()
    fireEvent.click(importButton)
    await waitFor(() =>
      expect(api.startUniversalImport).toHaveBeenCalledWith('job-1', PREVIEW.mapping, null, {
        skipLines: [4],
        scope: 'workspace',
        sourceSystem: null,
      }),
    )
  })

  it('R6 — le résultat : créés · complétés · non importés, répertoire, rapport, lignes non importées', async () => {
    api.startUniversalImport.mockResolvedValue({
      ...JOB,
      status: 'done',
      processedRows: 4,
      totalRows: 4,
      imported: 2,
      duplicates: 0,
      rejected: 2,
      breakdown: { contact: { created: 2, matched: 1, duplicates: 0, rejected: 2, toReconcile: 0 } },
    })
    renderWithRouter(<ImportAssistant source="file" />, '/contacts/import')
    await dropFile(file())
    fireEvent.click(await screen.findByRole('button', { name: 'Vérifier les contacts' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /Je confirme/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Importer la sélection' }))
    expect(await screen.findByText('Tes contacts sont dans le répertoire.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir le répertoire' }).getAttribute('href')).toBe('/contacts')
    expect(screen.getByRole('button', { name: 'Télécharger le rapport' })).toBeInTheDocument()
    expect(screen.getByText('Ce qui a été conservé')).toBeInTheDocument()
    expect(screen.getByText(/Ligne 5/)).toBeInTheDocument()
  })

  it('A5 long — un gros fichier est VÉRIFIÉ puis part en arrière-plan : on peut fermer la fenêtre', async () => {
    api.startUniversalImport.mockResolvedValue({ ...JOB, status: 'processing', processedRows: 7990 })
    renderWithRouter(<ImportAssistant source="file" />, '/contacts/import')
    await dropFile(file())
    fireEvent.click(await screen.findByRole('button', { name: 'Vérifier les contacts' }))
    expect(api.startUniversalImport).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Je confirme/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Importer la sélection' }))
    expect(await screen.findByText('L’import continue en arrière-plan')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour à Imports & sources' }).getAttribute('href')).toBe(
      '/contacts/imports',
    )
  })

  it('N1 carnet — un fichier vCard est lu dans le navigateur et déposé comme un tableau', async () => {
    renderWithRouter(<ImportAssistant source="address-book" />, '/contacts/import')
    const vcf = new File(['BEGIN:VCARD\nVERSION:3.0\nFN:Camille Duval\nEND:VCARD'], 'carnet.vcf')
    fireEvent.change(await screen.findByLabelText('Choisir un carnet'), { target: { files: [vcf] } })
    await waitFor(() => expect(api.uploadUniversalImport).toHaveBeenCalled())
    const sent = api.uploadUniversalImport.mock.calls[0]?.[0] as File
    expect(sent.name).toBe('carnet.csv')
  })

  it('N paste — un tableau collé devient un fichier tabulé déposé comme les autres', async () => {
    renderWithRouter(<ImportAssistant source="paste" />, '/contacts/import')
    fireEvent.change(await screen.findByLabelText('Colle ton tableau (avec ses en-têtes)'), {
      target: { value: 'Nom\tEmail\nCamille\tc@exemple.fr' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Lire ce tableau' }))
    await waitFor(() => expect(api.uploadUniversalImport).toHaveBeenCalled())
    expect((api.uploadUniversalImport.mock.calls[0]?.[0] as File).name).toBe('tableau-colle.tsv')
  })

  it('R9 — erreur de lecture : dite en clair, l’utilisateur reste sur la source', async () => {
    api.uploadUniversalImport.mockRejectedValue(new Error('boom'))
    renderWithRouter(<ImportAssistant source="file" />, '/contacts/import')
    await dropFile(file())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Dépose tes documents')).toBeInTheDocument()
  })
})
