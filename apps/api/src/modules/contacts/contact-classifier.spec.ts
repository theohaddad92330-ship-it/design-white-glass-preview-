import { classifyContact, classifyContacts } from './contact-classifier'
import type { ClassifyContactInput } from '@bellum/contracts'

const row = (
  full_name: string,
  title?: string | null,
  extra: Partial<ClassifyContactInput> = {},
): ClassifyContactInput => ({
  full_name,
  title: title ?? null,
  ...extra,
})

describe('classifyContact', () => {
  describe('family — decision-maker taxonomy', () => {
    it('maps DSI to the IT family at C-Level (the ESN priority decider)', () => {
      const c = classifyContact(row('Jean Dupont', 'DSI'))
      expect(c.family).toBe('IT')
      expect(c.decision_level).toBe('c_level')
    })

    it('maps "Directeur des Systèmes d\'Information" to IT (not Infra)', () => {
      // IT is checked before Infra so the "système" token does not steal the DSI.
      expect(classifyContact(row('A B', "Directeur des Systèmes d'Information")).family).toBe('IT')
    })

    it('maps RSSI to the Cyber family', () => {
      const c = classifyContact(row('Alice Martin', 'RSSI'))
      expect(c.family).toBe('Cyber')
    })

    it('maps a CISO to Cyber', () => {
      expect(classifyContact(row('C D', 'Chief Information Security Officer')).family).toBe('Cyber')
    })

    it('maps a developer to the Dev family', () => {
      expect(classifyContact(row('Bob Dev', 'Développeur Full Stack')).family).toBe('Dev')
    })

    it('maps a data engineer to Data and a data scientist to IA', () => {
      expect(classifyContact(row('E F', 'Data Engineer')).family).toBe('Data')
      expect(classifyContact(row('G H', 'Data Scientist')).family).toBe('IA')
    })

    it('maps an infrastructure/cloud role to Infra', () => {
      expect(classifyContact(row('I J', 'Ingénieur Cloud & Infrastructure')).family).toBe('Infra')
    })

    it('maps a purchasing role to the Achat family', () => {
      expect(classifyContact(row('Paul Achat', 'Responsable Achats IT')).family).toBe('Achat')
    })

    it('maps a finance role to Finance and an HR role to RH', () => {
      expect(classifyContact(row('K L', 'DAF')).family).toBe('Finance')
      expect(classifyContact(row('M N', 'DRH')).family).toBe('RH')
    })

    it('maps a domain-less top exec to C-Level', () => {
      expect(classifyContact(row('O P', 'Directeur Général')).family).toBe('C-Level')
      expect(classifyContact(row('Q R', 'PDG')).family).toBe('C-Level')
    })

    it('leaves an unrecognised function unclassified (family = null)', () => {
      expect(classifyContact(row('S T', 'Jardinier paysagiste')).family).toBeNull()
    })
  })

  describe('relevance score 1..5', () => {
    it('scores a DSI at the top (target family + C-Level)', () => {
      expect(classifyContact(row('Jean Dupont', 'DSI')).relevance_score).toBe(5)
    })

    it('scores an RSSI at the top (Cyber + direction)', () => {
      expect(classifyContact(row('Alice Martin', 'RSSI')).relevance_score).toBe(5)
    })

    it('scores an unknown/empty title at the floor (1)', () => {
      expect(classifyContact(row('No Title')).relevance_score).toBe(1)
      expect(classifyContact(row('S T', 'Jardinier paysagiste')).relevance_score).toBe(1)
    })

    it('always stays within 1..5', () => {
      for (const t of ['DSI', 'DAF', 'Développeur', 'Stagiaire', '', 'CEO', 'Data Scientist']) {
        const s = classifyContact(row('X', t)).relevance_score
        expect(s).toBeGreaterThanOrEqual(1)
        expect(s).toBeLessThanOrEqual(5)
      }
    })
  })

  describe('exclusion_reason — ⚠ keep low-value rows, never drop them', () => {
    it('is null for a clean high-value contact (kept as-is)', () => {
      expect(classifyContact(row('Jean Dupont', 'DSI')).exclusion_reason).toBeNull()
    })

    it('flags an unknown function but still returns the row', () => {
      const c = classifyContact(row('S T', 'Jardinier paysagiste'))
      expect(c.exclusion_reason).toMatch(/vérifier/i)
      expect(c.full_name).toBe('S T') // still present — not dropped
    })

    it('flags a missing title distinctly from an unknown one', () => {
      expect(classifyContact(row('No Title')).exclusion_reason).toMatch(/Titre manquant/i)
    })

    it('flags an out-of-scope intern and forces the floor score', () => {
      const c = classifyContact(row('Léa Stagiaire', 'Stagiaire DSI'))
      expect(c.exclusion_reason).toMatch(/[Ss]tagiaire/)
      expect(c.relevance_score).toBe(1) // "Stagiaire DSI" is still an intern
    })

    it('flags an HR contact as out of the IT perimeter (kept as relay)', () => {
      const c = classifyContact(row('M N', 'DRH'))
      expect(c.family).toBe('RH')
      // ⚠️ Rebasé le 25/08 : le motif disait « hors périmètre IT » à TOUT LE
      // MONDE, y compris à une ESN qui vend du conseil RH et pour qui cette
      // personne est la cible. Le périmètre est celui qu'on VEND, pas un
      // périmètre informatique présumé — voir le bloc « périmètre piloté par le
      // domaine vendu » plus bas.
      expect(c.exclusion_reason).toMatch(/hors du périmètre vendu/i)
    })
  })

  describe('cleaning', () => {
    it('trims the name and collapses blank optional cells to null', () => {
      const c = classifyContact(row('  Jean Dupont  ', '  ', { email: '', linkedin_url: '  ' }))
      expect(c.full_name).toBe('Jean Dupont')
      expect(c.title).toBeNull()
      expect(c.email).toBeNull()
      expect(c.linkedin_url).toBeNull()
    })

    it('keeps a provided entity', () => {
      expect(classifyContact(row('Jean', 'DSI', { entity: 'Filiale Cloud' })).entity).toBe('Filiale Cloud')
    })
  })
})

describe('classifyContacts', () => {
  it('classifies every row and tallies kept vs flagged', () => {
    const res = classifyContacts([
      row('Jean Dupont', 'DSI'), // kept
      row('Alice Martin', 'RSSI'), // kept
      row('S T', 'Jardinier'), // flagged (unknown)
      row('M N', 'DRH'), // flagged (RH out of perimeter)
    ])
    expect(res.contacts).toHaveLength(4)
    expect(res.kept).toBe(2)
    expect(res.flagged).toBe(2)
    expect(res.kept + res.flagged).toBe(res.contacts.length)
  })
})

/**
 * Le périmètre vendu, et le référentiel d'intitulés — lot C du Recovery Pack.
 *
 * Deux corrections qui se répondent : `RH` et `Finance` étaient exclues PAR
 * CONSTRUCTION (« hors périmètre IT », quel que soit ce que vend l'espace), et le
 * corpus de 298 intitulés dormait dans une archive au lieu de combler les trous
 * du classifieur.
 */
describe('périmètre piloté par le domaine vendu', () => {
  it('sans domaine, une DRH reste hors périmètre — le chemin historique ne bouge pas', () => {
    const drh = classifyContact(row('M N', 'DRH'))
    expect(drh.family).toBe('RH')
    expect(drh.exclusion_reason).toContain('hors du périmètre vendu')
  })

  it("chez une ESN qui vend du conseil RH, la DRH est la cible — plus aucun motif d'exclusion", () => {
    const drh = classifyContact(row('M N', 'DRH'), 'rh')
    expect(drh.family).toBe('RH')
    expect(drh.exclusion_reason).toBeNull()
    expect(drh.relevance_score).toBeGreaterThanOrEqual(4)
  })

  it('chez une ESN finance, le DAF cesse de se lire « hors périmètre »', () => {
    const daf = classifyContact(row('P Q', 'DAF'), 'finance')
    expect(daf.family).toBe('Finance')
    expect(daf.exclusion_reason).toBeNull()
  })

  it("le motif ne parle plus JAMAIS d'informatique à quelqu'un qui n'en vend pas", () => {
    const drh = classifyContact(row('M N', 'DRH'), 'industrial_engineering')
    expect(drh.exclusion_reason).not.toContain('IT')
  })

  it('un domaine sans famille supplémentaire laisse le périmètre historique intact', () => {
    const withoutDomain = classifyContact(row('M N', 'DRH'))
    const withGeneric = classifyContact(row('M N', 'DRH'), 'generic')
    expect(withGeneric).toEqual(withoutDomain)
  })
})

describe("référentiel d'intitulés — il comble, il n'écrase pas", () => {
  it('reconnaît un intitulé du corpus et rend sa forme canonique', () => {
    const c = classifyContact(row('A B', 'ingenieur systeme'))
    expect(c.canonical_title).toBe('Ingénieur système')
  })

  it("un titre inconnu du corpus n'a pas de forme canonique — et ce n'est pas un reproche", () => {
    const c = classifyContact(row('A B', 'DSI'))
    expect(c.canonical_title).toBeNull()
    expect(c.family).toBe('IT')
    expect(c.exclusion_reason).toBeNull()
  })

  it("n'écrase JAMAIS une famille trouvée par les règles", () => {
    // « Ingénieur cybersécurité » est ambigu dans le corpus (sécurité ET tech) ;
    // la règle, elle, tranche `Cyber`. C'est la règle qui gagne.
    const c = classifyContact(row('A B', 'Ingénieur cybersécurité'))
    expect(c.family).toBe('Cyber')
  })

  it('comble un trou : un intitulé reconnu que les règles ignorent obtient sa famille', () => {
    // « Scrum Master » est ambigu (livraison de projet ET tech) : sans domaine,
    // le référentiel ne conclut rien et le motif d'exclusion le DIT.
    const undecided = classifyContact(row('A B', 'Scrum Master'))
    expect(undecided.canonical_title).toBe('Scrum Master')
    // Avec un vendeur PMO, la famille se conclut et le motif disparaît.
    const decided = classifyContact(row('A B', 'Scrum Master'), 'pmo')
    expect(decided.family).toBe('PMO')
  })

  it("un intitulé reconnu SANS famille produit le dit — au lieu d'envoyer vérifier un titre clair", () => {
    // « Responsable Méthodes » : famille industrielle, pour laquelle le produit
    // n'a AUCUNE des onze familles. Ce n'est pas un libellé douteux.
    const c = classifyContact(row('A B', 'Responsable Méthodes'))
    expect(c.canonical_title).not.toBeNull()
    expect(c.family).toBeNull()
    expect(c.exclusion_reason).toContain('Intitulé reconnu')
  })
})
