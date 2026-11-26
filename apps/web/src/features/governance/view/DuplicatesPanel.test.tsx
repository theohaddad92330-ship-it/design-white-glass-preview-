import type { AutoMergedPairView, DuplicatePairView } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DuplicatesPanel } from './DuplicatesPanel'

/**
 * Les doublons PROPOSÉS — et jamais fusionnés.
 *
 * Ces cas vivaient dans `GovernancePanel.test.tsx` jusqu'au 29/08/2026. Ils ont
 * suivi le bloc qu'ils gardent : il a quitté l'écran Connaissances — où il
 * n'apparaissait que si un CRM était connecté — pour l'écran Qualité des
 * données, où le contrôle qui COMPTE les paires est affiché.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={params ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`$${k}`, v), to) : to}>{children}</a>
  ),
}))

const duplicates = vi.fn()
const decide = vi.fn()
const scan = vi.fn()
const restore = vi.fn()
const autoMerged = vi.fn()
const undoMerge = vi.fn()

vi.mock('../api', () => ({
  useDuplicates: () => duplicates(),
  useDuplicatesScan: () => scan(),
  useDecideDuplicate: () => ({ mutate: decide, isPending: false }),
  useRestoreArchivedAccount: () => ({ mutate: restore, isPending: false }),
  // #4016 L6 — les fusions automatiques en vigueur, et leur annulation.
  useAutoMergedDuplicates: () => autoMerged(),
  useUndoAutoMerge: () => ({ mutate: undoMerge, isPending: false }),
}))

function pair(over: Partial<DuplicatePairView> = {}): DuplicatePairView {
  return {
    id: 'p1',
    entityType: 'contact',
    leftId: 'c1',
    leftLabel: 'Marie Dupont',
    rightId: 'c2',
    rightLabel: 'M. Dupont',
    reason: 'Même adresse e-mail',
    confidence: 0.95,
    decision: 'pending',
    decidedAt: null,
    decidedByName: null,
    ...over,
  }
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DuplicatesPanel />
    </QueryClientProvider>,
  )
}

// #4468 — la raison d'une paire est un CODE écrit par le balayage (`same_email`…) : l'écran la dit en français,
// jamais la clé brute (45× « same_email » sur /contacts).
describe('DuplicatesPanel — aucune raison snake_case rendue (#4468)', () => {
  it.each([
    ['same_email', /Même adresse e-mail/],
    ['same_name', /Même nom/],
    ['same_name_same_company', /Même nom, même entreprise/],
    ['same_name_no_company', /Même nom, entreprise inconnue/],
    ['same_local_part', /Même début d’adresse/],
    ['raison_inconnue_du_futur', /Rapprochement proposé/],
  ])('%s → libellé français', (code, expected) => {
    scan.mockReturnValue(null)
    autoMerged.mockReturnValue({ data: [], isError: false })
    duplicates.mockReturnValue({ data: [pair({ reason: code })], isLoading: false, isError: false })
    const { container } = renderPanel()
    expect(container.textContent).toMatch(expected)
    expect(container.textContent).not.toMatch(/\b[a-z]+(_[a-z]+)+\b/)
  })
})

describe('DuplicatesPanel — on propose, on ne fusionne jamais', () => {
  beforeEach(() => {
    duplicates.mockReset()
    decide.mockReset()
    scan.mockReset()
    scan.mockReturnValue(null)
    duplicates.mockReturnValue({ data: [], isError: false })
    autoMerged.mockReset()
    undoMerge.mockReset()
    autoMerged.mockReturnValue({ data: [], isError: false })
  })

  it('affiche la RAISON du rapprochement — sans elle, rien ne se vérifie', () => {
    duplicates.mockReturnValue({ data: [pair()], isError: false })
    renderPanel()
    expect(screen.getByText('Même adresse e-mail')).toBeInTheDocument()
  })

  it('montre la CONFIANCE — 0,35 et 0,95 ne se traitent pas pareil', () => {
    duplicates.mockReturnValue({ data: [pair({ confidence: 0.35 })], isError: false })
    renderPanel()
    expect(screen.getByText('35 % de confiance')).toBeInTheDocument()
  })

  it('ne propose AUCUN bouton « fusionner » — Bellum ne fusionne rien', () => {
    // Le libellé est « J'ai fusionné » : c'est un compte rendu, pas une action.
    duplicates.mockReturnValue({ data: [pair()], isError: false })
    renderPanel()
    expect(screen.getByText('J’ai fusionné')).toBeInTheDocument()
    expect(screen.getByText('Ce ne sont pas les mêmes')).toBeInTheDocument()
  })

  it('#4016 L6 — dit ce que le produit fusionne SEUL, et que le CRM n’est jamais touché', () => {
    // ⚠️⚠️ Renversement daté de c37 (Louis 11/10/2026) : « il ne fusionne
    // jamais » est devenu faux pour les paires certaines. L'écran dit la
    // nouvelle règle ET sa borne — dans Bellum seulement, annulable.
    duplicates.mockReturnValue({ data: [pair()], isError: false })
    renderPanel()
    expect(screen.getByText(/fusionne seul les doublons quasi certains/)).toBeInTheDocument()
    expect(screen.getByText(/jamais dans ton CRM/)).toBeInTheDocument()
  })

  it('ne rend PAS un échec de lecture comme « aucun doublon »', () => {
    // Le même arbitrage que partout : « je n'ai pas pu lire » et « il n'y en a
    // pas » sont deux réponses, et les confondre fait croire une base propre.
    duplicates.mockReturnValue({ data: undefined, isError: true })
    renderPanel()
    expect(screen.getByText(/n’ont pas pu être chargés/)).toBeInTheDocument()
  })

  // #3490 (recette Y13) — « Aucun doublon en attente » ne disait pas ce qui avait
  // été regardé. Le panneau NOMME le périmètre examiné, ou l'échec du passage.
  it('#3490 — vide : nomme ce que le balayage a examiné', () => {
    scan.mockReturnValue({
      accountsExamined: 25,
      contactsExamined: 140,
      pairsDetected: 0,
      alreadyKnown: 0,
      failed: false,
      at: '2026-10-02T10:00:00.000Z',
    })
    renderPanel()
    expect(screen.getByText(/Aucun doublon en attente/)).toBeInTheDocument()
    expect(screen.getByText(/25 comptes et 140 contacts examinés/)).toBeInTheDocument()
  })

  it('#3490 (Y20) — vide : dit combien de comptes archivés ou rattachés ne sont pas comparés', () => {
    scan.mockReturnValue({
      accountsExamined: 65,
      accountsSetAside: 2,
      contactsExamined: 140,
      pairsDetected: 0,
      alreadyKnown: 0,
      failed: false,
      at: '2026-10-03T10:00:00.000Z',
    })
    renderPanel()
    expect(screen.getByText(/2 comptes archivés ou rattachés n’entrent pas dans la comparaison/)).toBeInTheDocument()
  })

  it('#3490 (Y20) — aucun compte écarté : aucune ligne de plus', () => {
    scan.mockReturnValue({
      accountsExamined: 25,
      accountsSetAside: 0,
      contactsExamined: 140,
      pairsDetected: 0,
      alreadyKnown: 0,
      failed: false,
      at: '2026-10-03T10:00:00.000Z',
    })
    renderPanel()
    expect(screen.queryByText(/n’entrent? pas dans la comparaison/)).not.toBeInTheDocument()
  })

  it('#3490 — vide : dit que les paires détectées sont déjà tranchées', () => {
    scan.mockReturnValue({
      accountsExamined: 25,
      contactsExamined: 0,
      pairsDetected: 1,
      alreadyKnown: 1,
      failed: false,
      at: '2026-10-02T10:00:00.000Z',
    })
    renderPanel()
    expect(screen.getByText(/1 paire déjà tranchée/)).toBeInTheDocument()
  })

  it('#3490 — un balayage incomplet ne se lit JAMAIS « aucun doublon »', () => {
    scan.mockReturnValue({
      accountsExamined: null,
      contactsExamined: 140,
      pairsDetected: 0,
      alreadyKnown: 0,
      failed: true,
      at: '2026-10-02T10:00:00.000Z',
    })
    renderPanel()
    expect(screen.queryByText(/Aucun doublon en attente/)).toBeNull()
    expect(screen.getByText(/La recherche de doublons n’a pas abouti/)).toBeInTheDocument()
  })

  it('#3490 (Y18) — sans rapport du balayage, « aucun doublon » dit qu’il n’est pas une mesure', () => {
    scan.mockReturnValue(null)
    renderPanel()
    expect(screen.getByText(/Le dernier balayage n’a rien rapporté/)).toBeInTheDocument()
  })

  it('#3490 (Y18) — balayage non lancé : l’écran dit POURQUOI, sans « 0 examiné »', () => {
    scan.mockReturnValue({
      accountsExamined: null,
      contactsExamined: null,
      pairsDetected: 0,
      alreadyKnown: 0,
      failed: false,
      skipped: 'demo',
      at: '2026-10-02T10:00:00.000Z',
    })
    renderPanel()
    expect(screen.getByText(/ne tourne pas sur un espace de démonstration/)).toBeInTheDocument()
    expect(screen.queryByText(/examinés/)).toBeNull()
  })
  // #3490 (recette Y22) — « 2 comptes archivés ou rattachés n'entrent pas dans la comparaison »
  // sans les NOMMER : on ne savait pas lesquels, ni pourquoi la paire SG manquait.
  describe('#3490 (Y22) — les comptes écartés se nomment', () => {
    const scanWithSetAside = (over: Record<string, unknown> = {}) => ({
      accountsExamined: 65,
      accountsSetAside: 2,
      contactsExamined: 140,
      pairsDetected: 0,
      alreadyKnown: 0,
      failed: false,
      at: '2026-10-03T10:00:00.000Z',
      setAsideAccounts: [
        { id: '8b25ec87', name: 'Societe Generale', status: 'archived' },
        { id: '99', name: 'Ancienne Filiale', status: 'merged' },
      ],
      setAsidePairs: [
        {
          left: { id: '0125b778', name: 'Société Générale', status: 'active' },
          right: { id: '8b25ec87', name: 'Societe Generale', status: 'archived' },
        },
      ],
      ...over,
    })

    it('liste chaque compte écarté : nom, statut, lien vers sa fiche', () => {
      scan.mockReturnValue(scanWithSetAside())
      renderPanel()
      const archived = screen.getByRole('link', { name: 'Societe Generale' })
      expect(archived).toHaveAttribute('href', '/accounts/8b25ec87')
      expect(screen.getByRole('link', { name: 'Ancienne Filiale' })).toHaveAttribute('href', '/accounts/99')
      expect(screen.getAllByText('archivé').length).toBeGreaterThan(0)
      expect(screen.getAllByText('rattaché').length).toBeGreaterThan(0)
    })

    it('dit qu’une paire est écartée parce que l’un des deux comptes est archivé, sans la proposer', () => {
      scan.mockReturnValue(scanWithSetAside())
      renderPanel()
      expect(
        screen.getByText(/« Société Générale » \(actif\) et « Societe Generale » \(archivé\).*pas proposée/),
      ).toBeInTheDocument()
      expect(screen.queryByText('J’ai fusionné')).toBeNull()
    })

    // #3490 — le geste qui manquait : la recette demandait « désarchiver la fiche
    // SG » et aucun bouton ne le faisait depuis l'endroit qui nomme le compte.
    it('un compte ARCHIVÉ se désarchive d’ici ; un compte rattaché non (son retour passe par sa fiche)', () => {
      scan.mockReturnValue(scanWithSetAside())
      renderPanel()
      const buttons = screen.getAllByRole('button', { name: 'Désarchiver' })
      expect(buttons).toHaveLength(1)
      fireEvent.click(buttons[0]!)
      expect(restore).toHaveBeenCalledWith('8b25ec87')
    })

    it('SAIT DIRE NON : aucun compte archivé, aucun bouton « Désarchiver »', () => {
      scan.mockReturnValue(
        scanWithSetAside({ setAsideAccounts: [{ id: '99', name: 'Ancienne Filiale', status: 'merged' }] }),
      )
      renderPanel()
      expect(screen.queryByRole('button', { name: 'Désarchiver' })).toBeNull()
    })

    it('SAIT DIRE NON : aucun compte écarté, aucune liste ni titre', () => {
      scan.mockReturnValue(scanWithSetAside({ accountsSetAside: 0, setAsideAccounts: [], setAsidePairs: [] }))
      renderPanel()
      expect(screen.queryByText('Comptes laissés de côté')).toBeNull()
      expect(screen.queryByText(/pas proposée/)).toBeNull()
    })

    it('un rapport antérieur au champ (absent) n’écrit rien de plus', () => {
      scan.mockReturnValue(scanWithSetAside({ setAsideAccounts: undefined, setAsidePairs: undefined }))
      renderPanel()
      expect(screen.queryByText('Comptes laissés de côté')).toBeNull()
    })
  })
})

function merged(over: Partial<AutoMergedPairView> = {}): AutoMergedPairView {
  return {
    id: 'm1',
    entityType: 'contact',
    keptId: 'c1',
    keptLabel: 'Marie Dupont',
    absorbedId: 'c2',
    absorbedLabel: 'Marie Dupont (import)',
    reason: 'Même adresse et même nom',
    confidence: 0.99,
    mergedAt: '2026-10-11T05:40:00.000Z',
    ...over,
  }
}

describe('#4016 L6 — DuplicatesPanel : les fusions automatiques se LISENT et s’ANNULENT', () => {
  beforeEach(() => {
    duplicates.mockReturnValue({ data: [], isError: false })
    scan.mockReturnValue(null)
    autoMerged.mockReset()
    undoMerge.mockReset()
  })

  it('nomme la fiche absorbée, celle qui reste, et la raison', () => {
    autoMerged.mockReturnValue({ data: [merged()], isError: false })
    renderPanel()
    expect(screen.getByText('Fusionnés par Bellum')).toBeInTheDocument()
    expect(screen.getByText(/« Marie Dupont \(import\) » a rejoint « Marie Dupont »/)).toBeInTheDocument()
    expect(screen.getByText(/Même adresse et même nom/)).toBeInTheDocument()
  })

  // R22 /briefing — « Camille Roussel a rejoint Camille Roussel » : un doublon porte, par définition, le MÊME nom.
  it('un doublon de même nom se dit « doublon fusionné dans la fiche gardée », jamais « X a rejoint X »', () => {
    autoMerged.mockReturnValue({
      data: [merged({ absorbedLabel: 'Camille Roussel', keptLabel: 'Camille Roussel' })],
      isError: false,
    })
    renderPanel()
    expect(screen.queryByText(/a rejoint/)).toBeNull()
    expect(screen.getByText(/« Camille Roussel » \(doublon\) a été fusionné dans la fiche gardée/)).toBeInTheDocument()
  })

  it('« Annuler la fusion » appelle l’annulation de CETTE fusion', () => {
    autoMerged.mockReturnValue({ data: [merged()], isError: false })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler la fusion' }))
    expect(undoMerge).toHaveBeenCalledWith('m1')
  })

  it('SAIT DIRE NON — aucune fusion automatique : ni titre, ni bouton', () => {
    autoMerged.mockReturnValue({ data: [], isError: false })
    renderPanel()
    expect(screen.queryByText('Fusionnés par Bellum')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Annuler la fusion' })).toBeNull()
  })
})

// #4600 / #4471 — la liste nomme CE QU'ELLE rapproche, et dit ce que le balayage a examiné même quand des paires restent.
describe('DuplicatesPanel — type de chaque paire et périmètre examiné (#4600, #4471)', () => {
  const scanOf = (over: Record<string, unknown> = {}) => ({
    accountsExamined: 15000,
    contactsExamined: 4200,
    pairsDetected: 2,
    alreadyKnown: 0,
    failed: false,
    at: '2026-10-27T05:40:00Z',
    ...over,
  })

  it('étiquette une paire de comptes « Compte » et une paire de contacts « Contact »', () => {
    scan.mockReturnValue(scanOf())
    autoMerged.mockReturnValue({ data: [], isError: false })
    duplicates.mockReturnValue({
      data: [pair({ id: 'a', entityType: 'account' }), pair({ id: 'b', entityType: 'contact' })],
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getAllByText('Compte')).toHaveLength(1)
    expect(screen.getAllByText('Contact')).toHaveLength(1)
  })

  it('nomme le périmètre examiné sous la liste', () => {
    scan.mockReturnValue(scanOf())
    autoMerged.mockReturnValue({ data: [], isError: false })
    duplicates.mockReturnValue({ data: [pair()], isLoading: false, isError: false })
    renderPanel()
    expect(screen.getByText(/15000 comptes et 4200 contacts examinés/)).toBeTruthy()
  })

  it('un périmètre non mesuré ne s’écrit pas « 0 » — aucune ligne', () => {
    scan.mockReturnValue(scanOf({ contactsExamined: null }))
    autoMerged.mockReturnValue({ data: [], isError: false })
    duplicates.mockReturnValue({ data: [pair()], isLoading: false, isError: false })
    renderPanel()
    expect(screen.queryByText(/examinés/)).toBeNull()
  })
})
