import type { TimesheetCheck, TimesheetReview } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * LE TIROIR DE VALIDATION D'UN RELEVÉ — monté pour de vrai.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS TIENNENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. « Non vérifié » n'emprunte JAMAIS le vert de « passé », et zéro contrôle
 *     abouti n'est pas « rien à signaler » — c'est le défaut que ce tiroir
 *     existe pour corriger.
 *  2. Aucun jour ne s'affiche « 0 » quand rien n'a été déposé.
 *  3. L'action recommandée est neutre quand elle ne peut rien conclure —
 *     jamais une phrase vague qui aurait l'air d'un conseil.
 *  4. Un relevé déjà DÉCIDÉ ne propose plus aucun geste.
 *  5. Un rejet exige un motif — le bouton reste désactivé tant qu'il est vide.
 */

const validate = vi.fn()
const reviewInternally = vi.fn()
const reject = vi.fn()
const review = vi.fn()

vi.mock('../api', () => ({
  useTimesheetReview: () => review(),
  useValidateByClient: () => ({ mutate: validate, isPending: false }),
  useReviewInternally: () => ({ mutate: reviewInternally, isPending: false }),
  useRejectTimesheet: () => ({ mutate: reject, isPending: false }),
}))

const { TimesheetReviewDrawer } = await import('./TimesheetReviewDrawer')

const TARGET = { missionId: 'm1', month: '2026-08', consultantId: 'c1' }

function check(over: Partial<TimesheetCheck> & Pick<TimesheetCheck, 'id'>): TimesheetCheck {
  return { outcome: 'passed', reason: null, gapDays: null, subject: null, ...over }
}

/** Les six contrôles, tous PASSÉS — le cas « rien à corriger ». */
const ALL_PASSED: TimesheetCheck[] = [
  check({ id: 'working_days' }),
  check({ id: 'zero_days' }),
  check({ id: 'day_fraction' }),
  check({ id: 'overlapping_mission' }),
  check({ id: 'duplicate_validated' }),
  check({ id: 'public_holidays', outcome: 'not_verified', reason: 'no_holiday_calendar' }),
]

function fixture(over: Partial<TimesheetReview> = {}): TimesheetReview {
  return {
    timesheetId: 't1',
    missionId: 'm1',
    missionLabel: 'Refonte SI',
    accountName: 'Cliente SA',
    consultantId: 'c1',
    consultantName: 'Sarah Lemoine',
    periodMonth: '2026-08-01',
    status: 'submitted',
    days: 20,
    expectedDays: 20,
    gap: 0,
    gapExplanation: null,
    blocksInvoicing: false,
    validatedByClientAt: null,
    internalReviewedAt: null,
    internalReviewedByName: null,
    rejectedAt: null,
    rejectionReason: null,
    contestedDays: null,
    correctionDeadline: null,
    remindersSent: 0,
    lastReminderAt: null,
    recordedAnomalies: [],
    checks: ALL_PASSED,
    recommendation: 'validate',
    ...over,
  }
}

function answer(over: Record<string, unknown> = {}) {
  return { data: fixture(), isLoading: false, isError: false, ...over }
}

beforeEach(() => {
  cleanup()
  validate.mockReset()
  reviewInternally.mockReset()
  reject.mockReset()
  review.mockReset()
})

describe('le tiroir d’un relevé — chargement et échec', () => {
  it('porte un titre ET une description pendant le chargement — jamais un dialogue anonyme', () => {
    review.mockReturnValue(answer({ data: undefined, isLoading: true }))
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.getByText('Relevé d’activité')).toBeInTheDocument()
    expect(screen.getByText('Chargement du dossier…')).toBeInTheDocument()
  })

  it('un échec de lecture ne se rend pas comme un mois vide', () => {
    review.mockReturnValue(answer({ data: undefined, isError: true }))
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.getByText('Le dossier n’a pas pu être chargé')).toBeInTheDocument()
  })
})

describe('le tiroir d’un relevé — en-tête', () => {
  it('nomme la mission, le consultant, le compte et la période', () => {
    review.mockReturnValue(answer())
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.getByText('Refonte SI')).toBeInTheDocument()
    expect(screen.getByText('Sarah Lemoine')).toBeInTheDocument()
    expect(screen.getByText('Cliente SA')).toBeInTheDocument()
    expect(screen.getByText('2026-08')).toBeInTheDocument()
  })

  it('nomme l’absence — mission et compte inconnus ne s’affichent pas vides', () => {
    review.mockReturnValue(answer({ data: fixture({ missionLabel: null, accountName: null }) }))
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.getByText('Mission inconnue')).toBeInTheDocument()
    expect(screen.getByText('Compte inconnu')).toBeInTheDocument()
  })
})

describe('le tiroir d’un relevé — bloc 2 · vérification automatique', () => {
  it('« non vérifié » n’emprunte jamais le vert de « passé » — zéro contrôle abouti n’est pas « rien à signaler »', () => {
    const allUnverified: TimesheetCheck[] = ALL_PASSED.map(c => ({
      ...c,
      outcome: 'not_verified',
      reason: 'no_declaration',
    }))
    review.mockReturnValue(
      answer({ data: fixture({ days: null, checks: allUnverified, recommendation: 'await_declaration' }) }),
    )
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(
      screen.getByText('Aucun contrôle n’a pu aboutir. Ce n’est pas « rien à signaler » : rien n’a été vérifié.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/contrôles qui ont pu aboutir sont passés/)).not.toBeInTheDocument()
  })

  it('un constat relevé se signale, avec son sujet nommé', () => {
    const flaggedChecks = ALL_PASSED.map(c =>
      c.id === 'overlapping_mission'
        ? check({ id: 'overlapping_mission', outcome: 'flagged', subject: 'Autre mission' })
        : c,
    )
    review.mockReturnValue(answer({ data: fixture({ checks: flaggedChecks, recommendation: 'fix' }) }))
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.getByText('1 point à vérifier.')).toBeInTheDocument()
    expect(screen.getByText(/aussi affecté à « Autre mission »/)).toBeInTheDocument()
  })

  it('nomme ce qui n’a PAS pu être évalué, même quand le reste est passé', () => {
    // Cinq contrôles concluent, le sixième (jours fériés) ne peut jamais
    // tourner : le mélange doit dire « conforme » ET nommer ce qui manque.
    review.mockReturnValue(answer())
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.getByText('Les 5 contrôles qui ont pu aboutir sont passés.')).toBeInTheDocument()
    expect(screen.getByText('1 contrôle n’a pas pu aboutir — voir le détail ci-dessous.')).toBeInTheDocument()
  })
})

describe('le tiroir d’un relevé — bloc 3 · détail des jours', () => {
  it('« aucun relevé », jamais « 0 jour », quand rien n’a été déposé', () => {
    review.mockReturnValue(answer({ data: fixture({ days: null, expectedDays: null, gap: null }) }))
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.getByText('Aucun relevé')).toBeInTheDocument()
    expect(screen.getByText('Non connue')).toBeInTheDocument()
    expect(screen.getByText('Écart non mesurable')).toBeInTheDocument()
    expect(screen.queryByText('0 jour')).not.toBeInTheDocument()
  })

  it('porte l’ARCHIVE des anomalies du dépôt, distincte du verdict', () => {
    review.mockReturnValue(
      answer({
        data: fixture({ recordedAnomalies: ['Il manque 1 jour(s) par rapport aux jours ouvrés du mois (21).'] }),
      }),
    )
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.getByText('Relevé au dépôt (archive) :')).toBeInTheDocument()
    expect(screen.getByText('Il manque 1 jour(s) par rapport aux jours ouvrés du mois (21).')).toBeInTheDocument()
  })
})

describe('le tiroir d’un relevé — bloc 4 · pièces jointes', () => {
  it('dit qu’aucun fichier n’est stocké — jamais « 0 pièce jointe »', () => {
    review.mockReturnValue(answer())
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(
      screen.getByText(
        'Bellum ne stocke aucun fichier sur un relevé d’activité. Ce qui suit est ce que le produit détient.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/pièce jointe/)).not.toBeInTheDocument()
  })

  it('trace la validation client, le rejet et les relances', () => {
    review.mockReturnValue(
      answer({
        data: fixture({
          validatedByClientAt: '2026-09-01T00:00:00.000Z',
          status: 'validated',
        }),
      }),
    )
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.getByText('Validé par le client le 2026-09-01')).toBeInTheDocument()
  })

  // #2415.7 — combien de jours posent problème, et par quand corriger, aux
  // côtés du motif dans les traces que le produit détient réellement.
  it('#2415.7 — trace la quantité contestée et la deadline de correction sur un rejet', () => {
    review.mockReturnValue(
      answer({
        data: fixture({
          status: 'rejected',
          rejectedAt: '2026-08-10T09:00:00.000Z',
          rejectionReason: 'Trois jours de juin imputés à juillet',
          contestedDays: 3,
          correctionDeadline: '2026-08-20',
        }),
      }),
    )
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.getByText('3 jours contestés')).toBeInTheDocument()
    expect(screen.getByText('Correction attendue avant le 2026-08-20')).toBeInTheDocument()
  })
})

describe('le tiroir d’un relevé — bloc 5 · action recommandée', () => {
  it('n’a AUCUN avis quand aucun contrôle n’a abouti — jamais une phrase vague', () => {
    const allUnverified: TimesheetCheck[] = ALL_PASSED.map(c => ({
      ...c,
      outcome: 'not_verified',
      reason: 'no_declaration',
    }))
    review.mockReturnValue(
      answer({ data: fixture({ days: null, checks: allUnverified, recommendation: 'not_measurable' }) }),
    )
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.getByText('Aucun avis : aucun contrôle n’a pu aboutir sur ce relevé.')).toBeInTheDocument()
  })

  it('dit le lien avec la facturation quand le relevé bloque', () => {
    review.mockReturnValue(answer({ data: fixture({ blocksInvoicing: true }) }))
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.getByText('En l’état, ce relevé empêche de facturer ce mois.')).toBeInTheDocument()
  })
})

describe('le tiroir d’un relevé — bloc 6 · valider / rejeter', () => {
  it('propose valider ET rejeter sur un relevé soumis', () => {
    review.mockReturnValue(answer())
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.getByRole('button', { name: 'Enregistrer la validation client' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rejeter le relevé' })).toBeInTheDocument()
  })

  it('ne propose AUCUN geste sur un relevé déjà décidé', () => {
    review.mockReturnValue(
      answer({ data: fixture({ status: 'validated', validatedByClientAt: '2026-09-01T00:00:00.000Z' }) }),
    )
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.queryByRole('button', { name: 'Enregistrer la validation client' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rejeter le relevé' })).not.toBeInTheDocument()
  })

  it('refuse de rejeter sans motif, quantité contestée ou deadline, puis part avec les trois', async () => {
    review.mockReturnValue(answer())
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    await userEvent.click(screen.getByRole('button', { name: 'Rejeter le relevé' }))
    const confirm = screen.getByRole('button', { name: 'Rejeter' })
    expect(confirm).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Motif du rejet'), 'Jours imputés au mauvais mois')
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Jours contestés (obligatoire)'), '3')
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Deadline de correction (obligatoire)'), '2026-08-20')
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    expect(reject).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 't1',
        reason: 'Jours imputés au mauvais mois',
        contestedDays: 3,
        correctionDeadline: '2026-08-20',
      }),
      expect.anything(),
    )
  })

  it('sans relevé déposé, aucun geste — il n’y a rien à décider', () => {
    review.mockReturnValue(answer({ data: fixture({ timesheetId: null, days: null, status: 'expected' }) }))
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.queryByRole('button', { name: 'Enregistrer la validation client' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rejeter le relevé' })).not.toBeInTheDocument()
  })

  // #2415.6 — la revue INTERNE, geste SÉPARÉ de la validation client.
  it('#2415.6 — propose « Marquer vérifié en interne » sur un relevé soumis, pas encore revu', () => {
    review.mockReturnValue(answer())
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.getByRole('button', { name: 'Marquer vérifié en interne' })).toBeInTheDocument()
  })

  it('#2415.6 — ne repropose pas la revue interne une fois posée', () => {
    review.mockReturnValue(
      answer({ data: fixture({ internalReviewedAt: '2026-09-24T08:00:00.000Z', internalReviewedByName: 'M. Ops' }) }),
    )
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.queryByRole('button', { name: 'Marquer vérifié en interne' })).not.toBeInTheDocument()
    // Mais le geste POSÉ reste lisible — sans lui, il redeviendrait invisible.
    expect(screen.getByText('Vérifié en interne par M. Ops')).toBeInTheDocument()
  })

  it('#2415.6 — envoie le geste sur le bon relevé, sans toucher à la validation client', async () => {
    review.mockReturnValue(answer())
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    await userEvent.click(screen.getByRole('button', { name: 'Marquer vérifié en interne' }))
    expect(reviewInternally).toHaveBeenCalledWith('t1', expect.anything())
    expect(validate).not.toHaveBeenCalled()
  })

  it('#2415.6 — ne se propose plus une fois le relevé décidé par le client', () => {
    review.mockReturnValue(
      answer({ data: fixture({ status: 'validated', validatedByClientAt: '2026-09-01T00:00:00.000Z' }) }),
    )
    render(<TimesheetReviewDrawer target={TARGET} onClose={() => undefined} />)

    expect(screen.queryByRole('button', { name: 'Marquer vérifié en interne' })).not.toBeInTheDocument()
  })
})
