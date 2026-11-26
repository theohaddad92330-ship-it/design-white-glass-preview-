import { describe, expect, it } from 'vitest'
import type { EsnAnswers } from '@bellum/contracts'
import { prioritySuggestions } from './prioritySuggestions'

type Answers = Pick<EsnAnswers, 'expertise_areas' | 'offer_domains'>

const answers = (over: Partial<Answers> = {}): Answers => ({
  expertise_areas: [],
  offer_domains: [],
  ...over,
})

describe('les priorités proposées au cadrage (#1110)', () => {
  it("rend les domaines d'expertise TELS QUE l'ESN les a écrits", () => {
    // Les normaliser produirait une chip que son auteur ne reconnaît pas.
    expect(prioritySuggestions(answers({ expertise_areas: ['Cybersécurité', 'Data & BI'] }), 'fr')).toEqual([
      'Cybersécurité',
      'Data & BI',
    ])
  })

  it('ajoute les libellés du portefeuille de domaines', () => {
    const out = prioritySuggestions(answers({ offer_domains: ['AI_ML_GENAI'] }), 'fr')
    expect(out).toEqual(['IA, machine learning, GenAI & agents'])
  })

  it('suit la langue de lecture', () => {
    expect(prioritySuggestions(answers({ offer_domains: ['AI_ML_GENAI'] }), 'en')).toEqual([
      'AI, machine learning, GenAI & agents',
    ])
  })

  it('ne propose RIEN quand rien n’a été saisi', () => {
    // Le repli n'est pas un glossaire maison : il parlerait d'informatique à une
    // ESN d'ingénierie industrielle. L'écran dit qu'il n'a rien à proposer.
    expect(prioritySuggestions(answers(), 'fr')).toEqual([])
    expect(prioritySuggestions(undefined, 'fr')).toEqual([])
  })

  it('ne propose jamais deux fois le même thème', () => {
    const out = prioritySuggestions(answers({ expertise_areas: ['Cloud', 'cloud', ' Cloud '] }), 'fr')
    expect(out).toEqual(['Cloud'])
  })

  it('écarte un code de domaine que ce build ne connaît pas', () => {
    // Skew de déploiement : on saute le code, on ne rend pas une chip vide.
    expect(prioritySuggestions(answers({ offer_domains: ['CODE_INCONNU'] as string[] }), 'fr')).toEqual([])
  })

  it('borne la rangée pour qu’elle reste lisible', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Thème ${i}`)
    expect(prioritySuggestions(answers({ expertise_areas: many }), 'fr')).toHaveLength(12)
  })

  // #4142 (recette R8a, Veolia, 14/10) — un domaine d'expertise écrit librement
  // par l'ESN (« Cybersécurité & Conformité ») et le libellé LONG du même
  // domaine de conseil (« Cybersécurité, IAM, GRC, SOC & résilience
  // numérique ») sont le MÊME thème : deux puces quasi-doublons pour une
  // seule priorité réelle. Même défaut sur « Cloud ». Le libellé de l'ESN
  // (plus court, dans ses propres mots) est gardé ; le libellé dérivé du
  // domaine de conseil, écarté.
  it("#4142 — dédoublonne par domaine d'offre, pas seulement à la casse près", () => {
    const out = prioritySuggestions(
      answers({
        expertise_areas: ['Cybersécurité & Conformité', 'Cloud & Infrastructure'],
        offer_domains: ['CYBER_IAM_GRC', 'CLOUD_DEVOPS_SRE'],
      }),
      'fr',
    )
    expect(out).toEqual(['Cybersécurité & Conformité', 'Cloud & Infrastructure'])
  })

  it('#4142 — deux domaines distincts, même sans recoupement de libellé, restent deux puces', () => {
    const out = prioritySuggestions(
      answers({ expertise_areas: ['Cybersécurité & Conformité'], offer_domains: ['AI_ML_GENAI'] }),
      'fr',
    )
    expect(out).toEqual(['Cybersécurité & Conformité', 'IA, machine learning, GenAI & agents'])
  })
  // #4142 (recette R16, Veolia, 15/10) — « Développement applicatif (Web,
  // Mobile, API) » (ESN) et « Développement logiciel & applications »
  // (domaine SW_ENGINEERING) sont le même thème sous deux mots : UNE puce.
  it('#4142 — fusionne les libellés synonymes en un seul thème canonique', () => {
    const out = prioritySuggestions(
      answers({
        expertise_areas: ['Développement applicatif (Web, Mobile, API)'],
        offer_domains: ['SW_ENGINEERING'],
      }),
      'fr',
    )
    expect(out).toEqual(['Développement applicatif (Web, Mobile, API)'])
  })

  it('#4142 — la fusion marche dans l’autre sens et en anglais', () => {
    expect(
      prioritySuggestions(
        answers({ expertise_areas: ['Software development'], offer_domains: ['SW_ENGINEERING'] }),
        'en',
      ),
    ).toEqual(['Software development'])
    expect(
      prioritySuggestions(
        answers({ expertise_areas: ['Développement logiciel'], offer_domains: ['SW_ENGINEERING'] }),
        'fr',
      ),
    ).toEqual(['Développement logiciel'])
  })
})
