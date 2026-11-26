import { knownPersonKey } from '@bellum/contracts'
import { crmMarkedContactIds, demoCrmPresence, DEMO_ORG_CRM_MARKED_CONTACTS } from './demo-dataset'
import { societeGeneraleOrgGraph } from './demo-org-graphs'

/**
 * #4072.1 (recette démo 18/10) — « Déjà connu : dans ton CRM » ne se voit que si les contacts marqués CRM
 * (`seedCrmDeals` : les premiers contacts NOMMÉS du dossier) sont AUSSI des personnes du graphe : l'écran rapproche
 * au nom exact. Sans cette parité, le marqueur est semé mais jamais dessiné.
 */
describe('#4072.1 — les contacts CRM de la démo sont des personnes de l’organigramme', () => {
  const graph = societeGeneraleOrgGraph as unknown as { people?: Array<{ fullName?: string; full_name?: string }> }

  it('au moins un contact marqué du compte vitrine porte le nom d’une personne du graphe', () => {
    const presence = demoCrmPresence(DEMO_ORG_CRM_MARKED_CONTACTS.account, Date.now())
    const graphNames = new Set((graph.people ?? []).map(p => knownPersonKey(p.fullName ?? p.full_name ?? '')))
    const marked = (presence?.contacts ?? []).map(c => knownPersonKey(c.name ?? ''))
    expect(graphNames.size).toBeGreaterThan(1) // sait dire NON : un graphe vide ne prouverait rien
    expect(marked.length).toBeGreaterThan(0)
    expect(marked.some(key => graphNames.has(key))).toBe(true)
  })
})

/**
 * #4293.5 (recette prod 19/10) — 0 « Déjà connu : dans ton CRM » sur la démo : le semis marquait les premiers
 * contacts DANS L'ORDRE DE LA BASE (même `created_at` pour tout le lot ⇒ ordre arbitraire). Il marque par NOM.
 */
describe('#4293.5 — le semis marque les personnes du graphe, quel que soit l’ordre de lecture en base', () => {
  const presence = demoCrmPresence(DEMO_ORG_CRM_MARKED_CONTACTS.account, Date.now())
  const names = (presence?.contacts ?? []).map(c => c.name ?? '')

  it('marque exactement les contacts NOMMÉS par le CRM fictif, même lus dans le désordre', () => {
    const rows = [
      { id: 'x1', full_name: 'Quelqu’un d’autre' },
      ...names.map((name, i) => ({ id: `k${i}`, full_name: name.toUpperCase() })),
      { id: 'x2', full_name: null },
    ]
    expect(crmMarkedContactIds(rows, presence).sort()).toEqual(names.map((_, i) => `k${i}`).sort())
  })

  it('sans CRM fictif pour ce compte, rien n’est marqué', () => {
    expect(crmMarkedContactIds([{ id: 'a', full_name: 'Quelqu’un' }], null)).toEqual([])
  })
})
