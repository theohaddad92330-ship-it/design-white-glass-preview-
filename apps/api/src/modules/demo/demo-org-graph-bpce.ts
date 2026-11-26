import { BPCE_ORG_GRAPH_ROOT_ID, mapBpceOrgGraphEntities } from './bpce-csv-complement'
import { BPCE_SEED } from './bpce-seed'
import { buildDemoOrgGraph } from './demo-org-graph'

/**
 * Le graphe du compte « Groupe BPCE » (30/09/2026), lu du CSV importé.
 *
 * Dans son propre fichier plutôt qu'à la suite des six autres (`demo-org-graphs.ts`) :
 * ceux-là sont écrits à la main, celui-ci est DÉRIVÉ d'un CSV — deux natures
 * qui ne se relisent pas de la même façon.
 *
 * - les 55 unités des blocs 02 et 03 (`extraEntities`), chacune citant sa ligne ;
 * - les personnes de la gouvernance (bloc 04), RATTACHÉES À LA RACINE seulement :
 *   le relevé publie une fonction par personne, jamais un lien hiérarchique — en
 *   déduire un serait de la donnée inventée. Donc aucune arête ni chemin :
 *   « non établi » n'est pas « vide » (aucune donnée inventée au-delà du CSV).
 * - le comité d'achat (#3282) : les six personnes de gouvernance les plus
 *   prioritaires du relevé (colonne `priorite`), chacune dans le rôle que le
 *   relevé lui donne (colonne `role_decision` : prescripteur → `influencer`,
 *   relais produit/livraison → `champion`), avec l'implication du relevé pour
 *   raison — un siège lu, jamais un organigramme deviné.
 */
const BPCE_GOVERNANCE = BPCE_SEED.contacts.filter(contact => contact.tags.includes('Gouvernance'))

const BPCE_COMMITTEE_SIZE = 6

const BPCE_IMPORT = { kind: 'workspace_import' as const, grounding: 'B' as const, date: '2026-09-30' }

export const bpceOrgGraph = buildDemoOrgGraph({
  extraEntities: mapBpceOrgGraphEntities(),
  entities: [
    {
      id: BPCE_ORG_GRAPH_ROOT_ID,
      name: 'Groupe BPCE',
      type: 'groupe',
      parentId: null,
      confidence: 90,
      evidence: { ...BPCE_IMPORT, ref: 'Relevé du compte importé le 30/09/2026 (bpce-compte-complet.csv)' },
    },
  ],
  people: BPCE_GOVERNANCE.map(contact => ({
    name: contact.full_name,
    title: contact.title,
    entityId: BPCE_ORG_GRAPH_ROOT_ID,
    family: contact.family,
    level: contact.seniority === 'c_suite' ? ('L1' as const) : ('L2' as const),
    roles: [contact.decision_role === 'champion' ? ('champion' as const) : ('influencer' as const)],
    confidence: 60,
    evidence: { ...BPCE_IMPORT, ref: `Relevé du compte importé le 30/09/2026 — ${contact.csvIds.join(', ')}` },
  })),
  edges: [],
  influences: [],
  committee: [...BPCE_GOVERNANCE]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, BPCE_COMMITTEE_SIZE)
    .map(contact => ({
      name: contact.full_name,
      role: contact.decision_role === 'champion' ? ('champion' as const) : ('influencer' as const),
      reason: contact.why_contact,
      accessScore: contact.contact_score,
    })),
  path: [],
})
