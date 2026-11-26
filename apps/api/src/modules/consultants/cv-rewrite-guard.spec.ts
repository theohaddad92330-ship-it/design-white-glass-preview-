import type { Consultant } from '@bellum/contracts'
import type { MatchTarget } from './consultant-matching'
import { deterministicGaps, excludedSkillsFor, proofIsGrounded, sanitizeCvRewrite } from './cv-rewrite-guard'

/**
 * Le garde-fou de la réécriture de CV (annexe méthodo p22).
 *
 * L'enjeu de ces tests n'est pas la mise en forme : c'est qu'une sortie de modèle
 * hostile (profil « musclé » pour coller au besoin) ne puisse pas produire un CV
 * qui affirme une expérience que la personne n'a pas.
 */

const CV = `Ingénieur DevOps — 2019 à 2023, Société Générale.
Migration de 40 applications vers Kubernetes, mise en place de pipelines GitLab CI.
2016 à 2019, Atos : administration de clusters Linux et scripts Ansible.`

function consultant(overrides: Partial<Consultant> = {}): Consultant {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: null,
    kind: 'consultant',
    source: null,
    last_contact_at: null,
    archived_at: null,
    archived_reason: null,
    review_status: 'qualified' as const,
    consent: { givenAt: null, expiresAt: null, basis: null, restrictions: null },
    full_name: 'Camille Dubois',
    title: 'Ingénieur DevOps',
    seniority: 'senior',
    years_experience: null,
    availability: 'immediate',
    available_from: null,
    contract_type: 'cdi',
    engagement_kind: 'salarie' as const,
    partner_account_id: null,
    contact_visible: true,
    finance_visible: true,
    tjm: 600,
    stack: ['Kubernetes', 'GitLab CI', 'Ansible'],
    sectors: ['Banque'],
    zones: ['IDF'],
    education: [],
    mobility: {
      zones: null,
      remote: null,
      travel: null,
      relocation: null,
      siteFrequency: null,
      international: null,
      restrictions: null,
    },
    process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
    positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
    preferences: { wantedSectors: [], refusedSectors: [], refusedTechnologies: [], wantedContractKinds: [] },
    references: ['Société Générale'],
    languages: [],
    clearances: [],
    wants: null,
    notes: null,
    cv_text: CV,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

const TARGET: MatchTarget = {
  label: 'Migration Kubernetes et industrialisation Terraform',
  detail: 'Renfort DevOps sur la plateforme cloud',
  offer: null,
  sector: 'Banque',
  zone: 'IDF',
}

describe('proofIsGrounded', () => {
  it('accepte une citation réellement présente dans le CV', () => {
    expect(proofIsGrounded('Migration de 40 applications vers Kubernetes', CV)).toBe(true)
  })

  it('accepte malgré la casse, les accents et les retours à la ligne', () => {
    expect(proofIsGrounded('ADMINISTRATION  de clusters\nLinux', CV)).toBe(true)
  })

  it('refuse une citation absente du CV', () => {
    expect(proofIsGrounded('Certification AWS Solutions Architect obtenue en 2022', CV)).toBe(false)
  })

  it('refuse une citation trop courte pour prouver quoi que ce soit', () => {
    // « Linux » est bien dans le CV, mais un mot ne prouve pas une expérience.
    expect(proofIsGrounded('Linux', CV)).toBe(false)
  })
})

describe('deterministicGaps', () => {
  it('signale un terme du besoin absent de la stack ET du CV', () => {
    const gaps = deterministicGaps(consultant(), TARGET)
    expect(gaps.join(' ')).toContain('terraform')
  })

  it('ne signale PAS un terme couvert par la stack déclarée', () => {
    expect(deterministicGaps(consultant(), TARGET).join(' ')).not.toContain('kubernetes')
  })

  it('ne signale PAS un terme prouvé par le CV même s’il manque à la stack', () => {
    // Le CV fait foi : c'est lui la preuve, la stack n'est qu'une déclaration.
    const sansStack = consultant({ stack: [] })
    expect(deterministicGaps(sansStack, TARGET).join(' ')).not.toContain('kubernetes')
  })

  it('ne dit rien quand le besoin n’a aucun terme discriminant', () => {
    expect(deterministicGaps(consultant(), { label: 'Mission', detail: null, offer: null })).toEqual([])
  })
})

describe('sanitizeCvRewrite', () => {
  const at = '2026-07-24T10:00:00.000Z'

  it('garde une expérience dont la citation est dans le CV', () => {
    const out = sanitizeCvRewrite(
      {
        headline: 'Ingénieur DevOps — plateformes bancaires',
        summary: 'Dix ans sur des plateformes régulées.',
        highlights: [
          {
            title: 'Migration Kubernetes à grande échelle',
            detail: '40 applications migrées en production.',
            proof: 'Migration de 40 applications vers Kubernetes',
          },
        ],
        keywords: ['Kubernetes'],
        gaps: [],
      },
      consultant(),
      TARGET,
      at,
    )
    expect(out.highlights).toHaveLength(1)
    expect(out.highlights[0]?.title).toBe('Migration Kubernetes à grande échelle')
  })

  it('RETIRE une expérience inventée et le DIT dans les manques', () => {
    const out = sanitizeCvRewrite(
      {
        highlights: [
          {
            title: 'Architecte AWS certifié',
            detail: 'Certification obtenue en 2022, trois refontes cloud.',
            proof: 'Certification AWS Solutions Architect obtenue en 2022',
          },
        ],
        gaps: [],
      },
      consultant(),
      TARGET,
      at,
    )
    expect(out.highlights).toEqual([])
    expect(out.gaps.join(' ')).toContain('retirées')
  })

  it('ajoute les manques calculés même quand le modèle n’en déclare aucun', () => {
    const out = sanitizeCvRewrite({ highlights: [], gaps: [] }, consultant(), TARGET, at)
    expect(out.gaps.join(' ')).toContain('terraform')
  })

  it('retire un mot-clé « couvert » que le CV ne mentionne pas', () => {
    const out = sanitizeCvRewrite(
      { highlights: [], keywords: ['Kubernetes', 'Terraform'], gaps: [] },
      consultant(),
      TARGET,
      at,
    )
    expect(out.keywords).toEqual(['Kubernetes'])
  })

  it('rend un livrable valide même sur une sortie de modèle absurde', () => {
    const out = sanitizeCvRewrite('pas du JSON', consultant(), TARGET, at)
    expect(out.consultantName).toBe('Camille Dubois')
    expect(out.missionLabel).toBe(TARGET.label)
    expect(out.headline).toBe('Ingénieur DevOps') // repli sur le titre déclaré
    expect(out.highlights).toEqual([])
  })

  it('TÉMOIN — sans CV source, aucune expérience ne peut être prouvée', () => {
    // Le pendant du test précédent : la sévérité ne vient pas du contenu du
    // modèle mais de l'absence de source. Retirer le CV suffit à tout invalider.
    const out = sanitizeCvRewrite(
      {
        highlights: [
          {
            title: 'Migration Kubernetes à grande échelle',
            detail: '40 applications migrées.',
            proof: 'Migration de 40 applications vers Kubernetes',
          },
        ],
      },
      consultant({ cv_text: null }),
      TARGET,
      at,
    )
    expect(out.highlights).toEqual([])
  })
})

/**
 * Les compétences ÉCARTÉES d'un dossier, avec leur raison (§9.2).
 *
 * Le garde-fou retirait en silence. Une compétence retirée sans un mot fait
 * croire que le profil ne l'a pas ; une compétence BARRÉE avec sa raison dit
 * exactement ce qu'il faut dire à un client — et prépare la question qu'il
 * posera.
 */
describe('excludedSkillsFor', () => {
  it('n’écarte PAS une compétence que le CV mentionne', () => {
    const profile = consultant({ stack: ['Kubernetes', 'GitLab CI'] })
    expect(excludedSkillsFor(profile)).toEqual([])
  })

  it('BARRE une compétence déclarée et absente du CV, en disant pourquoi', () => {
    const profile = consultant({ stack: ['Kubernetes', 'Kafka'] })
    const excluded = excludedSkillsFor(profile)
    expect(excluded).toHaveLength(1)
    expect(excluded[0]?.term).toBe('Kafka')
    // La raison est LISIBLE par un commercial : « absente du CV source » se
    // défend devant un client, « exclue » ne se défend pas.
    expect(excluded[0]?.reason).toContain('absente du CV source')
  })

  it('garde une compétence prouvée en MISSION même absente du CV', () => {
    // Une mission réalisée vaut mieux qu'une ligne de CV : c'est la source la
    // plus forte du §5.2.
    const profile = consultant({ stack: ['Kafka'] })
    expect(excludedSkillsFor(profile, [{ skill: 'Kafka', source: 'mission' }])).toEqual([])
  })

  it('barre une compétence seulement DÉCLARÉE, même connue du référentiel', () => {
    const profile = consultant({ stack: ['Kafka'] })
    const excluded = excludedSkillsFor(profile, [{ skill: 'Kafka', source: 'declared' }])
    expect(excluded[0]?.reason).toContain('aucune mission ni entretien')
  })
})
