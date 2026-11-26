import { describe, expect, it } from 'vitest'
import { buildProposalOutline, PROPOSAL_SECTION_ORDER, proposalInputSchema, type ProposalInput } from './proposal.js'

/**
 * L'assembleur de proposition (addendum final p69).
 *
 * Le module est un assembleur, pas un générateur : il constate ce que le produit
 * sait déjà et NOMME ce qui manque. Ces tests vérifient exactement cette
 * discipline — parce qu'une proposition commerciale porte un prix, un planning et
 * des noms de consultants, et que c'est le pire endroit du produit pour inventer.
 */

function input(over: Partial<ProposalInput> = {}): ProposalInput {
  return proposalInputSchema.parse({ ...over })
}

function sectionOf(outline: ReturnType<typeof buildProposalOutline>, key: string) {
  return outline.sections.find(section => section.key === key)
}

describe('assemblage', () => {
  it('rend les sections de la p69 (+ objections, BEL-SC-239), dans l’ordre', () => {
    const outline = buildProposalOutline(input())
    expect(outline.sections.map(section => section.key)).toEqual([...PROPOSAL_SECTION_ORDER])
  })

  it('sur un dossier vide, tout est « manquant » — et chaque trou dit pourquoi', () => {
    // Un écran qui affiche neuf sections vides sans mode d'emploi est inutile.
    const outline = buildProposalOutline(input())
    expect(outline.complete).toBe(false)
    for (const section of outline.sections) {
      expect(section.gaps.length).toBeGreaterThan(0)
    }
  })

  it('dérive l’état du CONTENU — il ne peut pas mentir sur ce qu’il y a dedans', () => {
    const outline = buildProposalOutline(
      input({ accountName: 'ACME', accountSector: 'Banque', accountChallenges: ['Modernisation du socle data'] }),
    )
    expect(sectionOf(outline, 'context')?.state).toBe('ready')
  })

  it('marque « partiel » ce qui est entamé mais incomplet', () => {
    const outline = buildProposalOutline(input({ accountName: 'ACME' }))
    const context = sectionOf(outline, 'context')
    expect(context?.state).toBe('partial')
    expect(context?.gaps.join(' ')).toContain('Secteur')
  })
})

describe('équipe', () => {
  it('annonce une disponibilité non confirmée — le risque le plus coûteux', () => {
    // Mieux vaut l'écrire ici qu'en soutenance, quand le client demande la date
    // de démarrage.
    const outline = buildProposalOutline(
      input({
        team: [{ fullName: 'Nadia Fournier', availabilityConfirmed: false, demonstratedSkills: ['kubernetes'] }],
      }),
    )
    expect(sectionOf(outline, 'team')?.gaps.join(' ')).toContain('Disponibilité à confirmer')
  })

  it('signale un profil sans compétence démontrée citable', () => {
    const outline = buildProposalOutline(
      input({ team: [{ fullName: 'Paul Martin', availabilityConfirmed: true, demonstratedSkills: [] }] }),
    )
    expect(sectionOf(outline, 'team')?.gaps.join(' ')).toContain('Sans compétence démontrée')
  })

  it('cite les compétences démontrées à côté du nom', () => {
    const outline = buildProposalOutline(
      input({
        team: [{ fullName: 'Nadia Fournier', availabilityConfirmed: true, demonstratedSkills: ['kubernetes', 'aws'] }],
      }),
    )
    expect(sectionOf(outline, 'team')?.content[0]).toContain('kubernetes')
    expect(sectionOf(outline, 'team')?.state).toBe('ready')
  })
})

describe('prix', () => {
  it('n’invente JAMAIS un montant — il dit qu’il manque', () => {
    const outline = buildProposalOutline(input())
    const pricing = sectionOf(outline, 'pricing')
    expect(pricing?.state).toBe('missing')
    expect(pricing?.gaps.join(' ')).toContain('aucun prix ne sera inventé')
  })

  it('reprend le montant quand il a été SAISI', () => {
    const outline = buildProposalOutline(
      input({ estimatedAmount: 120000, dailyRate: 620, btmmp: { budget: 'enveloppe 150 k€ votée' } }),
    )
    expect(sectionOf(outline, 'pricing')?.state).toBe('ready')
    expect(sectionOf(outline, 'pricing')?.content.join(' ')).toContain('120000')
  })
})

describe('risques', () => {
  it('traite une section risques VIDE comme un problème, pas une bonne nouvelle', () => {
    // C'est presque toujours le signe qu'on ne les a pas cherchés.
    const outline = buildProposalOutline(input())
    expect(sectionOf(outline, 'risks')?.gaps.join(' ')).toContain('vérifier que la question a été posée')
  })

  it('remonte les exigences d’appel d’offres non couvertes comme des risques', () => {
    const outline = buildProposalOutline(input({ openRequirements: ['Hébergement en France'] }))
    expect(sectionOf(outline, 'risks')?.content.join(' ')).toContain('Hébergement en France')
  })
})

describe('objections anticipées (BEL-SC-239)', () => {
  it('sur un dossier vide, dit qu’aucune objection n’a été cherchée', () => {
    const outline = buildProposalOutline(input())
    expect(sectionOf(outline, 'objections')?.gaps.join(' ')).toContain('vérifier que la question a été posée')
  })

  it('reformule une disponibilité non confirmée en objection probable', () => {
    const outline = buildProposalOutline(
      input({
        team: [{ fullName: 'Nadia Fournier', availabilityConfirmed: false, demonstratedSkills: ['kubernetes'] }],
      }),
    )
    expect(sectionOf(outline, 'objections')?.content.join(' ')).toContain('Disponibilité de Nadia Fournier')
  })

  it('reprend les risques et les exigences non couvertes déjà identifiés', () => {
    const outline = buildProposalOutline(
      input({ risks: ['Turnover élevé côté client'], openRequirements: ['Hébergement en France'] }),
    )
    const content = sectionOf(outline, 'objections')?.content.join(' ') ?? ''
    expect(content).toContain('Turnover élevé côté client')
    expect(content).toContain('Hébergement en France')
  })

  it('nomme un consentement expiré ou non recueilli — jamais confondus', () => {
    const outline = buildProposalOutline(
      input({
        team: [
          { fullName: 'A', availabilityConfirmed: true, demonstratedSkills: ['x'], consentState: 'expired' },
          { fullName: 'B', availabilityConfirmed: true, demonstratedSkills: ['x'], consentState: 'none' },
        ],
      }),
    )
    const content = sectionOf(outline, 'objections')?.content.join(' ') ?? ''
    expect(content).toContain('Consentement de A expiré')
    expect(content).toContain('Consentement non recueilli pour B')
  })
})

describe('équipe — trois preuves maximum (BEL-SC-239)', () => {
  it('borne les preuves citées à TROIS, jamais quatre', () => {
    const outline = buildProposalOutline(
      input({
        team: [
          {
            fullName: 'Nadia Fournier',
            availabilityConfirmed: true,
            demonstratedSkills: ['kubernetes', 'aws', 'terraform', 'golang'],
          },
        ],
      }),
    )
    const line = sectionOf(outline, 'team')?.content[0] ?? ''
    expect(line).toContain('kubernetes, aws, terraform')
    expect(line).not.toContain('golang')
  })
})

describe('équipe — CV adapté (BEL-SC-239)', () => {
  it('dit qu’un profil part sur son CV source quand aucun dossier n’a été adapté', () => {
    const outline = buildProposalOutline(
      input({
        team: [
          {
            fullName: 'Nadia Fournier',
            availabilityConfirmed: true,
            demonstratedSkills: ['kubernetes'],
            hasSourceCv: true,
            cvVersionStatus: null,
          },
        ],
      }),
    )
    expect(sectionOf(outline, 'team')?.gaps.join(' ')).toContain('CV non adapté pour ce besoin')
  })

  it('signale un CV adapté encore en attente de validation', () => {
    const outline = buildProposalOutline(
      input({
        team: [
          {
            fullName: 'Nadia Fournier',
            availabilityConfirmed: true,
            demonstratedSkills: ['kubernetes'],
            hasSourceCv: true,
            cvVersionStatus: 'pending_validation',
            cvChanges: [
              {
                before: 'compétence déclarée : rust',
                after: 'retenue dans le dossier',
                reason: 'présente dans le CV source',
                sourceProof: 'rust',
              },
            ],
          },
        ],
      }),
    )
    const team = sectionOf(outline, 'team')
    expect(team?.gaps.join(' ')).toContain('en attente de validation')
    expect(team?.content.join(' ')).toContain('1 modification(s) tracée(s)')
  })

  it('cite l’historique de présentation sans le cacher', () => {
    const outline = buildProposalOutline(
      input({
        team: [
          {
            fullName: 'Nadia Fournier',
            availabilityConfirmed: true,
            demonstratedSkills: ['kubernetes'],
            priorPresentationsCount: 2,
          },
        ],
      }),
    )
    expect(sectionOf(outline, 'team')?.content.join(' ')).toContain('déjà présenté ailleurs (2)')
  })
})

describe('traçabilité', () => {
  it('chaque section cite d’où vient son contenu', () => {
    // Sans source, impossible de savoir si une ligne vient du dossier ou d'une
    // saisie manuelle — donc impossible de la défendre.
    const outline = buildProposalOutline(input())
    for (const section of outline.sections) {
      expect(section.sources.length).toBeGreaterThan(0)
    }
  })

  it('compte les sections prêtes — le seul chiffre qui dit si on peut envoyer', () => {
    const outline = buildProposalOutline(
      input({
        accountName: 'ACME',
        accountSector: 'Banque',
        accountChallenges: ['Data'],
        references: ['Projet comparable chez BETA'],
      }),
    )
    expect(outline.readyCount).toBe(2)
  })
})
