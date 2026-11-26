import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Consultant } from '@bellum/contracts'
import { TalentProfileTab } from './TalentProfileTab'
import { useEnrichTalent } from '../../hooks'

vi.mock('@/features/profiles/hooks/useProfile', () => ({ useProfile: () => ({ data: null }) }))

// #3935.2b — la ligne « Expériences » lit `consultant_experiences`.
const experiencesData = vi.hoisted(() => ({ current: [] as unknown[] }))
vi.mock('../../talent-api', () => ({
  useTalentExperiences: () => ({ data: experiencesData.current }),
}))

vi.mock('../../hooks', () => ({
  useEnrichTalent: vi.fn(),
  useSearchTalentByName: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
  }),
  useConfirmTalentAvailability: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useConfirmTjmValidated: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isSuccess: false }),
  useConfirmCvValidated: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isSuccess: false }),
  useRecordInterviewTrait: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useRecordRampUp: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  // #3406 — `TalentProfileTab` monte aussi le renseignement terrain.
  useRecordFieldReport: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}))
vi.mocked(useEnrichTalent).mockReturnValue({
  mutate: vi.fn(),
  isPending: false,
  isSuccess: false,
  isError: false,
  data: undefined,
  error: null,
} as unknown as ReturnType<typeof useEnrichTalent>)

const TALENT_ID = '11111111-1111-4111-8111-111111111111'

function baseTalent(overrides: Partial<Consultant> = {}): Consultant {
  return {
    id: TALENT_ID,
    kind: 'candidate',
    full_name: 'Alix Martin',
    title: 'Ingénieure plateforme',
    seniority: 'senior',
    contract_type: 'freelance',
    engagement_kind: 'mission',
    contact_visible: true,
    finance_visible: true,
    email: null,
    phone: null,
    location: null,
    education: [],
    public_profile_url: null,
    availability: 'inconnu',
    ...overrides,
  } as unknown as Consultant
}

/**
 * #2183.21 (épopée #2784) — `location` est extraite et persistée depuis
 * longtemps (`cv-parse.service.ts`) mais n'apparaît sur AUCUN écran. Elle
 * rejoint email/téléphone dans le groupe Identité, sous la même règle de
 * visibilité (`contact_visible`) et le même « non renseigné » — jamais un
 * blanc, jamais une valeur devinée.
 */
describe('TalentProfileTab — location (#2784)', () => {
  it('affiche la ville lue dans le CV', () => {
    render(<TalentProfileTab talent={baseTalent({ location: 'Paris (75)' })} />)
    expect(screen.getByText('Paris (75)')).toBeInTheDocument()
  })

  // SIMON-FIX S.4 — une localisation absente ne fait aucune ligne (doctrine 20/09, c113).
  it('ne montre pas la ligne Localisation quand elle est absente', () => {
    render(<TalentProfileTab talent={baseTalent({ location: null })} />)
    expect(screen.queryByText('Localisation')).not.toBeInTheDocument()
  })

  it('« pas ton périmètre » remplace la localisation quand les coordonnées sont retirées', () => {
    render(<TalentProfileTab talent={baseTalent({ location: 'Lyon (69)', contact_visible: false })} />)
    expect(screen.queryByText('Lyon (69)')).not.toBeInTheDocument()
  })
})

/**
 * #2948 (#2329.19/.22/.23) — mobilité FINE : fréquence sur site, international,
 * restriction nommée. Même règle que le reste de la fiche : `null` DIT « non
 * renseigné », jamais un tiret muet ni une valeur devinée.
 */
describe('TalentProfileTab — mobilité fine (#2329.19/.22/.23)', () => {
  it('affiche la fréquence sur site, l’international et la restriction quand ils sont renseignés', () => {
    render(
      <TalentProfileTab
        talent={baseTalent({
          mobility: {
            zones: null,
            remote: null,
            travel: null,
            relocation: null,
            siteFrequency: 'reguliere',
            international: true,
            restrictions: 'Pas de découché',
          },
        })}
      />,
    )
    expect(screen.getByText('Régulière')).toBeInTheDocument()
    expect(screen.getByText('Accepte une mission à l’étranger')).toBeInTheDocument()
    expect(screen.getByText('Pas de découché')).toBeInTheDocument()
  })

  it('dit « non renseigné » — c’est le test qui dit NON — quand personne n’a demandé', () => {
    render(
      <TalentProfileTab
        talent={baseTalent({
          mobility: {
            zones: null,
            remote: null,
            travel: null,
            relocation: null,
            siteFrequency: null,
            international: null,
            restrictions: null,
          },
        })}
      />,
    )
    // SIMON-FIX S.4 — rien n'a été demandé : aucune ligne « Non renseigné ».
    expect(screen.queryAllByText('Non renseigné')).toHaveLength(0)
    expect(screen.queryByText('Accepte une mission à l’étranger')).not.toBeInTheDocument()
    expect(screen.queryByText('Refuse une mission à l’étranger')).not.toBeInTheDocument()
  })

  it('distingue un refus EXPLICITE de l’international d’un « on n’a pas demandé »', () => {
    render(
      <TalentProfileTab
        talent={baseTalent({
          mobility: {
            zones: null,
            remote: null,
            travel: null,
            relocation: null,
            siteFrequency: null,
            international: false,
            restrictions: null,
          },
        })}
      />,
    )
    expect(screen.getByText('Refuse une mission à l’étranger')).toBeInTheDocument()
  })
})

/**
 * #2948 (#2329.30-.34) — PROCESSUS : démarches en cours, exclusivité, autres
 * entretiens, deadline. L'owner N'Y FIGURE PAS (GA-26, voir le composant) — ce
 * test vérifie aussi qu'il n'est pas dupliqué ici.
 */
describe('TalentProfileTab — processus (#2329.30-.34)', () => {
  it('affiche les démarches en cours, les autres entretiens et la deadline quand ils sont renseignés', () => {
    render(
      <TalentProfileTab
        talent={baseTalent({
          process: {
            inProgress: true,
            exclusive: false,
            otherInterviews: 'Entretien final ailleurs',
            decisionDeadline: '2026-10-15',
          },
        })}
      />,
    )
    expect(screen.getByText('Des démarches sont en cours ailleurs')).toBeInTheDocument()
    expect(screen.getByText('Pas d’exclusivité')).toBeInTheDocument()
    expect(screen.getByText('Entretien final ailleurs')).toBeInTheDocument()
    expect(screen.getByText('2026-10-15')).toBeInTheDocument()
  })

  it('dit « non renseigné » — le test qui dit NON — quand rien n’a été demandé', () => {
    render(
      <TalentProfileTab
        talent={baseTalent({
          process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
        })}
      />,
    )
    expect(screen.queryAllByText('Non renseigné')).toHaveLength(0)
  })
})

/**
 * #2948 (#2329.45-.51) — L'ACCORD À 7 CONDITIONS : TJM validé, CV validé,
 * autres processus connus (dérivé de `process.otherInterviews`).
 */
describe('TalentProfileTab — accord avant présentation (#2329.45-.51)', () => {
  it('dit « connus » quand `process.otherInterviews` est renseigné, « non demandés » sinon', () => {
    const { rerender } = render(
      <TalentProfileTab
        talent={baseTalent({
          process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
          positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
        })}
      />,
    )
    expect(screen.getByText('Non demandés')).toBeInTheDocument()

    rerender(
      <TalentProfileTab
        talent={baseTalent({
          process: { inProgress: null, exclusive: null, otherInterviews: 'RAS', decisionDeadline: null },
          positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: true },
        })}
      />,
    )
    expect(screen.getByText('Connus')).toBeInTheDocument()
  })

  it('affiche l’action de validation quand rien n’est confirmé, l’état validé sinon', () => {
    const { rerender } = render(
      <TalentProfileTab
        talent={baseTalent({
          positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
        })}
      />,
    )
    expect(screen.getByRole('button', { name: 'Valider le TJM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Valider le CV' })).toBeInTheDocument()

    rerender(
      <TalentProfileTab
        talent={baseTalent({
          positioningAgreement: {
            tjmValidatedAt: '2026-09-01T00:00:00.000Z',
            cvValidatedAt: '2026-09-01T00:00:00.000Z',
            otherProcessesKnown: false,
          },
        })}
      />,
    )
    expect(screen.getByText('TJM validé.')).toBeInTheDocument()
    expect(screen.getByText('CV validé.')).toBeInTheDocument()
  })
})

/**
 * #2183.26 (épopée #2784) — les formations lues dans le CV rejoignent
 * `location` côté persistance (`consultants.education`) : la fiche ne dit
 * plus « non renseigné » sur une fiche née d'un CV déposé qui en portait.
 * Contrairement à `location`, ce n'est pas une coordonnée : elle reste
 * visible même quand `contact_visible` est retiré.
 */
/**
 * BEL-SC-238 (#3267) — ce que l'ENTRETIEN a appris (communication, autonomie,
 * temps avant efficacité). `null`/absent dit « non renseigné », jamais un
 * niveau deviné.
 */
describe('TalentProfileTab — traits d’entretien (#3267, BEL-SC-238)', () => {
  it('ne dit pas « non renseigné » quand aucun trait n’a encore été évalué (SIMON-FIX S.4)', () => {
    render(<TalentProfileTab talent={baseTalent()} />)
    expect(screen.queryAllByText('Non renseigné')).toHaveLength(0)
  })

  it('affiche le niveau enregistré pour un trait évalué', () => {
    render(
      <TalentProfileTab
        talent={baseTalent({
          interviewAssessment: {
            traits: [
              {
                trait: 'communication',
                level: 'fort',
                source: 'interview',
                note: null,
                recordedAt: '2026-09-28T10:00:00.000Z',
                recordedByName: null,
              },
            ],
            rampUp: { band: 'semaines', note: null, recordedAt: '2026-09-28T10:00:00.000Z', recordedByName: null },
          },
        })}
      />,
    )
    // « Fort » et « Quelques semaines » apparaissent deux fois chacun : la
    // valeur affichée ET le bouton du même libellé (trois crans nommés en un
    // clic, jamais un sélecteur générique) — voir InterviewTraitRow/RampUpRow.
    expect(screen.getAllByText('Fort').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Quelques semaines').length).toBeGreaterThanOrEqual(2)
  })
})

describe('TalentProfileTab — education (#2784)', () => {
  it('affiche les formations lues dans le CV', () => {
    render(<TalentProfileTab talent={baseTalent({ education: ['Master Informatique — Sorbonne — 2015'] })} />)
    expect(screen.getByText('Master Informatique — Sorbonne — 2015')).toBeInTheDocument()
  })

  it('ne montre aucune ligne Formation quand aucune formation n’est connue (SIMON-FIX S.4)', () => {
    render(<TalentProfileTab talent={baseTalent({ education: [] })} />)
    expect(screen.queryAllByText('Non renseigné')).toHaveLength(0)
  })

  it('reste visible même quand les coordonnées de contact sont retirées', () => {
    render(<TalentProfileTab talent={baseTalent({ education: ['DUT Réseaux — Lyon'], contact_visible: false })} />)
    expect(screen.getByText('DUT Réseaux — Lyon')).toBeInTheDocument()
  })
})

/**
 * #3935.2a (lot M07, 09/10) — environnements, outils et certifications lus dans
 * le CV rejoignent la fiche. « Non lu » (`null` : aucune lecture ne les a encore
 * produits) se DIT autrement que « non renseigné » — jamais une liste vide.
 */
describe('TalentProfileTab — environnements, outils, certifications (#3935.2a)', () => {
  it('affiche ce que le CV a donné', () => {
    render(
      <TalentProfileTab
        talent={baseTalent({
          environments: ['AWS', 'PostgreSQL'],
          tools: ['Jira'],
          certifications: ['CKA — CNCF'],
        })}
      />,
    )
    expect(screen.getByText('Environnements techniques')).toBeInTheDocument()
    expect(screen.getByText('AWS · PostgreSQL')).toBeInTheDocument()
    expect(screen.getByText('Jira')).toBeInTheDocument()
    expect(screen.getByText('CKA — CNCF')).toBeInTheDocument()
  })

  it('« non lu » n’est pas « non renseigné » : une colonne jamais lue le dit', () => {
    render(<TalentProfileTab talent={baseTalent({ environments: null, tools: null, certifications: null })} />)
    expect(screen.getAllByText('Pas encore lu dans un CV')).toHaveLength(3)
  })

  it('sait dire NON : une liste lue ne se dit jamais « non lue »', () => {
    render(
      <TalentProfileTab talent={baseTalent({ environments: ['AWS'], tools: ['Jira'], certifications: ['PSM I'] })} />,
    )
    expect(screen.queryByText('Pas encore lu dans un CV')).not.toBeInTheDocument()
  })
})

/**
 * #3935.2b (lot M07, 09/10) — les expériences lues dans le CV (ou saisies)
 * s'écrivent désormais dans `consultant_experiences` : la ligne « Expériences »,
 * vide à dessein jusqu'ici, les montre. Une date au mois se lit au mois.
 */
describe('TalentProfileTab — expériences (#3935.2b)', () => {
  it('liste les expériences connues, rôle, entreprise et période', () => {
    experiencesData.current = [
      {
        id: 'e1',
        role: 'Cheffe de projet SI',
        entreprise: 'Cabinet de conseil',
        dateDebut: '2023-01-01',
        dateFin: '2025-06-01',
      },
    ]
    render(<TalentProfileTab talent={baseTalent()} />)
    expect(screen.getByText('Cheffe de projet SI — Cabinet de conseil (2023-01 → 2025-06)')).toBeInTheDocument()
    experiencesData.current = []
  })

  // #3935 (lot P03, décision Louis 09/10) — une date gardée à l'ANNÉE s'affiche
  // « 2019 », jamais « 2019-01 » : le 1er janvier n'est qu'une convention de stockage.
  it('une période lue à l’année s’affiche à l’année, jamais un mois inventé', () => {
    experiencesData.current = [
      {
        id: 'e2',
        role: 'Chargée de projet junior',
        entreprise: null,
        dateDebut: '2019-01-01',
        dateDebutPrecision: 'year',
        dateFin: '2021-01-01',
        dateFinPrecision: 'year',
      },
    ]
    render(<TalentProfileTab talent={baseTalent()} />)
    expect(screen.getByText('Chargée de projet junior (2019 → 2021)')).toBeInTheDocument()
    expect(screen.queryByText(/2019-01/)).not.toBeInTheDocument()
    experiencesData.current = []
  })

  it('sait dire NON : sans expérience connue, la ligne dit « non renseigné », rien d’inventé', () => {
    experiencesData.current = []
    render(<TalentProfileTab talent={baseTalent()} />)
    expect(screen.queryByText(/→/)).not.toBeInTheDocument()
  })
})

/**
 * #4191 (D2) puis #4576 (GA-26) — « Disponible à partir du » et la disponibilité déclarée ne se lisent plus
 * dans les lignes de l'onglet : la ligne de disponibilité du haut les porte, et leur correction vit dans la
 * section « Disponibilité » (champs modifiables, où la date est formatée — voir `TalentFieldGroup.test.tsx`).
 */
describe('TalentProfileTab — la disponibilité ne se redit pas (#4576)', () => {
  it('ne rend ni « Disponibilité déclarée » ni « Disponible à partir du », ni l’ISO brut', () => {
    render(<TalentProfileTab talent={baseTalent({ available_from: '2026-11-10', availability: 'sous_1_mois' })} />)
    expect(screen.queryByText('Disponibilité déclarée')).not.toBeInTheDocument()
    expect(screen.queryByText('Disponible à partir du')).not.toBeInTheDocument()
    expect(screen.queryByText('2026-11-10')).not.toBeInTheDocument()
    expect(screen.queryByText('10 nov. 2026')).not.toBeInTheDocument()
  })

  it('garde le geste « Valider la disponibilité » (aucun geste n’est supprimé)', () => {
    render(<TalentProfileTab talent={baseTalent({ availability: 'sous_1_mois' })} />)
    expect(screen.getByRole('button', { name: 'Valider la disponibilité' })).toBeInTheDocument()
  })
})

/**
 * KEVIN-FIX K.2 (recette prod 20/10) — « Expériences : Non renseigné » et « Environnements techniques : pas
 * encore lu dans un CV » alors que trois compétences étaient DÉCLARÉES : une rubrique absente ne s'affiche pas
 * en mur, et « déclaré » se dit.
 */
describe('TalentProfileTab — rubriques absentes (KEVIN-FIX K.2)', () => {
  it('les compétences déclarées se disent, au lieu de « pas encore lu dans un CV »', () => {
    experiencesData.current = []
    render(
      <TalentProfileTab
        talent={baseTalent({ stack: ['java', 'spring', 'vue'], environments: null, tools: null, certifications: null })}
      />,
    )
    expect(screen.getByText('Déclaré : java · spring · vue')).toBeInTheDocument()
    // Outils et certifications, eux, n'ont rien de déclaré : ils restent « non lus ».
    expect(screen.getAllByText('Pas encore lu dans un CV')).toHaveLength(2)
  })

  it('une rubrique Expériences / Formation sans rien dedans ne s’affiche pas', () => {
    experiencesData.current = []
    render(<TalentProfileTab talent={baseTalent({ education: [] })} />)
    expect(screen.queryByText('Expériences')).not.toBeInTheDocument()
    expect(screen.queryByText('Formations')).not.toBeInTheDocument()
  })

  it('sait dire NON : une formation renseignée reste affichée', () => {
    experiencesData.current = []
    render(<TalentProfileTab talent={baseTalent({ education: ['Master MIAGE'] })} />)
    expect(screen.getByText('Master MIAGE')).toBeInTheDocument()
  })
})
