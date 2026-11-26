import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { checkCommercialBrief, commercialBriefSchema, type CommercialBrief } from '@bellum/contracts'

/**
 * Brief du compte Orange (12/10/2026) — le JSON versionné, converti du dossier de compte du CEO par
 * `pnpm --filter @bellum/api convert:orange-dossier` (`scripts/commercial-brief/orange-dossier.ts`). Le pack source est
 * hors dépôt : ce spec fige ce que la conversion a MESURÉ, pour qu'un régénéré qui dérive fasse échouer la CI.
 * Les nombres sont des mesures du pack (477 contacts, 18 ESN…), pas des cibles choisies.
 */
const raw = readFileSync(join(__dirname, 'orange.json'), 'utf8')
const parsed = commercialBriefSchema.safeParse(JSON.parse(raw))
const brief = parsed.success ? (parsed.data as CommercialBrief) : undefined
const section = (key: string) => brief?.sections.find(candidate => candidate.key === key)

describe('brief commercial « Orange » (dossier de compte du 12/10/2026)', () => {
  it('passe le schéma du contrat ET ne porte AUCUNE violation métier', () => {
    expect(parsed.success ? [] : parsed.error.issues.slice(0, 5)).toEqual([])
    expect(brief?.account_name).toBe('Orange')
    expect(brief?.scope).toBe('france')
    expect(brief ? checkCommercialBrief(brief) : ['brief illisible']).toEqual([])
  })

  it('porte les huit blocs du dossier : fiche, marché, projets, achats, besoins, décideurs, villes, sources', () => {
    expect(brief?.sections.map(s => s.key)).toEqual([
      'fiche-compte',
      'marche',
      'projets-2026-2027',
      'achats-avant-d-appeler',
      'besoins-en-base',
      'decideurs',
      'villes-consultants',
      'sources',
    ])
    expect(section('projets-2026-2027')?.rows).toHaveLength(7)
    expect(section('decideurs')?.rows).toHaveLength(7)
    expect(section('besoins-en-base')?.rows).toHaveLength(3)
    expect(section('villes-consultants')?.rows).toHaveLength(52)
    expect(brief?.entities).toHaveLength(9)
    expect(brief?.esn).toHaveLength(18)
    expect(brief?.guardrails).toHaveLength(7)
    expect(brief?.kpis).toHaveLength(6)
  })

  it('477 contacts du fichier + le CIO cité hors fichier ; les sept décideurs en tête', () => {
    expect(brief?.people).toHaveLength(478)
    const counts: Record<string, number> = {}
    for (const person of brief?.people ?? []) counts[person.role ?? '—'] = (counts[person.role ?? '—'] ?? 0) + 1
    expect(counts).toEqual({ decision_maker: 7, contact: 160, external: 13, alumni: 298 })
    expect((brief?.people ?? []).slice(0, 7).every(person => person.role === 'decision_maker')).toBe(true)
    const bazin = brief?.people.find(person => person.name === 'Florent Bazin')
    expect(bazin).toMatchObject({ role: 'decision_maker', function: 'CIO (cité par Ivalua)' })
    expect(bazin?.email).toBeUndefined()
  })

  it('coordonnées PROFESSIONNELLES en clair : seules des adresses du groupe Orange ; jamais de boîte personnelle', () => {
    const withEmail = (brief?.people ?? []).filter(person => person.email)
    expect(withEmail).toHaveLength(156)
    for (const person of withEmail) {
      for (const email of (person.email ?? '').split(' | ')) {
        expect(email).toMatch(
          /@(?:[\w-]+\.)*(orange\.com|orange-business\.com|orangecyberdefense\.com|orange-ftgroup\.com|francetelecom\.com)$/i,
        )
      }
    }
    expect(raw).not.toMatch(/@(gmail|hotmail|yahoo|outlook|live|icloud|free|wanadoo|sfr|laposte|orange\.fr)/i)
    expect((brief?.people ?? []).filter(person => person.mobile)).toHaveLength(83)
    // les liens LinkedIn de l'export (une barre perdue) sont réparés
    expect(raw).not.toMatch(/"https?:\/(?!\/)/)
    expect((brief?.people ?? []).filter(person => person.linkedin)).toHaveLength(476)
  })

  it('niveaux de confiance recopiés tels quels ; « non trouvé » reste « non trouvé » ; jamais 0', () => {
    const fiche = section('fiche-compte')?.rows ?? []
    expect(fiche).toContainEqual(
      expect.objectContaining({
        champ: 'Forme juridique, capital, NAF, bilans',
        valeur: 'non trouvé',
        fiabilite: 'non trouvé',
      }),
    )
    expect(brief?.entities.map(entity => entity.reliability)).toEqual([
      'probable',
      'confirmé',
      'confirmé',
      'probable',
      'confirmé',
      'probable',
      'indice faible',
      'probable',
      'probable',
    ])
    expect(brief?.esn.every(esn => esn.evidence_level !== 'confirmed')).toBe(true)
    expect(brief?.esn.map(esn => esn.reliability)).toEqual(expect.arrayContaining(['probable', 'indice faible']))
    expect(brief?.kpis.find(kpi => kpi.label === 'RÉFÉRENCEMENT ESN')?.value).toBe('Aucun confirmé')
    const needs = section('besoins-en-base')?.rows ?? []
    expect(needs.some(row => row['contact'] === 'non trouvé')).toBe(true)
    expect(needs.some(row => row['date'] === 'non trouvé')).toBe(true)
  })

  it('seul le SIREN est confirmé ; le siège n’est pas affirmé', () => {
    const fiche = section('fiche-compte')?.rows ?? []
    expect(fiche.find(row => row['champ'] === 'SIREN')).toMatchObject({ valeur: '380129866' })
    expect(brief?.headquarters).toEqual({ label: 'Siège non confirmé', city: 'Paris' })
    expect(brief?.sites.filter(site => site.kind === 'headquarters')).toEqual([])
    expect(fiche.find(row => row['champ'] === 'Siège')).toMatchObject({ fiabilite: 'faible' })
  })

  it('chaque chiffre de marché porte sa source, son lien et sa date de consultation', () => {
    const market = section('marche')?.rows ?? []
    expect(market).toHaveLength(10)
    for (const row of market) {
      expect(String(row['source'])).not.toBe('')
      expect(String(row['url'])).toMatch(/^https:\/\//)
      expect(row['consulte_le']).toBe('2026-10-12')
    }
  })

  it('l’organigramme est dit reconstitué, « en poste » est dit export 2024', () => {
    const points = (brief?.guardrails ?? []).map(guardrail => guardrail.point)
    expect(points).toContain('Organigramme reconstitué, pas officiel')
    expect(points).toContain('« En poste » = export 2024')
    expect(
      (brief?.people ?? []).filter(person => person.role === 'contact').every(p => p.hook?.includes('export 2024')),
    ).toBe(true)
  })

  it('aucune probabilité, aucun nom de source interne, aucune donnée de notre propre performance', () => {
    expect(raw).not.toMatch(/market\s*memory|\borion\b|dataforge/i)
    expect(raw).not.toMatch(/probabilit|chance de|taux de closing/i)
    expect(raw).not.toMatch(/Not Attempted|Faux num[ée]ro|STATUT RELATION/i)
    // le nom d'une ESN prospect neutralisée ne se glisse pas ici
    expect(raw.replace(/[\w.+'’-]+@[\w-]+(?:\.[\w-]+)+/g, '')).not.toMatch(
      /one\s?side|\bn\s?gen\b|th[ée]lio|alpineo|quick\s?sort|meedz/i,
    )
  })

  it('périmètre France : aucun site ni entité hors FR', () => {
    expect((brief?.sites ?? []).every(site => site.country === 'FR')).toBe(true)
    expect((brief?.entities ?? []).every(entity => entity.country === undefined || entity.country === 'FR')).toBe(true)
  })

  it('la note interne « base légale RGPD » de l’équipe n’est PAS affichée, et le README dit pourquoi', () => {
    expect(raw).not.toMatch(/RGPD|base légale/i)
    const readme = readFileSync(join(__dirname, 'README.md'), 'utf8')
    expect(readme).toContain('note interne de l’équipe, pas un garde-fou commercial')
  })

  it('le README des briefs porte la ligne et la section Orange', () => {
    const readme = readFileSync(join(__dirname, 'README.md'), 'utf8')
    expect(readme).toContain('| Orange | `orange.json` |')
    expect(readme).toContain('## Orange — ')
    expect(readme).toContain('adresse personnelle (webmail) : non reprise')
  })
})
