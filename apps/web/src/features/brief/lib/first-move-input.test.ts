import { describe, expect, it } from 'vitest'
import { antiAdvice } from '@bellum/contracts'
import { buildFirstMoveInput, departmentFromHeadquarters } from './first-move-input'

const account = (over: Record<string, unknown> = {}) =>
  ({
    id: 'a1',
    company_name: 'VINCI',
    sector: 'Construction',
    employees: '119 000 salariés',
    headquarters: '1 cours Ferdinand-de-Lesseps, 92500 Rueil-Malmaison',
    raw_analysis: {},
    ...over,
  }) as never

describe('nourrir le premier mouvement depuis le dossier', () => {
  it('lit le département depuis un siège écrit en clair', () => {
    expect(departmentFromHeadquarters('2 place aux Étoiles, 93210 Saint-Denis')).toBe('93')
    expect(departmentFromHeadquarters('Brest')).toBeNull()
  })

  it('ne devine pas la Corse depuis un code postal 20xxx', () => {
    // 20000 peut être 2A comme 2B ; se tromper ferait tirer l'interdit de
    // registre sur la mauvaise région.
    expect(departmentFromHeadquarters('20000 Ajaccio')).toBeNull()
  })

  it('déclenche l’interdit d’entité avec des chiffres RÉELS du dossier', () => {
    // C'est le test qui compte : allumer l'anti-conseil ne sert à rien si on
    // l'appelle avec des `null`.
    const input = buildFirstMoveInput(
      account({
        raw_analysis: {
          access_barrier: { score: 8.2, access_class: 'D', statut: 'groupe_cote' },
          awarded_contracts: Array.from({ length: 47 }, () => ({ objet: 'marché' })),
        },
      }),
      [],
      [
        { name: 'VINCI Autoroutes', score: 88 },
        { name: 'VINCI Energies', score: 74 },
      ],
    )
    const found = antiAdvice(input, new Date('2026-08-23T00:00:00Z'))
    expect(found[0]?.kind).toBe('entite')
    expect(found[0]?.reason).toContain('8.2/10')
    expect(found[0]?.reason).toContain('47 marchés publics')
    // Et la seconde porte devient la bascule « si silence ».
    expect(input.fallbackEntity?.name).toBe('VINCI Energies')
  })

  it('déclenche l’interdit de circuit sur une scale-up, et pas sur un groupe', () => {
    const scaleup = buildFirstMoveInput(
      account({
        company_name: 'Agicap',
        employees: '552 salariés',
        headquarters: '69003 Lyon',
        raw_analysis: { access_barrier: { score: 1.1, access_class: 'A', statut: 'scaleup' } },
      }),
      [],
    )
    expect(scaleup.isScaleup).toBe(true)
    expect(antiAdvice(scaleup, new Date()).some(item => item.kind === 'circuit')).toBe(true)

    const group = buildFirstMoveInput(
      account({ raw_analysis: { access_barrier: { score: 8.2, statut: 'groupe_cote' } } }),
      [],
    )
    expect(group.isScaleup).toBe(false)
  })

  it('ne compte comme postes produit que ce qui en est', () => {
    const input = buildFirstMoveInput(
      account({
        raw_analysis: {
          it_job_signals: [{ title: 'Product Owner Data' }, { title: 'UX Designer' }, { title: 'Comptable' }],
          technology_stack: [{ name: 'Kubernetes' }],
        },
      }),
      [],
    )
    expect(input.openProductRoles).toBe(2)
    expect(input.modernStack).toBe(true)
  })

  it('laisse tout à null sur un dossier vide — aucun interdit sur une supposition', () => {
    const input = buildFirstMoveInput(account(), [])
    expect(input.barrierScore).toBeNull()
    expect(input.openProductRoles).toBeNull()
    expect(input.publicContracts).toBeNull()
    expect(antiAdvice(input, new Date()).filter(item => item.kind !== 'registre')).toEqual([])
  })
})

/**
 * Le défaut trouvé en recette live le 23/08/2026, sur le PREMIER compte essayé.
 *
 * `product` en sous-chaîne matche « production » — un mot d'usine. Sur un
 * compte industriel, « Responsable production » et « Opérateur de tests,
 * production et réparation » comptaient comme des postes produit, et l'interdit
 * de vocabulaire (« ne pas écrire profil disponible ») se serait déclenché sur
 * une entreprise sans aucune équipe produit.
 */
describe('les postes PRODUIT ne sont pas des postes de production', () => {
  const withJobs = (titles: string[]) =>
    buildFirstMoveInput(
      {
        company_name: 'ACME',
        raw_analysis: {
          it_job_signals: titles.map(title => ({ title })),
          technology_stack: ['kubernetes'],
        },
      } as never,
      [],
      [],
    ).openProductRoles

  it('ne compte AUCUN poste produit sur des intitulés d’usine', () => {
    expect(
      withJobs([
        'Responsable production, intégration et tests (H/F)',
        'Opérateur de tests, production et réparation (H/F)',
        'Technicien productivité atelier',
      ]),
    ).toBe(0)
  })

  it('compte les vrais postes produit', () => {
    expect(withJobs(['Product Owner plateforme', 'Chef de produit digital', 'UX designer senior'])).toBe(3)
  })

  it('ne prend plus « dépôt » ni « poste » pour un product owner', () => {
    // L'ancien mot-clé était `po ` — deux lettres et une espace.
    expect(withJobs(['Gestionnaire de dépôt logistique', 'Chef de poste sûreté'])).toBe(0)
  })
})
