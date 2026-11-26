import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { MatchExplanation } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { MatchExplainSheet } from './MatchExplainSheet'

/**
 * Le document d'explication, LU À L'ÉCRAN.
 *
 * Le docblock de la route le dit lui-même : « "exportable" veut dire qu'on peut
 * le remettre à quelqu'un, pas qu'on peut le lire à l'écran ». Le rendu, le
 * schéma et la route existaient ; le seul geste de l'application était un
 * téléchargement de fichier. Ces tests vérifient ce qu'un utilisateur VOIT.
 *
 * ⚠️ L'invariant qui compte le plus n'est pas visuel : le document ne porte la
 * donnée d'AUCUN autre candidat. C'est ce qui permet de le remettre à la
 * personne concernée. Il est testé côté serveur ; il se casse côté écran le
 * jour où quelqu'un passe le `run` au panneau « pour avoir le contexte ».
 */

const apiFetchMock = vi.mocked(apiFetch)

const NEED_ID = '11111111-1111-4111-8111-111111111111'
const RUN_ID = '44444444-4444-4444-8444-444444444444'
const SOPHIE = 'a0000000-0000-4000-8000-000000000001'
/** L'autre candidat du même classement — il ne doit apparaître NULLE PART. */
const PIERRE = 'a0000000-0000-4000-8000-000000000002'

const EXPLANATION: MatchExplanation = {
  runId: RUN_ID,
  runAt: '2026-09-01T10:00:00.000Z',
  role: 'Data Engineer',
  accountName: 'EDF DSI',
  weights: {
    must_have: 25,
    nice_to_have: 8,
    seniority: 10,
    sector: 8,
    environment: 7,
    language: 5,
    location: 8,
    availability: 12,
    contract_status: 4,
    rate: 7,
    evidence_quality: 4,
    client_constraints: 2,
    risks: 5,
    client_history: 3,
    comparable_experience: 0,
  },
  threshold: 60,
  consultantId: SOPHIE,
  correspondenceScore: 84,
  pushableScore: 71,
  bucket: 'recommended',
  axes: [
    { axis: 'must_have', score: 90, weight: 25, detail: 'Spark prouvé sur deux missions', evidence: [] },
    { axis: 'language', score: null, weight: 5, detail: 'aucune langue saisie', evidence: [] },
  ],
  exclusions: [{ reason: 'consent_expired', severity: 'warning', detail: 'consentement à revalider' }],
  gaps: ['Aucune date de disponibilité'],
  questionsToValidate: ['Confirmer la mobilité sur Lyon'],
}

function mount(open = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MatchExplainSheet
        needId={NEED_ID}
        runId={RUN_ID}
        consultantId={SOPHIE}
        name="Sophie M."
        open={open}
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  )
}

describe('le panneau d’explication d’un classement', () => {
  beforeEach(() => {
    cleanup()
    apiFetchMock.mockReset()
    apiFetchMock.mockResolvedValue(EXPLANATION)
  })

  it('lit l’explication par la route prévue, pour CETTE personne seulement', async () => {
    mount()
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: `/needs/${NEED_ID}/match/explain?runId=${RUN_ID}&consultantId=${SOPHIE}`,
      }),
    )
  })

  it('affiche le seuil, la pondération, les axes, les motifs, les écarts et les questions', async () => {
    mount()
    // Le seuil et la date : sans eux, une explication n'est pas reproductible.
    expect(await screen.findByText(/Seuil de recommandation/)).toBeTruthy()
    expect(screen.getByText(/Data Engineer/)).toBeTruthy()
    // Un axe, son POIDS et son détail — les poids sont réglables par espace,
    // une explication qui tairait les siens n'expliquerait rien.
    expect(screen.getByText('Compétences obligatoires')).toBeTruthy()
    expect(screen.getByText(/Spark prouvé sur deux missions/)).toBeTruthy()
    expect(screen.getByText(/25/)).toBeTruthy()
    // Les motifs, les écarts, les questions.
    expect(screen.getByText(/consentement à revalider/)).toBeTruthy()
    expect(screen.getByText('Aucune date de disponibilité')).toBeTruthy()
    expect(screen.getByText('Confirmer la mobilité sur Lyon')).toBeTruthy()
  })

  it('nomme l’axe non évaluable — il ne vaut PAS zéro', async () => {
    mount()
    expect(await screen.findByText(/Non évaluable : Langue/)).toBeTruthy()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('non évaluable')
    // « aucune langue saisie » dit quoi compléter ; « 0 » dirait « vous avez
    // zéro », ce qui est faux et ne se corrige pas.
    expect(dialog.textContent).toContain('aucune langue saisie')
  })

  it('porte le bandeau de transparence — un écran qui classe le DIT', async () => {
    mount()
    await screen.findByText('Compétences obligatoires')
    const note = document.querySelector('[role="note"]')
    expect(note).toBeTruthy()
    // Non masquable : ni croix, ni « ne plus afficher ».
    expect(note?.querySelector('button')).toBeNull()
  })

  it('ne porte la donnée d’AUCUN autre candidat', async () => {
    mount()
    await screen.findByText('Compétences obligatoires')
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('Sophie M.')
    expect(dialog.textContent).not.toContain('Pierre L.')
    expect(dialog.textContent).not.toContain(PIERRE)
    // Un seul appel, pour un seul identifiant : le panneau ne peut pas
    // rapatrier le classement entier « pour avoir le contexte ».
    for (const call of apiFetchMock.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(PIERRE)
    }
  })

  it('remet le document téléchargeable — par le client authentifié', async () => {
    mount()
    const button = await screen.findByRole('button', { name: /Télécharger le document/ })

    // L'ancre est créée AVANT l'espion, sinon elle passerait par lui.
    const anchor = document.createElement('a')
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => {})
    const realCreate = document.createElement.bind(document)
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockImplementation(tag => (tag === 'a' ? anchor : realCreate(tag)))
    URL.createObjectURL = vi.fn(() => 'blob:explication') as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL

    apiFetchMock.mockResolvedValueOnce('# Explication')
    fireEvent.click(button)

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: `/needs/${NEED_ID}/match/explain?runId=${RUN_ID}&consultantId=${SOPHIE}&format=md`,
        responseType: 'text',
      }),
    )
    // Une balise `<a href>` nue partirait sans session : le fichier arrive par
    // le client authentifié, puis il est remis au navigateur.
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(anchor.download).toBe(`classement-${SOPHIE}.md`)
    createElement.mockRestore()
  })

  it('n’a AUCUN moyen de porter la donnée d’un autre candidat', () => {
    // ⚠️ Le test au-dessus ne prouve pas grand-chose à lui seul : la réponse
    // simulée ne contient qu'une personne, donc il resterait vert même si le
    // composant affichait le classement entier. Celui-ci lit la SOURCE et
    // tombe le jour où quelqu'un passe le `run` au panneau « pour situer le
    // profil » — un rang, un « mieux classé que », un bloc « écartés ».
    const source = readFileSync(join(__dirname, 'MatchExplainSheet.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    for (const leak of ['identities', 'recommended', 'borderline', 'excluded', 'notEvaluable', 'MatchRun']) {
      expect(source.includes(leak), `le panneau touche à « ${leak} »`).toBe(false)
    }
    // …et la garde LIT bien quelque chose : sans cela elle serait verte sur un
    // fichier vide ou renommé.
    expect(source).toContain('MatchExplanation')
  })

  it('dit qu’il rassemble l’explication plutôt que d’afficher un panneau vide', async () => {
    apiFetchMock.mockReset()
    apiFetchMock.mockReturnValue(new Promise(() => {}))
    mount()
    expect(await screen.findByText(/Je rassemble l’explication/)).toBeTruthy()
  })

  it('ne demande rien tant que personne n’a ouvert le panneau', () => {
    mount(false)
    expect(apiFetchMock).not.toHaveBeenCalled()
  })
})
