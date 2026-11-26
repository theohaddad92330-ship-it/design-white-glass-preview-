import type { OutreachSequence, OutreachSequenceStep } from '@bellum/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { chooseOption } from '@/test/select'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SequenceDetailSheet } from './SequenceDetailSheet'

/**
 * #2203.12 / #2203.13 / #2203.14 — LE HERO DU DÉTAIL SAIT DÉJÀ TOUT ÇA.
 *
 * Les canaux (`step.kind`), les échéances (`step.due_at`) et la prochaine
 * étape (`sequence.next_step`) sont déjà dans le contrat — la frise les
 * égrène pas par pas, mais aucune ligne n'en faisait le RÉSUMÉ en tête.
 * `next_step` a même déjà son couple de clés i18n ailleurs
 * (`ContactOutreachCard.tsx:177-181`, `sequence.nextDue`/`sequence.noNextDue`) :
 * ce test vérifie qu'ils sont repris ICI, pas réinventés.
 */

const action = vi.fn()
const stepDone = vi.fn()
const addStep = vi.fn()
const updateStep = vi.fn()
const removeStep = vi.fn()
const duplicate = vi.fn()
const declareEngagementSignal = vi.fn()
const reorder = vi.fn()
const declareOutcome = vi.fn()
const meetingBooked = vi.fn()

vi.mock('../hooks/useOutreachMutations', () => ({
  useOutreachSequenceAction: () => ({ mutate: action, isPending: false }),
  useOutreachStepDone: () => ({ mutate: stepDone, isPending: false }),
  useOutreachAddStep: () => ({ mutate: addStep, isPending: false }),
  useOutreachUpdateStep: () => ({ mutate: updateStep, isPending: false }),
  useOutreachRemoveStep: () => ({ mutate: removeStep, isPending: false }),
  useOutreachDuplicateSequence: () => ({ mutate: duplicate, isPending: false }),
  useOutreachDeclareEngagementSignal: () => ({ mutate: declareEngagementSignal, isPending: false }),
  useOutreachReorderSteps: () => ({ mutate: reorder, isPending: false }),
  useOutreachDeclareOutcome: () => ({ mutate: declareOutcome, isPending: false }),
  useOutreachMeetingBooked: () => ({ mutate: meetingBooked, isPending: false }),
}))

// #2202.36 — les membres de l'espace (même hook que les sélecteurs « attribuer à… »).
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({
    data: [
      { userId: 'u-me', email: 'moi@esn.test', fullName: 'Louis Moi', role: 'owner', isSelf: true },
      { userId: 'u-nadia', email: 'nadia@esn.test', fullName: 'Nadia Perrin', role: 'member', isSelf: false },
    ],
  }),
}))

// #2203.62 — la même recherche que le reste du produit (`useContacts`),
// aucune nouvelle route : le mock reprend la même forme que
// `ScopeDialog.test.tsx` (`data.pages[0].data`).
vi.mock('@/features/contacts/hooks/useContacts', () => ({
  useContacts: () => ({
    data: {
      pages: [
        {
          data: [
            {
              id: '44444444-4444-4444-4444-444444444444',
              full_name: 'Marie Dubois',
              title: 'DSI',
              company_name: 'NOVA LOGISTIQUE',
            },
            {
              id: '66666666-6666-6666-6666-666666666666',
              full_name: 'Karim Haddad',
              title: 'DAF',
              company_name: 'NOVA LOGISTIQUE',
            },
          ],
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}))

function step(over: Partial<OutreachSequenceStep> = {}): OutreachSequenceStep {
  return {
    id: `s-${Math.random()}`,
    sequence_id: 'seq',
    position: 0,
    due_at: '2026-09-01T09:00:00.000Z',
    kind: 'email',
    payload: { label: 'Premier contact (J0)' },
    status: 'pending',
    done_at: null,
    engagement_signal: null,
    engagement_signal_at: null,
    ...over,
  }
}

function sequence(over: Partial<OutreachSequence> = {}): OutreachSequence {
  const steps = over.steps ?? [step()]
  return {
    id: `q-${Math.random()}`,
    contact_id: '44444444-4444-4444-4444-444444444444',
    contact_name: 'Marie Dubois',
    contact_role: 'Directrice des systèmes d’information',
    account_id: '55555555-5555-5555-5555-555555555555',
    account_name: 'NOVA LOGISTIQUE',
    name: 'Compte froid — email',
    campaign_label: null,
    // #2378.6/.7 — `template_key`/`duplicated_from` sont apparus avec
    // 1255e7a34 (dupliquer/gabarit) sans ces fixtures : porte check-types
    // pré-existante rouge sur ce fichier, corrigée ici (pas de comportement changé).
    template_key: null,
    consultant_id: null,
    duplicated_from: null,
    forced_over_sequence_id: null,
    force_justification: null,
    status: 'active',
    created_at: '2026-09-01T09:00:00.000Z',
    steps,
    next_step: steps.find(s => s.status === 'pending') ?? null,
    contact_replied: false,
    cancel_reason: null,
    not_now_revalidation: null,
    can_send: true,
    delay_unit: 'calendar_days',
    vacation_until: null,
    ...over,
  }
}

beforeEach(async () => {
  action.mockReset()
  stepDone.mockReset()
  addStep.mockReset()
  updateStep.mockReset()
  removeStep.mockReset()
  duplicate.mockReset()
  await i18n.changeLanguage('fr')
})

describe('le hero du détail d’une séquence', () => {
  it('résume les canaux de la cadence — pas seulement pas à pas dans la frise', async () => {
    const seq = sequence({
      steps: [
        step({ id: 's1', kind: 'email', due_at: '2026-09-01T09:00:00.000Z' }),
        step({ id: 's2', kind: 'reminder', due_at: '2026-09-05T09:00:00.000Z' }),
        // Un canal répété ne se répète pas dans le résumé.
        step({ id: 's3', kind: 'email', due_at: '2026-09-10T09:00:00.000Z' }),
      ],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    const channels = await screen.findByText(/Email \(envoi manuel\), Rappel/)
    expect(channels).toBeInTheDocument()
  })

  // #4293.3 — le moteur arrête aussi sur exclusion (ne pas contacter) : le libellé le DIT.
  it('#4293.3 — les règles d’arrêt nomment l’exclusion', async () => {
    renderWithRouter(<SequenceDetailSheet sequence={sequence({ steps: [step({ id: 's1' })] })} onClose={() => {}} />)
    expect(await screen.findByText(/réponse, opposition, exclusion ou pause/)).toBeInTheDocument()
  })

  it('résume la plage de dates de la cadence — pas seulement par étape', async () => {
    const seq = sequence({
      steps: [
        step({ id: 's1', due_at: '2026-09-01T09:00:00.000Z' }),
        step({ id: 's2', due_at: '2026-09-18T09:00:00.000Z' }),
      ],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByText(/1 sept\..*18 sept\./)).toBeInTheDocument()
  })

  it('nomme la prochaine exécution — même clé que la fiche contact', async () => {
    const seq = sequence({
      steps: [step({ id: 's1', due_at: '2026-09-01T09:00:00.000Z', status: 'pending' })],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByText(/Prochaine échéance/)).toBeInTheDocument()
  })

  it('dit qu’aucune étape n’est à venir plutôt que de rester muet', async () => {
    const seq = sequence({
      steps: [step({ id: 's1', status: 'done', done_at: '2026-09-01T09:00:00.000Z' })],
      next_step: null,
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByText('Aucune étape à venir')).toBeInTheDocument()
  })
})

/**
 * #3421 lot G03 (30/09) — retour prod : « frise et condition d'arrêt de
 * séquence, à voir sur une séquence réelle ». `deriveOutreachDisplayStatus`
 * (packages/contracts) et la frise existaient déjà, mais AUCUN test ne les
 * exerçait avec un `cancel_reason` non nul — exactement ce que le retour
 * disait ne pas pouvoir vérifier. Ces deux tests le prouvent de bout en bout,
 * depuis la prop `sequence` jusqu'à l'écran.
 */
describe('#3421 — la condition d’arrêt d’une séquence, à l’écran', () => {
  it('un refus se lit « Refusée » — pas un « Annulée » générique', async () => {
    const seq = sequence({
      status: 'cancelled',
      cancel_reason: 'refusal',
      steps: [
        step({ id: 's1', status: 'done', done_at: '2026-09-01T09:00:00.000Z', due_at: '2026-09-01T09:00:00.000Z' }),
        step({ id: 's2', status: 'skipped', due_at: '2026-09-08T09:00:00.000Z' }),
      ],
      next_step: null,
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByText('Refusée')).toBeInTheDocument()
  })

  it('#3421.stop — un refus dit POURQUOI plus rien ne part ; une séquence active dit ce qui l’arrêtera', async () => {
    const refused = sequence({
      status: 'cancelled',
      cancel_reason: 'refusal',
      steps: [step({ id: 's1', status: 'skipped' })],
      next_step: null,
    })
    const { unmount } = renderWithRouter(<SequenceDetailSheet sequence={refused} onClose={() => {}} />)
    expect(await screen.findByTestId('sequence-stop-condition')).toHaveTextContent(/refus.*aucune relance/i)
    unmount()

    renderWithRouter(<SequenceDetailSheet sequence={sequence()} onClose={() => {}} />)
    expect(await screen.findByTestId('sequence-stop-condition')).toHaveTextContent(/réponse.*refus ferme/i)
  })

  it('#3421.retrait — résumé, frise et actions prennent le MÊME retrait (px-4) que le titre du panneau', async () => {
    // Recette prod 01/10 : titre à 17 px du bord, lignes Canaux / Prochaine
    // échéance / Condition d'arrêt à 1 px. Le titre vit dans `SheetHeader`
    // (p-4) : tout bloc frère porte la même gouttière.
    renderWithRouter(<SequenceDetailSheet sequence={sequence()} onClose={() => {}} />)
    const stop = await screen.findByTestId('sequence-stop-condition')
    const header = stop.closest('[data-slot="sheet-content"]')?.querySelector('[data-slot="sheet-header"]')
    expect(header?.className).toMatch(/(?:^|\s)p-4(?:\s|$)/)
    const blocks = [...(stop.closest('[data-slot="sheet-content"]')?.children ?? [])].filter(
      el => el.getAttribute('data-slot') !== 'sheet-header' && el.tagName === 'DIV' && el.className.includes('flex'),
    )
    expect(blocks.length).toBeGreaterThanOrEqual(3)
    for (const block of blocks) expect(block.className, block.className).toMatch(/(?:^|\s)px-4(?:\s|$)/)
  })

  it('#3421.stop — une séquence terminée ne promet aucune condition d’arrêt (absence = aucune ligne)', async () => {
    const done = sequence({ status: 'completed', steps: [step({ id: 's1', status: 'done' })], next_step: null })
    renderWithRouter(<SequenceDetailSheet sequence={done} onClose={() => {}} />)
    await screen.findByText('La cadence, étape par étape')
    expect(screen.queryByTestId('sequence-stop-condition')).toBeNull()
  })

  it('la frise montre l’étape FAITE et l’étape SAUTÉE — jamais relancée après un refus ferme', async () => {
    const seq = sequence({
      status: 'cancelled',
      cancel_reason: 'refusal',
      steps: [
        step({
          id: 's1',
          status: 'done',
          done_at: '2026-09-01T09:00:00.000Z',
          due_at: '2026-09-01T09:00:00.000Z',
          payload: { label: 'Premier contact (J0)' },
        }),
        step({
          id: 's2',
          status: 'skipped',
          due_at: '2026-09-08T09:00:00.000Z',
          payload: { label: 'Relance (J+7)' },
        }),
      ],
      next_step: null,
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByText('Premier contact (J0)')).toBeInTheDocument()
    expect(await screen.findByText('Relance (J+7)')).toBeInTheDocument()
    // #2378 — date et état partagent le MÊME nœud de texte (« 8 sept. · Sautée »).
    expect(await screen.findByText(/Sautée/)).toBeInTheDocument()
  })
})

/**
 * #2153.31 — LA SÉQUENCE PORTE SES MESSAGES, PAS SEULEMENT LEUR LIBELLÉ.
 *
 * La frise ne disait que « Premier contact (J0) » : le libellé, jamais le
 * brouillon lui-même. `CreateSequenceDialog.tsx:610-649` relit déjà chaque
 * message avant la création (#1935.24, même contrat `email_message`) — cette
 * frise, elle, ne relisait rien une fois la séquence lancée. Même donnée
 * (`step.payload.email_draft`, snapshot de `contact.email_message`), même
 * clé `preview.noDraft` quand rien n'a été préparé : un texte qui existe déjà
 * ne se réécrit pas une seconde fois (GA-26).
 */
describe('la séquence porte ses messages', () => {
  it('affiche le sujet et le corps du brouillon préparé pour une étape e-mail', async () => {
    const seq = sequence({
      steps: [
        step({
          id: 's1',
          kind: 'email',
          payload: {
            label: 'Premier contact (J0)',
            email_draft: { subject: 'Une idée pour NOVA LOGISTIQUE', body: 'Bonjour Marie,\n\nBrouillon préparé.' },
            draft_available: true,
          },
        }),
      ],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByText('Une idée pour NOVA LOGISTIQUE')).toBeInTheDocument()
    expect(await screen.findByText(/Brouillon préparé\./)).toBeInTheDocument()
  })

  it('#4163 LF — le score de qualité (critères nommés) se monte sous le brouillon de l’étape', async () => {
    const seq = sequence({
      steps: [
        step({
          id: 's1',
          kind: 'email',
          payload: {
            label: 'Premier contact (J0)',
            email_draft: {
              subject: 'Une idée pour NOVA LOGISTIQUE',
              body: 'Bonjour Marie, une idée pour votre équipe ?',
            },
            draft_available: true,
          },
        }),
      ],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    const quality = await screen.findByTestId('message-quality')
    expect(quality.textContent).toMatch(/Qualité du message — \d+ critères tenus sur \d+/)
  })

  it('dit qu’aucun brouillon n’est prêt plutôt que de rester muet sur une étape e-mail', async () => {
    const seq = sequence({
      steps: [
        step({ id: 's1', kind: 'email', payload: { label: 'Relance', email_draft: null, draft_available: false } }),
      ],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByText(/Aucun brouillon préparé/)).toBeInTheDocument()
  })

  it('ne montre aucun brouillon pour une étape qui n’est pas un e-mail', async () => {
    const seq = sequence({ steps: [step({ id: 's1', kind: 'reminder', payload: { label: 'Rappel interne' } })] })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    await screen.findByText('Rappel interne')
    expect(screen.queryByText(/Aucun brouillon préparé/)).not.toBeInTheDocument()
  })
})

/**
 * #2153.39 — LA SÉQUENCE N'EST PAS UNE LISTE FIGÉE.
 *
 * `create` était la SEULE porte qui écrivait des étapes : une fois lancée, une
 * séquence ne pouvait plus recevoir de touche, seulement avancer ou s'arrêter.
 * `POST /outreach/sequences/:id/steps` (`OutreachService.addStep`) ouvre une
 * seconde porte ; ce test vérifie qu'elle est ATTEIGNABLE depuis le détail.
 */
describe('la séquence n’est pas une liste figée', () => {
  it('ajoute une relance datée après la dernière étape, sur une séquence active', async () => {
    const seq = sequence({
      status: 'active',
      steps: [
        step({ id: 's1', due_at: '2026-09-01T09:00:00.000Z', status: 'done', done_at: '2026-09-01T09:00:00.000Z' }),
      ],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /Ajouter une relance/ }))
    expect(addStep).toHaveBeenCalledWith({
      id: seq.id,
      input: { kind: 'reminder', due_at: '2026-09-08T09:00:00.000Z' },
    })
  })

  it('ne propose pas d’ajouter une relance sur une séquence terminée', async () => {
    const seq = sequence({
      status: 'completed',
      steps: [step({ id: 's1', status: 'done', done_at: '2026-09-01T09:00:00.000Z' })],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    await screen.findByText(seq.name)
    expect(screen.queryByRole('button', { name: /Ajouter une relance/ })).not.toBeInTheDocument()
  })
})

/**
 * #2378.5 / #2378.6 — LA FRISE N'EST PLUS UN GABARIT FIGÉ.
 *
 * L'API (`PATCH .../steps/:stepId`, `POST .../steps/:stepId/remove`) est
 * livrée depuis 6730d402d — cette suite branche l'ÉCRAN qui manquait : une
 * étape encore À FAIRE se modifie (libellé, échéance) ou se retire, qu'elle
 * vienne d'un gabarit (#2378.6) ou d'étapes custom (#2378.5). Une étape déjà
 * faite ou sautée ne propose ni l'un ni l'autre — l'histoire ne se réécrit
 * pas.
 */
describe('une étape à faire se modifie ou se retire (#2378.5, #2378.6)', () => {
  it('propose Modifier et Retirer sur une étape À FAIRE d’une séquence active', async () => {
    const seq = sequence({ status: 'active', steps: [step({ id: 's1', status: 'pending' })] })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Modifier' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retirer' })).toBeInTheDocument()
  })

  it('ne propose ni Modifier ni Retirer sur une étape déjà FAITE', async () => {
    const seq = sequence({
      status: 'active',
      steps: [step({ id: 's1', status: 'done', done_at: '2026-09-01T09:00:00.000Z' })],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    await screen.findByText(seq.name)
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument()
  })

  it('ne propose ni Modifier ni Retirer sur une étape SAUTÉE', async () => {
    const seq = sequence({ status: 'active', steps: [step({ id: 's1', status: 'skipped' })] })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    await screen.findByText(seq.name)
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument()
  })

  it('Modifier ouvre un formulaire pré-rempli, et Enregistrer appelle updateStep avec le libellé et l’échéance retouchés', async () => {
    const seq = sequence({
      status: 'active',
      steps: [step({ id: 's1', status: 'pending', due_at: '2026-09-08T09:00:00.000Z', payload: { label: 'Relance' } })],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    const label = await screen.findByLabelText('Libellé')
    expect(label).toHaveValue('Relance')
    fireEvent.change(label, { target: { value: 'Relance personnalisée' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(updateStep).toHaveBeenCalledWith({
      id: seq.id,
      stepId: 's1',
      input: { label: 'Relance personnalisée', due_at: '2026-09-08T09:00:00.000Z' },
    })
  })

  it('#2202.33 — le champ Objectif se pré-remplit et se sauvegarde DISTINCT de la note', async () => {
    const seq = sequence({
      status: 'active',
      steps: [
        step({
          id: 's1',
          status: 'pending',
          due_at: '2026-09-08T09:00:00.000Z',
          payload: { label: 'Relance', note: 'A déjà répondu une fois.', objective: 'Qualifier le besoin.' },
        }),
      ],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    const objective = await screen.findByLabelText('Objectif')
    expect(objective).toHaveValue('Qualifier le besoin.')
    fireEvent.change(objective, { target: { value: 'Obtenir un accord de principe.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(updateStep).toHaveBeenCalledWith({
      id: seq.id,
      stepId: 's1',
      input: {
        label: 'Relance',
        due_at: '2026-09-08T09:00:00.000Z',
        note: 'A déjà répondu une fois.',
        objective: 'Obtenir un accord de principe.',
      },
    })
  })

  it('#2202.36 — le responsable de l’étape se nomme sur la ligne, se choisit dans Modifier et s’efface', async () => {
    const seq = sequence({
      status: 'active',
      steps: [
        step({
          id: 's1',
          status: 'pending',
          due_at: '2026-09-08T09:00:00.000Z',
          payload: { label: 'Relance', owner_id: 'u-nadia' },
        }),
        step({ id: 's2', status: 'pending', due_at: '2026-09-15T09:00:00.000Z', payload: { label: 'Appel' } }),
      ],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    // Une étape sans responsable ne fait AUCUNE ligne « Responsable » ; celle qui en a un le nomme.
    expect(await screen.findAllByText(/Responsable : Nadia Perrin/)).toHaveLength(1)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Modifier' }))[0]!)
    const owner = await screen.findByRole('combobox', { name: 'Responsable de l’étape' })
    expect(owner).toHaveTextContent('Nadia Perrin')
    fireEvent.click(owner)
    fireEvent.click(await screen.findByRole('option', { name: 'Personne en particulier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(updateStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: 's1', input: expect.objectContaining({ owner_id: null }) }),
    )
  })

  it('#3702 — une étape e-mail SANS brouillon offre Objet + Corps dans Modifier, et les envoie', async () => {
    const seq = sequence({
      status: 'active',
      steps: [
        step({
          id: 's1',
          status: 'pending',
          due_at: '2026-09-08T09:00:00.000Z',
          payload: { label: 'Premier contact', email_draft: null, draft_available: false },
        }),
      ],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    fireEvent.change(await screen.findByLabelText('Objet de l’e-mail'), { target: { value: 'Bonjour Louis' } })
    fireEvent.change(screen.getByLabelText('Corps de l’e-mail'), { target: { value: 'Un mot rapide.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(updateStep).toHaveBeenCalledWith({
      id: seq.id,
      stepId: 's1',
      input: {
        label: 'Premier contact',
        due_at: '2026-09-08T09:00:00.000Z',
        email_draft: { subject: 'Bonjour Louis', body: 'Un mot rapide.' },
      },
    })
  })

  it('#4163 LF — l’éditeur montre la qualité du message en cours d’écriture (non évaluée tant que le corps est vide)', async () => {
    const seq = sequence({
      status: 'active',
      steps: [
        step({
          id: 's1',
          status: 'pending',
          due_at: '2026-09-08T09:00:00.000Z',
          payload: { label: 'Premier contact', email_draft: null, draft_available: false },
        }),
      ],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    const body = await screen.findByLabelText('Corps de l’e-mail')
    expect((await screen.findByTestId('message-quality')).textContent).toMatch(/Qualité non évaluée/)
    fireEvent.change(screen.getByLabelText('Objet de l’e-mail'), { target: { value: 'Bonjour' } })
    fireEvent.change(body, { target: { value: 'Un mot rapide. Disponible cette semaine ?' } })
    expect(screen.getByTestId('message-quality').textContent).toMatch(/À revoir : .*aucune personnalisation/)
  })

  it('#3702 — une étape e-mail qui a DÉJÀ un brouillon n’offre pas Objet/Corps (il se révise dans À valider)', async () => {
    const seq = sequence({
      status: 'active',
      steps: [
        step({
          id: 's1',
          status: 'pending',
          payload: { label: 'Premier contact', email_draft: { subject: 'S', body: 'B' }, draft_available: true },
        }),
      ],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    await screen.findByLabelText('Libellé')
    expect(screen.queryByLabelText('Objet de l’e-mail')).not.toBeInTheDocument()
  })

  it('Annuler referme le formulaire sans appeler updateStep', async () => {
    const seq = sequence({ status: 'active', steps: [step({ id: 's1', status: 'pending' })] })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    await screen.findByLabelText('Libellé')
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByLabelText('Libellé')).not.toBeInTheDocument()
    expect(updateStep).not.toHaveBeenCalled()
  })

  it('Retirer appelle removeStep — l’étape est archivée, jamais effacée côté client', async () => {
    const seq = sequence({ status: 'active', steps: [step({ id: 's1', status: 'pending' })] })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer' }))
    expect(removeStep).toHaveBeenCalledWith({ id: seq.id, stepId: 's1' })
  })

  it('une séquence en PAUSE reste modifiable — seule une séquence terminée fige la frise', async () => {
    const seq = sequence({ status: 'paused', steps: [step({ id: 's1', status: 'pending' })] })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Modifier' })).toBeInTheDocument()
  })

  it('une séquence TERMINÉE ne propose plus Modifier ni Retirer', async () => {
    const seq = sequence({ status: 'completed', steps: [step({ id: 's1', status: 'pending' })] })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    await screen.findByText(seq.name)
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
  })
})

/**
 * #2909 (#2378.2) — le signal d'ouverture/clic est DÉCLARÉ par le commercial,
 * jamais détecté automatiquement.
 */
describe('signal d’ouverture/clic RAPPORTÉ sur une étape e-mail (#2909)', () => {
  it('propose le signal sur une étape e-mail, quel que soit son statut', async () => {
    const seq = sequence({
      status: 'active',
      steps: [step({ id: 's1', kind: 'email', status: 'done', done_at: '2026-09-01T09:00:00.000Z' })],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByRole('combobox', { name: 'Signal rapporté' })).toBeInTheDocument()
  })

  it('ne propose rien sur une étape qui n’est pas un e-mail — ça ne s’ouvre pas', async () => {
    const seq = sequence({ status: 'active', steps: [step({ id: 's1', kind: 'reminder' })] })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    await screen.findByText(seq.name)
    expect(screen.queryByRole('combobox', { name: 'Signal rapporté' })).not.toBeInTheDocument()
  })

  it('choisir « Ouvert » appelle declareEngagementSignal', async () => {
    const seq = sequence({ status: 'active', steps: [step({ id: 's1', kind: 'email' })] })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    const select = await screen.findByRole('combobox', { name: 'Signal rapporté' })
    await chooseOption(select, 'Ouvert')
    expect(declareEngagementSignal).toHaveBeenCalledWith({
      id: seq.id,
      stepId: 's1',
      input: { engagement_signal: 'opened' },
    })
  })
})

/**
 * #2203.62 / #2378.7 — DUPLIQUER VERS UN AUTRE CONTACT.
 *
 * `POST /outreach/sequences/:id/duplicate` est livré et testé côté serveur
 * depuis 1255e7a34 (#2378.7) — cette sheet était le seul écran sans bouton
 * pour l'atteindre (doctrine : chercher l'appelant, pas la fonction).
 */
describe('dupliquer une séquence vers un autre contact (#2203.62)', () => {
  it('propose Dupliquer quel que soit le statut de la séquence', async () => {
    const seq = sequence({
      status: 'completed',
      steps: [step({ id: 's1', status: 'done', done_at: '2026-09-01T09:00:00.000Z' })],
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByRole('button', { name: /Dupliquer/ })).toBeInTheDocument()
  })

  it('ouvre la recherche de contact au clic, exclut le contact déjà engagé sur cette séquence', async () => {
    const seq = sequence()
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /Dupliquer/ }))
    fireEvent.change(await screen.findByPlaceholderText('Rechercher un contact…'), { target: { value: 'a' } })
    expect(await screen.findByText('Karim Haddad')).toBeInTheDocument()
    // Marie Dubois est le contact DÉJÀ engagé sur cette séquence (fixture `sequence()`).
    expect(screen.queryByText('Marie Dubois')).not.toBeInTheDocument()
  })

  it('choisir un contact appelle duplicate avec le contact_id retenu, puis referme la boîte', async () => {
    const seq = sequence()
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /Dupliquer/ }))
    fireEvent.change(await screen.findByPlaceholderText('Rechercher un contact…'), { target: { value: 'Karim' } })
    fireEvent.click(await screen.findByText('Karim Haddad'))
    await waitFor(() =>
      expect(duplicate).toHaveBeenCalledWith({
        id: seq.id,
        input: { contact_id: '66666666-6666-6666-6666-666666666666' },
      }),
    )
    await waitFor(() => expect(screen.queryByPlaceholderText('Rechercher un contact…')).not.toBeInTheDocument())
  })

  it('Annuler referme la boîte sans appeler duplicate', async () => {
    const seq = sequence()
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /Dupliquer/ }))
    await screen.findByPlaceholderText('Rechercher un contact…')
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByPlaceholderText('Rechercher un contact…')).not.toBeInTheDocument()
    expect(duplicate).not.toHaveBeenCalled()
  })
})
