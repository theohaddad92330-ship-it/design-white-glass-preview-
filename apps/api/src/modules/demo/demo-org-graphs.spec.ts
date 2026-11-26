import { orgGraphSchema } from '@bellum/contracts'
import { orgPersonSlug } from '@bellum/utils'
import { DEMO_BPCE_REAL_CONTACTS_COMPANY } from './bpce-csv-mapping'
import { DEMO_BRIEF_DERIVED_GRAPH_COMPANIES, DEMO_BRIEF_THIN_COMPANIES } from './commercial-brief-seed'
import { DEMO_DOSSIERS } from './demo-dataset'
import { buildDemoOrgGraph } from './demo-org-graph'
import { DEMO_ORG_PEOPLE_WITHOUT_RECORD } from './demo-org-graphs'

/**
 * La carte d'influence d'un dossier de démonstration doit MONTRER des liens.
 *
 * Ce test existe parce que l'échec est silencieux des deux côtés : côté web,
 * `buildOrgGraphViewData` fait `safeParse` et rend `null` — la carte s'affiche
 * alors sans un seul trait, ce qui se lit « aucun lien connu » et non « le
 * graphe est cassé » ; côté données, un nom mal orthographié dans le graphe
 * produit un nœud que le rapprochement par slug ne retrouve jamais, donc un
 * trait qui n'est simplement pas dessiné.
 *
 * On vérifie donc les trois choses qui font qu'un trait apparaît vraiment :
 * le graphe est valide, chaque personne du graphe EST un contact seedé, et il
 * y a des liens des deux natures (plein sourcé, pointillé inféré).
 */
// #2284.7 / #2284.14 — craft rule 9 : la taxonomie posée sur les nœuds se VOIT en démo.
describe('taxonomie d’entité sur l’organigramme de démonstration (#2284)', () => {
  const graphs = DEMO_DOSSIERS.map(d => {
    const org = (d.account.raw_analysis as { org?: { orgGraph?: unknown } }).org
    return orgGraphSchema.parse(org?.orgGraph)
  })

  it('au moins un nœud porte un kind qui affine son type', () => {
    expect(graphs.flatMap(g => g.entities).some(e => e.entityKind === 'business_direction')).toBe(true)
  })

  it('au moins un écarté se nomme homonyme', () => {
    expect(graphs.flatMap(g => g.rejectedItems).some(r => r.entityKind === 'homonym')).toBe(true)
  })

  // #2553 / #3740 — craft rule 9 : un organigramme IMPORTÉ et DATÉ se voit en démo,
  // avec son année dans la source et sa vérification à SA date (donc « à vérifier »).
  it('au moins une personne vient d’un organigramme importé daté de plus d’un an', () => {
    const imported = graphs
      .flatMap(g => g.people)
      .filter(p => p.sources.some(s => s.kind === 'org_chart' && s.ref === 'organigramme importé (2023)'))
    expect(imported.length).toBeGreaterThan(0)
    expect(imported[0]!.lastVerifiedAt).toBe('2023-06-01')
  })
})

/**
 * Plancher de personnes d'un graphe : huit — le format d'une vraie cartographie. EXEMPTION NOMMÉE (04/10/2026, démo
 * clients) : Kiabi, dont le classeur ne nomme que SIX décideurs et aucun manager (« 16 profils identifiés : échantillon
 * limité », garde-fou du brief) ; en exiger huit reviendrait à inventer deux personnes. Le plancher de Kiabi est ce que
 * son classeur porte, jamais moins.
 */
const MIN_GRAPH_PEOPLE_BY_COMPANY: Readonly<Record<string, number>> = { Kiabi: 6 }
// Les autres comptes minces (DEMO_BRIEF_THIN_COMPANIES : Naval Group, Chantiers de l'Atlantique) : plancher réduit à 1.
const minGraphPeople = (company: string): number =>
  MIN_GRAPH_PEOPLE_BY_COMPANY[company] ?? (DEMO_BRIEF_THIN_COMPANIES.includes(company) ? 1 : 8)
/** Même exemption pour les entités : le classeur Kiabi ne cite ni filiale ni enseigne, seule l'entité racine figure au graphe. */
const MIN_GRAPH_ENTITIES_BY_COMPANY: Readonly<Record<string, number>> = { Kiabi: 1 }
const minGraphEntities = (company: string): number =>
  MIN_GRAPH_ENTITIES_BY_COMPANY[company] ?? (DEMO_BRIEF_THIN_COMPANIES.includes(company) ? 1 : 3)

describe('graphes d’organisation de la démonstration', () => {
  for (const dossier of DEMO_DOSSIERS) {
    describe(dossier.account.company_name, () => {
      const org = (dossier.account.raw_analysis as { org?: { orgGraph?: unknown } }).org
      const graph = orgGraphSchema.parse(org?.orgGraph)
      const contactSlugs = new Set(dossier.contacts.map(c => orgPersonSlug(c.full_name)))
      // EXEMPTION NOMMÉE — Groupe BPCE (30/09/2026). Son graphe est DÉRIVÉ d'un
      // CSV : le relevé publie une fonction par personne, JAMAIS un lien
      // hiérarchique, un comité d'achat, une influence ni un chemin. Les écrire
      // serait inventer des faits sur des personnes réelles. Les quatre gardes
      // ci-dessous lisent ces liens ; le bloc « Groupe BPCE — graphe dérivé »
      // plus bas prouve à la place que le graphe n'en invente aucun.
      //
      // MÊME exemption, étendue le 01/10/2026 à ENGIE, TotalEnergies et Alstom :
      // leur graphe est dérivé d'un brief commercial (`briefOrgGraph`) — fonction,
      // département et colonne « manager » du classeur, rattachements NON vérifiés,
      // aucune influence ni chemin inventés. Le bloc « briefs commerciaux » plus bas
      // prouve ce que ces graphes portent.
      const itWithHierarchy =
        dossier.account.company_name === DEMO_BPCE_REAL_CONTACTS_COMPANY ||
        DEMO_BRIEF_DERIVED_GRAPH_COMPANIES.includes(dossier.account.company_name)
          ? it.skip
          : it

      // EXEMPTION NOMMÉE (04/10/2026, démo ESN Nantes) — Naval Group et Chantiers de l'Atlantique : le classeur nomme
      // 1 et 3 personnes (« compte vierge », « Indret peu couvert »). Plancher RÉDUIT, jamais supprimé.
      const thin = DEMO_BRIEF_THIN_COMPANIES.includes(dossier.account.company_name)

      it('porte un graphe d’organisation valide', () => {
        expect(graph.people.length).toBeGreaterThanOrEqual(minGraphPeople(dossier.account.company_name))
        expect(graph.entities.length).toBeGreaterThanOrEqual(minGraphEntities(dossier.account.company_name))
      })

      it('assez de contacts pour que la carte vaille le détour', () => {
        // Cinq cartes posées côte à côte ne montrent pas un compte, elles
        // montrent un écran. Le plancher est le format d'une vraie cartographie.
        expect(dossier.contacts.length).toBeGreaterThanOrEqual(thin ? 3 : 9)
      })

      it('chaque personne du graphe est un contact seedé (sinon son trait disparaît)', () => {
        // EXEMPTION NOMMÉE (#4509) : la personne que la démo laisse SANS fiche pour montrer « Créer sa fiche ».
        const withoutRecord = DEMO_ORG_PEOPLE_WITHOUT_RECORD[dossier.account.company_name] ?? []
        const orphans = graph.people
          .filter(person => !contactSlugs.has(person.id) && !withoutRecord.includes(person.fullName))
          .map(person => person.fullName)
        expect(orphans).toEqual([])
      })

      itWithHierarchy('dessine des liens sourcés ET des liens inférés', () => {
        // Un lien VÉRIFIÉ peut être un rattachement entre personnes OU une
        // appartenance à une entité : sur une société réelle, l'appartenance est
        // souvent la seule chose que le registre autorise à affirmer. Un
        // organigramme qui ne dessinerait que des pointillés se lirait « on ne
        // sait rien » alors qu'on sait précisément qui siège où.
        const verified = graph.hierarchyEdges.filter(edge => edge.verified)
        const reporting = graph.hierarchyEdges.filter(edge => edge.type === 'reports_to')
        const inferred = reporting.filter(edge => !edge.verified)
        expect(verified.length).toBeGreaterThanOrEqual(3)
        expect(inferred.length).toBeGreaterThanOrEqual(3)
        // Les deux extrémités d'un RATTACHEMENT doivent être des contacts
        // AFFICHÉS : un lien vers quelqu'un qu'on ne voit pas ne se dessine pas.
        for (const edge of reporting) {
          expect(contactSlugs.has(edge.fromId)).toBe(true)
          expect(contactSlugs.has(edge.toId)).toBe(true)
        }
      })

      it('ne fait jamais descendre un lien VÉRIFIÉ vers un siège sans personne', () => {
        // Le registre nomme des mandataires ; il ne dit pas qui rapporte à qui.
        // Affirmer un rattachement vers un rôle dont personne n'occupe le siège
        // serait exactement la donnée inventée que ce chantier s'interdit.
        const seatTitles = new Set(
          dossier.contacts.filter(c => c.full_name === c.title).map(c => orgPersonSlug(c.full_name)),
        )
        const wrong = graph.hierarchyEdges
          .filter(edge => edge.type === 'reports_to' && edge.verified)
          .filter(edge => seatTitles.has(edge.toId))
        expect(wrong).toEqual([])
      })

      itWithHierarchy('le comité d’achat et le chemin recommandé pointent des contacts réels', () => {
        expect(graph.buyingCommittee.length).toBeGreaterThanOrEqual(5)
        expect(graph.recommendedPath.length).toBeGreaterThanOrEqual(3)
        for (const seat of graph.buyingCommittee) expect(contactSlugs.has(seat.personId)).toBe(true)
        for (const step of graph.recommendedPath) expect(contactSlugs.has(step.personId)).toBe(true)
      })

      itWithHierarchy('les influences portent toutes leur raisonnement, opposition comprise', () => {
        expect(graph.influenceEdges.length).toBeGreaterThanOrEqual(5)
        for (const edge of graph.influenceEdges) expect(edge.reasoning.length).toBeGreaterThan(20)
      })

      /**
       * Ce que la VUE FOCALE lit — et pourquoi il faut le vérifier ici.
       *
       * Le lien de démonstration est bâti en TypeScript statique : ces graphes
       * ne passent PAS par l'assembleur IA. Un champ que le nouvel écran lit et
       * que le jeu de démonstration ne porte pas ne casse rien en CI — il
       * produit un écran vide devant un prospect, et ça ne se découvre qu'en
       * réunion.
       *
       * Les trois choses que l'écran lit et qui n'existaient nulle part dans ce
       * fichier de test : le NIVEAU hiérarchique (la géométrie de l'arbre), le
       * canal ACHATS (la colonne à part) et un BLOQUEUR (la carte atténuée).
       */
      itWithHierarchy('porte ce que la vue focale par direction lit', () => {
        // La hauteur des cartes vient de là. Sans niveau, l'arbre est vide.
        const levelled = graph.people.filter(person => person.hierarchyLevel)
        expect(levelled.length).toBe(graph.people.length)
        const levels = new Set(levelled.map(person => person.hierarchyLevel))
        // Au moins trois étages : un arbre à un seul niveau n'est pas un arbre.
        expect(levels.size).toBeGreaterThanOrEqual(3)

        // Chaque personne est rattachée à une entité RÉELLE du graphe : c'est ce
        // rattachement qui définit le périmètre d'une direction focale.
        const entityIds = new Set(graph.entities.map(entity => entity.id))
        const unattached = graph.people.filter(p => !p.entityId || !entityIds.has(p.entityId)).map(p => p.fullName)
        expect(unattached).toEqual([])

        // La colonne Achats — canal parallèle, hors de l'arbre (arbitrage A3).
        const procurement = graph.people.filter(
          person => person.hierarchyLevel === 'L5' || person.decisionRoles.includes('procurement'),
        )
        expect(procurement.length).toBeGreaterThanOrEqual(1)

        // Une direction par défaut existe : la première étape du chemin est
        // rattachée à une entité. Sans elle, l'écran s'ouvrirait au hasard.
        const first = [...graph.recommendedPath].sort((a, b) => a.step - b.step)[0]
        expect(first).toBeDefined()
        const firstPerson = graph.people.find(person => person.id === first?.personId)
        expect(firstPerson?.entityId).toBeTruthy()

        // Décision 5 : un bloqueur n'entre jamais dans le chemin recommandé.
        const blockers = new Set(graph.people.filter(p => p.decisionRoles.includes('blocker')).map(p => p.id))
        const inPath = graph.recommendedPath.filter(step => blockers.has(step.personId))
        expect(inPath).toEqual([])
      })

      it('ne porte AUCUN portrait — ce sont des personnes réelles', () => {
        // Le jeu portait des portraits illustrés de personnes inventées. Les
        // sociétés sont désormais réelles, et leurs mandataires aussi : dessiner
        // un visage pour eux fabriquerait une image de quelqu'un qui existe.
        // L'interface retombe sur le monogramme, comme pour tout contact sans
        // photo — c'est le comportement normal du produit.
        for (const contact of dossier.contacts) {
          expect(contact.photo_url).toBeNull()
        }
      })
    })
  }

  describe('Groupe BPCE — graphe dérivé du CSV, sans lien inventé (30/09/2026)', () => {
    const dossier = DEMO_DOSSIERS.find(d => d.account.company_name === DEMO_BPCE_REAL_CONTACTS_COMPANY)
    const org = (dossier?.account.raw_analysis as { org?: { orgGraph?: unknown } } | undefined)?.org
    const graph = orgGraphSchema.parse(org?.orgGraph)

    it('porte les 55 unités des blocs 02 et 03 et la racine, chacune citant sa ligne source', () => {
      expect(graph.entities).toHaveLength(56)
      const fromCsv = graph.entities.filter(entity => entity.id !== 'e-bpce')
      expect(fromCsv.every(entity => entity.sources.some(source => (source.ref ?? '').includes('BPCE-')))).toBe(true)
    })

    it('n’invente ni rattachement hiérarchique, ni influence, ni chemin', () => {
      expect(graph.hierarchyEdges).toEqual([])
      expect(graph.influenceEdges).toEqual([])
      expect(graph.recommendedPath).toEqual([])
    })

    it('le comité d’achat lit la gouvernance du relevé : six sièges, P1/P2 d’abord, rôle de la colonne role_decision', () => {
      const byId = new Map(graph.people.map(person => [person.id, person]))
      const seats = graph.buyingCommittee.map(seat => ({ person: byId.get(seat.personId), role: seat.role }))
      expect(seats).toHaveLength(6)
      expect(seats.every(seat => seat.person !== undefined)).toBe(true)
      expect(seats.every(seat => seat.role === 'influencer' || seat.role === 'champion')).toBe(true)
      expect(seats.filter(seat => seat.role === 'champion')).toHaveLength(2)
    })

    it('ne nomme que les personnes de la gouvernance du relevé', () => {
      const governance = dossier?.contacts.filter(c => c.tags?.includes('Gouvernance')) ?? []
      expect(graph.people).toHaveLength(governance.length)
      expect(governance.length).toBeGreaterThanOrEqual(48)
    })
  })

  it('refuse un graphe qui cite quelqu’un d’inconnu plutôt que de l’ignorer', () => {
    expect(() =>
      buildDemoOrgGraph({
        entities: [
          {
            id: 'e-x',
            name: 'X',
            type: 'groupe',
            parentId: null,
            confidence: 90,
            evidence: { kind: 'official_site', ref: 'https://x.example', grounding: 'A', date: '2026-01-01' },
          },
        ],
        people: [],
        edges: [],
        influences: [],
        committee: [],
        path: [{ name: 'Personne Inexistante', objective: 'o', channel: 'E-mail' }],
      }),
    ).toThrow(/Personne Inexistante/)
  })
})

describe('briefs commerciaux — graphe dérivé du classeur, sans lien inventé (01/10/2026)', () => {
  for (const company of DEMO_BRIEF_DERIVED_GRAPH_COMPANIES) {
    describe(company, () => {
      const dossier = DEMO_DOSSIERS.find(d => d.account.company_name === company)
      const org = (dossier?.account.raw_analysis as { org?: { orgGraph?: unknown } } | undefined)?.org
      const graph = orgGraphSchema.parse(org?.orgGraph)

      it('porte des personnes et un siège de décision lus du classeur', () => {
        expect(graph.people.length).toBeGreaterThanOrEqual(minGraphPeople(company))
        expect(graph.buyingCommittee.length).toBeGreaterThanOrEqual(1)
      })

      it('aucun rattachement n’est donné pour vérifié, et aucune influence ni chemin n’est inventé', () => {
        expect(graph.hierarchyEdges.filter(edge => edge.verified)).toEqual([])
        expect(graph.influenceEdges).toEqual([])
        expect(graph.recommendedPath).toEqual([])
      })

      it('une entité sortie du périmètre ne figure jamais au graphe', () => {
        const exited = (
          dossier?.account.raw_analysis as { commercial_brief?: { entities: { name: string; status: string }[] } }
        ).commercial_brief?.entities
          .filter(entity => entity.status === 'exited')
          .map(entity => entity.name.toLowerCase())
        const names = graph.entities.map(entity => entity.name.toLowerCase())
        for (const name of exited ?? []) expect(names).not.toContain(name)
      })
    })
  }
})

// #4061 — craft rule 9 : la carte d'influence montre un poste SANS personne (GapCard) en démo.
// La web (`buildOrgInfluenceMap`) ne pose une zone blanche que sous une entité NOMMÉE du graphe :
// une zone sans entité, ou sous une entité inconnue, disparaîtrait sans bruit de l'écran.
describe('postes sans personne sur l’organigramme de démonstration (#4061)', () => {
  const { societeGeneraleOrgGraph, sncfOrgGraph } =
    jest.requireActual<typeof import('./demo-org-graphs')>('./demo-org-graphs')
  for (const [name, graph] of [
    ['Société Générale', societeGeneraleOrgGraph],
    ['SNCF', sncfOrgGraph],
  ] as const) {
    it(`${name} : au moins une zone blanche rattachée à une entité réelle, avec des intitulés de poste`, () => {
      const parsed = orgGraphSchema.parse(graph)
      const entityIds = new Set(parsed.entities.map(e => e.id))
      const placed = parsed.uncoveredZones.filter(z => z.entityId && entityIds.has(z.entityId))
      expect(placed.length).toBeGreaterThanOrEqual(1)
      for (const zone of placed) {
        expect(zone.suggestedTitles.length).toBeGreaterThan(0)
      }
    })
  }
})
