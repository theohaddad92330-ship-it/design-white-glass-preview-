import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact, ContactRankingResponse, RankedContact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useContactRanking } from '@/features/contacts/hooks/useContactRanking'
import type { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { PriorityPathSection } from './PriorityPathSection'

vi.mock('@/features/contacts/hooks/useContactRanking', () => ({ useContactRanking: vi.fn() }))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useEsnProfile: vi.fn() }))
vi.mock('@/features/actions/hooks/useTrackAction', () => ({ useTrackAction: () => ({ mutate: vi.fn() }) }))
const engagement = vi.hoisted(() => ({ openEngagement: vi.fn() }))
vi.mock('../../components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement: engagement.openEngagement }),
  useOptionalContactEngagement: () => ({ openEngagement: engagement.openEngagement }),
}))
vi.mock('../../components/contact-engagement/ContactEngagementTrigger', () => ({
  ContactEngagementTrigger: ({ onChannelSelect }: { onChannelSelect: (channel: 'email' | 'phone') => void }) => (
    <>
      <button type="button" onClick={() => onChannelSelect('email')}>
        engager-email
      </button>
      <button type="button" onClick={() => onChannelSelect('phone')}>
        preparer-appel
      </button>
    </>
  ),
}))
vi.mock('@/features/contacts/components/EnrichConfirmDialog', () => ({ EnrichConfirmDialog: () => null }))

// #2130.68 — le double du traceur produit ANONYME, distinct de `useTrackAction`
// (mocké ci-dessus, qui porte account_id).
const tracker = vi.hoisted(() => ({ trackActionStarted: vi.fn() }))
vi.mock('@/lib/product-tracker', () => tracker)

/**
 * #2120.13 / .18 / .19 / .22-.25 / .30-38 — le chemin recommandé lit l'ORDRE et
 * ses raisons sur l'API ; la carte nomme l'entité, la confiance, la voie d'accès,
 * les coordonnées et le dernier échange — et nomme chaque absence.
 */
function contact(patch: Partial<Contact>): Contact {
  return {
    id: 'c1',
    account_id: 'acc-1',
    full_name: 'Camille Roux',
    title: 'Responsable Data',
    entity: 'ACME Retail',
    decision_role: 'user',
    priority: 3,
    email: null,
    email_verified: false,
    phone: null,
    linkedin_url: null,
    photo_url: null,
    why_contact: null,
    location: null,
    last_enrichment_at: null,
    email_sent_at: null,
    ...patch,
  } as Contact
}

function ranked(patch: Partial<RankedContact>): RankedContact {
  return {
    contact_id: 'c1',
    position: 1,
    score: 46,
    max: 75,
    axes: [
      { key: 'perimeter', points: 20, max: 20, reason: 'perimeter_p1' },
      { key: 'subject', points: 15, max: 15, reason: 'subject_match' },
      { key: 'history', points: 0, max: 10, reason: 'no_exchange' },
      { key: 'offer', points: null, max: 10, reason: 'no_offer' },
    ],
    // #2295.5 / #2295.2 — les axes stratégiques et le groupe sont REQUIS au
    // contrat depuis le lot BX. Cet écran n'en lit aucun : une dérivation
    // écrite ici serait une valeur inventée pour satisfaire un type.
    strategic_axes: [],
    group: 'first_door',
    // #2295.8 — les six dimensions, toujours toutes les six (contrat REQUIS).
    explanation: {
      who: { key: 'who', measured: true, code: 'who_first_door' },
      when: { key: 'when', measured: true, code: 'when_no_recent_signal' },
      stage: { key: 'stage', measured: true, code: 'stage_discovery' },
      unlocks: { key: 'unlocks', measured: true, code: 'unlocks_entry_confirmed' },
      next: { key: 'next', measured: false, code: 'next_path_end' },
      limit: { key: 'limit', measured: true, code: 'limit_no_decision_power' },
    },
    // #2295.9 — l'anti-recommandation par CONTACT (contrat REQUIS).
    anti_advice: { what: 'dont_ask_for_decision', why: 'limit_no_decision_power' },
    confidence: 'high',
    access_path: { kind: 'verified_email', missing_reason: null },
    last_interaction_at: null,
    ...patch,
  }
}

function mockRanking(state: { data?: ContactRankingResponse; isError?: boolean }) {
  vi.mocked(useContactRanking).mockReturnValue({
    data: state.data,
    isError: state.isError ?? false,
  } as ReturnType<typeof useContactRanking>)
}

const CONTEXT: ContactRankingResponse['context'] = {
  perimeter: null,
  perimeter_source: 'account',
  subject: null,
  subject_source: 'account',
  offer: null,
}

function renderSection(contacts: Contact[], onContactClick?: (contact: Contact) => void) {
  return render(
    <PriorityPathSection
      accountId="acc-1"
      contacts={contacts}
      accountCompanyName="ACME"
      rawAnalysis={{ angles: [{ title: 'Plateforme Data' }] }}
      entities={['ACME Retail']}
      enrichmentCredits={10}
      enrichMutation={{ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useEnrichContact>}
      onContactClick={onContactClick}
    />,
  )
}

function mockEsnProfile(expertiseAreas: string[] | undefined) {
  vi.mocked(useEsnProfile).mockReturnValue({
    data: expertiseAreas ? { expertise_areas: expertiseAreas } : undefined,
  } as unknown as ReturnType<typeof useEsnProfile>)
}

beforeEach(async () => {
  vi.mocked(useContactRanking).mockReset()
  mockEsnProfile(undefined)
  tracker.trackActionStarted.mockClear()
  await i18n.changeLanguage('fr')
})

describe('#3685.2 — lecture courte : lignes, pas de répétition Persona/Rôle', () => {
  it('n’écrit plus « Persona » et dit « Rôle à identifier » pour une personne non vérifiée', () => {
    mockRanking({ data: { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT } })
    renderSection([contact({ full_name: 'Julien', title: 'Directeur des Sports', entity: null, decision_role: null })])

    expect(screen.getByText('Rôle à identifier')).toBeInTheDocument()
    expect(screen.getByText('Directeur des Sports')).toBeInTheDocument()
    expect(screen.queryByText('Persona')).not.toBeInTheDocument()
    expect(screen.queryByText('Julien')).not.toBeInTheDocument()
  })
})

// #4292.10 (recette 21/10, Veolia) — dix référents techniques et aucun décideur : le bloc le DIT.
describe('#4292.10 — aucun décideur identifié', () => {
  it('le bloc le dit en une ligne quand l’API signale l’absence de décideur ni sponsor', () => {
    mockRanking({
      data: { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT, no_decision_maker: true },
    })
    renderSection([contact({})])
    expect(screen.getByTestId('priority-no-decision-maker').textContent).toBe('Aucun décideur identifié sur ce compte')
  })

  it('NON : un décideur connu (drapeau absent) ⇒ aucune ligne', () => {
    mockRanking({ data: { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT } })
    renderSection([contact({})])
    expect(screen.queryByTestId('priority-no-decision-maker')).not.toBeInTheDocument()
  })
})

describe('recette 31/10 — critères dépliés lisibles', () => {
  it('libellé/valeur en grille, badge de rang qui ne rétrécit pas', () => {
    mockRanking({
      data: { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT },
    })
    renderSection([contact({})])
    fireEvent.click(screen.getByText('Pourquoi ce rang ?'))
    const rows = screen.getAllByTestId('score-axis-row')
    expect(rows.length).toBeGreaterThan(0)
    // Recette 01/11 — plus de gabarit de colonnes fixe : le libellé passe au-dessus de la valeur (flex-wrap),
    // la valeur garde `min-w-0` + `break-words` et ne tombe jamais à 0 px.
    expect(rows[0].className).toContain('flex-wrap')
    expect(rows[0].className).not.toMatch(/grid-cols-\[/)
    expect((rows[0].children[1] as HTMLElement).className).toContain('break-words')
    expect(screen.getByText('N° 1').className).toContain('shrink-0')
  })
})

// Lot 758 (Loïc) — « les achats interviennent ensuite » ne disait pas QUI est l'acheteur.
describe('lot 758 — sous un décideur, l’étape achats nomme l’acheteur', () => {
  const dsi = contact({ id: 'dsi', full_name: 'Diane Sorel', title: 'DSI', decision_role: 'economic' })
  const buyer = contact({ id: 'buy', full_name: 'Bruno Achard', title: 'Acheteur IT', decision_role: 'procurement' })
  const deciderRanked = ranked({ contact_id: 'dsi', group: 'decision_maker' })

  it('nomme l’acheteur identifié, avec sa fonction', () => {
    mockRanking({
      data: {
        excluded: [],
        ranked: [deciderRanked],
        total: 2,
        scored: 2,
        context: CONTEXT,
        procurement_contact_id: 'buy',
      },
    })
    renderSection([dsi, buyer])
    expect(screen.getByTestId('priority-buyer').textContent).toBe(
      'Les achats interviennent ensuite : Bruno Achard (Acheteur IT)',
    )
  })

  // Recette 31/10 — un siège sans titulaire (nom = intitulé) ne se lisait « X (X) ».
  it('acheteur sans nom (siège) : la fonction UNE seule fois, jamais « X (X) »', () => {
    const seat = contact({
      id: 'seat',
      full_name: 'Responsable achats informatiques',
      title: 'Responsable achats informatiques',
      decision_role: 'procurement',
    })
    mockRanking({
      data: {
        excluded: [],
        ranked: [deciderRanked],
        total: 2,
        scored: 2,
        context: CONTEXT,
        procurement_contact_id: 'seat',
      },
    })
    renderSection([dsi, seat])
    expect(screen.getByTestId('priority-buyer').textContent).toBe(
      'Les achats interviennent ensuite : Responsable achats informatiques (nom à identifier)',
    )
  })

  it('aucun acheteur au dossier : la ligne le DIT, jamais un nom deviné', () => {
    mockRanking({
      data: {
        excluded: [],
        ranked: [deciderRanked],
        total: 1,
        scored: 1,
        context: CONTEXT,
        procurement_contact_id: null,
      },
    })
    renderSection([dsi])
    expect(screen.getByTestId('priority-buyer').textContent).toBe(
      'Les achats interviennent ensuite : aucun acheteur identifié dans ce dossier',
    )
  })

  it('NON : pas sous une « première porte », ni sans le champ (réponse d’avant)', () => {
    mockRanking({
      data: {
        excluded: [],
        ranked: [ranked({ contact_id: 'dsi' })],
        total: 1,
        scored: 1,
        context: CONTEXT,
        procurement_contact_id: null,
      },
    })
    const { unmount } = renderSection([dsi])
    expect(screen.queryByTestId('priority-buyer')).not.toBeInTheDocument()
    unmount()
    mockRanking({ data: { excluded: [], ranked: [deciderRanked], total: 1, scored: 1, context: CONTEXT } })
    renderSection([dsi])
    expect(screen.queryByTestId('priority-buyer')).not.toBeInTheDocument()
  })
})

describe('PriorityPathSection — chemin recommandé classé côté API', () => {
  it('#2120.30-38 — suit l’ORDRE de l’API, pas le rang du prompt', () => {
    const a = contact({ id: 'a', full_name: 'Alice Martin', priority: 1 })
    const b = contact({ id: 'b', full_name: 'Bruno Petit', priority: 5 })
    mockRanking({
      data: {
        excluded: [],
        ranked: [ranked({ contact_id: 'b', position: 1 }), ranked({ contact_id: 'a', position: 2 })],
        total: 2,
        scored: 2,
        context: CONTEXT,
      },
    })
    renderSection([a, b])
    const cards = screen.getAllByTestId('priority-contact-card')
    expect(within(cards[0]).getByText('Bruno Petit')).toBeInTheDocument()
    expect(within(cards[0]).getByText('N° 1')).toBeInTheDocument()
    expect(within(cards[1]).getByText('Alice Martin')).toBeInTheDocument()
    // #2297.57 — huit critères notés ; la joignabilité ne fait que départager.
    expect(screen.getByText(/Classés parmi 2 contacts sur huit critères nommés/)).toBeInTheDocument()
  })

  // #2130.68 — UTILISER le chemin d'accès recommandé (ouvrir la fiche d'un
  // contact classé) émet access_path_used, en plus du traceur métier existant
  // (useTrackAction, `plan_action_contact_opened`, mocké ci-dessus).
  it('#2130.68 — ouvrir la fiche d’un contact classé émet access_path_used', () => {
    mockRanking({
      data: { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT },
    })
    renderSection([contact({})])

    fireEvent.click(screen.getByRole('button', { name: 'Voir la fiche' }))

    expect(tracker.trackActionStarted).toHaveBeenCalledWith('access_path_used', '/accounts/$id')
  })

  // #2130.75 — « contacts recommandés effectivement engagés » : le geste
  // d'engagement d'un contact du chemin recommandé émet contact_selected,
  // anonyme et par écran (jamais l'identifiant du contact : c64).
  it('#2130.75 — engager un contact recommandé émet contact_selected, sans identifiant', () => {
    mockRanking({
      data: { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT },
    })
    renderSection([contact({})])

    fireEvent.click(screen.getByRole('button', { name: 'engager-email' }))

    expect(tracker.trackActionStarted).toHaveBeenCalledWith('contact_selected', '/accounts/$id')
    expect(tracker.trackActionStarted).not.toHaveBeenCalledWith('access_path_used', expect.anything())
  })

  it('#2754 — l’indice ("Enrichis d’abord…") n’occupe plus sa propre ligne, mais reste nommé sur une icône tabulable', () => {
    mockRanking({
      data: { excluded: [], ranked: [ranked({})], total: 2, scored: 2, context: CONTEXT },
    })
    renderSection([contact({})])

    // Ligne de texte dédiée disparue — c'était le "blabla" pointé par #2754.
    expect(screen.queryByText("Enrichis d'abord 3 à 5 contacts clés.")).not.toBeInTheDocument()

    // Le repère reste ACCESSIBLE : une icône nommée, tabulable (GA-32/GA-35).
    const trigger = screen.getByLabelText("Enrichis d'abord 3 à 5 contacts clés.")
    expect(trigger.tabIndex).toBe(0)

    // Le repère de méthode (doctrine anti-discrimination) reste visible par
    // défaut — inchangé, toujours protégé par #2297.57 ci-dessus.
    expect(screen.getByText(/Classés parmi 2 contacts sur huit critères nommés/)).toBeInTheDocument()
  })

  it('#2297.57 — la joignabilité est nommée comme DÉPARTAGE, jamais parmi les axes du score', () => {
    const withReach = ranked({
      axes: [
        { key: 'perimeter', points: 20, max: 20, reason: 'perimeter_p1' },
        { key: 'accessibility', points: 15, max: 15, reason: 'verified_email' },
        { key: 'history', points: 0, max: 10, reason: 'no_exchange' },
      ],
    })
    mockRanking({ data: { excluded: [], ranked: [withReach], total: 1, scored: 1, context: CONTEXT } })
    renderSection([contact({})])
    fireEvent.click(screen.getByRole('button', { name: 'Pourquoi ce rang ?' }))
    expect(screen.getByText('20/20')).toBeInTheDocument()
    expect(screen.queryByText(/^15\/15/)).not.toBeInTheDocument()
    expect(screen.getByTestId('ranking-tie-breaker')).toHaveTextContent(
      'Départage à rôle égal — Accessibilité : e-mail vérifié',
    )
  })

  it('#3754.4 — le niveau de l’ESN est la RAISON de l’ordre ; aucun poste rapproché = aucune ligne', () => {
    mockRanking({
      data: {
        excluded: [],
        ranked: [ranked({ contact_id: 'c1', esn_target_level: 1 }), ranked({ contact_id: 'c2', position: 2 })],
        total: 2,
        scored: 2,
        context: CONTEXT,
      },
    })
    renderSection([contact({ id: 'c1' }), contact({ id: 'c2' })])
    const lines = screen.getAllByTestId('ranking-esn-level')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toHaveTextContent('Niveau 1 pour toi — signataire')
  })

  it('LOIC-FIX O.4 — la carte entière mène à la fiche : le nom et le chevron nommé, tabulables, ≥ 44 px', () => {
    mockRanking({
      data: { excluded: [], ranked: [ranked({ contact_id: 'c1' })], total: 1, scored: 1, context: CONTEXT },
    })
    const open = vi.fn()
    renderSection([contact({ id: 'c1', full_name: 'Camille Roux' })], open)

    const chevron = screen.getByRole('button', { name: /Ouvrir la fiche de Camille Roux/i })
    expect(chevron.className).toMatch(/min-h-11/)
    fireEvent.click(chevron)
    fireEvent.click(screen.getByRole('button', { name: 'Camille Roux' }))
    expect(open).toHaveBeenCalledTimes(2)
    expect(open.mock.calls[0]?.[0]).toMatchObject({ id: 'c1' })
  })

  it('LOIC-FIX O.3 — le passage devant par le statut d’accès est DIT ; une seule échelle de note', () => {
    mockRanking({
      data: {
        excluded: [],
        ranked: [
          ranked({ contact_id: 'c1', order_reason: 'access_referenced' }),
          ranked({ contact_id: 'c2', position: 2 }),
        ],
        total: 2,
        scored: 2,
        context: CONTEXT,
      },
    })
    renderSection([contact({ id: 'c1' }), contact({ id: 'c2' })])
    const lines = screen.getAllByTestId('ranking-order-reason')
    // Sait dire NON : la seconde personne n'a pas été avancée, elle ne porte aucune raison.
    expect(lines).toHaveLength(1)
    expect(lines[0]).toHaveTextContent(/compte est référencé/i)
    // SIMON-FIX S.19 / LUDOVIC-F : UNE échelle (sur 100) pour la note d'une personne — plus de « note de classement ».
    expect(screen.queryByText(/Note de classement/)).not.toBeInTheDocument()
  })

  it('#2120.18 / .19 / .22 / .23 — entité, ville affichée, confiance nommée et voie d’accès', () => {
    mockRanking({ data: { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT } })
    renderSection([contact({ email: 'camille@acme.fr', email_verified: true, location: 'Lyon' })])
    expect(screen.getByText('ACME Retail')).toBeInTheDocument()
    expect(screen.getByText('Lyon')).toBeInTheDocument()
    expect(screen.getByText('élevée')).toBeInTheDocument()
    expect(screen.getByText('à compléter : Offre')).toBeInTheDocument()
    expect(screen.getByText('e-mail vérifié')).toBeInTheDocument()
    expect(screen.getByText('camille@acme.fr')).toBeInTheDocument()
  })

  // #4432.4 — la zone du profil est NOMMÉE : en zone / hors zone / « lieu absent » ; sans zone déclarée, rien.
  it.each([
    ['in_zone', 'En zone'],
    ['out_of_zone', 'Hors zone'],
    ['place_absent', 'Lieu absent'],
  ] as const)('#4432.4 — le statut %s se lit « %s »', (status, label) => {
    mockRanking({
      data: { excluded: [], ranked: [ranked({ zone_status: status })], total: 1, scored: 1, context: CONTEXT },
    })
    renderSection([contact({ location: status === 'place_absent' ? null : 'Lyon' })])
    expect(screen.getByTestId('contact-zone-status')).toHaveTextContent(label)
  })

  it('#4556.4 — « Hors zone » NOMME la zone du profil ; sans libellé, jamais de parenthèses vides', () => {
    mockRanking({
      data: {
        excluded: [],
        ranked: [ranked({ zone_status: 'out_of_zone', zone_label: 'Toulouse & Occitanie' })],
        total: 1,
        scored: 1,
        context: CONTEXT,
      },
    })
    const { unmount } = renderSection([contact({ location: 'Lyon' })])
    expect(screen.getByTestId('contact-zone-status')).toHaveTextContent('Hors zone (Toulouse & Occitanie)')
    unmount()
    mockRanking({
      data: {
        excluded: [],
        ranked: [ranked({ zone_status: 'out_of_zone', zone_label: null })],
        total: 1,
        scored: 1,
        context: CONTEXT,
      },
    })
    renderSection([contact({ location: 'Lyon' })])
    expect(screen.getByTestId('contact-zone-status')).toHaveTextContent(/^Hors zone$/)
  })

  it('#4432.4 — dit NON : aucune zone déclarée (statut absent ou null) ⇒ aucune ligne', () => {
    mockRanking({
      data: { excluded: [], ranked: [ranked({ zone_status: null })], total: 1, scored: 1, context: CONTEXT },
    })
    renderSection([contact({ location: 'Lyon' })])
    expect(screen.queryByTestId('contact-zone-status')).not.toBeInTheDocument()
  })

  it('#2120.22 — « Pourquoi ce rang ? » ouvre les axes nommés, jamais un pourcentage', () => {
    mockRanking({ data: { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT } })
    const { container } = renderSection([contact({})])
    fireEvent.click(screen.getByRole('button', { name: 'Pourquoi ce rang ?' }))
    expect(screen.getByText('20/20')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/%|probab|chance/i)
  })

  // #3912.1/.2 — « Confiance moyenne, 35. C'est quoi le numéro ? » (retour
  // bêta, 08/10/2026) : le score et la confiance n'avaient aucune infobulle
  // qui dise ce qu'ils mesurent. Un score n'est jamais nu (doctrine).
  it('#3912.1 — le score porte une infobulle « score de classement sur son maximum »', () => {
    mockRanking({
      data: { excluded: [], ranked: [ranked({ score: 46, max: 75 })], total: 1, scored: 1, context: CONTEXT },
    })
    renderSection([contact({})])
    // SIMON-FIX S.19 — une seule échelle (sur 100) ; le plafond évalué vit dans l'infobulle.
    // Recette 21/10 A.2 — points et plafond sont ceux des CRITÈRES affichés (20+15+0 sur 20+15+10),
    // pas `ranked.score`/`ranked.max` (46/75) lus à côté : détail et total ne divergent jamais.
    expect(
      screen.getByTitle(
        'Score de classement sur 100 — ramené de 35 points obtenus sur 45 possibles (critères évalués)',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/78\/100/)).toBeInTheDocument()
    expect(screen.queryByText(/\/75/)).toBeNull()
  })

  it('#3912.2 — la confiance porte une infobulle « axes mesurés sur N »', () => {
    // 3 axes mesurés sur les 4 de la fiction (offer: null = non mesuré).
    mockRanking({
      data: { excluded: [], ranked: [ranked({ confidence: 'high' })], total: 1, scored: 1, context: CONTEXT },
    })
    renderSection([contact({})])
    expect(screen.getByText('élevée')).toHaveAttribute('title', 'Confiance : 3 axes mesurés sur 4')
  })

  // #2613 — une entité inconnue et une voie d'accès jamais cherchée sont des
  // absences PURES : elles ne font plus de ligne (avant #2613, #2120.18/.23
  // nommaient « Entité non renseignée » / « non mesurée — coordonnées jamais
  // recherchées »).
  // #3059/#3060 (retour bêta, 26/09/2026) — Louis : « ne pas afficher si
  // vide » sur les coordonnées et le dernier échange jamais tracés. Ce qui
  // était encore NOMMÉ (#2120.24/.25) rejoint désormais la même règle que
  // l'entité et la voie d'accès : une absence pure ne fait plus de ligne.
  it('#2613/#3059/#3060 — un contact jamais cherché ne fait AUCUNE ligne d’absence', () => {
    mockRanking({
      data: {
        excluded: [],
        ranked: [ranked({ access_path: { kind: null, missing_reason: 'never_searched' }, confidence: 'low' })],
        total: 1,
        scored: 1,
        context: CONTEXT,
      },
    })
    renderSection([contact({ entity: null })])
    expect(screen.queryByText('Entité non renseignée')).not.toBeInTheDocument()
    expect(screen.queryByText('non mesurée — coordonnées jamais recherchées')).not.toBeInTheDocument()
    expect(screen.queryByText('Coordonnées jamais recherchées')).not.toBeInTheDocument()
    expect(screen.queryByText('Aucun échange tracé dans ton espace')).not.toBeInTheDocument()
    expect(screen.queryByText('Coordonnées')).not.toBeInTheDocument()
    expect(screen.queryByText('Dernier échange')).not.toBeInTheDocument()
  })

  // Recette 13/10/2026 — « e-mail non vérifié » en boucle et « Inconnu » partout : une voie « e-mail » sans e-mail
  // affiché ne fait aucune ligne, et un rôle inconnu aucune pastille.
  it('13/10 — pas de « e-mail non vérifié » sans e-mail affiché, ni de pastille « Inconnu »', () => {
    mockRanking({
      data: {
        excluded: [],
        ranked: [ranked({ access_path: { kind: 'email', missing_reason: null } })],
        total: 1,
        scored: 1,
        context: CONTEXT,
      },
    })
    renderSection([contact({ email: null, decision_role: 'unknown' })])
    expect(screen.queryByText('e-mail non vérifié')).not.toBeInTheDocument()
    expect(screen.queryByText('Inconnu')).not.toBeInTheDocument()
  })

  it('13/10 — « e-mail non vérifié » reste dit quand l’e-mail est affiché', () => {
    mockRanking({
      data: {
        excluded: [],
        ranked: [ranked({ access_path: { kind: 'email', missing_reason: null } })],
        total: 1,
        scored: 1,
        context: CONTEXT,
      },
    })
    renderSection([contact({ email: 'camille@acme.fr' })])
    expect(screen.getByText('e-mail non vérifié')).toBeInTheDocument()
  })

  // 13/10/2026 — le badge « Décideur » sur chaque carte de décideur ; rien pour les autres.
  it('13/10 — un décideur porte le badge « Décideur », un non-décideur ou un rôle inconnu aucun', () => {
    mockRanking({
      data: { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT },
    })
    const { unmount } = renderSection([contact({ decision_role: 'economic' })])
    // GA-26 : un seul texte « Décideur… » — le RoleBadge « Décideur économique » joue ce rôle.
    expect(screen.getAllByText(/Décideur/)).toHaveLength(1)
    unmount()
    renderSection([contact({ decision_role: 'technical' })])
    expect(screen.queryByText(/Décideur/)).not.toBeInTheDocument()
  })

  // #3060 — une recherche qui n'a rien trouvé reste une absence qui dit
  // quelque chose (distincte de « jamais cherché ») : elle reste NOMMÉE.
  it('#3060 — des coordonnées cherchées sans rien trouver restent nommées', () => {
    mockRanking({ data: { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT } })
    renderSection([contact({ last_enrichment_at: '2026-09-20T10:00:00.000Z' })])
    expect(screen.getByText('Coordonnées')).toBeInTheDocument()
    expect(screen.getByText('Aucune coordonnée trouvée après recherche')).toBeInTheDocument()
  })

  // #2613 — `searched_nothing_found` reste nommé : on a cherché, il n'y a
  // rien, ce n'est pas la même chose que « jamais cherché ».
  it('#2613 — un accès cherché sans rien trouver reste nommé', () => {
    mockRanking({
      data: {
        excluded: [],
        ranked: [ranked({ access_path: { kind: null, missing_reason: 'searched_nothing_found' } })],
        total: 1,
        scored: 1,
        context: CONTEXT,
      },
    })
    renderSection([contact({})])
    expect(screen.getByText('aucun canal trouvé après recherche')).toBeInTheDocument()
  })

  it('#2120.25 — le dernier échange tracé dans l’espace est daté', () => {
    mockRanking({
      data: {
        excluded: [],
        ranked: [ranked({ last_interaction_at: '2026-09-02T10:00:00.000Z' })],
        total: 1,
        scored: 1,
        context: CONTEXT,
      },
    })
    renderSection([contact({})])
    expect(screen.getByText('02 septembre 2026')).toBeInTheDocument()
  })

  it('#2120.34 — l’offre saisie part vers le classement', () => {
    mockRanking({ data: { excluded: [], ranked: [], total: 0, scored: 0, context: CONTEXT } })
    renderSection([contact({})])
    fireEvent.change(screen.getByPlaceholderText('ex. migration cloud'), { target: { value: 'Migration Cloud' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reclasser' }))
    expect(useContactRanking).toHaveBeenLastCalledWith('acc-1', { offer: 'Migration Cloud' })
  })

  // #2628.1 — la porte d'entrée se classait sur la séniorité par défaut : l'axe
  // `offer` (poids 10) sort du score tant que rien n'est saisi, et personne ne
  // remplissait ce champ. Il se préremplit désormais depuis les domaines
  // d'expertise déclarés du profil ESN — l'adéquation à l'offre entre dans le
  // classement SANS geste du commercial.
  it("#2628.1 — préremplit l'offre depuis les domaines d'expertise du profil ESN", () => {
    mockEsnProfile(['Migration cloud', 'Cybersécurité'])
    mockRanking({ data: { excluded: [], ranked: [], total: 0, scored: 0, context: CONTEXT } })
    renderSection([contact({})])
    expect(useContactRanking).toHaveBeenLastCalledWith('acc-1', { offer: 'Migration cloud, Cybersécurité' })
    expect(screen.getByPlaceholderText('ex. migration cloud')).toHaveValue('Migration cloud, Cybersécurité')
  })

  it("#2628.1 — ne préremplit rien quand le profil ESN ne déclare aucun domaine d'expertise", () => {
    mockEsnProfile([])
    mockRanking({ data: { excluded: [], ranked: [], total: 0, scored: 0, context: CONTEXT } })
    renderSection([contact({})])
    expect(useContactRanking).toHaveBeenLastCalledWith('acc-1', {})
    expect(screen.getByPlaceholderText('ex. migration cloud')).toHaveValue('')
  })

  it('#2628.1 — une offre déjà saisie par le commercial passe avant le préremplissage du profil', () => {
    mockEsnProfile(['Migration cloud'])
    mockRanking({ data: { excluded: [], ranked: [], total: 0, scored: 0, context: CONTEXT } })
    renderSection([contact({})])
    fireEvent.change(screen.getByPlaceholderText('ex. migration cloud'), { target: { value: 'Refonte SI' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reclasser' }))
    expect(useContactRanking).toHaveBeenLastCalledWith('acc-1', { offer: 'Refonte SI' })
  })

  // #4292.19 — Thales : le score du n°1 passait de 34/55 à 44/65 entre deux rendus (l'axe « offre » arrivait avec
  // le profil ESN, après le premier classement). Tant que le profil n'est pas lu, aucun score n'est affiché.
  it('#4292.19 — pas de score tant que l’offre du profil n’est pas posée : « Classement en cours… »', () => {
    vi.mocked(useEsnProfile).mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<
      typeof useEsnProfile
    >)
    mockRanking({
      data: { excluded: [], ranked: [ranked({ score: 34, max: 55 })], total: 1, scored: 1, context: CONTEXT },
    })
    renderSection([contact({})])
    expect(screen.getByText('Classement en cours…')).toBeInTheDocument()
    expect(screen.queryByText('Camille Roux')).toBeNull()
    expect(screen.queryByText(/34/)).toBeNull()
  })

  it('#4292.19 — le profil lu, le score affiché est celui de la requête AVEC l’offre, et il ne bouge plus', () => {
    mockEsnProfile(['Migration cloud'])
    mockRanking({
      data: { excluded: [], ranked: [ranked({ score: 44, max: 65 })], total: 1, scored: 1, context: CONTEXT },
    })
    renderSection([contact({})])
    expect(screen.getByText('Camille Roux')).toBeInTheDocument()
    expect(screen.queryByText('Classement en cours…')).toBeNull()
    expect(useContactRanking).toHaveBeenLastCalledWith('acc-1', { offer: 'Migration cloud' })
  })

  it('une réponse sans liste `ranked` ne fait pas tomber l’onglet : elle vaut « indisponible »', () => {
    vi.mocked(useContactRanking).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<
      typeof useContactRanking
    >)
    renderSection([contact({ id: 'y', full_name: 'Yves Morel' })])
    expect(screen.getByText(/Classement indisponible/)).toBeInTheDocument()
    expect(screen.getByText('Yves Morel')).toBeInTheDocument()
  })

  it('API ancienne ou en panne : l’ordre de l’analyse revient, et l’écran dit qu’il n’a pas ses critères', () => {
    mockRanking({ isError: true })
    renderSection([contact({ id: 'x', full_name: 'Xavier Blanc' })])
    expect(screen.getByText(/Classement indisponible/)).toBeInTheDocument()
    expect(screen.getByText('Xavier Blanc')).toBeInTheDocument()
    expect(screen.queryByText('Voie d’accès')).not.toBeInTheDocument()
  })

  // #3062 (retour bêta, 26/09/2026) — Louis : « supprimer » sur le bloc des
  // six dimensions d'explication (#2295.8). Remplace les deux tests qui
  // vérifiaient sa présence : la carte ne le rend plus.
  it('#3062 — le bloc des six dimensions d’explication ne s’affiche plus sur la carte', () => {
    mockRanking({ data: { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT } })
    renderSection([contact({})])
    for (const key of ['who', 'when', 'stage', 'unlocks', 'next', 'limit']) {
      expect(screen.queryByTestId(`contact-explanation-${key}`)).not.toBeInTheDocument()
    }
  })

  // #3058 (retour bêta, 26/09/2026) — Louis : « ce message est incompréhensif,
  // à supprimer » sur l'anti-recommandation par contact (#2295.9/#2724.1).
  // Remplace les deux tests qui vérifiaient sa présence.
  it('#3058 — l’anti-recommandation par contact ne s’affiche plus sur la carte', () => {
    mockRanking({
      data: {
        excluded: [],
        ranked: [ranked({ anti_advice: { what: 'dont_treat_as_authority', why: 'limit_no_authority' } })],
        total: 1,
        scored: 1,
        context: CONTEXT,
      },
    })
    renderSection([contact({})])
    expect(screen.queryByTestId('contact-anti-advice')).not.toBeInTheDocument()
  })

  // LUDOVIC-E LC.5 — « Préparer mon appel » sur un contact SANS numéro n'ouvrait rien : sans
  // `callPreparation`, le fournisseur jugeait le canal « téléphone » sans donnée et retombait ailleurs.
  it('LC.5 — « Préparer mon appel » ouvre le panneau d’appel même sans numéro (callPreparation)', () => {
    mockRanking({
      data: { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT },
    })
    engagement.openEngagement.mockClear()
    renderSection([contact({ phone: null })])

    fireEvent.click(screen.getByRole('button', { name: 'preparer-appel' }))
    expect(engagement.openEngagement).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'c1' })],
      'phone',
      expect.objectContaining({ callPreparation: true }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'engager-email' }))
    expect(engagement.openEngagement).toHaveBeenLastCalledWith(
      [expect.objectContaining({ id: 'c1' })],
      'email',
      expect.not.objectContaining({ callPreparation: true }),
    )
  })

  // LUDOVIC-E LC.1 — la zone du profil n'était pas vérifiable : aucune carte n'affichait où le contact travaille.
  it('LC.1 — affiche la ville du contact quand elle est connue (lue à la collecte), rien sinon', () => {
    mockRanking({
      data: { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT },
    })
    const known = renderSection([
      contact({ entity: null, place: { city: 'Lyon', country: 'France', organization: null } }),
    ])
    expect(screen.getByText('Lyon, France')).toBeInTheDocument()
    known.unmount()
    renderSection([contact({ entity: null })])
    expect(screen.queryByText(/Lyon/)).not.toBeInTheDocument()
  })
})

// LOIC-FIX2 O.4 — recette 20/10 : le nom (53×20) et « Voir la fiche » (101×32) menaient à la fiche sous 44 px.
describe('LOIC-FIX2 O.4 — cibles ≥ 44 px du chemin d’accès', () => {
  it('« Voir la fiche » et le nom ouvrent la fiche, chacun avec une cible d’au moins 44 px', () => {
    mockRanking({ data: { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT } })
    const onContactClick = vi.fn()
    render(
      <PriorityPathSection
        accountId="acc-1"
        contacts={[contact({})]}
        accountCompanyName="ACME"
        rawAnalysis={{}}
        entities={[]}
        enrichmentCredits={10}
        enrichMutation={{ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useEnrichContact>}
        onContactClick={onContactClick}
      />,
    )
    const view = screen.getByRole('button', { name: 'Voir la fiche' })
    const name = screen.getByRole('button', { name: 'Camille Roux' })
    expect(view.className).toMatch(/min-h-11/)
    expect(name.className).toMatch(/min-h-11/)
    fireEvent.click(name)
    expect(onContactClick).toHaveBeenCalledTimes(1)
  })
})

// LOIC-FIX2 O.3 — « Pourquoi ce rang ? » : points SUR leur maximum, et la raison du passage devant le suivant.
describe('LOIC-FIX2 O.3 — Pourquoi ce rang ?', () => {
  const first = ranked({
    contact_id: 'a',
    position: 1,
    score: 35,
    max: 50,
    axes: [
      { key: 'perimeter', points: 20, max: 30, reason: 'perimeter_p1' },
      { key: 'subject', points: 10, max: 10, reason: 'subject_match' },
      { key: 'history', points: 5, max: 10, reason: 'no_exchange' },
    ],
  })
  const second = ranked({
    contact_id: 'b',
    position: 2,
    score: 22,
    max: 50,
    axes: [
      { key: 'perimeter', points: 5, max: 30, reason: 'perimeter_p1' },
      { key: 'subject', points: 10, max: 10, reason: 'subject_match' },
      { key: 'history', points: 7, max: 10, reason: 'no_exchange' },
    ],
  })

  function open() {
    mockRanking({ data: { excluded: [], ranked: [first, second], total: 2, scored: 2, context: CONTEXT } })
    renderSection([contact({ id: 'a', full_name: 'Alice Martin' }), contact({ id: 'b', full_name: 'Bruno Petit' })])
    fireEvent.click(screen.getAllByRole('button', { name: 'Pourquoi ce rang ?' })[0] as HTMLElement)
  }

  it('chaque critère affiche ses points sur son maximum (20/30), jamais le nombre nu', () => {
    open()
    const cards = screen.getAllByTestId('priority-contact-card')
    expect(within(cards[0] as HTMLElement).getByText('20/30')).toBeInTheDocument()
    expect(within(cards[0] as HTMLElement).getAllByText('10/10').length).toBeGreaterThan(0)
  })

  it('dit pourquoi ce contact passe devant le suivant, par le critère le plus discriminant', () => {
    open()
    const line = screen.getByTestId('ranking-pass-ahead')
    expect(line).toHaveTextContent('Passe devant Bruno Petit (n° 2)')
    // périmètre : 20 contre 5 (écart 15) l'emporte sur l'historique, où le suivant fait mieux.
    expect(line).toHaveTextContent('20/30 contre 5/30')
  })

  it('le dernier du classement ne passe devant personne : aucune phrase', () => {
    open()
    const cards = screen.getAllByTestId('priority-contact-card')
    fireEvent.click(within(cards[1] as HTMLElement).getByRole('button', { name: 'Pourquoi ce rang ?' }))
    expect(within(cards[1] as HTMLElement).queryByTestId('ranking-pass-ahead')).not.toBeInTheDocument()
  })
})

describe('PriorityPathSection — Recette 21/10 A.2 / A.3 / A.4', () => {
  const sameAxes = [
    { key: 'perimeter', points: 20, max: 30, reason: 'perimeter_p1' },
    { key: 'subject', points: 10, max: 10, reason: 'subject_match' },
  ] as RankedContact['axes']
  const a = ranked({ contact_id: 'a', position: 1, score: 99, max: 99, axes: sameAxes })
  const b = ranked({ contact_id: 'b', position: 2, score: 1, max: 99, axes: sameAxes })

  function open() {
    mockRanking({ data: { excluded: [], ranked: [a, b], total: 2, scored: 2, context: CONTEXT } })
    renderSection([contact({ id: 'a', full_name: 'Alice Martin' }), contact({ id: 'b', full_name: 'Bruno Petit' })])
    const trigger = screen.getAllByRole('button', { name: 'Pourquoi ce rang ?' })[0] as HTMLElement
    fireEvent.click(trigger)
    return trigger
  }

  it('A.2 : le total affiché est la somme du détail (30/40 → 75/100), pas ranked.score', () => {
    open()
    expect(screen.getAllByTestId('ranking-axes-sum')[0]).toHaveTextContent('30 points sur 40 évalués, ramenés à 75/100')
  })

  it('A.3 : deux contacts à égalité de score le disent', () => {
    open()
    expect(screen.getByTestId('ranking-tied')).toHaveTextContent('À égalité avec Bruno Petit (n° 2)')
    expect(screen.queryByTestId('ranking-pass-ahead')).not.toBeInTheDocument()
  })

  it('A.7 : le badge « N° N » porte le même aria-label que /contacts', () => {
    open()
    expect(screen.getAllByLabelText('Priorité 1 — 1 = à contacter en premier').length).toBeGreaterThan(0)
  })

  it('A.4 : le déclencheur « Pourquoi ce rang ? » a une cible de 44 px', () => {
    expect(open().className).toContain('min-h-11')
  })
})

// #4984.2 — l'ordre suit la taille du compte : la phrase LIT le palier de la réponse (GA-26) ; absent ⇒ rien.
describe('#4984.2 — « classé pour une entreprise de N personnes »', () => {
  const base = { excluded: [], ranked: [ranked({})], total: 1, scored: 1, context: CONTEXT }
  const withSize = (employees: number, tier: 'small' | 'mid' | 'large') => ({
    ...base,
    account_size: { employees, tier },
  })
  it('dit la taille pour laquelle le rang est calculé', () => {
    mockRanking({ data: withSize(500, 'small') })
    renderSection([contact({})])
    expect(screen.getByTestId('priority-ranked-size').textContent).toBe(
      'Classé pour une entreprise de 500 personnes (palier moins de 1 000 personnes).',
    )
  })
  it('nomme le palier envoyé par l’API : 1 000 à 10 000, puis plus de 10 000', () => {
    mockRanking({ data: withSize(1500, 'mid') })
    const { unmount } = renderSection([contact({})])
    expect(screen.getByTestId('priority-ranked-size').textContent).toContain('palier 1 000 à 10 000 personnes')
    unmount()
    mockRanking({ data: withSize(20000, 'large') })
    renderSection([contact({})])
    expect(screen.getByTestId('priority-ranked-size').textContent).toContain('palier plus de 10 000 personnes')
  })
  it('ne recalcule jamais le palier : celui de l’API gagne sur le texte du compte', () => {
    mockRanking({ data: withSize(500, 'large') })
    renderSection([contact({})])
    expect(screen.getByTestId('priority-ranked-size').textContent).toContain('palier plus de 10 000 personnes')
  })
  it('effectif inconnu (champ absent) : aucune phrase, jamais « 0 personne »', () => {
    mockRanking({ data: base })
    renderSection([contact({})])
    expect(screen.queryByTestId('priority-ranked-size')).toBeNull()
  })
})
