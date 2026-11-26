import { accessBarrierSchema } from '@bellum/contracts'
import { AccountAccessService } from './account-access.service'

/**
 * La barrière d'ACHAT, servie à l'onglet Accès (tome 3 §5.1 et §8).
 *
 * Elle est calculée à CHAQUE analyse (`phase1_research.py`), stockée dans
 * `raw_analysis.access_barrier`, semée en démonstration — et jusqu'ici lue par
 * ce service pour en tirer **deux booléens** (`avoidGroupEntry`, `warning`).
 * Le score, la classe, les six proxies et ce qui manque pour estimer n'avaient
 * aucun chemin vers un écran : on payait le calcul à chaque analyse pour ne
 * rien en montrer.
 *
 * Les trois propriétés que ces tests tiennent :
 *
 * 1. le service sert la STRUCTURE, pas un résumé — un score sans ses axes est
 *    exactement la forme que la doctrine refuse ;
 * 2. l'absence se dit `null`, jamais un objet vide qui se lirait « barrière 0 » ;
 * 3. l'avertissement de procédure collective ne part PAS deux fois — il a déjà
 *    sa place, hors barème, et le montrer aussi dans la barrière le rangerait
 *    dans un score dont il est délibérément absent.
 */

type Row = Record<string, unknown>

/** Le barème complet, tel que le moteur Python l'écrit. */
const FULL_BARRIER = {
  score: 5.7,
  accessibility: 4.3,
  access_class: 'C' as const,
  label: 'Semi-ouvert',
  proxies: [
    { key: 'statut', contribution: 3.15, evidence: 'grande entreprise au sens INSEE', measurable: true },
    { key: 'effectif', contribution: 1.05, evidence: 'effectif 1999 salariés', measurable: true },
    { key: 'cotation', contribution: 0, evidence: 'cotation inconnue', measurable: false },
    { key: 'commande_publique', contribution: 1.5, evidence: 'achète en commande publique', measurable: true },
    { key: 'decentralisation', contribution: 0, evidence: '6 établissement(s)', measurable: true },
    { key: 'anciennete', contribution: 0, evidence: 'créée il y a 57 an(s)', measurable: true },
  ],
  measurable: true,
  missing: ['cotation'],
  corrections: [
    {
      key: 'echeance_proche',
      delta: -1.5,
      label: 'Le marché en place arrive à échéance',
      evidence: 'marché public en cours jusqu’au 2026-11-30',
    },
  ],
  warning: { kind: 'procedure_collective', date: '2026-06-01', label: 'Redressement judiciaire' },
}

function buildService(rawAnalysis: Row | null): AccountAccessService {
  const facts = {
    find: jest.fn().mockResolvedValue([]),
    query: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
    create: jest.fn(),
  }
  const accounts = {
    findOne: jest.fn().mockResolvedValue({
      id: 'acc-1',
      siren: null,
      priority_gate: 'pending',
      raw_analysis: rawAnalysis,
      // #3504 — un compte dont la collecte est postérieure à la correction de l'effectif : sa barrière
      // est servie entière (un effectif à revérifier, lui, sort du calcul — `access-addressability.spec.ts`).
      signals_collected_at: new Date('2099-01-01T00:00:00Z'),
    }),
  }
  const entities = { find: jest.fn().mockResolvedValue([]) }
  return new AccountAccessService(facts as never, accounts as never, entities as never)
}

describe('la barrière d’achat arrive jusqu’à l’écran', () => {
  it('sert la structure ENTIÈRE — score, classe, proxies, ce qui manque', async () => {
    const service = buildService({ access_barrier: FULL_BARRIER })
    const landscape = await service.landscape('ws-1', 'acc-1')

    expect(landscape.barrier).not.toBeNull()
    expect(landscape.barrier?.score).toBe(5.7)
    expect(landscape.barrier?.access_class).toBe('C')
    // Six proxies NOMMÉS : c'est ce qui fait qu'un score n'est pas nu. Sous
    // trois mesurables, le moteur ne produit aucune classe — mais il produit
    // toujours la liste, et c'est elle qui explique pourquoi.
    expect(landscape.barrier?.proxies).toHaveLength(6)
    expect(landscape.barrier?.missing).toEqual(['cotation'])
    expect(landscape.barrier?.corrections).toHaveLength(1)
  })

  it('accepte l’alias camelCase, comme le faisait déjà la lecture des deux booléens', async () => {
    const service = buildService({ accessBarrier: FULL_BARRIER })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.barrier?.access_class).toBe('C')
  })

  it('rend `null` quand le compte n’a pas de barrière — jamais un objet vide', async () => {
    // Un compte analysé avant que ce calcul existe n'a pas de barrière. Servir
    // `{}` ferait afficher « barrière 0/10 » à l'écran, c'est-à-dire « ouvert
    // probable » — la lecture exactement inverse de la vérité, qui est
    // « je n'ai pas regardé ».
    const service = buildService({})
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.barrier).toBeNull()
  })

  it('rend `null` quand la structure stockée est illisible — un score sans ses axes ne s’affiche pas', async () => {
    // La forme partielle EXISTE dans le dépôt (elle a été semée ainsi). Un
    // « 8,2/10 » sans ses proxies serait un score nu, et un score nu est
    // précisément ce que la doctrine refuse.
    const service = buildService({ access_barrier: { score: 8.2, access_class: 'D', label: 'Verrouillé' } })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.barrier).toBeNull()
  })

  it('ne renvoie PAS l’avertissement dans la barrière — il a déjà sa place, hors barème', async () => {
    const service = buildService({ access_barrier: FULL_BARRIER })
    const landscape = await service.landscape('ws-1', 'acc-1')

    expect(landscape.warning?.kind).toBe('procedure_collective')
    expect(JSON.stringify(landscape.barrier)).not.toContain('procedure_collective')
  })

  it('#3916.1 — porte le lien vers l’annonce BODACC quand la ligne en a un', async () => {
    const url = 'https://bodacc-datadila.opendatasoft.com/explore/dataset/annonces-commerciales/table/?q=552032534'
    const service = buildService({ access_barrier: { ...FULL_BARRIER, warning: { ...FULL_BARRIER.warning, url } } })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.warning?.url).toBe(url)
  })

  it('#3916.1 — `url` absente plutôt que devinée quand la ligne n’en porte pas', async () => {
    const service = buildService({ access_barrier: FULL_BARRIER })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.warning?.url ?? null).toBeNull()
  })

  it('n’écrit rien : exposer la barrière est une LECTURE', async () => {
    const service = buildService({ access_barrier: FULL_BARRIER })
    await service.landscape('ws-1', 'acc-1')
    // Le corpus de la garde : la structure servie vient bien du contrat, et le
    // contrat la valide. Sans cette ligne, les tests ci-dessus passeraient au
    // vert sur un schéma vide.
    expect(accessBarrierSchema.safeParse(FULL_BARRIER).success).toBe(true)
  })
})
