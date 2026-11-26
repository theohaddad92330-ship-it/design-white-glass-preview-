import { describe, expect, it } from 'vitest'
import {
  CONSULTING_DOMAIN_BY_CODE,
  CONSULTING_DOMAIN_GROUPS,
  CONSULTING_DOMAINS,
  consultingDomainNamesFr,
  dominantOfferDomain,
} from './consulting-domains.js'
import { OFFER_DOMAINS } from './onboarding.js'

describe('CONSULTING_DOMAINS — la taxonomie DATAFORGE V10', () => {
  it('porte exactement les 66 domaines du pack, codes uniques', () => {
    expect(CONSULTING_DOMAINS).toHaveLength(66)
    expect(new Set(CONSULTING_DOMAINS.map(domain => domain.code)).size).toBe(66)
  })

  it('chaque domaine est rattaché à un pack d’offre EXISTANT et à un groupe déclaré', () => {
    for (const domain of CONSULTING_DOMAINS) {
      expect(OFFER_DOMAINS).toContain(domain.pack)
      expect(CONSULTING_DOMAIN_GROUPS).toContain(domain.group)
    }
  })

  it('aucun groupe déclaré n’est vide — un groupe sans domaine est un libellé mort', () => {
    const used = new Set(CONSULTING_DOMAINS.map(domain => domain.group))
    expect([...CONSULTING_DOMAIN_GROUPS].filter(group => !used.has(group))).toEqual([])
  })

  it('chaque libellé existe en FRANÇAIS ET en ANGLAIS (règle i18n permanente)', () => {
    for (const domain of CONSULTING_DOMAINS) {
      expect(domain.labelFr.trim().length).toBeGreaterThan(3)
      expect(domain.labelEn.trim().length).toBeGreaterThan(3)
    }
  })

  it('12 des 14 domaines technologiques pointent sur le pack esn_it (mapping CSV verbatim, CYBER_IAM_GRC exclu depuis #3186.3)', () => {
    const tech = CONSULTING_DOMAINS.filter(domain => domain.group === 'tech')
    expect(tech).toHaveLength(14)
    expect(tech.filter(domain => domain.pack === 'esn_it')).toHaveLength(12)
  })

  /**
   * #2633.1 — un vendeur qui choisit explicitement « IA, machine learning,
   * GenAI & agents » dans son portefeuille retombait quand même sur le pack
   * générique `esn_it` : les recommandations restaient génériques quel que
   * soit le choix. La CAUSE diagnostiquée : ce mapping.
   */
  it('#2633.1 — « IA, machine learning, GenAI & agents » pointe sur le pack IA dédié, pas sur esn_it', () => {
    const aiMlGenai = CONSULTING_DOMAINS.find(domain => domain.code === 'AI_ML_GENAI')
    expect(aiMlGenai?.pack).toBe('ia')
  })
})

describe('dominantOfferDomain', () => {
  it('le pack le plus représenté gagne', () => {
    expect(dominantOfferDomain(['FINANCE_FPNA', 'TREASURY_WC', 'SW_ENGINEERING'])).toBe('finance')
  })

  it('à égalité, le premier dans l’ordre OFFER_DOMAINS — déterministe', () => {
    // 1 esn_it vs 1 finance → esn_it vient d'abord dans OFFER_DOMAINS.
    expect(dominantOfferDomain(['FINANCE_FPNA', 'SW_ENGINEERING'])).toBe('esn_it')
  })

  it('un code inconnu est IGNORÉ, jamais deviné ; rien de connu → null', () => {
    expect(dominantOfferDomain(['DOMAINE_INVENTE'])).toBeNull()
    expect(dominantOfferDomain([])).toBeNull()
    expect(dominantOfferDomain(['DOMAINE_INVENTE', 'HRIS_PAYROLL'])).toBe('rh')
  })

  /**
   * Trouvé en vérifiant #2274.36 (« un utilisateur peut combiner plusieurs
   * packs sectoriels ») : `ia` est le DERNIER de `OFFER_DOMAINS` (#2633.1,
   * ajouté en fin), donc aucune paire de la boucle ci-dessous ne le place en
   * position `i` — son absence de la copie locale `PACK_PRIORITY` passait
   * inaperçue. Un portefeuille qui ne cite QUE des domaines IA doit résoudre
   * `ia`, comme le fait déjà le miroir Python (`portfolio.py::PACK_PRIORITY`,
   * `test_dominant_pack_majority_and_tie_break`).
   */
  it('un portefeuille qui ne cite que des domaines IA résout le pack ia (parité avec portfolio.py)', () => {
    expect(dominantOfferDomain(['AI_ML_GENAI'])).toBe('ia')
    expect(dominantOfferDomain(['AI_ML_GENAI', 'AI_ML_GENAI'])).toBe('ia')
  })

  it('l’ordre de départage local est EXACTEMENT OFFER_DOMAINS (copie anti-cycle surveillée)', () => {
    // La fonction départage 1-1 selon PACK_PRIORITY ; on vérifie par le
    // comportement : pour chaque paire (pack[i], pack[j]) i<j, i gagne.
    const byPack = new Map<string, string>()
    for (const domain of CONSULTING_DOMAINS) {
      if (!byPack.has(domain.pack)) byPack.set(domain.pack, domain.code)
    }
    for (let i = 0; i < OFFER_DOMAINS.length; i += 1) {
      for (let j = i + 1; j < OFFER_DOMAINS.length; j += 1) {
        const first = byPack.get(OFFER_DOMAINS[i] as string)
        const second = byPack.get(OFFER_DOMAINS[j] as string)
        if (!first || !second) continue
        expect(dominantOfferDomain([first, second])).toBe(OFFER_DOMAINS[i])
      }
    }
    // Et chaque pack est bien atteint par au moins un domaine.
    expect([...byPack.keys()].sort()).toEqual([...OFFER_DOMAINS].sort())
  })
})

describe('consultingDomainNamesFr', () => {
  it('rend les libellés français dans l’ordre du portefeuille, codes inconnus écartés', () => {
    expect(consultingDomainNamesFr(['RISK_COMPLIANCE_AML', 'INCONNU', 'PMO_PORTFOLIO'])).toEqual([
      'Risques, conformité, AML/KYC, réglementaire & modèles',
      'PMO, portefeuille, programme & gestion de projet',
    ])
  })

  it('la table par code couvre tout', () => {
    expect(CONSULTING_DOMAIN_BY_CODE.size).toBe(66)
  })
})
