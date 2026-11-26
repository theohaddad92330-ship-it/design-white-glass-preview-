import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ContactDetail } from './ContactDetail'

/**
 * #3716 (intégration C) — le détail « Corriger la fiche » doit rester VISIBLE
 * (replié) sur la fiche contact : il avait été rangé dans le pli « Preuves »,
 * lui-même replié, donc la fiche modifiable n'était plus atteignable d'un clic
 * (E2E golden journey 34). Les enfants lourds sont remplacés par des repères ;
 * le squelette, lui, est le vrai.
 */
const { stub, openEngagement, navigate } = vi.hoisted(() => ({
  stub: (name: string) => () => <div data-testid={`stub-${name}`} />,
  openEngagement: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement }),
  useOptionalContactEngagement: () => ({ openEngagement }),
}))
vi.mock('@/features/accounts/hooks/useAccountStrategy5P', () => ({ useAccountStrategy5P: () => ({ data: null }) }))
const ACCOUNT_ANALYSIS = { objections: [{ objection: 'Déjà un prestataire', response: 'Compléter, pas remplacer' }] }
vi.mock('@/features/accounts/hooks/useAccountRawAnalysis', () => ({ useAccountRawAnalysis: () => ACCOUNT_ANALYSIS }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/features/tasks/view/TaskList', () => ({ TaskList: stub('TaskList') }))
vi.mock('./components/ContactMeetingPlanCard', () => ({ ContactMeetingPlanCard: stub('MeetingPlan') }))
vi.mock('@/features/crm-core/view/NotesPanel', () => ({ NOTES_COMPOSER_ID: 'notes-composer' }))
vi.mock('@/features/linkedin/view/ContactNetworkJournal', () => ({ ContactNetworkJournal: stub('Journal') }))
vi.mock('./components/ContactRecordCard', () => ({
  ContactRecordCard: () => <button type="button">Corriger Fonction</button>,
}))
vi.mock('./components/ContactActionHistory', () => ({ ContactActionHistory: stub('ActionHistory') }))
vi.mock('./components/ContactCareerDetail', () => ({ ContactCareerDetail: stub('CareerDetail') }))
vi.mock('./components/SectionCard', () => ({
  SectionCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('./components/ContactCallTaskCard', () => ({
  ContactCallTaskCard: ({ onPrepare }: { onPrepare?: () => void }) => (
    <button type="button" onClick={onPrepare} disabled={!onPrepare}>
      Préparer mon appel
    </button>
  ),
}))
vi.mock('./components/ContactCorrectionsCard', () => ({ ContactCorrectionsCard: stub('CorrectionsCard') }))
vi.mock('./components/ContactIntroductionRelay', () => ({ ContactIntroductionRelay: stub('Relay') }))
vi.mock('./components/ContactCorrectionsHistory', () => ({ ContactCorrectionsHistory: stub('CorrHistory') }))
vi.mock('./components/ContactPreflight', () => ({ ContactPreflight: stub('Preflight') }))
vi.mock('./components/ContactPermissionBadge', () => ({ ContactPermissionBadge: stub('PermBadge') }))
vi.mock('./components/ContactRelationalCtaBanner', () => ({ ContactRelationalCtaBanner: stub('CtaBanner') }))
vi.mock('./components/ContactCrmExport', () => ({ ContactCrmExport: stub('CrmExport') }))
vi.mock('@/features/lemlist/view/ContactLemlist', () => ({ ContactLemlist: stub('Lemlist') }))
vi.mock('./components/ContactCommercialUtility', () => ({ ContactCommercialUtility: stub('Utility') }))
vi.mock('./components/DetectedNewEmployer', () => ({ DetectedNewEmployer: stub('NewEmployer') }))
vi.mock('./components/ContactAmbiguousIdentityAlert', () => ({
  ContactAmbiguousIdentityAlert: stub('AmbiguousIdentity'),
}))
vi.mock('./components/ContactSolicitationCollisionAlert', () => ({
  ContactSolicitationCollisionAlert: stub('SolicitationCollision'),
}))
vi.mock('./components/ContactExclusion', () => ({ ContactExclusion: stub('Exclusion') }))
// #4158 (lot L4) — les trois cartes « garde-fous entre collègues » ont leurs propres tests.
vi.mock('@/features/team-guardrails/components/ColleagueActivityBanner', () => ({
  ColleagueActivityBanner: stub('ColleagueActivity'),
}))
vi.mock('@/features/team-guardrails/components/ContactDoNotContactAction', () => ({
  ContactDoNotContactAction: stub('DoNotContactAction'),
}))
vi.mock('@/features/team-guardrails/components/ContactScopeNote', () => ({
  ContactScopeNote: stub('ContactScopeNote'),
}))
vi.mock('@/features/team-guardrails/components/DuplicateCandidatesCard', () => ({
  DuplicateCandidatesCard: stub('DuplicateCandidates'),
}))
vi.mock('./components/ContactErasureCard', () => ({ ContactErasureCard: stub('Erasure') }))
vi.mock('./components/ContactPlanBlock', () => ({ ContactPlanBlock: stub('PlanBlock') }))
vi.mock('./components/ContactHeader', () => ({
  ContactHeader: ({ onGenerateMessage }: { onGenerateMessage: (channel: string) => void }) => (
    <div data-testid="stub-Header">
      <button type="button" onClick={() => onGenerateMessage('email')}>
        préparer-email
      </button>
      <button type="button" onClick={() => onGenerateMessage('linkedin')}>
        préparer-linkedin
      </button>
      <button type="button" onClick={() => onGenerateMessage('task')}>
        préparer-tâche
      </button>
    </div>
  ),
}))
vi.mock('./components/HistoricalContactStillUseful', () => ({ HistoricalContactStillUseful: stub('Historical') }))
vi.mock('./components/ContactKeyInfo', () => ({ ContactKeyInfo: stub('KeyInfo') }))
vi.mock('./components/ContactLifecycleTimeline', () => ({ ContactLifecycleTimeline: stub('Lifecycle') }))
vi.mock('./components/ContactAssociations', () => ({ ContactAssociations: stub('Associations') }))
vi.mock('./components/ContactRelationSummary', () => ({ ContactRelationSummary: stub('RelSummary') }))
vi.mock('./components/ContactNotesCard', () => ({ ContactNotesCard: stub('Notes') }))
vi.mock('./components/ContactTimelineCard', () => ({ ContactTimelineCard: stub('Timeline') }))
vi.mock('./components/ContactOutreachCard', () => ({ ContactOutreachCard: stub('Outreach') }))
vi.mock('./components/ContactOutreachMessagesCard', () => ({ ContactOutreachMessagesCard: stub('OutreachMsgs') }))
vi.mock('./components/ContactRelations', () => ({ ContactRelations: stub('Relations') }))
vi.mock('./components/ContactRoleBlock', () => ({ ContactRoleBlock: stub('RoleBlock') }))
vi.mock('./components/ContactScoreBreakdown', () => ({
  SCORE_BREAKDOWN_ID: 'score-breakdown',
}))
vi.mock('./components/ContactSignals', () => ({ ContactSignals: stub('Signals') }))
vi.mock('./components/ContactWorkBar', () => ({ ContactWorkBar: stub('WorkBar') }))
vi.mock('./components/ContactWhyKey', () => ({ ContactWhyKey: stub('WhyKey') }))

const contact = { id: 'c1', account_id: 'a1', full_name: 'Camille Roux', title: 'DSI' } as Contact

describe('ContactDetail — #3716 « Corriger la fiche »', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('porte « Corriger la fiche » en détail replié, au niveau de la page (pas dans un pli fermé)', () => {
    render(<ContactDetail contact={contact} />)
    const title = screen.getByText('Corriger la fiche', { exact: true })
    const details = title.closest('details')
    expect(details).not.toBeNull()
    expect(details).not.toHaveAttribute('open')
    // La fiche modifiable est dans le document (détail natif) : ses boutons « Corriger <champ> » existent.
    expect(details?.querySelector('button')?.textContent).toBe('Corriger Fonction')
    // Et ce détail n'est PAS niché dans un pli (ContactFold) replié, dont les enfants ne sont pas montés.
    expect(details?.closest('[id^="contact-fold-"]')).toBeNull()
  })

  it('garde les autres apports d’intégration : tâches, parcours, plis rôle / preuves / journal / protections', () => {
    render(<ContactDetail contact={contact} />)
    expect(screen.getByTestId('stub-TaskList')).toBeInTheDocument()
    expect(screen.getByTestId('stub-CareerDetail')).toBeInTheDocument()
    expect(screen.getByTestId('stub-WorkBar')).toBeInTheDocument()
    for (const id of ['proofs', 'journal', 'protections']) {
      expect(document.getElementById(`contact-fold-${id}`)).not.toBeNull()
    }
  })
})

describe('ContactDetail — lot F04 (vu en passant, recette prod 09/10) : la bulle Laura ne coupe plus le dernier pli', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  // Théo B c5 — le dernier pli « Corrections et protections » vit désormais au bas de la colonne de TRAVAIL.
  it('la colonne qui porte le dernier pli « Corrections et protections » réserve la marge de la bulle', () => {
    render(<ContactDetail contact={contact} />)
    // #4523 — le dernier pli vit désormais dans les rangées pleine largeur, sous les trois colonnes.
    const colonne = screen.getByTestId('contact-rows')
    // La bulle Laura (`LauraDock`) est `fixed right-[4.5rem] bottom-…`, 48 px :
    // sans cette réserve, son dernier pli (« Corrections et protections »,
    // `contact-fold-protections`) se faisait couper par la bulle flottante.
    expect(colonne.className).toMatch(/lg:pb-\d/)
    expect(colonne.querySelector('#contact-fold-protections')).not.toBeNull()
  })
})

describe('ContactDetail — Théo C7 « Préparer mon appel » mène à la page d’appel', () => {
  it('ouvre /contacts/<id>/approach/call (le dossier du compte y est relu), sans ouvrir le panneau', () => {
    openEngagement.mockClear()
    navigate.mockClear()
    render(<ContactDetail contact={contact} />)
    screen.getByRole('button', { name: 'Préparer mon appel' }).click()
    expect(navigate).toHaveBeenCalledWith({
      to: '/contacts/$id/approach/$channel',
      params: { id: 'c1', channel: 'call' },
    })
    expect(openEngagement).not.toHaveBeenCalled()
  })
})

describe('ContactDetail — #3690 le relais d’introduction n’est jamais dans un pli replié', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('monte « Relais d’introduction » (carte ou geste « Consigner ») sans ouvrir aucun pli', () => {
    render(<ContactDetail contact={contact} />)
    const relay = screen.getByTestId('stub-Relay')
    // Les plis ne montent leurs enfants qu'ouverts : un relais rangé dans l'un d'eux est invisible (KO recette 06/10).
    expect(relay.closest('[id^="contact-fold-"]')).toBeNull()
  })
})

describe('ContactDetail — #3700 la carte Séquences n’est jamais dans un pli replié', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('monte la carte Séquences sans ouvrir aucun pli (Brossard : « Séquence active » mais aucune carte)', () => {
    render(<ContactDetail contact={contact} />)
    const card = screen.getByTestId('stub-Outreach')
    expect(card.closest('[id^="contact-fold-"]')).toBeNull()
  })
})

describe('ContactDetail — #4036.3 la séniorité n’est jamais dans un pli replié', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  // Recette prod 18/10 : 0 « énior » et 0 « Non disponible » — la carte vivait dans le pli « rôle », fermé.
  it('monte « Rôle & périmètre » sans ouvrir aucun pli', () => {
    render(<ContactDetail contact={contact} />)
    const card = screen.getByTestId('stub-RoleBlock')
    expect(card.closest('[id^="contact-fold-"]')).toBeNull()
  })
})

describe('ContactDetail — #3720.2 un ancien `?tab=` retombe sur sa section', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('`?tab=activite` (onglet retiré) ouvre le pli Journal, et lui seul', () => {
    render(<ContactDetail contact={contact} initialTab="activite" />)
    expect(document.getElementById('contact-fold-journal-panel')).not.toBeNull()
    expect(screen.getByTestId('stub-ActionHistory')).toBeInTheDocument()
    for (const id of ['proofs', 'protections']) {
      expect(document.getElementById(`contact-fold-${id}-panel`)).toBeNull()
    }
  })

  it('`?tab=informations` (onglet de #3644) ouvre le pli des propriétés ; une clé inconnue n’ouvre rien', () => {
    const { unmount } = render(<ContactDetail contact={contact} initialTab="informations" />)
    expect(document.getElementById('contact-fold-proofs-panel')).not.toBeNull()
    unmount()
    render(<ContactDetail contact={contact} initialTab="zzz" />)
    for (const id of ['proofs', 'journal', 'protections']) {
      expect(document.getElementById(`contact-fold-${id}-panel`)).toBeNull()
    }
  })
})

describe('ContactDetail — #3637 / #3697.1 le support oral (pitch + objections) sans numéro', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    openEngagement.mockClear()
  })

  it('« Préparer mon appel » reste actif sans numéro de téléphone et ouvre la page d’appel', () => {
    navigate.mockClear()
    render(<ContactDetail contact={{ ...contact, phone: null } as Contact} />)
    const button = screen.getByRole('button', { name: 'Préparer mon appel' })
    expect(button).toBeEnabled()
    button.click()
    expect(navigate).toHaveBeenCalledWith({
      to: '/contacts/$id/approach/$channel',
      params: { id: 'c1', channel: 'call' },
    })
  })
})

describe('ContactDetail — #4427.2/.3 Lemlist est monté sur la fiche', () => {
  it('le pli « Preuves », une fois ouvert, porte l’export CRM ET le panneau Lemlist', async () => {
    await i18n.changeLanguage('fr')
    render(<ContactDetail contact={contact} />)
    const fold = document.getElementById('contact-fold-proofs')
    const toggle = fold?.querySelector('button')
    toggle?.click()
    expect(await screen.findByTestId('stub-Lemlist')).toBeInTheDocument()
    expect(screen.getByTestId('stub-CrmExport')).toBeInTheDocument()
  })
})

describe('ContactDetail — Théo C6 : l’e-mail et LinkedIn se préparent sur leur page', () => {
  beforeEach(() => {
    openEngagement.mockClear()
    navigate.mockClear()
  })

  it('« E-mail » mène à /contacts/<id>/approach/email, sans ouvrir le panneau', () => {
    render(<ContactDetail contact={contact} />)
    screen.getByRole('button', { name: 'préparer-email' }).click()
    expect(navigate).toHaveBeenCalledWith({
      to: '/contacts/$id/approach/$channel',
      params: { id: 'c1', channel: 'email' },
    })
    expect(openEngagement).not.toHaveBeenCalled()
  })

  it('« LinkedIn » mène à la page LinkedIn', () => {
    render(<ContactDetail contact={contact} />)
    screen.getByRole('button', { name: 'préparer-linkedin' }).click()
    expect(navigate).toHaveBeenCalledWith({
      to: '/contacts/$id/approach/$channel',
      params: { id: 'c1', channel: 'linkedin' },
    })
  })

  it('les canaux préparés (tâche…) gardent le panneau — rien ne se perd', () => {
    render(<ContactDetail contact={contact} />)
    screen.getByRole('button', { name: 'préparer-tâche' }).click()
    expect(navigate).not.toHaveBeenCalled()
    expect(openEngagement).toHaveBeenCalledWith([contact], 'task', expect.anything())
  })
})
