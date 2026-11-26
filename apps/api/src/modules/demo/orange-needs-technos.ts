import type { CommercialBrief } from '@bellum/contracts'
import { ORANGE_CONSULTANTS_CSV } from './data/orange-consultants.generated'
import { parseCompteCsvRows } from './compte-csv-parser'
import { ORANGE_COLLECTED_JOBS } from './orange-jobs-collected-13-10'

/**
 * 14/10/2026 (Louis, 13/10 : « Orange au niveau de remplissage de Groupe BPCE ») — les rubriques BESOINS et TECHNOS du brief
 * d'Orange, lues de matière RÉELLE déjà au dépôt, jamais inventées :
 *  - BESOINS : un besoin par OFFRE D'EMPLOI RÉELLE collectée (`orange-jobs-collected-13-10.ts`) — titre, entité et date de
 *    publication de la source, lien vers l'offre. Rien n'est ajouté que la source ne dise : ville et contrat absents ⇒ aucune
 *    mention (« on n'affiche pas ce qu'on n'a pas »). Ce sont des besoins OBSERVÉS dans des offres, pas des missions : aucune
 *    mission terminée n'est ajoutée ici (les deux du dossier, sans date, restent dans « BESOINS EN BASE »).
 *  - TECHNOS : les technologies CITÉES dans le titre d'une offre réelle (besoin exprimé) ou dans le titre d'un profil du relevé
 *    du compte (`orange-consultants.csv`, Drive « DÉMO CLIENTS »). Une techno sans aucune occurrence n'a pas de ligne : pas de
 *    pile devinée. Le relevé compte les profils OBSERVÉS (export 2024), pas des profils « en poste » confirmés.
 */

type Section = CommercialBrief['sections'][number]
type Row = Section['rows'][number]

const KEYWORDS: readonly [label: string, pattern: string][] = [
  ['Java', 'java'],
  ['Angular', 'angular'],
  ['React', 'react'],
  ['.NET', '\\.net'],
  ['PHP', 'php'],
  ['Python', 'python'],
  ['Full Stack', 'full stack'],
  ['Data / BI', 'data|bi'],
  ['Power BI', 'power bi'],
  ['Talend / ETL', 'talend|etl'],
  ['IA / Machine learning', 'ia|machine learning'],
  ['Cloud', 'cloud'],
  ['AWS', 'aws'],
  ['Azure / Microsoft', 'azure|microsoft'],
  ['Kubernetes', 'kubernetes'],
  ['Virtualisation', 'virtualisation'],
  ['DevOps / Platform Engineering', 'devops|platform engineer'],
  ['SRE', 'sre'],
  ['Cybersécurité / SOC', 'cyber|cybersécurité|soc|sécurité'],
  ['SAP / ERP', 'sap|erp'],
  ['Salesforce', 'salesforce'],
  ['Oracle', 'oracle'],
  ['iOS', 'ios'],
  ['Android', 'android'],
  ['Tests / QA', 'qa|test'],
  ['Télécoms / réseau', 'telecom|réseau'],
]

const MATCHERS = KEYWORDS.map(
  ([label, pattern]) => [label, new RegExp(`(?<![\\p{L}\\d])(?:${pattern})(?![\\p{L}\\d])`, 'iu')] as const,
)

const techsOf = (title: string): string[] =>
  MATCHERS.filter(([, matcher]) => matcher.test(title)).map(([label]) => label)

/** Offres RÉELLES retenues (jamais un stage : écarté à la collecte). */
const OFFERS = ORANGE_COLLECTED_JOBS.offers

/** Les titres des profils du relevé (une ligne = une personne observée, export 2024). */
const PROFILE_TITLES: readonly string[] = parseCompteCsvRows(ORANGE_CONSULTANTS_CSV)
  .map(row => row.title ?? '')
  .filter(title => title.length > 0)

function domainOf(title: string): string {
  if (/cyber|soc\b|sécurité/i.test(title)) return 'Cybersécurité'
  if (/chef de projet/i.test(title)) return 'Pilotage de projet'
  if (/data|\bbi\b/i.test(title)) return 'Data et IA'
  if (/développeur|full stack|\bback\b|\bfront\b/i.test(title)) return 'Développement logiciel'
  return 'Infrastructure, cloud et exploitation'
}

const monthOf = (isoDate: string): string => isoDate.slice(0, 7)

const columns = (...entries: [string, string][]): Section['columns'] => entries.map(([key, label]) => ({ key, label }))

/** Section BESOINS : un besoin observé par offre réelle, aucune cellule vide (le lieu, le contrat, les technos vont dans la lecture). */
export function orangeNeedsSection(): Section | null {
  if (OFFERS.length === 0) return null
  return {
    key: 'besoins-recents',
    title: 'BESOINS',
    columns: columns(
      ['besoin', 'BESOIN'],
      ['entity', 'ENTITÉ'],
      ['periode', 'PÉRIODE'],
      ['canal', 'CANAL'],
      ['domaine', 'DOMAINE'],
      ['lecture', 'LECTURE'],
      ['url', 'LIEN'],
    ),
    rows: OFFERS.map((offer): Row => {
      const techs = techsOf(offer.title)
      return {
        besoin: offer.title,
        entity: offer.entity,
        periode: monthOf(offer.published_at),
        canal: 'Offre d’emploi publiée (source publique)',
        domaine: domainOf(offer.title),
        lecture: [
          'Poste ouvert = compétence non couverte : proposer un profil en renfort au manager concerné.',
          offer.city ? `Lieu : ${offer.city}.` : null,
          offer.contract ? `Contrat : ${offer.contract}.` : null,
          techs.length > 0 ? `Technologies citées : ${techs.join(', ')}.` : null,
        ]
          .filter(Boolean)
          .join(' '),
        url: offer.url,
      }
    }),
  }
}

type TechLine = { label: string; needs: number; profiles: number; entities: string[] }

export function orangeTechLines(): TechLine[] {
  return MATCHERS.flatMap(([label, matcher]): TechLine[] => {
    const offers = OFFERS.filter(offer => matcher.test(offer.title))
    const profiles = PROFILE_TITLES.filter(title => matcher.test(title)).length
    if (offers.length === 0 && profiles === 0) return []
    return [{ label, needs: offers.length, profiles, entities: [...new Set(offers.map(offer => offer.entity))] }]
  })
}

/** Section TECHNOS (même format que Groupe BPCE) : seules les technologies citées par une source ont une ligne. */
export function orangeTechnosSection(): Section | null {
  const lines = orangeTechLines()
  if (lines.length === 0) return null
  const rows = lines
    .map((line): { score: number; row: Row } => {
      const score = line.needs * 10 + Math.min(line.profiles, 9)
      const signals = [
        line.needs > 0 ? `${line.needs} besoin(s) exprimé(s)` : null,
        line.profiles > 0 ? `${line.profiles} profil(s) observé(s) au relevé` : null,
      ]
        .filter(Boolean)
        .join(' · ')
      return {
        score,
        row: {
          competence_techno: line.label,
          score,
          verdict: line.needs > 0 ? 'À VENDRE EN PRIORITÉ' : 'À QUALIFIER',
          signaux: signals,
          ou_la_vendre:
            line.entities.length > 0 ? line.entities.join(', ') : 'Entité à qualifier avec le contact du besoin',
          pourquoi:
            line.needs > 0
              ? `Citée dans ${line.needs} offre(s) d’emploi publiée(s) par le groupe : besoin exprimé, donc prouvé.${line.profiles > 0 ? ` Présente aussi chez ${line.profiles} profil(s) observé(s) au relevé.` : ''}`
              : `Présente chez ${line.profiles} profil(s) observé(s) au relevé du compte ; aucun besoin exprimé trouvé : à qualifier avant de la proposer.`,
        },
      }
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.row)
  return {
    key: 'technos-a-vendre',
    title: 'TECHNOS',
    columns: columns(
      ['competence_techno', 'COMPÉTENCE / TECHNO'],
      ['score', 'SCORE'],
      ['verdict', 'VERDICT'],
      ['signaux', 'SIGNAUX'],
      ['ou_la_vendre', 'OÙ LA VENDRE'],
      ['pourquoi', 'POURQUOI'],
    ),
    rows,
  }
}

/** Nombre de besoins observés dans les offres (la rubrique « Ce que je sais » l'énonce). */
export const ORANGE_OBSERVED_NEEDS_COUNT = OFFERS.length
