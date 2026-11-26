import type { ExpenseReportDetailView } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const detail = vi.fn()
const validate = vi.fn()
const reject = vi.fn()
/** L'ouverture d'un justificatif (31/08/2026) : elle demande l'URL signée au
 *  CLIC, elle ne la fabrique pas d'avance. */
const openAttachment = vi.fn()
const upload = vi.fn()

const submit = vi.fn()
const withdraw = vi.fn()

vi.mock('../api', () => ({
  useExpenseReportDetail: () => detail(),
  useValidateExpenseReport: () => ({ mutate: validate, isPending: false }),
  useRejectExpenseReport: () => ({ mutate: reject, isPending: false }),
  useOpenAttachment: () => ({ mutate: openAttachment, isPending: false }),
  useUploadAttachment: () => ({ mutateAsync: upload, isPending: false }),
  // Les deux gestes du DÉPOSANT (31/08/2026) : soumettre son brouillon, ou
  // retirer une note envoyée par erreur.
  useSubmitExpenseReport: () => ({ mutate: submit, isPending: false }),
  useWithdrawExpenseReport: () => ({ mutate: withdraw, isPending: false }),
}))

const { ExpenseReportDrawer } = await import('./ExpenseReportDrawer')

function report(over: Partial<ExpenseReportDetailView> = {}): ExpenseReportDetailView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    reference: 'F-2026-006',
    bearerName: 'Inès Kaczmarek',
    accountName: 'DINUM',
    missionId: '22222222-2222-4222-8222-222222222222',
    missionLabel: 'Fiabilisation plateforme',
    periodMonth: '2026-05',
    status: 'pending',
    lineCount: 1,
    totalAmountCents: 1850,
    submittedAt: '2026-06-02T09:00:00.000Z',
    accountId: '22222222-2222-4222-8222-222222222222',
    decidedAt: null,
    decidedByName: null,
    policyCheck: { verdict: 'compliant', overageCount: 0, unmeasuredLineCount: 0, worstOverage: null },
    rejectionReason: null,
    policyLabel: 'Barème interne — déplacements clients',
    reimbursementBasis: 'actual',
    anomalies: [],
    compliance: { verdict: 'compliant', unmeasuredLineCount: 0 },
    recoverableVatCents: 168,
    borneVatCents: 0,
    vatUnmeasuredLineCount: 0,
    lines: [
      {
        id: 'l1',
        category: 'meal',
        label: 'Repas – Déjeuner',
        spentOn: '2026-05-15',
        city: 'Paris',
        detail: null,
        amountCents: 1850,
        vatRateBps: 1000,
        recoverableVatCents: 168,
        capCents: 2500,
        overageCents: 0,
        // ⚠️ `null` et non 0 : un repas ne parcourt pas de kilomètres, et
        // « 0 km » serait une mesure — donc une mesure fausse.
        distanceKm: null,
        fiscalHorsepower: null,
      },
    ],
    attachments: [
      { id: 'a1', fileName: 'Facture_hotel.pdf', byteSize: 127000, downloadUrl: null, retentionUntil: '2036-05-14' },
    ],
    missionExpenseId: null,
    ...over,
  }
}

function answer(over: Record<string, unknown> = {}) {
  return { data: report(), isLoading: false, isError: false, ...over }
}

beforeEach(() => {
  cleanup()
  detail.mockReset()
  validate.mockReset()
  reject.mockReset()
  submit.mockReset()
  withdraw.mockReset()
})

describe('le tiroir d’une note de frais', () => {
  it('rend le dossier : porteur, client, période et montant', () => {
    detail.mockReturnValue(answer())
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.getByText('Inès Kaczmarek')).toBeInTheDocument()
    expect(screen.getAllByText('F-2026-006').length).toBeGreaterThan(0)
    expect(screen.getByText('Repas – Déjeuner')).toBeInTheDocument()
  })

  it('dit « aucune anomalie détectée » sur une note saine', () => {
    detail.mockReturnValue(answer())
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.getByText('Aucune anomalie détectée')).toBeInTheDocument()
    // Rien à déplier : proposer « Voir le détail » de rien fait cliquer pour rien.
    expect(screen.queryByRole('button', { name: 'Voir le détail' })).not.toBeInTheDocument()
  })

  it('ne montre les anomalies qu’à la demande, et les montre vraiment', async () => {
    detail.mockReturnValue(
      answer({ data: report({ anomalies: ['2 ligne(s) datée(s) hors de la période déclarée (2026-05).'] }) }),
    )
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.getByText('1 point à vérifier')).toBeInTheDocument()
    expect(screen.queryByText(/hors de la période déclarée/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Voir le détail' }))
    expect(screen.getByText(/hors de la période déclarée/)).toBeInTheDocument()
  })

  it('écrit « Non vérifiée » — jamais « Conforme » — quand le barème n’a pas tout couvert', () => {
    // LE défaut que ce test empêche : « Conforme » est ce qu'un valideur lit
    // pour NE PAS ouvrir les justificatifs. Le tirer d'un barème incomplet est
    // une garantie tirée d'un silence.
    // La ligne du fixture est elle aussi sans plafond : son verdict dit la même chose que l'encart.
    const base = report()
    detail.mockReturnValue(
      answer({
        data: report({
          compliance: { verdict: 'unknown', unmeasuredLineCount: 2 },
          lines: [
            { ...(base.lines[0] as ExpenseReportDetailView['lines'][number]), capCents: null, overageCents: null },
          ],
        }),
      }),
    )
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    // L'encart ET la ligne le disent : deux endroits, un seul verdict.
    expect(screen.getAllByText('Non vérifiée')).toHaveLength(2)
    expect(screen.queryByText('Conforme')).not.toBeInTheDocument()
    // Et ce qui n'a pas pu être évalué est NOMMÉ, sinon le verdict est ignoré.
    expect(screen.getByText('2 lignes n’ont pas pu être comparées à un plafond.')).toBeInTheDocument()
  })

  it('dit qu’aucun barème n’existe plutôt que de laisser l’encart muet', () => {
    detail.mockReturnValue(
      answer({
        data: report({
          policyLabel: null,
          reimbursementBasis: null,
          compliance: { verdict: 'unknown', unmeasuredLineCount: 1 },
        }),
      }),
    )
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.getByText(/Aucun barème n’est défini pour ce client/)).toBeInTheDocument()
  })

  it('n’offre AUCUN téléchargement quand la pièce n’est pas stockée', () => {
    // Un bouton qui ne télécharge rien est une donnée fictive sous forme
    // d'affordance : on le découvre en réunion, pas en CI.
    detail.mockReturnValue(answer())
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.getByText('Enregistrée, non téléchargeable ici')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Télécharger/ })).not.toBeInTheDocument()
    expect(screen.getByText('À conserver jusqu’au 2036-05-14')).toBeInTheDocument()
  })

  it('OUVRE la pièce rangée — et demande l’URL signée au clic, pas d’avance', async () => {
    // 31/08/2026 — le stockage existe : la condition du bouton est la
    // DÉTENTION des octets, que `downloadUrl` porte.
    detail.mockReturnValue(
      answer({
        data: report({
          attachments: [
            {
              id: 'a1',
              fileName: 'Facture_hotel.pdf',
              byteSize: 127000,
              downloadUrl: '/expenses/reports/r1/attachments/a1/download',
              retentionUntil: '2036-05-14',
            },
          ],
        }),
      }),
    )
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => {}} />)

    // Un BOUTON, pas un lien : la cible est la porte de l'API, pas le fichier.
    const button = screen.getByRole('button', { name: /Télécharger Facture_hotel.pdf/ })
    expect(screen.queryByText('Enregistrée, non téléchargeable ici')).not.toBeInTheDocument()
    // Rien n'a été demandé tant que personne n'a cliqué : une URL signée vit
    // cinq minutes, la fabriquer d'avance la ferait périr dans le tiroir.
    expect(openAttachment).not.toHaveBeenCalled()

    await userEvent.click(button)
    expect(openAttachment).toHaveBeenCalledWith('/expenses/reports/r1/attachments/a1/download')
  })

  it('offre le dépôt sur une note EN ATTENTE, et le retire sur une note décidée', () => {
    detail.mockReturnValue(answer())
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => {}} />)
    expect(screen.getByRole('button', { name: 'Choisir un fichier' })).toBeInTheDocument()

    cleanup()
    // Les justificatifs sont ce sur quoi la décision s'est prise : en ajouter
    // après coup rendrait illisible « sur quoi cette note a-t-elle été validée ? ».
    detail.mockReturnValue(answer({ data: report({ status: 'validated', decidedAt: '2026-06-03T09:00:00.000Z' }) }))
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Choisir un fichier' })).not.toBeInTheDocument()
  })

  it('écrit « non mesuré » — jamais « 0 KB » — sur un justificatif sans poids', () => {
    detail.mockReturnValue(
      answer({
        data: report({
          attachments: [
            { id: 'a1', fileName: 'Recu.jpg', byteSize: null, downloadUrl: null, retentionUntil: '2036-05-14' },
          ],
        }),
      }),
    )
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.queryByText('0 B')).not.toBeInTheDocument()
    expect(screen.queryByText('0 KB')).not.toBeInTheDocument()
  })

  it('refuse de partir sans motif, puis part avec', async () => {
    detail.mockReturnValue(answer())
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    await userEvent.click(screen.getByRole('button', { name: 'Refuser avec un motif' }))
    const confirm = screen.getByRole('button', { name: 'Confirmer le refus' })
    // Le serveur ET la base exigent le motif ; ceci évite l'aller-retour en 400,
    // qui fait recliquer.
    expect(confirm).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Motif du refus'), 'Justificatif illisible')
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    expect(reject).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Justificatif illisible' }),
      expect.anything(),
    )
  })

  it('annonce le lien avec le coût de la mission — avant et après la validation', () => {
    detail.mockReturnValue(answer())
    const { unmount } = render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)
    expect(screen.getByText(/entreront dans le coût de la mission/)).toBeInTheDocument()
    unmount()

    detail.mockReturnValue(answer({ data: report({ status: 'validated', missionExpenseId: 'me1' }) }))
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)
    expect(screen.getByText(/sont entrés dans le coût de la mission/)).toBeInTheDocument()
  })

  it('ne propose aucune décision sur une note déjà décidée', () => {
    detail.mockReturnValue(answer({ data: report({ status: 'validated' }) }))
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.queryByRole('button', { name: 'Valider la note' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refuser avec un motif' })).not.toBeInTheDocument()
  })

  it('un échec de lecture ne se rend pas comme un dossier vide', () => {
    detail.mockReturnValue(answer({ data: undefined, isError: true }))
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.getByText('Ce dossier n’a pas pu être ouvert')).toBeInTheDocument()
  })
})

describe('le tiroir d’un BROUILLON (31/08/2026)', () => {
  it('ne propose NI valider NI refuser — personne ne l’a déposé', () => {
    // Valider un brouillon prendrait une décision sur une demande qui n'a pas
    // été faite. Les deux seuls gestes ici sont ceux du déposant.
    detail.mockReturnValue(answer({ data: report({ status: 'draft', submittedAt: null }) }))
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.queryByRole('button', { name: 'Valider la note' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refuser avec un motif' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Soumettre' })).toBeInTheDocument()
  })

  it('n’est PAS un cul-de-sac : un brouillon garde ses deux gestes', () => {
    // Le défaut évité : `status !== 'pending'` rangeait le brouillon parmi les
    // notes décidées et faisait disparaître tout bouton.
    detail.mockReturnValue(answer({ data: report({ status: 'draft', submittedAt: null }) }))
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.getByText('Cette note n’est pas encore déposée — complète-la, puis soumets-la.')).toBeInTheDocument()
  })

  it('soumet le brouillon quand on le lui demande', async () => {
    detail.mockReturnValue(answer({ data: report({ status: 'draft', submittedAt: null }) }))
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    await userEvent.click(screen.getByRole('button', { name: 'Soumettre' }))
    expect(submit).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', expect.anything())
  })

  it('une note EN ATTENTE se corrige et se retire', async () => {
    // Une note soumise par erreur sans autre issue qu'un refus obligerait
    // quelqu'un d'autre à écrire un motif pour une faute de frappe.
    const edited: string[] = []
    detail.mockReturnValue(answer())
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={id => edited.push(id)} />)

    await userEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    expect(edited).toEqual(['11111111-1111-4111-8111-111111111111'])

    await userEvent.click(screen.getByRole('button', { name: 'Retirer' }))
    expect(withdraw).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', expect.anything())
  })

  it('une note DÉCIDÉE n’offre ni correction ni retrait', () => {
    detail.mockReturnValue(answer({ data: report({ status: 'validated', decidedAt: '2026-06-05T09:00:00.000Z' }) }))
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument()
  })

  it('NOMME le trajet d’une ligne kilométrique, pour que le plafond s’explique', () => {
    // Sans lui, un plafond de 108 € sur une ligne à 132 € ressemblerait à un
    // forfait arbitraire.
    detail.mockReturnValue(
      answer({
        data: report({
          lines: [
            {
              id: 'l9',
              category: 'mileage',
              label: 'Trajet client',
              spentOn: '2026-05-06',
              city: 'Rouen',
              detail: null,
              amountCents: 13200,
              vatRateBps: null,
              recoverableVatCents: null,
              capCents: 10800,
              overageCents: 2400,
              distanceKm: 180,
              fiscalHorsepower: 5,
            },
          ],
        }),
      }),
    )
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.getByText('180 km · 5 CV')).toBeInTheDocument()
  })
})

describe('Théo C missions-notes-de-frais.N6 — le tiroir dans la grammaire de Théo', () => {
  it('place l’« Action recommandée » EN TÊTE du dossier, avant les chiffres et les lignes', () => {
    detail.mockReturnValue(answer())
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    const recommended = screen.getByText('Action recommandée')
    const firstLine = screen.getByText('Repas – Déjeuner')
    expect(recommended.compareDocumentPosition(firstLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const periodFigure = screen.getByText('Période')
    expect(recommended.compareDocumentPosition(periodFigure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('chaque ligne dit son verdict : « Conforme » quand elle tient dans le plafond', () => {
    detail.mockReturnValue(answer())
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.getByTestId('line-verdict-l1')).toHaveTextContent('Conforme')
  })

  it('chaque ligne dit son verdict : le dépassement est nommé avec son montant', () => {
    const base = report()
    detail.mockReturnValue(
      answer({
        data: report({
          lines: [
            {
              ...(base.lines[0] as ExpenseReportDetailView['lines'][number]),
              amountCents: 7800,
              capCents: 5000,
              overageCents: 2800,
            },
          ],
        }),
      }),
    )
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.getByTestId('line-verdict-l1')).toHaveTextContent(/Dépasse de 28\s?€/)
  })

  it('une ligne sans plafond est « Non vérifiée » — jamais « Conforme »', () => {
    const base = report()
    detail.mockReturnValue(
      answer({
        data: report({
          lines: [
            { ...(base.lines[0] as ExpenseReportDetailView['lines'][number]), capCents: null, overageCents: null },
          ],
        }),
      }),
    )
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.getByTestId('line-verdict-l1')).toHaveTextContent('Non vérifiée')
    expect(screen.getByTestId('line-verdict-l1')).not.toHaveTextContent('Conforme')
  })

  it('sans droit financier, aucun verdict n’est affirmé : un plafond masqué n’est ni « conforme » ni « non vérifié »', () => {
    const base = report()
    detail.mockReturnValue(
      answer({
        data: report({
          lines: [
            {
              ...(base.lines[0] as ExpenseReportDetailView['lines'][number]),
              amountCents: null,
              capCents: null,
              overageCents: null,
            },
          ],
        }),
      }),
    )
    render(<ExpenseReportDrawer reportId="r1" onClose={() => undefined} onEdit={() => undefined} />)

    expect(screen.queryByTestId('line-verdict-l1')).not.toBeInTheDocument()
  })
})
