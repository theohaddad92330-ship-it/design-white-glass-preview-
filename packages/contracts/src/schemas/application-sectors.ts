import { z } from 'zod'

/**
 * Les SECTEURS D'APPLICATION — le marché dans lequel une prestation est
 * délivrée, normalisé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SECONDE LISTE ALORS QUE `target_sectors` EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `target_sectors` (onboarding) est une liste de LIBELLÉS français libres, avec
 * « Autre » ouvert, stockée telle quelle. Elle répond très bien à « dis-moi qui
 * tu cibles » et ne peut répondre à AUCUNE autre question : rien ne rapproche
 * « Industrie manufacturière & Automobile » d'un consultant dont l'expérience
 * dit « automobile », ni d'un projet dont le secteur dit « ferroviaire ».
 *
 * Elle AGRÈGE en plus ce que l'ingénierie sépare : automobile et équipements
 * industriels sont un seul choix, aéronautique et défense aussi — or ce sont
 * des marchés aux cycles, aux habilitations et aux acheteurs différents.
 *
 * Cette liste-ci est donc la version CODÉE, plus fine, partagée entre le
 * portefeuille du vendeur, le secteur d'un projet, celui d'une mission et
 * l'expérience d'un consultant : c'est ce qui permet de dire « ce profil a déjà
 * travaillé dans le secteur de cette mission » sans comparer deux phrases.
 *
 * Le libellé libre n'est pas supprimé pour autant (rien ne disparaît, GA-08) —
 * exactement le motif `offer_domain` → `offer_domains`.
 *
 * ⚠️ Générale par construction, et pas un référentiel « industrie ». Coder ici
 * les seuls secteurs d'un client serait le « ne pas coder en dur les cibles
 * d'un vendeur dans le pack global » que l'addendum interdit.
 */
export const APPLICATION_SECTOR_GROUPS = [
  'industrie',
  'energie',
  'process',
  'construction',
  'transport',
  'finance',
  'sante',
  'commerce',
  'tech',
  'public',
] as const
export type ApplicationSectorGroup = (typeof APPLICATION_SECTOR_GROUPS)[number]

export interface ApplicationSector {
  code: string
  group: ApplicationSectorGroup
  labelFr: string
  labelEn: string
}

/**
 * ⚠️ ADDITIF UNIQUEMENT — un code voyage vers la base (portefeuille, projet,
 * mission, consultant). En retirer un rendrait illisibles des lignes déjà
 * écrites (GA-08).
 */
export const APPLICATION_SECTORS: readonly ApplicationSector[] = [
  // ── Industrie et fabrication ────────────────────────────────────────────
  { code: 'automotive', group: 'industrie', labelFr: 'Automobile', labelEn: 'Automotive' },
  { code: 'aerospace', group: 'industrie', labelFr: 'Aéronautique & spatial', labelEn: 'Aerospace & space' },
  { code: 'defense', group: 'industrie', labelFr: 'Défense', labelEn: 'Defence' },
  { code: 'naval', group: 'industrie', labelFr: 'Naval & maritime', labelEn: 'Naval & maritime' },
  {
    code: 'industrial_equipment',
    group: 'industrie',
    labelFr: 'Équipements industriels',
    labelEn: 'Industrial equipment',
  },
  { code: 'special_machinery', group: 'industrie', labelFr: 'Machines spéciales', labelEn: 'Special machinery' },
  {
    code: 'electronics_semiconductor',
    group: 'industrie',
    labelFr: 'Électronique & semi-conducteurs',
    labelEn: 'Electronics & semiconductors',
  },
  {
    code: 'steel_materials',
    group: 'industrie',
    labelFr: 'Sidérurgie, métallurgie & matériaux',
    labelEn: 'Steel, metals & materials',
  },

  // ── Énergie et utilities ────────────────────────────────────────────────
  { code: 'nuclear', group: 'energie', labelFr: 'Nucléaire', labelEn: 'Nuclear' },
  {
    code: 'power_grid_distribution',
    group: 'energie',
    labelFr: 'Réseaux électriques & distribution',
    labelEn: 'Power grids & distribution',
  },
  { code: 'renewables', group: 'energie', labelFr: 'Énergies renouvelables', labelEn: 'Renewable energy' },
  { code: 'oil_gas', group: 'energie', labelFr: 'Pétrole & gaz', labelEn: 'Oil & gas' },
  { code: 'water_waste', group: 'energie', labelFr: 'Eau & déchets', labelEn: 'Water & waste' },

  // ── Procédés ────────────────────────────────────────────────────────────
  { code: 'chemicals', group: 'process', labelFr: 'Chimie & procédés', labelEn: 'Chemicals & process' },
  {
    code: 'pharma_manufacturing',
    group: 'process',
    labelFr: 'Pharma & production industrielle',
    labelEn: 'Pharma manufacturing',
  },
  { code: 'food_beverage', group: 'process', labelFr: 'Agroalimentaire', labelEn: 'Food & beverage' },
  { code: 'cosmetics', group: 'process', labelFr: 'Cosmétique & parfumerie', labelEn: 'Cosmetics & fragrance' },
  { code: 'paper_packaging', group: 'process', labelFr: 'Papier & emballage', labelEn: 'Paper & packaging' },

  // ── Construction et infrastructures ─────────────────────────────────────
  { code: 'construction', group: 'construction', labelFr: 'BTP & génie civil', labelEn: 'Construction & civil works' },
  { code: 'real_estate', group: 'construction', labelFr: 'Immobilier', labelEn: 'Real estate' },
  {
    code: 'transport_infrastructure',
    group: 'construction',
    labelFr: 'Infrastructures de transport',
    labelEn: 'Transport infrastructure',
  },

  // ── Transport et logistique ─────────────────────────────────────────────
  { code: 'rail', group: 'transport', labelFr: 'Ferroviaire', labelEn: 'Rail' },
  { code: 'air_transport', group: 'transport', labelFr: 'Transport aérien', labelEn: 'Air transport' },
  { code: 'road_maritime', group: 'transport', labelFr: 'Transport routier & maritime', labelEn: 'Road & maritime' },
  { code: 'logistics', group: 'transport', labelFr: 'Logistique & supply chain', labelEn: 'Logistics & supply chain' },

  // ── Finance ─────────────────────────────────────────────────────────────
  {
    code: 'retail_banking',
    group: 'finance',
    labelFr: 'Banque de détail & privée',
    labelEn: 'Retail & private banking',
  },
  {
    code: 'investment_banking',
    group: 'finance',
    labelFr: "Banque d'investissement & marchés",
    labelEn: 'Investment banking & markets',
  },
  { code: 'insurance', group: 'finance', labelFr: 'Assurance & mutuelles', labelEn: 'Insurance & mutuals' },
  {
    code: 'fintech',
    group: 'finance',
    labelFr: 'Fintech & services financiers',
    labelEn: 'Fintech & financial services',
  },

  // ── Santé et sciences du vivant ─────────────────────────────────────────
  { code: 'healthcare', group: 'sante', labelFr: 'Santé & hôpitaux', labelEn: 'Healthcare & hospitals' },
  {
    code: 'life_sciences',
    group: 'sante',
    labelFr: 'Sciences du vivant & biotech',
    labelEn: 'Life sciences & biotech',
  },
  { code: 'medtech', group: 'sante', labelFr: 'Medtech & dispositifs médicaux', labelEn: 'Medtech & medical devices' },

  // ── Commerce et services ────────────────────────────────────────────────
  { code: 'retail', group: 'commerce', labelFr: 'Retail & grande distribution', labelEn: 'Retail & mass distribution' },
  { code: 'ecommerce', group: 'commerce', labelFr: 'E-commerce & marketplaces', labelEn: 'E-commerce & marketplaces' },
  { code: 'luxury', group: 'commerce', labelFr: 'Luxe & mode', labelEn: 'Luxury & fashion' },
  {
    code: 'hospitality_tourism',
    group: 'commerce',
    labelFr: 'Hôtellerie, tourisme & loisirs',
    labelEn: 'Hospitality, tourism & leisure',
  },

  // ── Technologie et médias ───────────────────────────────────────────────
  { code: 'software_tech', group: 'tech', labelFr: 'Éditeurs & tech', labelEn: 'Software & tech' },
  { code: 'telecom', group: 'tech', labelFr: 'Télécoms', labelEn: 'Telecoms' },
  { code: 'media_entertainment', group: 'tech', labelFr: 'Médias & divertissement', labelEn: 'Media & entertainment' },

  // ── Public et éducation ─────────────────────────────────────────────────
  { code: 'public_sector', group: 'public', labelFr: 'Secteur public & collectivités', labelEn: 'Public sector' },
  {
    code: 'education_research',
    group: 'public',
    labelFr: 'Éducation & recherche',
    labelEn: 'Education & research',
  },
] as const

export const APPLICATION_SECTOR_CODES: readonly string[] = APPLICATION_SECTORS.map(sector => sector.code)

export const APPLICATION_SECTOR_BY_CODE: ReadonlyMap<string, ApplicationSector> = new Map(
  APPLICATION_SECTORS.map(sector => [sector.code, sector]),
)

export const applicationSectorCodeSchema = z.enum(APPLICATION_SECTOR_CODES as unknown as [string, ...string[]])

/** Libellés FR des codes reconnus, dans l'ordre reçu. Un code inconnu est
 *  ignoré : le prisme ne nomme jamais un secteur qu'il ne connaît pas. */
export function applicationSectorNamesFr(codes: readonly string[]): string[] {
  return codes.map(code => APPLICATION_SECTOR_BY_CODE.get(code)?.labelFr).filter((label): label is string => !!label)
}
