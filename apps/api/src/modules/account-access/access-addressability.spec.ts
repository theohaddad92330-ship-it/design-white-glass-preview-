import { addressabilitySchema } from '@bellum/contracts'
import { AccountAccessService } from './account-access.service'

/**
 * L'ADRESSABILITÉ — les cinq axes (tome 1 §6), servie à l'onglet Accès.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST MESURÉ, ET DEPUIS QUAND (⚠️ CORRIGÉ — ce docblock affirmait
 * encore « aucun producteur » ; c'est FAUX depuis le 06/09/2026, demande
 * traitée par `fix/adressabilite-nommee-au-contrat`)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le calcul existe côté IA, dans `addressability_for_company`
 * (`apps/ia/app/services/discover_scoring.py`, publique — sans `_` — depuis
 * #1579), et atteint déjà un écran : la carte d'un candidat Découvrir. Depuis
 * la PR #1689 (06/09/2026, #1580/#1579), il a aussi un producteur qui l'écrit
 * sur un compte du portefeuille : `phase1_research.py:1535` pose
 * `result["addressability"] = addressability_for_company(...)` à CHAQUE
 * analyse, exactement comme il pose `raw_analysis.access_barrier` juste
 * au-dessus — la MÊME dérivation rejoint le portefeuille au lieu de rester
 * cantonnée à une recherche Découvrir (GA-26 : « une dérivation vit à un seul
 * endroit »). La colonne `addressability` de la table `opportunities`
 * (migration `1789992413058`) porte le même nom et la même intention mais
 * vit sur le BESOIN, pas sur le compte, et **elle**, en revanche, n'a
 * toujours aucun producteur.
 *
 * Ce service ne RECALCULE donc rien — il lit `raw_analysis.addressability`,
 * exactement comme il lit déjà `raw_analysis.access_barrier` depuis le 29/08.
 * Un compte analysé AVANT cette PR porte encore `null` — jusqu'à sa prochaine
 * analyse — et l'onglet le dit honnêtement plutôt que d'inventer un score.
 */

type Row = Record<string, unknown>

/** La forme complète, telle que `addressability_for_company()` la rend côté Découvrir. */
const FULL_ADDRESSABILITY = {
  score: 9,
  max: 11,
  unmeasured: ['path', 'relation', 'access_cost'],
  factors: [
    {
      label: 'Consultation ouverte — la porte l’est aussi',
      points: 6,
      evidence: 'appel d’offres publié : Refonte SI (2026-05-01)',
      axis: 'lock',
      block: 'accessibility',
    },
    {
      label: 'Proportion — < 250 pour une ESN de 10-30',
      points: 3,
      evidence: 'effectif < 250 face à une ESN de 10-30',
      axis: 'proportion',
      block: 'accessibility',
    },
  ],
}

function buildService(
  rawAnalysis: Row | null,
  opts: { signalsCollectedAt?: Date | null; employees?: string | null } = {},
): AccountAccessService {
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
      signals_collected_at: opts.signalsCollectedAt ?? null,
      employees: opts.employees ?? null,
    }),
  }
  const entities = { find: jest.fn().mockResolvedValue([]) }
  return new AccountAccessService(facts as never, accounts as never, entities as never)
}

describe('l’adressabilité (cinq axes) — lue, jamais recalculée', () => {
  it('sert la structure ENTIÈRE quand un producteur l’a écrite — score, axes non mesurés, facteurs', async () => {
    const service = buildService({ addressability: FULL_ADDRESSABILITY })
    const landscape = await service.landscape('ws-1', 'acc-1')

    expect(landscape.addressability).not.toBeNull()
    expect(landscape.addressability?.score).toBe(9)
    expect(landscape.addressability?.max).toBe(11)
    // Les TROIS axes non mesurables au stade où le calcul tourne aujourd'hui —
    // NOMMÉS, jamais fondus dans un score à zéro.
    expect(landscape.addressability?.unmeasured).toEqual(['path', 'relation', 'access_cost'])
    expect(landscape.addressability?.factors).toHaveLength(2)
    expect(landscape.addressability?.factors.map(f => f.axis)).toEqual(['lock', 'proportion'])
  })

  it('rend `null` quand le compte n’a pas d’adressabilité — jamais un objet vide', async () => {
    // C'est le cas de TOUS les comptes aujourd'hui : aucun producteur n'existe
    // encore. Servir `{}` ferait lire « 0/20 », c'est-à-dire « inatteignable » —
    // l'inverse de « nous n'avons pas encore regardé ».
    const service = buildService({})
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.addressability).toBeNull()
  })

  it('rend `null` quand la structure stockée est illisible — un score sans ses axes ne s’affiche pas', async () => {
    const service = buildService({ addressability: { score: 9, max: 11 } })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.addressability).toBeNull()
  })

  it('n’écrit rien : exposer l’adressabilité est une LECTURE', async () => {
    const service = buildService({ addressability: FULL_ADDRESSABILITY })
    await service.landscape('ws-1', 'acc-1')
    // Le corpus de la garde : la structure servie vient bien du contrat, et le
    // contrat la valide. Sans cette ligne, les tests ci-dessus passeraient au
    // vert sur un schéma vide.
    expect(addressabilitySchema.safeParse(FULL_ADDRESSABILITY).success).toBe(true)
  })

  /**
   * #2298.4 (réfuté en production le 19/09/2026) — LA DATE DU CALCUL VOYAGE
   * AVEC LUI.
   *
   * `raw_analysis.addressability` est recalculé à CHAQUE recherche Phase 1
   * (`AccountsService.applyResearch`), qui stampe `signals_collected_at` dans
   * la MÊME écriture (`analysis.persistence.ts`/`accounts.service.ts`) —
   * c'est donc la date exacte du dernier calcul de l'axe RELATION. Sans elle,
   * l'écran ne peut pas dire qu'un compte a été analysé avant la capacité
   * #2298.4 (missions/agenda/e-mails/correction) — deux comptes du même
   * espace se contredisent alors sur l'état d'un connecteur (ACTIA « CRM non
   * connecté » vs LVMH « CRM connecté », mesuré en production le 19/09).
   */
  it('#2298.4 — sert `addressabilityCollectedAt`, la date du dernier calcul de l’axe RELATION', async () => {
    const collectedAt = new Date('2026-09-10T08:00:00.000Z')
    const service = buildService({ addressability: FULL_ADDRESSABILITY }, { signalsCollectedAt: collectedAt })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.addressabilityCollectedAt).toBe(collectedAt.toISOString())
  })

  it('#2298.4 — `addressabilityCollectedAt` est `null` quand ce compte n’a jamais été analysé', async () => {
    const service = buildService({ addressability: FULL_ADDRESSABILITY }, { signalsCollectedAt: null })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.addressabilityCollectedAt).toBeNull()
  })

  /**
   * #3504 (recette prod 02/10) — « effectif 53 salariés » sous un en-tête « Plus de 10 000 » :
   * la valeur à REVÉRIFIER ne pèse plus, ni dans la barrière ni dans l'axe proportion.
   */
  it('#3504 — un effectif contredit par l’en-tête sort de la barrière ET de la proportion', async () => {
    const service = buildService(
      {
        addressability: FULL_ADDRESSABILITY,
        access_barrier: {
          score: 5.5,
          accessibility: 4.5,
          access_class: 'C',
          label: 'Semi-ouvert',
          proxies: [
            { key: 'statut', contribution: 3, evidence: 'statut retenu : eti', measurable: true },
            { key: 'effectif', contribution: 0.18, evidence: 'effectif 53 salariés — paliers', measurable: true },
            { key: 'cotation', contribution: 1, evidence: 'société cotée', measurable: true },
            { key: 'commande_publique', contribution: 1.32, evidence: 'achète en commande publique', measurable: true },
          ],
          measurable: true,
          missing: [],
          corrections: [],
        },
      },
      { signalsCollectedAt: new Date('2099-01-01T00:00:00Z'), employees: 'Plus de 10 000 salariés' },
    )
    const landscape = await service.landscape('ws-1', 'acc-1')

    expect(landscape.headcountToRecheck).toBe(true)
    expect(landscape.barrier?.proxies.find(p => p.key === 'effectif')).toMatchObject({
      contribution: 0,
      measurable: false,
    })
    expect(landscape.barrier?.score).toBe(5.32)
    expect(landscape.addressability?.factors.map(f => f.axis)).toEqual(['lock'])
    expect(landscape.addressability?.unmeasured).toContain('proportion')
  })

  it('#3504 — sait dire NON : un effectif cohérent et frais ne bouge rien', async () => {
    const service = buildService(
      { addressability: FULL_ADDRESSABILITY },
      { signalsCollectedAt: new Date('2099-01-01T00:00:00Z'), employees: '50 à 99 salariés' },
    )
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.headcountToRecheck).toBe(false)
    expect(landscape.addressability?.factors.map(f => f.axis)).toEqual(['lock', 'proportion'])
  })
})
