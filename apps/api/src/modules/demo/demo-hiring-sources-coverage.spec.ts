import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2616.1 (recette D3 01/11) — les signaux de recrutement de /discover montrent des sources de recrutement
 * (job board cadre, site carrière, ATS) et un contrat CDI, pas seulement `example.org` / `offres.demo.example`.
 * Domaines RÉSERVÉS (`.example`, RFC 2606) : jamais un faux lien vers un vrai site.
 */
const source = readFileSync(join(__dirname, 'demo-scripts.ts'), 'utf8')
const hosts = [...source.matchAll(/url: 'https:\/\/([^/']+)\//g)].map(match => match[1]!)

describe('signaux de recrutement démo — sources typées (#2616.1)', () => {
  it.each(['apec', 'welcometothejungle', 'lever'])('au moins un lien de signal pointe vers une source « %s »', name => {
    expect(hosts.some(host => host.includes(name))).toBe(true)
  })

  it('sait dire NON : aucun lien ne quitte le domaine réservé .example / example.org', () => {
    const real = hosts.filter(host => !/(\.example|example\.org)$/.test(host))
    expect(real).toEqual([])
  })

  it('une offre portant une source ATS est un CDI distingué', () => {
    const atsBlock = source.split('jobs.lever.example')[1]!.split('},')[0]!
    expect(atsBlock).toContain("contractType: 'CDI'")
  })
})
