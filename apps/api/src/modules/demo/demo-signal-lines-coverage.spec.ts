import { mergeSignalLineCandidates, type SignalLineCandidate } from '@bellum/contracts'
import { analysisCandidates } from '../accounts/account-signal-lines.sources'
import { DEMO_SIGNAL_LINES_COVERAGE } from './demo-coverage'
import { DEMO_CRM_DEALS, DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4755 / #4756 (lot 761, craft rule n°9) — le tableau « Signaux et besoins » en démonstration.
 *
 * La route lit des familles déjà SEMÉES ; ce fichier rejoue, sur le jeu fictif de Société Générale, ce que le
 * service fait des lignes semées (les mêmes lectures pures, la même fusion) et prouve que les DEUX périodes sont
 * remplies, avec ce que la maquette du 31/10 montre.
 */
const NOW = new Date()
const DAY = 86_400_000
const SG = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')

function sgLines() {
  if (!SG) throw new Error('dossier Société Générale absent du jeu de démo')
  return linesOf(SG)
}

/** Ce que le service fait des familles semées d'UN dossier ; le CRM semé n'est rattaché qu'à Société Générale. */
function linesOf(dossier: (typeof DEMO_DOSSIERS)[number]) {
  const crm = dossier.account.company_name === DEMO_CRM_DEALS.account ? DEMO_CRM_DEALS.deals : []
  const candidates: SignalLineCandidate[] = [
    ...analysisCandidates(dossier.account.raw_analysis, dossier.account.recent_signals),
    // `seedBriefClosedNeeds` : un besoin FERMÉ par entrée, daté au semis, avec son TJM.
    ...(dossier.closedNeeds ?? []).map((need, index) => ({
      key: `need:${index}`,
      type: 'besoin_passe' as const,
      rawDate: new Date(NOW.getTime() - need.closed_days_ago * DAY),
      title: need.title,
      outcome:
        need.status === 'won' ? ('won' as const) : need.status === 'lost' ? ('lost' as const) : ('none' as const),
      tjmEur: need.tjm_eur ?? null,
    })),
    // `crm_deal_facts` semés pour le même compte (`DemoSeedService`, #3918.b).
    ...crm.map(deal => ({
      key: `crm:${deal.deal_id}`,
      type: 'affaire' as const,
      rawDate: new Date(NOW.getTime() - (deal.closed_days_ago ?? deal.last_activity_days_ago) * DAY),
      title: deal.name,
      ...(deal.is_closed ? { outcome: deal.is_won ? ('won' as const) : ('lost' as const) } : {}),
    })),
  ]
  return mergeSignalLineCandidates(candidates, NOW)
}

describe('#4755 — le tableau des signaux, en démonstration', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_SIGNAL_LINES_COVERAGE.state).toBe('seede')
    expect(DEMO_SIGNAL_LINES_COVERAGE.reason).toContain('Société Générale')
    expect(DEMO_CRM_DEALS.account).toBe('Société Générale')
  })

  it('Actuel : un recrutement fusionné, un marché public, une affaire', () => {
    const now = sgLines().filter(line => line.period === 'now')
    const merged = now.find(line => line.type === 'recrutement' && (line.merged?.length ?? 0) > 0)
    expect(merged?.title).toMatch(/Java/)
    expect(now.some(line => line.type === 'marche_public')).toBe(true)
    expect(now.some(line => line.type === 'affaire')).toBe(true)
  })

  it('Historique : un besoin passé gagné ET un perdu, chacun avec son TJM', () => {
    const past = sgLines().filter(line => line.period === 'past' && line.type === 'besoin_passe')
    expect(past.find(line => line.outcome === 'won')?.tjm_eur).toBeGreaterThan(0)
    expect(past.find(line => line.outcome === 'lost')?.tjm_eur).toBeGreaterThan(0)
  })

  // #5010 (Louis 02/11) — le SITE DE PUBLICATION d'une offre (`origin` : LinkedIn, France Travail, APEC…) s'affiche :
  // ce n'est pas une « source » au sens du 31/10. Tout le RESTE de la ligne ne nomme toujours aucune source.
  it('aucune ligne ne nomme sa source (hors site de publication de l’offre)', () => {
    // `origin` est retiré à toute profondeur (lignes fusionnées comprises) ; le reste est lu tel quel.
    const withoutOrigin = JSON.stringify(sgLines(), (key, value: unknown) => (key === 'origin' ? undefined : value))
    expect(withoutOrigin).not.toMatch(/France Travail|APEC|"source"|base commune/i)
  })

  it('#5010 — une offre semée nomme son site de publication', () => {
    const origins = sgLines()
      .filter(line => line.type === 'recrutement')
      .map(line => line.origin)
      .filter(Boolean)
    expect(origins.length).toBeGreaterThan(0)
  })

  it('des contacts semés recoupent les lignes (« À contacter » n’est pas vide en salle)', () => {
    const words = (value: string) =>
      new Set(
        value
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(word => word.length >= 4),
      )
    const titles = (SG?.contacts ?? []).map(contact => words(contact.title ?? ''))
    const matched = sgLines().filter(line => {
      const lineWords = words(line.title)
      return titles.some(title => [...title].some(word => lineWords.has(word)))
    })
    expect(matched.length).toBeGreaterThan(0)
  })

  it('lot 764 — Signaux › Historique (même lecture, tout l’espace) : Société Générale ET Sanofi y ont leurs lignes passées', () => {
    for (const name of ['Société Générale', 'Sanofi']) {
      const dossier = DEMO_DOSSIERS.find(candidate => candidate.account.company_name === name)
      expect({ name, found: Boolean(dossier) }).toEqual({ name, found: true })
      const past = linesOf(dossier!).filter(line => line.period === 'past')
      expect({ name, past: past.length > 0 }).toEqual({ name, past: true })
    }
  })
})
