import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORG_REPORTING_INFLUENCE_TOPIC, orgGraphSchema, type OrgGraph, type SessionUser } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { SessionContext } from '@/features/auth/session-context'
import {
  buildFocalOrgView,
  defaultFocalDirectionId,
} from '@/features/accounts/view/account-detail/tabs/organigramme/focalOrgData'
import { FocalOrgView } from '@/features/accounts/view/account-detail/tabs/organigramme/FocalOrgView'

/**
 * GA-126 — « VÉRIFIER CE LIEN » A UN SUJET, PAS SEULEMENT UN MONTAGE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU QU'ELLE COMBLE, ET QUI ÉTAIT ÉCRIT
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-103 tient le montage du bouton et sa chaîne d'appel jusqu'au service IA.
 * Son propre docbloc dit ce qu'elle ne prouve pas : « Elle prouve que le bouton
 * est MONTÉ […]. Elle ne prouve PAS qu'il a un SUJET. » Et c'est très exactement
 * ce qui était faux : depuis le correctif P0 du 29/08, l'assembleur ne produit
 * plus AUCUNE `hierarchyEdge` de type `reports_to`, si bien que la condition de
 * rendu de la vue focale — `person.reporting && !person.reporting.verified` —
 * n'était jamais vraie sur un dossier réel. Un bouton monté sur un tableau vide
 * est un bouton mort, et GA-103 restait verte.
 *
 * Une garde qui constate un montage aurait été la huitième garde borgne de la
 * semaine. Celle-ci part donc de la SORTIE RÉELLE de l'assembleur — figée ici
 * telle qu'elle a été mesurée le 30/08 en exécutant
 * `assemble_org_graph` — et va jusqu'au read-model que l'écran consomme.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT, ET POURQUOI CE CORPUS-LÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le graphe ci-dessous n'est pas une maquette commode : c'est la FORME que
 * l'assembleur émet aujourd'hui — que des `member_of` du côté hiérarchique,
 * chaque `reportingTo` rangé en influence sous le topic
 * `rattachement hiérarchique`, confiance ≤ 49. Si un jour le pipeline se remet à
 * produire des `reports_to`, cette garde reste vraie (la carte préfère la ligne
 * hiérarchique) — elle ne fige pas le défaut, elle fige le PIRE cas.
 *
 * ⚠️ Le topic est une jointure PAR CHAÎNE entre deux services : le Python
 * l'écrit, le TypeScript le lit. Le dernier `it` compare les deux fichiers —
 * sans quoi un renommage côté IA reviderait le bouton en silence, exactement
 * comme le correctif P0 l'a fait.
 */

const IA_ASSEMBLER = join(__dirname, '..', '..', '..', 'ia', 'app', 'services', 'org_graph_assembler.py')

const APOLLO = {
  id: 's-p-marie-martin',
  kind: 'linkedin' as const,
  grounding: 'B' as const,
  claim: 'identity' as const,
}

/**
 * La sortie de `assemble_org_graph` sur quatre contacts dont trois portent un
 * `reportingTo`, réduite à ce que l'écran lit. Mesuré, pas imaginé :
 *
 *     hierarchyEdges par type ........ { member_of: 4 }
 *     hierarchyEdges reports_to ...... 0
 *     influenceEdges par topic ....... { « rattachement hiérarchique »: 3 }
 */
function assembledGraph(): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 1,
    entities: [
      { id: 'e-tf1', name: 'TF1 Groupe', type: 'groupe', parentId: null, confidence: 90, sources: [] },
      {
        id: 'e-dsi',
        name: 'Direction des systèmes d’information',
        type: 'bu',
        parentId: 'e-tf1',
        confidence: 60,
        sources: [],
      },
    ],
    people: [
      {
        id: 'p-jean-dupont',
        fullName: 'Jean Dupont',
        title: 'DSI',
        entityId: 'e-dsi',
        hierarchyLevel: 'L1',
        decisionRoles: ['technical_buyer'],
        identityStatus: 'classified',
        confidence: 60,
        sources: [APOLLO],
      },
      {
        id: 'p-marie-martin',
        fullName: 'Marie Martin',
        title: 'Responsable Data',
        entityId: 'e-dsi',
        hierarchyLevel: 'L2',
        decisionRoles: ['champion'],
        identityStatus: 'classified',
        confidence: 55,
        sources: [APOLLO],
      },
      {
        id: 'p-paul-durand',
        fullName: 'Paul Durand',
        title: 'Architecte SI',
        entityId: 'e-dsi',
        hierarchyLevel: 'L2',
        decisionRoles: [],
        identityStatus: 'classified',
        confidence: 50,
        sources: [APOLLO],
      },
    ],
    // ── Ce que l'assembleur produit VRAIMENT du côté hiérarchique : des
    //    `member_of`, dont la cible est une ENTITÉ. Aucun `reports_to`.
    hierarchyEdges: [
      {
        fromId: 'p-jean-dupont',
        toId: 'e-dsi',
        type: 'member_of',
        sourceIds: [APOLLO.id],
        confidence: 60,
        verified: false,
      },
      {
        fromId: 'p-marie-martin',
        toId: 'e-dsi',
        type: 'member_of',
        sourceIds: [APOLLO.id],
        confidence: 55,
        verified: false,
      },
      {
        fromId: 'p-paul-durand',
        toId: 'e-dsi',
        type: 'member_of',
        sourceIds: [APOLLO.id],
        confidence: 50,
        verified: false,
      },
    ],
    // ── Et voilà où sont passés les rattachements : en influence, plafonnés.
    influenceEdges: [
      {
        fromId: 'p-marie-martin',
        toId: 'p-jean-dupont',
        topic: ORG_REPORTING_INFLUENCE_TOPIC,
        stance: 'unknown',
        confidence: 15,
        reasoning:
          'N+1 supposé par le modèle à partir du poste (champ « reportingTo », formulé « probablement ») — aucune source n’a observé ce rattachement.',
      },
      {
        fromId: 'p-paul-durand',
        toId: 'p-jean-dupont',
        topic: ORG_REPORTING_INFLUENCE_TOPIC,
        stance: 'unknown',
        confidence: 15,
        reasoning:
          'N+1 supposé par le modèle à partir du poste (champ « reportingTo », formulé « probablement ») — aucune source n’a observé ce rattachement.',
      },
      // Un sujet MÉTIER : il n'est pas un rattachement, il ne doit donner
      // aucun sujet au bouton. Sans lui, la garde ne verrait pas la différence
      // entre « filtre le topic » et « prend tout ce qui traîne en influence ».
      {
        fromId: 'p-paul-durand',
        toId: 'p-jean-dupont',
        topic: 'Choix des partenaires techniques',
        stance: 'supporter',
        confidence: 55,
        reasoning: 'Un architecte pèse sur le choix d’un partenaire durable.',
      },
    ],
  })
}

describe('GA-126 — « vérifier ce lien » a un SUJET sur des données réalistes', () => {
  it('LIT quelque chose — le corpus n’est ni vide ni dégénéré', () => {
    // Sans ces trois assertions, un graphe accidentellement vidé rendrait toute
    // la garde verte sur rien : le faux zéro silencieux.
    const graph = assembledGraph()
    expect(graph.people.length).toBeGreaterThanOrEqual(3)
    expect(graph.influenceEdges.length).toBeGreaterThanOrEqual(3)
    // Le fait mesuré qui a créé le défaut, écrit noir sur blanc.
    expect(graph.hierarchyEdges.filter(edge => edge.type === 'reports_to')).toHaveLength(0)
  })

  it('la vue FOCALE rend des cartes, et elles ont un rattachement à vérifier', () => {
    const graph = assembledGraph()
    const view = buildFocalOrgView(graph, defaultFocalDirectionId(graph))
    expect(view).not.toBeNull()
    const cards = view!.contacts
    expect(cards.length).toBeGreaterThan(0)

    // ⚠️ LE COMPTEUR DÉCISIF. Il valait 0, et c'est ce 0 qui a rendu le bouton
    // invisible. La condition de rendu de la carte est mot pour mot celle de
    // `FocalOrgView` : `person.reporting && !person.reporting.verified`.
    const withSubject = cards.filter(card => card.reporting && !card.reporting.verified)
    expect(withSubject.length).toBeGreaterThan(0)

    // Et le sujet est utilisable : deux PERSONNES nommées, jamais une entité —
    // sinon l'API répond 412 et le clic ne peut que échouer.
    const personIds = new Set(graph.people.map(person => person.id))
    for (const card of withSubject) {
      expect(personIds.has(card.id)).toBe(true)
      expect(personIds.has(card.reporting!.managerId)).toBe(true)
      expect(card.reporting!.managerName.length).toBeGreaterThan(0)
    }
  })

  it('un sujet MÉTIER ne devient pas un rattachement à vérifier', () => {
    const graph = assembledGraph()
    const view = buildFocalOrgView(graph, defaultFocalDirectionId(graph))
    const cards = view!.contacts
    // « Choix des partenaires techniques » relie les deux mêmes personnes que
    // l'hypothèse de Paul Durand. Si le filtre du topic sautait, Jean Dupont —
    // qui ne rapporte à personne — hériterait d'un N+1.
    expect(cards.find(card => card.id === 'p-jean-dupont')!.reporting).toBeNull()
  })

  it('une HYPOTHÈSE se dit hypothèse — jamais un score nu, jamais une probabilité', () => {
    const graph = assembledGraph()
    const view = buildFocalOrgView(graph, defaultFocalDirectionId(graph))
    const cards = view!.contacts
    const marie = cards.find(card => card.id === 'p-marie-martin')!
    expect(marie.reporting?.origin).toBe('hypothesis')
    // Le graphe porte 15/100 sur cette influence. Un score sans axes n'est pas un
    // score (« sous 3 axes, il n'y a pas de score ») et un pourcentage de
    // rattachement se lirait comme une chance. La carte ne le reçoit donc pas.
    expect(marie.reporting?.confidence).toBeNull()
    // Une ligne hiérarchique inférée, elle, garde son chiffre : il est calculé
    // sur des facteurs nommés. Les deux cas ne se confondent pas.
    expect(marie.reporting?.verified).toBe(false)
  })

  it('et le bouton se REND à l’écran — le read-model ne suffit pas à le prouver', () => {
    // Un read-model juste que le JSX ne lit pas est le motif n°1 du dépôt :
    // « du code juste, calculé, testé, que personne n'appelle ». On rend donc
    // l'écran d'arrivée pour de vrai, et on cherche le libellé du bouton.
    const graph = assembledGraph()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    // #2837 — FocalOrgView lit désormais `useAccountMarketContext` (la ligne
    // mémoire marché), qui lit `useSession` : un vrai `SessionContext`, pas un
    // mock, garde l'esprit de cette garde (« l'écran pour de vrai »).
    const { container } = render(
      createElement(
        SessionContext.Provider,
        { value: { user: { id: 'u-1' } as SessionUser, loading: false } },
        createElement(
          QueryClientProvider,
          { client },
          createElement(FocalOrgView, { accountId: 'a1', graph, discovered: graph.people.length }),
        ),
      ),
    )
    expect(container.textContent).toContain(i18n.t('accountOrg:orgGraph.verifyRelation'))
    // Et il dit que c'est une SUPPOSITION, sans jamais écrire de chiffre à côté
    // du nom du N+1 : ni score nu, ni chance.
    expect(container.textContent).toContain(i18n.t('accountOrg:focal.reportsToAssumed', { name: 'Jean Dupont' }))
    expect(container.textContent).not.toContain(
      i18n.t('accountOrg:focal.reportsToProbable', { name: 'Jean Dupont', confidence: 15 }),
    )
  })

  it('le TOPIC est le même des deux côtés du fil — TypeScript et Python', () => {
    // Une jointure par chaîne entre deux services ne rougit jamais toute seule.
    const python = readFileSync(IA_ASSEMBLER, 'utf8')
    expect(python.length).toBeGreaterThan(1000)
    const match = python.match(/"reports_to"\s*:\s*"([^"]+)"/)
    expect(match, '_RELATION_TOPIC["reports_to"] introuvable dans l’assembleur').not.toBeNull()
    expect(match![1]).toBe(ORG_REPORTING_INFLUENCE_TOPIC)
  })
})
