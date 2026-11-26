import { ANALYSED_ACCOUNT_FILES } from './demo-analysed-accounts'

/**
 * Doctrine : JAMAIS de personne fictive en démo (Louis 12/10/2026). Une vraie analyse cite parfois des contacts qui
 * n'existent pas dans la liste (l'analyse elle-même les marquait « hallucinés ») ou que le plafond de 400 a écartés :
 * rien de ce qui est semé ne doit citer une personne absente des contacts semés du compte.
 */
const norm = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

type Obj = Record<string, unknown>
const asArray = (value: unknown): Obj[] => (Array.isArray(value) ? (value as Obj[]) : [])
const asObj = (value: unknown): Obj => (value && typeof value === 'object' ? (value as Obj) : {})

function seededNames(contacts: readonly { full_name: string }[]): { full: Set<string>; first: Set<string> } {
  const full = new Set(contacts.map(contact => norm(contact.full_name)))
  const first = new Set([...full].map(name => name.split(' ')[0] ?? ''))
  return { full, first }
}

describe('comptes démo analysés — aucune personne citée hors des contacts semés', () => {
  for (const { company_name, file } of ANALYSED_ACCOUNT_FILES) {
    it(`${company_name} : plan, organigramme et comité ne citent que des contacts semés`, () => {
      const { full, first } = seededNames(file.contacts)
      const known = (name: unknown): boolean => full.has(norm(name)) || first.has(norm(name))
      const raw = file.account.raw_analysis
      const plan = asObj(raw['plan'])
      const org = asObj(raw['org'])
      const graph = asObj(org['orgGraph'])
      const cited: string[] = [
        ...asArray(asObj(plan['actionPlan'])['phases']).flatMap(phase =>
          asArray(phase['actions']).map(action => String(action['contact'] ?? '')),
        ),
        String(asObj(plan['nextBestAction'])['contact'] ?? ''),
        ...asArray(org['approach_order']).map(item => String(item['contact'] ?? '')),
        ...asArray(org['stakeholderMap']).map(item => String(item['fullName'] ?? '')),
        ...asArray(asObj(org['decisionChain'])['steps']).flatMap(step =>
          Array.isArray(step['actors']) ? (step['actors'] as string[]) : [],
        ),
        ...asArray(org['organigramme']).flatMap(level =>
          Array.isArray(level['contacts']) ? (level['contacts'] as string[]) : [],
        ),
        ...asArray(graph['people']).map(person => String(person['fullName'] ?? '')),
        ...asArray(asObj(org['buyingCommittee'])['members']).map(member => String(member['fullName'] ?? '')),
      ].filter(name => name.trim() !== '')
      expect(cited.length).toBeGreaterThan(0)
      expect({ company_name, absent: cited.filter(name => !known(name)) }).toEqual({ company_name, absent: [] })
    })
  }

  it('sait dire NON : un nom absent de la liste est attrapé', () => {
    const { full, first } = seededNames([{ full_name: 'Jihene Saadi' }])
    expect(full.has(norm('Jérôme Lefebvre')) || first.has(norm('Jérôme Lefebvre'))).toBe(false)
    expect(first.has(norm('Jihene'))).toBe(true)
  })
})

describe('comptes démo analysés — noms complets + décideurs uniquement (Louis 12/10/2026)', () => {
  const isFull = (name: string): boolean => name.trim().split(/\s+/).length >= 2

  for (const { company_name, file } of ANALYSED_ACCOUNT_FILES) {
    it(`${company_name} : tout prénom seul est un décideur, jamais un simple contact détecté`, () => {
      const singles = file.contacts.filter(contact => !isFull(contact.full_name))
      expect(singles.length).toBe(file.meta.single_name_contacts)
      expect({ company_name, nonDeciders: singles.filter(contact => contact.decision_role === null).length }).toEqual({
        company_name,
        nonDeciders: 0,
      })
    })

    it(`${company_name} : tous les décideurs de l’analyse sont semés, aucun remplissage artificiel`, () => {
      const deciders = file.contacts.filter(contact => contact.decision_role !== null).length
      expect(deciders).toBe(file.meta.deciders)
      // La liste est plus courte que le plafond quand il y a moins de noms complets : pas de remplissage.
      expect(file.contacts.length).toBeLessThan(file.meta.cap)
    })
  }

  it('sait dire NON : un prénom seul est détecté', () => {
    expect(isFull('Sunder')).toBe(false)
    expect(isFull('Susam Borthakur')).toBe(true)
  })
})
