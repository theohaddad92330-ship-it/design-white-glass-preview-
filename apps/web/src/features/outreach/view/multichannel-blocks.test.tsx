import type { OutreachEligibilityResponse, OutreachSequence } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { excludedRows, isHardBlocked } from '../enrollment-exclusions'
import { EnrollmentExclusions } from './EnrollmentExclusions'
import { SequenceStepStats } from './SequenceStepStats'
import { VacationBanner } from './VacationBanner'

/**
 * Lot L-B (#4165) — les trois blocs autonomes de l'écran Séquences : le bandeau
 * de pause vacances, les exclusions nommées à l'inscription, les stats par étape.
 */

const start = vi.fn()
const resume = vi.fn()
vi.mock('../hooks/useOutreachMutations', () => ({
  useOutreachStartVacation: () => ({ mutate: start, isPending: false }),
  useOutreachResumeVacation: () => ({ mutate: resume, isPending: false }),
}))

const t = i18n.getFixedT('fr', 'outreach')

function sequence(over: Partial<OutreachSequence> = {}): OutreachSequence {
  return {
    id: 'seq',
    contact_id: 'c',
    contact_name: null,
    contact_role: null,
    account_id: null,
    account_name: null,
    name: 'Séquence',
    campaign_label: null,
    template_key: null,
    consultant_id: null,
    duplicated_from: null,
    forced_over_sequence_id: null,
    force_justification: null,
    status: 'active',
    delay_unit: 'business_days',
    vacation_until: null,
    created_at: '2099-09-01T07:00:00.000Z',
    steps: [],
    next_step: null,
    contact_replied: false,
    cancel_reason: null,
    not_now_revalidation: null,
    can_send: true,
    ...over,
  }
}

beforeEach(async () => {
  start.mockReset()
  resume.mockReset()
  await i18n.changeLanguage('fr')
})

describe('VacationBanner', () => {
  const idle = { open: false, onOpenChange: () => undefined }

  it('ne montre aucun bandeau sans séquence en pause vacances', () => {
    render(<VacationBanner sequences={[sequence()]} t={t} {...idle} />)
    expect(screen.queryByTestId('vacation-banner')).not.toBeInTheDocument()
  })

  it('le bandeau nomme la reprise, compte les séquences, et reprend sur demande', () => {
    render(
      <VacationBanner
        sequences={[
          sequence({ status: 'paused', vacation_until: '2099-10-28T07:00:00.000Z' }),
          sequence({ id: 'b', status: 'paused', vacation_until: '2099-10-28T07:00:00.000Z' }),
        ]}
        t={t}
        {...idle}
      />,
    )
    expect(screen.getByTestId('vacation-banner')).toHaveTextContent('Mode vacances jusqu’au')
    expect(screen.getByTestId('vacation-banner')).toHaveTextContent('Tes 2 séquences actives sont suspendues')
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre maintenant' }))
    expect(resume).toHaveBeenCalled()
  })

  it('une pause ordinaire (sans date) n’est pas une pause vacances', () => {
    render(<VacationBanner sequences={[sequence({ status: 'paused', vacation_until: null })]} t={t} {...idle} />)
    expect(screen.queryByTestId('vacation-banner')).not.toBeInTheDocument()
  })

  it('la fenêtre « Mode vacances » dit Du (aujourd’hui) et Au, et envoie la reprise demandée', () => {
    render(<VacationBanner sequences={[sequence()]} t={t} open onOpenChange={() => undefined} />)
    expect(screen.getByLabelText('Du')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Reprise le'), { target: { value: '2099-10-28' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mettre en pause' }))
    expect(start).toHaveBeenCalledWith({ until: '2099-10-28T07:00:00.000Z' })
  })
})

describe('EnrollmentExclusions', () => {
  const eligibility: OutreachEligibilityResponse = {
    contacts: [
      {
        contact_id: 'a',
        contact_name: 'Marie Dubois',
        exclusions: [{ code: 'recently_contacted', forceable: true }],
        client_status_known: false,
      },
      {
        contact_id: 'b',
        contact_name: 'Karim Haddad',
        exclusions: [{ code: 'rgpd_opposition', forceable: false }],
        client_status_known: true,
      },
      { contact_id: 'c', contact_name: 'Léa Roy', exclusions: [], client_status_known: true },
    ],
  }

  it('nomme chaque contact exclu et sa raison — jamais « 2 exclus »', () => {
    render(<EnrollmentExclusions eligibility={eligibility} overridden={false} onOverrideChange={() => {}} t={t} />)
    const block = screen.getByTestId('enrollment-exclusions')
    expect(block).toHaveTextContent('Marie Dubois')
    expect(block).toHaveTextContent('contacté il y a moins de 30 jours')
    expect(block).toHaveTextContent('Karim Haddad')
    expect(block).toHaveTextContent('a demandé à ne plus être contacté')
    expect(block).not.toHaveTextContent('Léa Roy')
  })

  it('le RGPD ne se lève jamais ; le reste se lève par une case', () => {
    const onChange = vi.fn()
    render(<EnrollmentExclusions eligibility={eligibility} overridden={false} onOverrideChange={onChange} t={t} />)
    expect(screen.getByTestId('enrollment-exclusions')).toHaveTextContent('ne peut jamais être inscrit')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
    expect(isHardBlocked(eligibility.contacts[1]!)).toBe(true)
    expect(isHardBlocked(eligibility.contacts[0]!)).toBe(false)
  })

  it('seulement du RGPD : aucune case pour lever', () => {
    render(
      <EnrollmentExclusions
        eligibility={{ contacts: [eligibility.contacts[1]!] }}
        overridden={false}
        onOverrideChange={() => {}}
        t={t}
      />,
    )
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('rien à dire quand personne n’est exclu, ou avant la réponse du serveur', () => {
    const { container } = render(
      <EnrollmentExclusions eligibility={undefined} overridden={false} onOverrideChange={() => {}} t={t} />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(excludedRows({ contacts: [eligibility.contacts[2]!] })).toEqual([])
  })

  it('dit quand le statut client est inconnu, sans le deviner', () => {
    render(<EnrollmentExclusions eligibility={eligibility} overridden={false} onOverrideChange={() => {}} t={t} />)
    expect(screen.getByTestId('enrollment-exclusions')).toHaveTextContent('rien n’est deviné')
  })
})

describe('SequenceStepStats', () => {
  it('ne rend rien sans séquence', () => {
    const { container } = render(<SequenceStepStats sequences={[]} t={t} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('« — » pour le non mesuré, un zéro mesuré reste 0, RDV compté', () => {
    const step = (position: number, status: 'done' | 'pending' | 'skipped') => ({
      id: `s${position}`,
      sequence_id: 'seq',
      position,
      due_at: '2099-09-01T07:00:00.000Z',
      kind: 'call' as const,
      payload: {},
      status,
      done_at: status === 'done' ? '2099-09-01T07:00:00.000Z' : null,
      engagement_signal: null,
      engagement_signal_at: null,
    })
    render(
      <SequenceStepStats
        sequences={[
          sequence({ steps: [step(0, 'done'), step(1, 'pending')], cancel_reason: 'meeting_booked' }),
          sequence({ id: 'b', steps: [step(0, 'done'), step(1, 'pending')] }),
        ]}
        t={t}
      />,
    )
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent(/1\. Appel.*2\s*2\s*0\s*1/)
    // Étape 2 : préparée deux fois, rien de fait → répondu et RDV non mesurés
    expect(rows[1]).toHaveTextContent(/2\. Appel.*2\s*0\s*—\s*—/)
  })
})
