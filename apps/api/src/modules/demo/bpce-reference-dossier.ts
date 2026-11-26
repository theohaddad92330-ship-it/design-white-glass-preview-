import type { ReferenceDossier } from '@bellum/contracts'
import type { CompteCsvRow } from './compte-csv-parser'

/**
 * Théo A comptes-fiche-reference — le DOSSIER DE RÉFÉRENCE BPCE, lu dans le relevé.
 *
 * Chaque champ vient d'une ligne du CSV (`data/bpce-compte-complet.csv`) ; ce que le relevé
 * ne dit pas reste `null`. Les chiffres (55 unités, 18 besoins, 16 TJM, 49 contacts) sont
 * COMPTÉS ici, jamais écrits en dur. Aucune moyenne de TJM entre direct et intermédiaire.
 */

type Rows = readonly CompteCsvRow[]

const BLOC = {
  structure: '02_STRUCTURE_GROUPE',
  banques: '03_BANQUES_COOPERATIVES',
  gouvernance: '04_GOUVERNANCE',
  achats: '06_CHAINE_ACHATS',
  referencement: '06B_REFERENCEMENT_DETAIL',
  prestataires: '07_PRESTATAIRES_EN_PLACE',
  routes: '07B_ROUTES_ET_INTERMEDIAIRES',
  besoins: '08_BESOINS_OBSERVES',
  projection: '12B_PROJECTION_2027',
  programmes: '13_PROGRAMMES',
  anciens: '11_PROFILS_AYANT_EXERCE_CHEZ_LE_COMPTE',
} as const

/** Les deux programmes du bloc 13 qui complètent les sept projections datées du bloc 12B. */
const UNDATED_PROGRAMME_IDS = ['BPCE-0900', 'BPCE-0899'] as const

const ORGANISATION_GROUPS = [
  { label: 'Domaines & fonctions', kinds: ['Domaine fonctionnel SI', 'Capacité de service SI'] },
  { label: 'Groupements & coentreprises', kinds: ['Groupement', 'Coentreprise'] },
  { label: 'Entités & filiales', kinds: ['Segment de reporting', 'Pôle fonctionnel', 'Réseau coopératif'] },
] as const

const COOPERATIVE_GROUP = 'Réseaux coopératifs'
const NOT_FILLED = 'Domaine non renseigné'

function inBloc(rows: Rows, bloc: string): CompteCsvRow[] {
  return rows.filter(row => row['bloc'] === bloc)
}

const byId = (a: CompteCsvRow, b: CompteCsvRow): number => (a['id'] ?? '').localeCompare(b['id'] ?? '')

/** « 630 € / jour » → 630 ; « 800 à 850 € par jour » n'est PAS un relevé unitaire (bloc 08B, ignoré ici). */
function dailyRate(row: CompteCsvRow): number | null {
  const match = /^\s*(\d[\d\s]*)\s*€/.exec(row['prix_observe'] ?? '')
  if (!match) return null
  const value = Number((match[1] ?? '').replace(/\s/g, ''))
  return Number.isFinite(value) && value > 0 ? value : null
}

function circuitOf(row: CompteCsvRow): 'msp' | 'direct' | null {
  const channel = row['canal'] ?? ''
  // « Sourcing direct — aucun intermédiaire » contient « intermédiaire » : le direct se teste d'abord.
  if (/direct/i.test(channel)) return 'direct'
  if (/MSP|interm/i.test(channel)) return 'msp'
  return null
}

function tjmByCircuit(needs: CompteCsvRow[]): ReferenceDossier['tjm'] {
  const out: ReferenceDossier['tjm'] = []
  for (const channel of ['msp', 'direct'] as const) {
    const rates = needs
      .filter(row => circuitOf(row) === channel)
      .map(dailyRate)
      .filter((rate): rate is number => rate !== null)
    if (rates.length > 0) {
      out.push({ channel, observations: rates.length, min: Math.min(...rates), max: Math.max(...rates) })
    }
  }
  return out
}

function organisation(rows: Rows): ReferenceDossier['organisation'] {
  const structure = inBloc(rows, BLOC.structure).sort(byId)
  const groups = ORGANISATION_GROUPS.map(group => ({
    label: group.label as string,
    units: structure
      .filter(row => (group.kinds as readonly string[]).includes(row['niveau'] ?? ''))
      .map(row => ({ kind: row['niveau'] ?? group.label, name: row['objet'] ?? '', note: row['constat'] ?? null })),
  }))
  const cooperative = inBloc(rows, BLOC.banques)
    .sort(byId)
    .map(row => ({ kind: 'Unité du relevé', name: row['objet'] ?? '', note: row['constat'] ?? null }))
  return [...groups, { label: COOPERATIVE_GROUP, units: cooperative }].filter(group => group.units.length > 0)
}

function expertises(needs: CompteCsvRow[]): ReferenceDossier['expertises'] {
  const counts = new Map<string, number>()
  for (const row of needs) {
    const label = row['famille_metier'] ?? NOT_FILLED
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'))
}

function programmes(rows: Rows, statementDate: string): ReferenceDossier['programmes'] {
  const source = `Relevé du ${statementDate}`
  const dated = inBloc(rows, BLOC.projection).sort(
    (a, b) => (a['horizon'] ?? '').localeCompare(b['horizon'] ?? '') || byId(a, b),
  )
  const undated = inBloc(rows, BLOC.programmes).filter(row =>
    (UNDATED_PROGRAMME_IDS as readonly string[]).includes(row['id'] ?? ''),
  )
  return [...dated, ...undated].map(row => ({
    period: row['horizon'] ?? null,
    statement_label: source,
    title: row['objet'] ?? '',
    summary: row['constat'] ?? null,
    reading: row['interpretation'] ?? null,
    angle: row['implication'] ?? null,
  }))
}

function ecosystem(rows: Rows): ReferenceDossier['ecosystem'] {
  const observed = [...inBloc(rows, BLOC.prestataires).sort(byId), ...inBloc(rows, BLOC.routes).sort(byId)].map(
    row => ({
      name: row['objet'] ?? '',
      perimeter: row['niveau'] ?? null,
      nature: 'observed' as const,
      observation: row['constat'] ?? null,
      reserve: row['interpretation'] ?? null,
    }),
  )

  // Les employeurs actuels d'anciens du compte : un SIGNAL INDIRECT, une seule ligne, jamais un panel.
  const employers = new Map<string, number>()
  for (const row of inBloc(rows, BLOC.anciens)) {
    const employer = row['entite']
    if (employer) employers.set(employer, (employers.get(employer) ?? 0) + 1)
  }
  const top = [...employers.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).slice(0, 8)
  const indirect =
    top.length > 0
      ? [
          {
            name: top.map(([employer]) => employer).join(', '),
            perimeter: null,
            nature: 'indirect' as const,
            observation: `Employeurs actuels de ${[...employers.values()].reduce((a, b) => a + b, 0)} personnes qui ont exercé chez le compte.`,
            reserve: 'Une connaissance du compte, pas un accès : ni panel, ni accord de sous-traitance.',
          },
        ]
      : []
  return [...observed, ...indirect]
}

export function buildReferenceDossier(rows: Rows, options: { statementDate: string }): ReferenceDossier {
  const needs = inBloc(rows, BLOC.besoins)
  const orderedNeeds = [...needs].sort((a, b) => (b['periode'] ?? '').localeCompare(a['periode'] ?? '') || byId(a, b))
  const tjmRows = needs.filter(row => dailyRate(row) !== null)
  return {
    counts: {
      units: inBloc(rows, BLOC.structure).length + inBloc(rows, BLOC.banques).length,
      historical_needs: needs.length,
      tjm_observations: tjmRows.length,
      contacts: inBloc(rows, BLOC.gouvernance).length,
    },
    programmes: programmes(rows, options.statementDate),
    purchasing: [...inBloc(rows, BLOC.achats).sort(byId), ...inBloc(rows, BLOC.referencement).sort(byId)].map(row => ({
      title: row['objet'] ?? '',
      note: row['constat'] ?? null,
      reliability: row['fiabilite'] ?? null,
    })),
    organisation: organisation(rows),
    expertises: expertises(needs),
    tjm: tjmByCircuit(needs),
    needs: orderedNeeds.map(row => ({
      title: row['objet'] ?? '',
      entity: row['entite'] ?? null,
      period: row['periode'] ?? null,
      rate: dailyRate(row),
    })),
    ecosystem: ecosystem(rows),
  }
}
