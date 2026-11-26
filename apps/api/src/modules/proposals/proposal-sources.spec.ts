import { buildProposalOutline } from '@bellum/contracts'
import { type ProposalSources, toProposalInput } from './proposal-sources'

/**
 * L'assemblage des SOURCES vers l'entrée de l'assembleur.
 *
 * Le contrat (`packages/contracts/src/schemas/proposal.ts`) sait ranger ce que
 * le produit connaît dans les neuf sections d'une proposition, et NOMMER ce qui
 * manque. Ce fichier-ci tient la moitié qui manquait : la traduction des lignes
 * de la base vers son entrée. Chaque test tient une règle qui, si elle cédait,
 * ferait écrire au client une affirmation que personne n'a vérifiée.
 */

function sources(over: Partial<ProposalSources> = {}): ProposalSources {
  return {
    account: null,
    project: { label: 'Refonte du socle data', detail: null, offer: null, estimated_amount: null, btmmp: null },
    team: [],
    clientSafeProofs: [],
    risks: [],
    openRequirements: [],
    ...over,
  }
}

function member(over: Partial<ProposalSources['team'][number]> = {}): ProposalSources['team'][number] {
  return {
    fullName: 'A. Martin',
    availability: 'immediate',
    skills: [],
    proposedRateCents: null,
    consentState: null,
    cvVersionStatus: null,
    cvChanges: [],
    hasSourceCv: false,
    priorPresentationsCount: 0,
    ...over,
  }
}

describe('toProposalInput', () => {
  it('reprend le compte, son secteur et ses enjeux — sans en inventer', () => {
    const input = toProposalInput(
      sources({
        account: {
          company_name: 'Contoso Industries',
          sector: 'Industrie',
          it_challenges: [
            { title: 'Dette applicative', description: null },
            { title: null, description: 'ERP en fin de vie' },
            { title: '  ', description: null },
          ],
        },
      }),
    )

    expect(input.accountName).toBe('Contoso Industries')
    expect(input.accountSector).toBe('Industrie')
    // Le titre d'abord, la description en repli. Un enjeu qui n'a ni l'un ni
    // l'autre DISPARAÎT : il ne devient pas une puce vide dans « contexte ».
    expect(input.accountChallenges).toEqual(['Dette applicative', 'ERP en fin de vie'])
  })

  it('sans compte lisible, le nom et le secteur restent nuls — jamais une chaîne de remplissage', () => {
    const input = toProposalInput(sources({ account: null }))
    expect(input.accountName).toBeNull()
    expect(input.accountSector).toBeNull()
    expect(input.accountChallenges).toEqual([])
  })

  it('convertit le montant `numeric` (rendu en chaîne par le driver) en nombre', () => {
    const input = toProposalInput(
      sources({ project: { label: 'x', detail: null, offer: null, estimated_amount: '120000.00', btmmp: null } }),
    )
    expect(input.estimatedAmount).toBe(120000)
  })

  it('un montant illisible vaut `null`, jamais 0 — « non saisi » n’est pas « gratuit »', () => {
    const input = toProposalInput(
      sources({ project: { label: 'x', detail: null, offer: null, estimated_amount: 'n/a', btmmp: null } }),
    )
    expect(input.estimatedAmount).toBeNull()
  })

  it('n’expose comme offre que celle RATTACHÉE au besoin', () => {
    const withOffer = toProposalInput(
      sources({ project: { label: 'x', detail: null, offer: 'TMA data', estimated_amount: null, btmmp: null } }),
    )
    expect(withOffer.offers).toEqual(['TMA data'])

    // Sans rattachement, la liste reste VIDE : les domaines d'expertise de l'ESN
    // ne sont pas « les offres qui répondent à ce besoin » tant que personne ne
    // les y a reliés, et la section « approche » doit le dire.
    expect(toProposalInput(sources()).offers).toEqual([])
  })

  it('recopie les six axes BTMMP tels qu’ils ont été saisis', () => {
    const input = toProposalInput(
      sources({
        project: {
          label: 'x',
          detail: null,
          offer: null,
          estimated_amount: null,
          btmmp: {
            budget: '400 k€',
            timing: 'T4',
            mission: 'Refonte',
            management: 'DSI',
            process: 'Appel d’offres',
            nextStep: 'Soutenance',
          },
        },
      }),
    )
    expect(input.btmmp).toEqual({
      budget: '400 k€',
      timing: 'T4',
      mission: 'Refonte',
      management: 'DSI',
      process: 'Appel d’offres',
      nextStep: 'Soutenance',
    })
  })

  describe('équipe', () => {
    it('ne déclare une disponibilité CONFIRMÉE que sur une fenêtre datée', () => {
      const input = toProposalInput(
        sources({
          team: [
            member({ fullName: 'Immédiat', availability: 'immediate' }),
            member({ fullName: 'Un mois', availability: 'sous_1_mois' }),
            member({ fullName: 'Trois mois', availability: 'sous_3_mois' }),
            member({ fullName: 'Indisponible', availability: 'indisponible' }),
            member({ fullName: 'Inconnu', availability: 'inconnu' }),
          ],
        }),
      )
      expect(input.team.map(row => row.availabilityConfirmed)).toEqual([true, true, true, false, false])
    })

    it('ne cite comme démontrée qu’une compétence vue en mission ou en entretien', () => {
      const input = toProposalInput(
        sources({
          team: [
            member({
              skills: [
                { label: 'Kubernetes', source: 'mission' },
                { label: 'Terraform', source: 'interview' },
                { label: 'Go', source: 'cv' },
                { label: 'Kafka', source: 'declared' },
                { label: 'Rust', source: null },
              ],
            }),
          ],
        }),
      )
      // Un CV est auto-déclaratif et `declared` est une saisie : ni l'un ni
      // l'autre ne se cite comme preuve dans un document envoyé au client.
      expect(input.team[0]?.demonstratedSkills).toEqual(['Kubernetes', 'Terraform'])
    })
  })

  describe('TJM', () => {
    it('reprend le tarif PROPOSÉ quand le projet n’en porte qu’un', () => {
      const input = toProposalInput(
        sources({ team: [member({ proposedRateCents: 65000 }), member({ proposedRateCents: 65000 })] }),
      )
      expect(input.dailyRate).toBe(650)
    })

    it('reste nul quand deux positionnements portent deux tarifs différents', () => {
      // En choisir un — le premier, le plus haut, une moyenne — écrirait sur la
      // proposition un prix que personne n'a décidé.
      const input = toProposalInput(
        sources({ team: [member({ proposedRateCents: 65000 }), member({ proposedRateCents: 72000 })] }),
      )
      expect(input.dailyRate).toBeNull()
    })

    it('reste nul quand aucun positionnement n’est chiffré', () => {
      const input = toProposalInput(sources({ team: [member({ proposedRateCents: null })] }))
      expect(input.dailyRate).toBeNull()
    })
  })

  describe('dossier de compétences et consentement (BEL-SC-239)', () => {
    it('reprend le consentement, le statut du dossier adapté et l’historique de présentation', () => {
      const input = toProposalInput(
        sources({
          team: [
            member({
              consentState: 'expiring',
              cvVersionStatus: 'validated',
              cvChanges: [{ before: 'a', after: 'b', reason: 'c', sourceProof: null }],
              hasSourceCv: true,
              priorPresentationsCount: 3,
            }),
          ],
        }),
      )
      expect(input.team[0]?.consentState).toBe('expiring')
      expect(input.team[0]?.cvVersionStatus).toBe('validated')
      expect(input.team[0]?.cvChanges).toHaveLength(1)
      expect(input.team[0]?.hasSourceCv).toBe(true)
      expect(input.team[0]?.priorPresentationsCount).toBe(3)
    })
  })

  it('ne reprend en référence que ce qui est citable, avec son détail quand il existe', () => {
    const input = toProposalInput(
      sources({
        clientSafeProofs: [
          { claim: 'Migration de 400 To en 6 mois', detail: 'secteur industrie' },
          { claim: 'Réduction de 30 % du coût cloud', detail: null },
        ],
      }),
    )
    expect(input.references).toEqual([
      'Migration de 400 To en 6 mois — secteur industrie',
      'Réduction de 30 % du coût cloud',
    ])
  })

  it('passe les risques et les exigences non couvertes sans les fusionner', () => {
    const input = toProposalInput(
      sources({ risks: ['A. Martin : pas de preuve Kafka'], openRequirements: ['ISO 27001'] }),
    )
    expect(input.risks).toEqual(['A. Martin : pas de preuve Kafka'])
    expect(input.openRequirements).toEqual(['ISO 27001'])
  })

  it('produit une entrée que le contrat accepte, et un plan lisible de bout en bout', () => {
    const outline = buildProposalOutline(
      toProposalInput(
        sources({
          account: {
            company_name: 'Contoso',
            sector: 'Industrie',
            it_challenges: [{ title: 'Dette', description: null }],
          },
          project: {
            label: 'Refonte data',
            detail: 'Socle unifié',
            offer: 'TMA data',
            estimated_amount: '90000',
            btmmp: {
              budget: '100 k€',
              timing: 'T4',
              mission: 'Refonte',
              management: 'DSI',
              process: 'AO',
              nextStep: 'Soutenance',
            },
          },
          team: [member({ proposedRateCents: 65000, skills: [{ label: 'Kubernetes', source: 'mission' }] })],
          clientSafeProofs: [{ claim: 'Migration 400 To', detail: null }],
          risks: ['Fenêtre de bascule courte'],
        }),
      ),
    )

    expect(outline.sections).toHaveLength(10)
    expect(outline.complete).toBe(true)
    expect(outline.sections.find(section => section.key === 'pricing')?.state).toBe('ready')
    expect(outline.sections.find(section => section.key === 'context')?.state).toBe('ready')
  })

  it('sur un dossier vide, aucune section n’est prête et chaque trou dit pourquoi', () => {
    const outline = buildProposalOutline(toProposalInput(sources()))
    expect(outline.readyCount).toBe(0)
    expect(outline.complete).toBe(false)
    // Une section vide sans mode d'emploi est un trou ; avec sa raison, c'est
    // une tâche. C'est toute la valeur du studio.
    expect(outline.sections.every(section => section.gaps.length > 0)).toBe(true)
  })
})
