import { coverageGapsResponseSchema } from '@bellum/contracts'
import { IsNull } from 'typeorm'
import { ContactEntity } from '../../database/entities/contact.entity'
import { CoverageService } from './coverage.service'

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'
const WORKSPACE_ID = '22222222-2222-2222-2222-222222222222'

/** Build a contact row with only the fields the coverage model reads. */
function contact(partial: Partial<ContactEntity>): ContactEntity {
  return {
    family: null,
    title: null,
    seniority: null,
    scope: null,
    decision_role: null,
    ...partial,
  } as ContactEntity
}

function makeService(
  rows: ContactEntity[],
  mappedEntities: number | string[] = 0,
  extraRawAnalysis: Record<string, unknown> = {},
) {
  const find = jest.fn().mockResolvedValue(rows)
  const repo = { find }
  // Le compte fournit le dénominateur des « entités couvertes » (cartographie).
  // Un tableau de NOMS permet d'exercer le rapprochement contacts ↔ cartographie.
  const mapped = Array.isArray(mappedEntities)
    ? mappedEntities.map(name => ({ name }))
    : Array.from({ length: mappedEntities }, (_, i) => ({ name: `E${i}` }))
  const accounts = {
    findOne: jest.fn().mockResolvedValue({
      id: ACCOUNT_ID,
      raw_analysis: { ...(mapped.length > 0 ? { entitiesExhaustive: mapped } : {}), ...extraRawAnalysis },
    }),
  }
  const service = new CoverageService(repo as never, accounts as never)
  return { service, find, accounts }
}

describe('CoverageService.computeForAccount', () => {
  it('reads contacts scoped by account_id AND workspace_id', async () => {
    const { service, find } = makeService([])
    await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
    // #4324.1 — un contact ARCHIVÉ (excluded_at) ou supprimé ne compte ni dans le total ni dans les rôles.
    expect(find).toHaveBeenCalledWith({
      where: { account_id: ACCOUNT_ID, workspace_id: WORKSPACE_ID, deleted_at: IsNull(), excluded_at: IsNull() },
    })
  })

  // #4324.1 (DHL, recette 22/10) — un compte suivi montre un DSI OU dit pourquoi il n'y en a pas : un contact IT
  // de niveau N-1 (non direction) ferme le gap « contacts opérationnels » sans tenir le siège DSI.
  it('#4324.1 — de l’IT N-1 sans DSI : « IT / DSI » reste un angle mort, avec sa raison', async () => {
    const { service } = makeService([
      contact({ family: 'it', title: 'Directeur Infrastructure', seniority: 'director' }),
      contact({ family: 'cloud', title: 'Directeur Cloud' }),
      contact({ family: 'cloud', title: 'Responsable Cloud' }),
    ])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
    expect(res.technical_gap?.reason).toBe('it_below_director')
    const itGap = res.gaps.find(gap => gap.family === 'it')
    expect(itGap).toBeDefined()
    expect(itGap?.level).toBe('c_level')
    expect(itGap?.reason).toMatch(/DSI/)
  })

  // P5 (29/09) — `coverage-gaps` relisait le compte (et son `raw_analysis`, le
  // plus gros champ de la table) que la garde de propriété venait déjà de lire.
  it('P5 — avec le `raw_analysis` déjà lu, ne relit PAS le compte, et rend la même carte', async () => {
    const rawAnalysis = { entitiesExhaustive: [{ name: 'DSI' }, { name: 'Finance' }] }
    const relit = makeService([contact({ title: 'DSI' })], ['DSI', 'Finance'])
    const prete = makeService([contact({ title: 'DSI' })], ['DSI', 'Finance'])

    const attendu = await relit.service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
    const obtenu = await prete.service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID, { rawAnalysis })

    expect(relit.accounts.findOne).toHaveBeenCalledTimes(1)
    expect(prete.accounts.findOne).not.toHaveBeenCalled()
    expect(obtenu).toEqual(attendu)
  })

  it('returns an all-missing, single-champion-risk map for an empty account', async () => {
    const { service } = makeService([])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    expect(res.account_id).toBe(ACCOUNT_ID)
    expect(res.score).toBe(0)
    expect(res.contacts_total).toBe(0)
    expect(res.classified_contacts).toBe(0)
    expect(res.families_covered).toBe(0)
    expect(res.levels_covered).toBe(0)
    expect(res.single_champion_risk).toBe(true)
    // Every canonical family is reported, all uncovered.
    expect(res.families).toHaveLength(11)
    expect(res.families.every(f => !f.covered)).toBe(true)
    expect(res.levels.map(l => l.level)).toEqual(['c_level', 'n1', 'n2'])
    // Gaps are generated but capped.
    expect(res.gaps.length).toBeGreaterThan(0)
    expect(res.gaps.length).toBeLessThanOrEqual(6)
  })

  it('scores 1.0 when the 3 levels + 3 target families + the critical roles are all engaged', async () => {
    const { service } = makeService([
      contact({ family: 'IT', title: 'DSI', decision_role: 'sponsor' }), //                it   · c_level
      contact({ family: 'IT', title: 'Directeur des Systèmes', decision_role: 'economic' }), // it · n1
      contact({ family: 'IT', title: 'Ingénieur systèmes', decision_role: 'technical' }), //  it   · n2
      contact({ family: 'Cyber', title: 'RSSI', decision_role: 'procurement' }), //         cyber· n1
      contact({ family: 'Cyber', title: 'Analyste SOC' }), //          cyber· n2
      contact({ family: 'Data', title: 'Head of Data' }), //          data · n1
      contact({ family: 'Data', title: 'Data Analyst' }), //          data · n2
    ])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    expect(res.families_covered).toBe(3) // it, cyber, data
    expect(res.levels_covered).toBe(3) // c_level, n1, n2
    expect(res.score).toBe(1)
    expect(res.single_champion_risk).toBe(false)
  })

  /**
   * #2121.51 — « une couverture à 100 % est impossible si un rôle critique
   * manque ». Familles et niveaux tous tenus, mais personne ne tient le
   * sponsor, le décideur économique, le référent technique ni les achats :
   * afficher 100 % dirait « rien ne nous manque » alors que le comité est vide.
   */
  it.each(['sponsor', 'economic', 'technical', 'procurement'])(
    'ne rend JAMAIS 100 %% tant que le rôle critique « %s » manque (#2121.51)',
    async missing => {
      const roles = ['sponsor', 'economic', 'technical', 'procurement'].filter(role => role !== missing)
      const { service } = makeService([
        contact({ family: 'IT', title: 'DSI', decision_role: roles[0] }),
        contact({ family: 'IT', title: 'Directeur des Systèmes', decision_role: roles[1] }),
        contact({ family: 'IT', title: 'Ingénieur systèmes', decision_role: roles[2] }),
        // #4324 — un RSSI SANS rôle posé tiendrait le siège technique (rapprochement par intitulé) : ce
        // fixture modélise un comité VIDE, donc son rôle est posé ailleurs (`user`).
        contact({ family: 'Cyber', title: 'RSSI', decision_role: 'user' }),
        contact({ family: 'Cyber', title: 'Analyste SOC' }),
        contact({ family: 'Data', title: 'Head of Data' }),
        contact({ family: 'Data', title: 'Data Analyst' }),
      ])
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

      expect(res.families_covered).toBe(3)
      expect(res.levels_covered).toBe(3)
      expect(res.roles_missing).toContain(missing)
      // Le pourcentage que l'écran ARRONDIT ne doit pas non plus retomber sur 100.
      expect(Math.round(res.score * 100)).toBeLessThan(100)
    },
  )

  /**
   * LE défaut que le registre partagé corrige, en bout de chaîne réelle.
   *
   * Le prompt de classification (`apps/ia/app/prompts/bellum_contacts.py:45`)
   * demande à Claude d'écrire des libellés COMPOSÉS, et l'API les persiste tels
   * quels (`contacts.service.ts`, `family: c.family || null`). La matrice les
   * comparait à ses alias par égalité EXACTE : « Data / BI / Analytics » ne vaut
   * ni `data`, ni `bi`, ni `analytics` — neuf des dix retombaient donc sur le
   * repli par mots-clés de TITRE, silencieusement.
   *
   * Le titre choisi ici est volontairement MUET sur sa famille (« Responsable de
   * secteur » : il donne un NIVEAU, aucune famille) — sans le registre, aucun
   * indice de titre ne peut sauver la mise et la famille sort `null`. C'est ce
   * qui fait de ce test une garde plutôt qu'une coïncidence.
   */
  it('lit les libellés composés que le prompt de classification demande, titre muet compris', async () => {
    const { service } = makeService([
      contact({ family: 'IT / Infrastructure', title: 'Responsable de secteur' }),
      contact({ family: 'Data / BI / Analytics', title: 'Responsable de secteur' }),
      contact({ family: 'IA / ML', title: 'Responsable de secteur' }),
      contact({ family: 'Finance / Controle de gestion', title: 'Responsable de secteur' }),
      contact({ family: 'Achat / Procurement', title: 'Responsable de secteur' }),
      contact({ family: 'RH / Talent', title: 'Responsable de secteur' }),
    ])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    const covered = res.families
      .filter(f => f.covered)
      .map(f => f.family)
      .sort()
    expect(covered).toEqual(['achat', 'data', 'finance', 'ia', 'it', 'rh'])
    // Chaque contact est situé : aucun ne compte plus pour une incohérence.
    expect(res.classified_contacts).toBe(6)
  })

  it('flags single-champion risk when every contact is in one family', async () => {
    const { service } = makeService([
      contact({ family: 'IT', title: 'DSI' }),
      contact({ family: 'IT', title: 'Directeur Infrastructure IT' }),
      contact({ family: 'IT', title: 'Ingénieur systèmes' }),
      contact({ family: 'IT', title: 'Responsable exploitation' }),
    ])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    expect(res.families_covered).toBe(1)
    expect(res.single_champion_risk).toBe(true)
    // The zones blanches must point at OTHER families than the one covered.
    expect(res.gaps.some(g => g.family !== 'it')).toBe(true)
  })

  it('derives the level from title (DSI → C-Level, Directeur → N-1, Analyst → N-2)', async () => {
    const { service } = makeService([
      contact({ title: 'DSI' }), //           no family field, title hint → it · c_level
      contact({ title: 'Directeur Data' }), // data · n1
      contact({ title: 'Data Analyst' }), //  data · n2
    ])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    const byLevel = Object.fromEntries(res.levels.map(l => [l.level, l.contact_count]))
    expect(byLevel['c_level']).toBe(1)
    expect(byLevel['n1']).toBe(1)
    expect(byLevel['n2']).toBe(1)
    expect(res.levels_covered).toBe(3)
    // Title fallback also classifies the family (it, data).
    expect(res.families.find(f => f.family === 'data')?.contact_count).toBe(2)
  })

  it('excludes unclassifiable contacts from classified_contacts but keeps them in the total', async () => {
    const { service } = makeService([
      contact({ family: 'IT', title: 'DSI' }), //          classified
      contact({ title: 'Assistant administratif' }), //    no family, no level → unclassified
    ])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
    expect(res.contacts_total).toBe(2)
    expect(res.classified_contacts).toBe(1)
  })

  it('emits ranked, deduped gaps and a schema-valid payload', async () => {
    const { service } = makeService([contact({ family: 'IT', title: 'Ingénieur systèmes' })])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    // Gaps are sorted by ascending priority and unique per family×level.
    const priorities = res.gaps.map(g => g.priority)
    expect([...priorities]).toEqual([...priorities].sort((a, b) => a - b))
    const keys = res.gaps.map(g => `${g.family}:${g.level}`)
    expect(new Set(keys).size).toBe(keys.length)
    // A covered-but-operational-only family should be told to climb to N-1.
    expect(res.gaps.some(g => g.family === 'it' && g.level === 'n1')).toBe(true)

    // Full contract validation.
    expect(() => coverageGapsResponseSchema.parse(res)).not.toThrow()
  })

  // ── Maquette p33 : la page doit répondre à une décision ────────────────────

  it('prouve chaque cellule famille × niveau (avant : « possible mais non prouvé »)', async () => {
    const { service } = makeService([
      contact({ family: 'data', title: 'DSI', decision_role: 'economic' }),
      contact({ family: 'data', title: 'Directeur Data', decision_role: 'technical' }),
      contact({ family: 'cyber', title: 'Analyste SOC', decision_role: 'user' }),
    ])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    const cell = (family: string, level: string) =>
      res.cells?.find(c => c.family === family && c.level === level)?.contact_count ?? 0
    expect(cell('data', 'c_level')).toBe(1)
    expect(cell('data', 'n1')).toBe(1)
    expect(cell('cyber', 'n2')).toBe(1)
    // Une cellule vide n'est pas émise — pas 33 zéros dans le payload.
    expect(res.cells?.some(c => c.contact_count === 0)).toBe(false)
  })

  it('réconcilie les dénominateurs : contacts placés vs contacts en famille CIBLE', async () => {
    // Le cas p32 : « 9 contacts, 0 famille couverte » se contredisaient à l'écran
    // parce que tous les contacts étaient dans des familles SUPPORT.
    const { service } = makeService([
      contact({ family: 'clevel', title: 'CEO' }),
      contact({ family: 'pmo', title: 'Directeur de projet' }),
    ])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    expect(res.classified_contacts).toBe(2)
    expect(res.families_covered).toBe(0)
    expect(res.target_family_contacts).toBe(0)
  })

  it('compte les rôles du comité tenus (« Rôles couverts 4/8 »)', async () => {
    const { service } = makeService([
      contact({ family: 'data', title: 'DSI', decision_role: 'economic' }),
      contact({ family: 'data', title: 'Architecte', decision_role: 'technical' }),
      contact({ family: 'data', title: 'Lead', decision_role: 'technical' }),
    ])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    expect(res.roles_covered).toBe(2) // economic + technical, jamais 3
    expect(res.roles_target).toBe(8)
  })

  it('compte les entités couvertes sur la cartographie du compte (« 2/7 »)', async () => {
    // La cartographie NOMME les sept entités, et les contacts en touchent deux.
    // La fixture disait « 2/7 » en donnant sept entités anonymes qu'aucun
    // contact ne touchait : le compte était donc « 2/7 » à l'affichage et
    // « sept à ouvrir » dans la liste — les deux chiffres ne parlaient pas du
    // même ensemble.
    const mapped = ['TF1 SA', 'TF1 Pub', 'E2', 'E3', 'E4', 'E5', 'E6']
    const { service } = makeService(
      [
        contact({ family: 'data', title: 'DSI', entity: 'TF1 SA' }),
        contact({ family: 'data', title: 'Directeur', entity: 'TF1 Pub' }),
        contact({ family: 'cyber', title: 'RSSI', entity: 'TF1 Pub' }),
      ],
      mapped,
    )
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    expect(res.entities_covered).toBe(2)
    expect(res.entities_total).toBe(7)
    // Ce qui rend le ratio lisible : les cinq restantes sont exactement celles
    // que la liste « à ouvrir » propose.
    expect(res.entities_uncovered_names).toHaveLength(5)
  })

  // ── Maquette p19 : le cockpit doit NOMMER, pas seulement compter ───────────

  it('nomme les entités couvertes et celles qui restent blanches', async () => {
    // La tuile de la maquette affiche « 2/7 » ET « TF1 SA, TF1 Pub » : sans les
    // noms, le commercial sait qu'il lui manque des entités mais pas lesquelles.
    const { service } = makeService(
      [
        contact({ family: 'data', title: 'DSI', entity: 'TF1 SA' }),
        contact({ family: 'data', title: 'Directeur Data', entity: 'TF1 Pub' }),
        contact({ family: 'cyber', title: 'RSSI', entity: 'TF1 Pub' }),
      ],
      ['TF1 SA', 'TF1 Pub', 'TF1+', 'Studio TF1'],
    )
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    // Triées du mieux couvert au moins couvert, libellé d'origine conservé.
    expect(res.entities_covered_names).toEqual(['TF1 Pub', 'TF1 SA'])
    expect(res.entities_uncovered_names).toEqual(['TF1+', 'Studio TF1'])
  })

  it("ne déclare jamais couverte une entité de la cartographie qu'aucun contact ne nomme", async () => {
    const { service } = makeService([contact({ family: 'data', title: 'DSI', entity: 'TF1 SA' })], ['TF1 Pub'])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    expect(res.entities_covered_names).toEqual(['TF1 SA'])
    expect(res.entities_uncovered_names).toEqual(['TF1 Pub'])
  })

  it('dit QUELS rôles du comité manquent derrière le « 4/8 »', async () => {
    const { service } = makeService([
      contact({ family: 'data', title: 'DSI', decision_role: 'economic' }),
      contact({ family: 'data', title: 'Architecte', decision_role: 'technical' }),
    ])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    expect(res.roles_covered).toBe(2)
    expect(res.roles_missing).toEqual(['user', 'champion', 'influencer', 'blocker', 'procurement', 'sponsor'])
  })

  // K.4 / #4324 (Louis 19/10/2026, cas Arkéa) — « aucun DSI / RSSI » alors que le compte porte un CISO :
  // un rôle ne se déclare absent qu'après avoir rapproché les intitulés équivalents.
  it('#4324 — un CISO sans rôle posé tient le siège technique : « technical » n’est PAS manquant', async () => {
    const { service } = makeService([contact({ title: 'CISO', decision_role: null })])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    expect(res.roles_missing).not.toContain('technical')
    expect(res.roles_covered).toBe(1)
  })

  it('#4324 — sait dire NON : sans intitulé équivalent, « technical » reste manquant ; un rôle posé n’est pas écrasé', async () => {
    const sansTitre = makeService([contact({ title: 'Directeur Financier', decision_role: null })])
    const poseAilleurs = makeService([contact({ title: 'CISO', decision_role: 'blocker' })])

    expect((await sansTitre.service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)).roles_missing).toContain('technical')
    expect((await poseAilleurs.service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)).roles_missing).toContain(
      'technical',
    )
  })

  // #4324.2 — l'alignement des intitulés est incertain : on DIT l'incertitude au lieu d'affirmer « aucun contact ».
  it('#4324.2 — un intitulé voisin (« Head of IT ») nuance la zone blanche IT : jamais « Aucun contact »', async () => {
    const { service } = makeService([contact({ title: 'Head of IT', family: 'finance' })])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
    const gap = res.gaps.find(g => g.family === 'it' && g.level === 'n1')

    expect(gap).toBeDefined()
    expect(gap?.reason).not.toMatch(/^Aucun contact/)
    expect(gap?.reason).toContain('Head of IT')
    expect(gap?.reason).toMatch(/à confirmer/)
  })

  it('#4324.2 — sait dire NON : aucun intitulé voisin → le texte actuel, inchangé', async () => {
    const { service } = makeService([contact({ title: 'Directeur Financier', family: 'finance' })])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
    const gap = res.gaps.find(g => g.family === 'it' && g.level === 'n1')

    expect(gap?.reason).toBe('Aucun contact dans cette famille — engager le décideur pour ouvrir le compte.')
  })

  // #4324.1 (retour client 21/10) — un compte sans DSI connu dit POURQUOI.
  it('#4324.1 — aucun contact IT collecté : le manque du siège technique est de COLLECTE', async () => {
    const { service } = makeService([contact({ title: 'Directeur Financier' }), contact({ title: 'Responsable RH' })])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
    expect(res.technical_gap).toEqual({ reason: 'no_it_contact', it_contacts: 0 })
  })

  it('#4324.1 — des contacts IT, aucun au niveau direction : le manque est de NIVEAU', async () => {
    const { service } = makeService([contact({ title: 'Chef de projet DSI' }), contact({ title: 'Technicien réseau' })])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
    expect(res.technical_gap).toEqual({ reason: 'it_below_director', it_contacts: 2 })
  })

  // #4324.1 (26/10, Julien Seigneur — STG SERVICES / DHL) — une place n'est « à pourvoir » que si AUCUN contact du
  // dossier ne peut la tenir. « À qualifier » (`unknown`) = pas fini de vérifier, pas « n'existe pas ».
  describe('#4324.1 — un titulaire d’intitulé voisin tient la place, même « à qualifier »', () => {
    const missing = async (contacts: ContactEntity[]) =>
      (await makeService(contacts).service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)).roles_missing

    it('référent technique : « Responsable de Domaine IT » et « IT Infrastructure and Security Manager » rangés unknown', async () => {
      const roles = await missing([
        contact({ title: 'Responsable de Domaine IT / Pole Transport & Logistique', decision_role: 'unknown' }),
        contact({ title: 'IT Infrastructure and Security Manager', decision_role: 'unknown' }),
      ])
      expect(roles).not.toContain('technical')
    })

    it('décideur économique (CFO) et achats (Chief Procurement Officer) sont tenus', async () => {
      const roles = await missing([
        contact({ title: 'CFO', decision_role: 'unknown' }),
        contact({ title: 'Chief Procurement Officer', decision_role: null }),
      ])
      expect(roles).not.toContain('economic')
      expect(roles).not.toContain('procurement')
    })

    it.each(['CIO', 'Head of IT', 'IT Director'])('non-régression : %s reste référent technique', async title => {
      expect(await missing([contact({ title })])).not.toContain('technical')
    })

    it('SAIT DIRE NON : un rôle sans aucun candidat reste « à pourvoir » (et le sponsor ne se déduit jamais d’un titre)', async () => {
      const roles = await missing([
        contact({ title: 'Chauffeur livreur', decision_role: 'unknown' }),
        contact({ title: 'Directeur Commercial', decision_role: 'unknown' }),
      ])
      expect(roles).toEqual(expect.arrayContaining(['economic', 'technical', 'procurement', 'sponsor']))
    })

    it('un rôle posé n’est jamais écrasé par le titre', async () => {
      expect(await missing([contact({ title: 'CFO', decision_role: 'user' })])).toContain('economic')
    })
  })

  it('#4324.1 — un DSI reconnu (intitulé de terrain) : aucun manque à dire', async () => {
    const { service } = makeService([contact({ title: 'Directeur IT' })])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
    expect(res.technical_gap).toBeUndefined()
    expect(res.roles_missing).not.toContain('technical')
  })

  it('croise ENTITÉ × famille × niveau — une famille couverte ailleurs reste blanche ici', async () => {
    // Le cœur de la maquette p19 : « Data couvert » au niveau du compte cache que
    // TF1 Pub n'a personne. L'agrégation famille × niveau ne peut pas le dire.
    const { service } = makeService([
      contact({ family: 'data', title: 'Directeur Data', entity: 'TF1 SA' }),
      contact({ family: 'data', title: 'Data Analyst', entity: 'TF1 SA' }),
      contact({ family: 'cyber', title: 'RSSI', entity: 'TF1 Pub' }),
    ])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    const cell = (entity: string, family: string, level: string) =>
      res.entity_cells?.find(c => c.entity === entity && c.family === family && c.level === level)?.contact_count ?? 0
    expect(cell('TF1 SA', 'data', 'n1')).toBe(1)
    expect(cell('TF1 SA', 'data', 'n2')).toBe(1)
    expect(cell('TF1 Pub', 'cyber', 'n1')).toBe(1)
    // Data chez TF1 Pub : zone blanche réelle, invisible dans la matrice agrégée.
    expect(cell('TF1 Pub', 'data', 'n1')).toBe(0)
    // Jamais de cellule vide dans le payload.
    expect(res.entity_cells?.some(c => c.contact_count === 0)).toBe(false)
    // Un contact sans entité ne fabrique pas d'entité fantôme.
    expect(res.entity_cells?.every(c => c.entity.trim().length > 0)).toBe(true)
  })

  it('un contact sans entité ne produit aucune cellule entité', async () => {
    const { service } = makeService([contact({ family: 'data', title: 'Directeur Data' })])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
    expect(res.entity_cells).toEqual([])
    expect(res.entities_covered_names).toEqual([])
  })

  it('note la CONFIANCE donnée /100, distincte du taux de couverture (p29)', async () => {
    const fresh = new Date()
    const { service } = makeService([
      contact({
        family: 'data',
        title: 'DSI',
        decision_role: 'economic',
        email: 'a@tf1.fr',
        source: 'apollo',
        updated_at: fresh,
      } as Partial<ContactEntity>),
    ])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

    // Joignable, frais, sourcé, plaçable → 100 sur ces 4 axes ; seul le taux de
    // couverture (1 contact sur un compte entier) tire la note vers le bas.
    expect(res.confidence?.identity).toBe(100)
    expect(res.confidence?.freshness).toBe(100)
    expect(res.confidence?.sources).toBe(100)
    expect(res.confidence?.consistency).toBe(100)
    expect(res.confidence?.coverage).toBeLessThan(100)
    expect(res.confidence?.score).toBeGreaterThan(res.confidence!.coverage)
  })

  it('ne flatte jamais un dossier vide : confiance 0 sans contact', async () => {
    const { service } = makeService([])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
    expect(res.confidence?.score).toBe(0)
  })

  it("un contact reconstruit par l'IA ne compte pas comme une source", async () => {
    const { service } = makeService([
      contact({ family: 'data', title: 'DSI', source: 'ia_reconstruction' } as Partial<ContactEntity>),
    ])
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
    expect(res.confidence?.sources).toBe(0)
  })

  /**
   * #2307.7 — dimension « personnes vérifiées », DISTINCTE de l'axe `identity`.
   * `identity` mesure la JOIGNABILITÉ (un email ou un LinkedIn) ; un contact
   * joignable n'est pas pour autant VÉRIFIÉ — `email_verified` est le seul
   * fait qui le prouve (rebond Resend, vérification explicite). Diagnostic
   * seulement : ne participe PAS à la moyenne p29 (`score` inchangé), comme
   * `corroboration` dans la grille sœur `apps/ia/app/services/confidence.py`.
   */
  describe('dimension "personnes vérifiées" (#2307.7)', () => {
    it('un contact joignable mais NON vérifié compte pour `identity`, pas pour `verified`', async () => {
      const { service } = makeService([
        contact({ family: 'data', title: 'DSI', email: 'a@tf1.fr', email_verified: false } as Partial<ContactEntity>),
      ])
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      expect(res.confidence?.identity).toBe(100)
      expect(res.confidence?.verified).toBe(0)
    })

    it('un email vérifié fait monter `verified` sans changer `identity`', async () => {
      const { service } = makeService([
        contact({ family: 'data', title: 'DSI', email: 'a@tf1.fr', email_verified: true } as Partial<ContactEntity>),
      ])
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      expect(res.confidence?.identity).toBe(100)
      expect(res.confidence?.verified).toBe(100)
    })

    it('`verified` ne participe PAS à la moyenne : deux comptes identiques hors vérification notent pareil', async () => {
      const base = { family: 'data', title: 'DSI', email: 'a@tf1.fr', source: 'apollo', updated_at: new Date() }
      const { service: unverified } = makeService([
        contact({ ...base, email_verified: false } as Partial<ContactEntity>),
      ])
      const { service: verified } = makeService([contact({ ...base, email_verified: true } as Partial<ContactEntity>)])
      const resUnverified = await unverified.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      const resVerified = await verified.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      expect(resVerified.confidence?.score).toBe(resUnverified.confidence?.score)
      expect(resVerified.confidence?.verified).toBe(100)
      expect(resUnverified.confidence?.verified).toBe(0)
    })

    it('aucun contact ⇒ `verified` à 0, même règle que les autres composants sur un dossier vide', async () => {
      const { service } = makeService([])
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      expect(res.confidence?.verified).toBe(0)
    })
  })

  /**
   * #2307.2 — dimension « scope résolu », même statut DIAGNOSTIC que
   * `verified` (#2307.7) : lue sur `raw_analysis.entity_resolution`, jamais
   * un 0 par défaut quand ce champ n'existe pas encore (dossier antérieur à
   * #2284).
   */
  describe('dimension "scope résolu" (#2307.2)', () => {
    const anchored = {
      state: 'resolved',
      kind: null,
      canonical_id: 'c1',
      commercial_name: 'EDF',
      legal_name: null,
      country: null,
      identifiers: {},
      domain: null,
      naf_code: null,
      naf_label: null,
      location: null,
      parent_names: [],
      children_count: null,
      sources: ['legal_identifier'],
      confidence: 90,
      reasons: [],
      question: null,
      resolved_at: '2026-09-01T00:00:00Z',
    }

    it('100 quand l’entité est ANCRÉE (resolved)', async () => {
      const { service } = makeService([], 0, { entity_resolution: anchored })
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      expect(res.confidence?.scope).toBe(100)
    })

    it('0 quand résolu mais NON ancré (ambigu) — un vrai fait, pas une absence', async () => {
      const { service } = makeService([], 0, {
        entity_resolution: {
          ...anchored,
          state: 'ambiguous',
          canonical_id: null,
          question: { candidates: [{ name: 'EDF SA' }, { name: 'EDF Renouvelables' }] },
        },
      })
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      expect(res.confidence?.scope).toBe(0)
    })

    it('absent quand `entity_resolution` n’existe pas — jamais un 0 par défaut', async () => {
      const { service } = makeService([])
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      expect(res.confidence?.scope).toBeUndefined()
    })

    it('ne participe PAS à la moyenne `score`', async () => {
      const { service: withScope } = makeService([], 0, { entity_resolution: anchored })
      const { service: withoutScope } = makeService([])
      const resWith = await withScope.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      const resWithout = await withoutScope.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      expect(resWith.confidence?.score).toBe(resWithout.confidence?.score)
    })
  })

  describe('le dénominateur des entités', () => {
    /**
     * « 40/40 » et « 5 entités à ouvrir » ne peuvent pas être vrais ensemble.
     *
     * C'est pourtant ce qu'affichait la fiche d'un grand compte, signalé en
     * bêta : la carte annonçait une couverture parfaite ET listait juste en
     * dessous cinq entités qu'aucun contact ne touche. Le lecteur ne sait plus
     * lequel des deux chiffres croire, donc il ne croit ni l'un ni l'autre.
     *
     * La cause était `Math.max(cartographiées, vues)` comme total. Les contacts
     * nomment des entités que la cartographie ignore (filiales, directions,
     * co-entreprises) ; le `max` prenait alors le plus grand des deux et le
     * ratio devenait mécaniquement parfait, quel que soit le nombre d'entités
     * cartographiées jamais touchées. Le total honnête est l'UNION : ce qu'on
     * couvre, plus ce qu'on sait exister sans le couvrir.
     */
    it("compte l'union, pas le plus grand des deux ensembles", async () => {
      const { service } = makeService(
        [
          contact({ family: 'data', title: 'DSI', entity: 'Vue A' }),
          contact({ family: 'cyber', title: 'RSSI', entity: 'Vue B' }),
        ],
        ['Cartographiée 1', 'Cartographiée 2', 'Cartographiée 3'],
      )
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      expect(res.entities_covered).toBe(2)
      // 2 vues + 3 cartographiées non couvertes = 5. Avec `Math.max`, on lisait
      // « 2/3 » — un dénominateur qui ignore deux entités bel et bien touchées.
      expect(res.entities_total).toBe(5)
      expect(res.entities_uncovered_names).toHaveLength(3)
    })

    it('ne dit « tout couvert » que lorsque rien ne reste à ouvrir', async () => {
      // La propriété qui compte vraiment : couvert = total ⟺ liste vide.
      const { service } = makeService([contact({ family: 'data', title: 'DSI', entity: 'Alpha' })], ['Alpha'])
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      expect(res.entities_uncovered_names).toEqual([])
      expect(res.entities_covered).toBe(res.entities_total)
    })

    it('sans cartographie, le total est ce que les contacts nomment', async () => {
      const { service } = makeService([contact({ family: 'data', title: 'DSI', entity: 'Alpha' })])
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      expect(res.entities_covered).toBe(1)
      expect(res.entities_total).toBe(1)
    })
  })

  // ── Recette live du 29/08/2026, ROCHE : une PERSONNE dans le dénominateur ──
  //
  // « Entités couvertes 26/27 · À ouvrir : Wafaa Mamilli — Chief Digital
  // Technology Officer ». La cause est en amont (`entity_type.py` ne savait pas
  // reconnaître une personne, corrigé) — mais le correctif amont ne vaut que
  // pour les analyses FUTURES. Le dossier de ROCHE porte déjà la chaîne dans
  // son `raw_analysis` et continuerait d'afficher 26/27 jusqu'à sa prochaine
  // analyse. D'où cette lecture défensive, qui est aussi la seule que le
  // dossier déjà écrit puisse recevoir.
  describe('une personne n’est pas une entité', () => {
    it('la chaîne exacte vue en recette sort du dénominateur, et elle est NOMMÉE', async () => {
      const { service } = makeService(
        [contact({ family: 'data', title: 'DSI', entity: 'Roche Diagnostics France' })],
        ['Roche Diagnostics France', 'Roche Pharma', 'Wafaa Mamilli — Chief Digital Technology Officer'],
      )
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

      // 1 couverte + 1 cartographiée non couverte = 2, et non 3.
      expect(res.entities_total).toBe(2)
      expect(res.entities_uncovered_names).toEqual(['Roche Pharma'])
      // « On archive, on ne supprime pas » : l'entrée ne disparaît pas en
      // silence, elle est nommée avec ce qu'elle est.
      expect(res.entities_excluded_names).toEqual(['Wafaa Mamilli — Chief Digital Technology Officer'])
    })

    it('n’écarte RIEN quand la cartographie ne contient que des organisations', async () => {
      // La moitié qui compte le plus : un faux positif ferait disparaître une
      // cible commerciale, ce qui est pire que le défaut qu'on corrige.
      const { service } = makeService(
        [contact({ family: 'data', title: 'DSI', entity: 'Alpha' })],
        [
          'Alpha',
          'Roche Diagnostics France',
          'SCI Jean Martin',
          'Michel Bras',
          'Direction des Systèmes d’Information',
          'SG SOCIETE GENERALE — Retail Banking France',
          'Genentech',
        ],
      )
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      expect(res.entities_excluded_names).toEqual([])
      expect(res.entities_total).toBe(7)
    })

    it('croit le TYPE calculé en amont, même si le nom seul ne trahit rien', async () => {
      // Quand l'analyse est récente, `entityType` porte déjà le verdict du §24.
      // Le nom nu « Michel Bras » ne serait jamais écarté par la forme — le
      // type, lui, tranche, et une correction humaine passe par lui.
      const accounts = {
        findOne: jest.fn().mockResolvedValue({
          id: ACCOUNT_ID,
          raw_analysis: {
            entitiesExhaustive: [{ name: 'Alpha' }, { name: 'Michel Bras', entityType: 'person_not_an_entity' }],
          },
        }),
      }
      const repo = { find: jest.fn().mockResolvedValue([contact({ family: 'data', title: 'DSI', entity: 'Alpha' })]) }
      const service = new CoverageService(repo as never, accounts as never)
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

      expect(res.entities_total).toBe(1)
      expect(res.entities_excluded_names).toEqual(['Michel Bras'])
    })
  })

  /**
   * R15-13 (recette du 15/09/2026, prod `5ca597d5a`, dossier QONTO) — UN TAUX
   * NOMME CE QU'IL MESURE, OU IL MENT.
   *
   * Mesuré à l'écran, Personnes › « Qui nous manque » : le chiffre de tête
   * annonçait « Couverture décisionnelle 99 % » et, juste dessous, cinq axes
   * sur dix disaient « Manque » — Entités, Sponsor, Décideur économique,
   * Référent technique, Achats — avec « Rôles couverts 4/8 ».
   *
   * La cause est ici : le score ne mesurait QUE largeur × profondeur, et le
   * plafond de #2121.51 était COSMÉTIQUE — « choisi pour que l'écran, qui
   * arrondit, lise 99, jamais 100 ». Un 99 % se lit « rien ne nous manque »
   * bien plus sûrement qu'un 100 % : le plafond rendait le mensonge crédible
   * au lieu de l'empêcher.
   *
   * Les rôles critiques du comité deviennent donc un TROISIÈME axe du calcul,
   * à poids égal avec la largeur et la profondeur. Le plafond reste, comme
   * énoncé explicite de la règle — il n'est simplement plus ce qui la tient.
   */
  describe('R15-13 — le taux compte les rôles critiques, il ne les plafonne pas', () => {
    /** Familles et niveaux TOUS tenus ; le comité, lui, est vide. */
    // #4324 — les intitulés DSI / RSSI sans rôle posé tiendraient le siège technique (rapprochement par
    // intitulé) : ce fixture modélise un comité VIDE, leur rôle par défaut est donc `user`.
    const familiesAndLevelsFull = (roles: (string | null)[]) => [
      contact({ family: 'IT', title: 'DSI', decision_role: roles[0] ?? 'user' }),
      contact({ family: 'IT', title: 'Directeur des Systèmes', decision_role: roles[1] ?? null }),
      contact({ family: 'IT', title: 'Ingénieur systèmes', decision_role: roles[2] ?? null }),
      contact({ family: 'Cyber', title: 'RSSI', decision_role: roles[3] ?? 'user' }),
      contact({ family: 'Cyber', title: 'Analyste SOC' }),
      contact({ family: 'Data', title: 'Head of Data' }),
      contact({ family: 'Data', title: 'Data Analyst' }),
    ]

    it('ne lit plus 99 % quand AUCUN des quatre rôles critiques n’est tenu', async () => {
      const { service } = makeService(familiesAndLevelsFull([]))
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

      expect(res.families_covered).toBe(3)
      expect(res.levels_covered).toBe(3)
      expect(res.roles_missing).toEqual(expect.arrayContaining(['sponsor', 'economic', 'technical', 'procurement']))
      // Le chiffre exact importe moins que l'ordre de grandeur : un comité vide
      // ne peut pas se lire « quasiment tenu ».
      expect(Math.round(res.score * 100)).toBeLessThanOrEqual(70)
    })

    it('monte par paliers avec les rôles critiques tenus, jamais d’un bond au plafond', async () => {
      const scoreWith = async (roles: string[]) => {
        const { service } = makeService(familiesAndLevelsFull(roles))
        return (await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)).score
      }
      const none = await scoreWith([])
      const two = await scoreWith(['sponsor', 'economic'])
      const three = await scoreWith(['sponsor', 'economic', 'technical'])

      expect(two).toBeGreaterThan(none)
      expect(three).toBeGreaterThan(two)
      expect(Math.round(three * 100)).toBeLessThan(100)
    })

    it('sait dire NON : les quatre rôles tenus, le taux atteint bien 100 %', async () => {
      const { service } = makeService(familiesAndLevelsFull(['sponsor', 'economic', 'technical', 'procurement']))
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      expect(res.score).toBe(1)
    })

    /**
     * Le SECOND écart du même bloc : « Champions identifiés 3 » cohabitait avec
     * « Sponsor : Manque ». Le compteur additionnait `champion` ET `sponsor`,
     * pendant que l'axe lisait `roles_missing` — deux lectures du mot
     * « sponsor » qui ne pouvaient que se contredire (GA-26).
     */
    it('ne compte comme champion que les champions — le sponsor se lit sur son axe', async () => {
      const { service } = makeService([
        contact({ family: 'IT', title: 'Directeur SI', decision_role: 'champion' }),
        contact({ family: 'Data', title: 'Head of Data', decision_role: 'sponsor' }),
        contact({ family: 'Cyber', title: 'RSSI', decision_role: 'technical' }),
      ])
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)

      expect(res.champion_count).toBe(1)
      expect(res.roles_missing).not.toContain('sponsor')
    })

    it('sait dire NON : un espace sans aucun champion n’en invente pas', async () => {
      const { service } = makeService([contact({ family: 'IT', title: 'RSSI', decision_role: 'sponsor' })])
      const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
      expect(res.champion_count).toBe(0)
    })
  })

  it('fails soft to an empty map when the repository throws', async () => {
    const find = jest.fn().mockRejectedValue(new Error('db down'))
    const service = new CoverageService({ find } as never, { findOne: jest.fn() } as never)
    const res = await service.computeForAccount(ACCOUNT_ID, WORKSPACE_ID)
    expect(res.contacts_total).toBe(0)
    expect(res.score).toBe(0)
  })
})
