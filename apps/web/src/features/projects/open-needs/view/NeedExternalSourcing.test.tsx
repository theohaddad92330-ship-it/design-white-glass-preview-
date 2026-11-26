import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type {
  ExternalSourcingCandidate,
  ExternalSourcingPartnerBrief,
  ExternalSourcingSearchResult,
} from '@bellum/contracts'

/**
 * « CHERCHER HORS VIVIER » (#2818). Ce fichier garde :
 *
 *  1. **la recherche est un GESTE** — rien n'est interrogé avant le clic
 *     (`enabled: false`), contrairement à `NeedReverseProspects` qui se charge
 *     seule.
 *  2. **jamais un score** — les compétences PARTAGÉES sont nommées, jamais un
 *     pourcentage.
 *  3. **jamais un import sans consentement** — le bouton de confirmation reste
 *     désactivé tant que la case n'est pas cochée, et `mutateAsync` n'est
 *     JAMAIS appelée sans elle (le test qui dit NON).
 *  4. **AVANT LANCEMENT** (#2818, lot T4) — besoin/critères/sources/coût/
 *     volume/délai/consentement/dédup affichés AVANT le clic.
 *  5. **CONNECTEURS ABSENTS** (#2818, lot T4) — jamais « Rechercher sur
 *     LinkedIn » ; « importer les résultats » ouvre la TROISIÈME PORTE déjà
 *     réelle (`onImportResult`), jamais une seconde porte inventée.
 *  6. **le brief partenaire se PRÉPARE, il ne s'envoie jamais** (doctrine).
 */

const search = vi.fn()
const mutateAsync = vi.fn()
const partnerBriefs = vi.fn()
const prepareBrief = vi.fn()
const recordFeedback = vi.fn()
vi.mock('../hooks/useExternalSourcing', () => ({
  useExternalSourcingSearch: (needId: string, enabled: boolean, maxPerSource?: number) =>
    search(needId, enabled, maxPerSource),
  useImportExternalSourcingCandidate: () => ({ mutateAsync, isPending: false, isSuccess: false, data: undefined }),
  useExternalSourcingPartnerBriefs: () => partnerBriefs(),
  useExternalSourcingPreparePartnerBrief: () => ({ mutateAsync: prepareBrief, isPending: false }),
  useExternalSourcingRecordPartnerBriefFeedback: () => ({ mutateAsync: recordFeedback, isPending: false }),
}))

const { NeedExternalSourcing } = await import('./NeedExternalSourcing')

function result(over: Partial<ExternalSourcingSearchResult> = {}): ExternalSourcingSearchResult {
  return {
    needId: 'n-1',
    skillTerms: ['Kubernetes'],
    unavailableReason: null,
    candidates: [],
    notConnected: [],
    unanswered: [],
    ...over,
  }
}

function candidate(over: Partial<ExternalSourcingCandidate> = {}): ExternalSourcingCandidate {
  return {
    id: 'c-1',
    fullName: 'Karim Belkacem',
    title: 'Ingénieur infrastructure',
    sourceKind: 'partner_bench',
    sharedSkills: ['Kubernetes'],
    limits: ['partner_availability_unconfirmed'],
    ...over,
  }
}

function brief(over: Partial<ExternalSourcingPartnerBrief> = {}): ExternalSourcingPartnerBrief {
  return {
    id: 'b-1',
    needId: 'n-1',
    partnerName: 'ESN Atlas',
    message: 'Besoin : Ingénieur DevOps Kubernetes\nCompétences recherchées : Kubernetes',
    conditions: null,
    delay: null,
    feedback: null,
    nonSolicitation: true,
    preparedAt: '2026-09-28T10:00:00.000Z',
    feedbackRecordedAt: null,
    ...over,
  }
}

const onImportResult = vi.fn()

function renderComponent(overSearch: Partial<ExternalSourcingSearchResult> | undefined = undefined) {
  return render(
    <NeedExternalSourcing
      needId="n-1"
      needTitle="Ingénieur DevOps Kubernetes"
      skillTerms={['Kubernetes']}
      headcount={2}
      onImportResult={onImportResult}
    />,
  )
}

async function clickLaunch() {
  await userEvent.click(screen.getByRole('button', { name: /Chercher hors vivier/ }))
}

beforeEach(() => {
  search.mockReset()
  mutateAsync.mockReset()
  onImportResult.mockReset()
  partnerBriefs.mockReset()
  prepareBrief.mockReset()
  recordFeedback.mockReset()
  mutateAsync.mockResolvedValue({ consultantId: 'c-1', imported: true })
  partnerBriefs.mockReturnValue({ data: [] })
})

describe('avant le clic', () => {
  it('montre le bouton, n’interroge PAS la recherche', () => {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderComponent()
    expect(screen.getByRole('button', { name: /Chercher hors vivier/ })).toBeInTheDocument()
    expect(search).toHaveBeenCalledWith('n-1', false, 20)
  })

  it('déclenche la recherche au clic — enabled passe à `true`', async () => {
    search.mockReturnValue({ data: undefined, isPending: true, isError: false })
    renderComponent()
    await clickLaunch()
    expect(search).toHaveBeenLastCalledWith('n-1', true, 20)
    expect(screen.getByText(/Je regarde ce que les sources connectées savent/)).toBeInTheDocument()
  })

  it('AVANT LANCEMENT : montre le besoin, les critères, les sources, le coût, le volume, le délai, le consentement, la déduplication', () => {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderComponent()
    const panel = screen.getByTestId('external-sourcing-pre-launch')
    expect(panel).toHaveTextContent('Ingénieur DevOps Kubernetes')
    expect(panel).toHaveTextContent('Kubernetes')
    expect(panel).toHaveTextContent('Partenaires autorisés')
    expect(panel).toHaveTextContent('gratuit')
    expect(panel).toHaveTextContent('20 profils')
    expect(panel).toHaveTextContent('Délai')
    expect(panel).toHaveTextContent('Consentement')
    expect(panel).toHaveTextContent('Déduplication')
  })

  it('#2190.1-.7 — l’ORDRE de recherche s’affiche en sept niveaux, dans l’ordre, sans nommer de fournisseur', () => {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderComponent()
    const items = screen.getAllByTestId(/^external-sourcing-tier-/)
    expect(items.map(item => item.getAttribute('data-testid'))).toEqual([
      'external-sourcing-tier-internal_pool',
      'external-sourcing-tier-dormant_profiles',
      'external-sourcing-tier-network',
      'external-sourcing-tier-authorized_partners',
      'external-sourcing-tier-connected_sources',
      'external-sourcing-tier-manual_import',
      'external-sourcing-tier-legal_public_search',
    ])
    expect(items[0]).toHaveTextContent('Vivier interne')
    expect(items[0]).toHaveTextContent('déjà ouvert')
    expect(items[2]).toHaveTextContent('Recommandations et réseau')
    expect(items[4]).toHaveTextContent('Sources externes connectées')
    expect(items[6]).toHaveTextContent('Recherche publique légale')
    expect(screen.getByTestId('external-sourcing-pre-launch').textContent?.toLowerCase()).not.toContain('apollo')
  })

  it('#2190.12 — le volume par source est RÉGLABLE, borné, et voyage jusqu’à la recherche lancée', async () => {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderComponent()
    const volumeInput = screen.getByLabelText(/Profils par source/)

    await userEvent.clear(volumeInput)
    await userEvent.type(volumeInput, '10')
    expect(screen.getByTestId('external-sourcing-pre-launch')).toHaveTextContent('10 profils')

    // Une valeur hors bornes est ramenée à la borne PUBLIÉE une fois la
    // saisie terminée — jamais un plafond silencieusement différent de ce
    // que l'écran annonce.
    await userEvent.clear(volumeInput)
    await userEvent.type(volumeInput, '9999')
    await userEvent.tab()
    expect(screen.getByTestId('external-sourcing-pre-launch')).toHaveTextContent('50 profils')

    await clickLaunch()
    expect(search).toHaveBeenLastCalledWith('n-1', true, 50)
  })
})

describe('une lecture cassée', () => {
  it('ne rend RIEN d’autre que la carte après le clic', async () => {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderComponent()
    search.mockReturnValue({ data: undefined, isPending: false, isError: true })
    await clickLaunch()
    expect(screen.queryByTestId('need-external-sourcing')).toBeInTheDocument()
    expect(screen.queryByText(/Aucune piste/)).not.toBeInTheDocument()
  })
})

describe('le croisement ne peut PAS tourner', () => {
  it('le DIT — jamais une liste au hasard', async () => {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderComponent()
    search.mockReturnValue({
      data: result({ skillTerms: [], unavailableReason: 'skills_missing' }),
      isPending: false,
      isError: false,
    })
    await clickLaunch()
    expect(screen.getByText(/Aucune compétence n’a été typée/)).toBeInTheDocument()
  })
})

describe('le croisement a tourné', () => {
  it('dit l’absence de piste — pas un échec', async () => {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderComponent()
    search.mockReturnValue({ data: result({ candidates: [] }), isPending: false, isError: false })
    await clickLaunch()
    expect(screen.getByText(/Aucune piste dans les sources déjà connectées/)).toBeInTheDocument()
  })

  it('nomme la source non branchée, jamais un silence', async () => {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderComponent()
    search.mockReturnValue({
      data: result({ candidates: [], notConnected: ['external_directory'] }),
      isPending: false,
      isError: false,
    })
    await clickLaunch()
    expect(screen.getByText(/n’est pas encore branchée/)).toBeInTheDocument()
  })

  it('montre un candidat : nom, source, compétences PARTAGÉES, statut de consentement, coût — jamais un score', async () => {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderComponent()
    search.mockReturnValue({ data: result({ candidates: [candidate()] }), isPending: false, isError: false })
    await clickLaunch()
    expect(screen.getByText('Karim Belkacem')).toBeInTheDocument()
    expect(screen.getByText('Banc partenaire')).toBeInTheDocument()
    expect(screen.getByText(/Compétence commune.*Kubernetes/)).toBeInTheDocument()
    expect(screen.getByText(/Disponibilité non confirmée par le partenaire/)).toBeInTheDocument()
    expect(screen.getByText(/Consentement : à recueillir avant import/)).toBeInTheDocument()
    expect(screen.getByText(/Coût : gratuit/)).toBeInTheDocument()
    expect(screen.queryByText(/%|score/i)).not.toBeInTheDocument()
  })
})

describe('l’import — jamais sans consentement', () => {
  async function renderWithOneCandidate() {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderComponent()
    search.mockReturnValue({ data: result({ candidates: [candidate()] }), isPending: false, isError: false })
    await clickLaunch()
    await userEvent.click(screen.getByRole('button', { name: /Importer vers le vivier/ }))
  }

  it('dit NON — le bouton de confirmation refuse tant que la case n’est pas cochée', async () => {
    await renderWithOneCandidate()
    const confirm = screen.getByRole('button', { name: /Confirmer l’import/ })
    expect(confirm).toBeDisabled()
    await userEvent.click(confirm)
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('importe UNE FOIS la case cochée et le clic confirmé', async () => {
    await renderWithOneCandidate()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /Confirmer l’import/ }))
    expect(mutateAsync).toHaveBeenCalledWith({ consultantId: 'c-1', sourceKind: 'partner_bench' })
  })
})

describe('#2190.5 / #2190.7 — l’annuaire externe', () => {
  const directory = candidate({
    id: 'external_directory:p1',
    fullName: 'Camille D.',
    title: 'Kubernetes Platform Engineer',
    sourceKind: 'external_directory',
    limits: ['not_yet_qualified', 'skills_not_provided'],
  })

  it('montre le profil (nom, poste, compétences), sa source SANS nom de fournisseur, et ce qui manque', async () => {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderComponent()
    search.mockReturnValue({ data: result({ candidates: [directory] }), isPending: false, isError: false })
    await clickLaunch()

    expect(screen.getByText('Camille D.')).toBeInTheDocument()
    expect(screen.getByText('Kubernetes Platform Engineer')).toBeInTheDocument()
    expect(screen.getByText('Annuaire externe')).toBeInTheDocument()
    expect(screen.getByText(/Compétences non fournies par la source/)).toBeInTheDocument()
    expect(document.body.textContent?.toLowerCase()).not.toContain('apollo')
  })

  it('importer CRÉE la fiche avec ce qui était affiché — après consentement seulement', async () => {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderComponent()
    search.mockReturnValue({ data: result({ candidates: [directory] }), isPending: false, isError: false })
    await clickLaunch()
    await userEvent.click(screen.getByRole('button', { name: /Importer vers le vivier/ }))
    expect(screen.getByRole('button', { name: /Confirmer l’import/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /Confirmer l’import/ }))

    expect(mutateAsync).toHaveBeenCalledWith({
      sourceKind: 'external_directory',
      externalProfile: {
        ref: 'external_directory:p1',
        fullName: 'Camille D.',
        title: 'Kubernetes Platform Engineer',
        skills: ['Kubernetes'],
      },
    })
  })

  it('une source sans réponse est NOMMÉE : l’absence n’y devient pas « personne »', async () => {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderComponent()
    search.mockReturnValue({
      data: result({ unanswered: ['external_directory'] }),
      isPending: false,
      isError: false,
    })
    await clickLaunch()

    expect(screen.getByText(/n’a pas répondu à temps/)).toBeInTheDocument()
  })
})

describe('CONNECTEURS ABSENTS — jamais « Rechercher sur LinkedIn »', () => {
  beforeEach(() => {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
  })

  it('ne montre jamais un bouton "Rechercher sur LinkedIn"', () => {
    renderComponent()
    expect(screen.queryByText(/Rechercher sur LinkedIn/i)).not.toBeInTheDocument()
  })

  it('« préparer une requête Sales Navigator » compose une requête et ne fait AUCUN appel serveur', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderComponent()
    await userEvent.click(screen.getByRole('button', { name: /Préparer une requête Sales Navigator/ }))
    expect(screen.getByTestId('sales-navigator-query')).toHaveTextContent('Kubernetes')
    await userEvent.click(screen.getByRole('button', { name: /Copier la requête/ }))
    expect(writeText).toHaveBeenCalledWith('Kubernetes')
  })

  it('« importer les résultats » ouvre la TROISIÈME PORTE déjà réelle — jamais un nouvel appel serveur', async () => {
    renderComponent()
    await userEvent.click(screen.getByRole('button', { name: /Importer les résultats/ }))
    expect(onImportResult).toHaveBeenCalledTimes(1)
  })
})

describe('circuit partenaire — le brief se PRÉPARE, il ne s’envoie jamais', () => {
  beforeEach(() => {
    search.mockReturnValue({ data: undefined, isPending: false, isError: false })
  })

  it('exige un nom de partenaire avant de préparer', async () => {
    renderComponent()
    await userEvent.click(screen.getByRole('button', { name: /Partager le brief à un partenaire/ }))
    expect(screen.getByRole('button', { name: /^Préparer le brief$/ })).toBeDisabled()
  })

  it('prépare le brief — jamais un statut « envoyé »', async () => {
    prepareBrief.mockResolvedValue(brief())
    renderComponent()
    await userEvent.click(screen.getByRole('button', { name: /Partager le brief à un partenaire/ }))
    await userEvent.type(screen.getByLabelText(/Nom du partenaire/), 'ESN Atlas')
    await userEvent.click(screen.getByRole('button', { name: /^Préparer le brief$/ }))
    expect(prepareBrief).toHaveBeenCalledWith({ partnerName: 'ESN Atlas', conditions: undefined, delay: undefined })
    expect(screen.queryByText(/envoyé/i)).not.toBeInTheDocument()
  })

  it('affiche un brief déjà préparé avec sa clause de non-sollicitation, jamais un « fait » sans preuve', () => {
    partnerBriefs.mockReturnValue({ data: [brief()] })
    renderComponent()
    expect(screen.getByTestId('partner-brief-b-1')).toHaveTextContent('ESN Atlas')
    expect(screen.getByText(/Clause de non-sollicitation incluse/)).toBeInTheDocument()
    expect(screen.getByText(/prépare ce brief, il ne l’envoie jamais/)).toBeInTheDocument()
  })

  it('enregistre le retour du partenaire — saisi par un humain', async () => {
    partnerBriefs.mockReturnValue({ data: [brief()] })
    recordFeedback.mockResolvedValue(brief({ feedback: 'Deux profils proposés' }))
    renderComponent()
    await userEvent.type(screen.getByLabelText(/Retour du partenaire/), 'Deux profils proposés')
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer le retour/ }))
    expect(recordFeedback).toHaveBeenCalledWith({ briefId: 'b-1', feedback: 'Deux profils proposés' })
  })
})
