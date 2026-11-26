import type { EntityNode, KeyNote, ProgramName, SiteFrance, TechnologyEntry } from '@bellum/contracts'
import type { CompteCsvRow } from './compte-csv-parser'

/**
 * Mappe chaque bloc du CSV « compte SG complet » (2 289 lignes, 17 blocs) vers
 * ce que le dossier de démonstration sait déjà porter — jamais un nouveau
 * schéma (FINIR-V2-27-09, décision 1).
 *
 * Complément v2 (27/09/2026) — les cinq blocs qui n'avaient AUCUN champ
 * d'accueil (`01_LECTURE_STRUCTURELLE`, `14_ECOSYSTEME`,
 * `15_DOMAINES_OPPORTUNITE`, `16_INDICATEURS`, `17_GARDE_FOUS`) en ont
 * désormais un : `keyNoteSchema` (`@bellum/contracts`), un type générique
 * ajouté pour cette raison précise — voir `mapSgKeyNotes` plus bas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CONFLIT DE DOCTRINE, ET LA VARIANTE CONFORME (FINIR-V2-27-09, décision 2)
 * ─────────────────────────────────────────────────────────────────────────
 * `demo-dataset.ts:55-70` et `demo-dataset.ts:105-110,148-167` (règles 1/1bis/3
 * du docblock, et le champ `DemoContact.email`) : **aucune coordonnée sur une
 * personne réelle**, et une personne ne peut être NOMMÉE que si elle vient du
 * registre du commerce OU d'une annonce publique citée — sinon c'est un SIÈGE
 * sans nom (`full_name: ''`).
 *
 * Les blocs `06_CONTACTS_OPERATIONNELS` (1 781 lignes), `07_PRESTATAIRES_EXTERNES_
 * EN_POSTE` (43) et `08_PROFILS_AYANT_EXERCE_CHEZ_LE_COMPTE` (74) sont des
 * personnes RÉELLES, nommées, avec e-mail et parfois LinkedIn — mais sourcées
 * d'une base de contacts (LinkedIn/Apollo-like), PAS d'une annonce publique
 * citée. Les semer verbatim sur un lien de démonstration PUBLIC exposerait
 * l'identité et l'employeur de ~1 900 personnes réelles sans base légale ni
 * consentement : exactement ce que la règle 3 a été écrite pour empêcher.
 *
 * La variante conforme qui livre quand même l'INTENTION (montrer la vraie
 * profondeur/le vrai volume du compte) : aucun email/téléphone/LinkedIn n'est
 * jamais semé (`mapSgGovernanceContacts` non plus), et les trois blocs ci-dessus
 * ne sont JAMAIS semés nom par nom. Leur volume réel est montré par les
 * SIÈGES anonymes de `buildSgFamilyRoleSeats` (familles métier RÉELLES, comptage
 * RÉEL cité en toutes lettres, aucun nom individuel) et par `SG_DETECTED_TECH_STACK`
 * (bloc `13_TECHNOLOGIES`, ligne « stack citée dans les offres »).
 *
 * `04_GOUVERNANCE_ET_ROLES` (44 lignes) EST conforme à la règle 3 : chaque
 * `linkedin` renseigné pointe une page de gouvernance/annonce publique
 * (societegenerale.com/group/governance, ayvens.com/about-us/our-leadership,
 * securities-services.societegenerale.com/about, ou un communiqué de presse —
 * vérifié ligne par ligne, aucune URL `linkedin.com/in/…` personnelle) — la
 * même catégorie que les deux mandataires déjà semés à la main. Nommés, donc,
 * mais toujours sans coordonnée : la citation de la source publique vit en
 * texte dans `profile_summary`, jamais dans un champ `linkedin_url` qui
 * laisserait croire à un profil personnel.
 */

const CSV_IMPORT_DATE = '27/09/2026'

function rowsOf(rows: readonly CompteCsvRow[], bloc: string): CompteCsvRow[] {
  return rows.filter(row => row.bloc === bloc)
}

/* ------------------------------------------------------------------ */
/* 09_ENTITES_ET_PERIMETRE → entities_exhaustive                       */
/* ------------------------------------------------------------------ */

/** `existingNames` : dédoublonne contre les entités déjà écrites à la main
 *  (« Treezor », « Boursorama / BoursoBank », la maison mère…) — comparaison
 *  insensible à la casse sur le nom EXACT, jamais un rapprochement flou qui
 *  fusionnerait deux entités distinctes par erreur. */
export function mapSgEntities(
  rows: readonly CompteCsvRow[],
  existingNames: ReadonlySet<string> = new Set(),
): EntityNode[] {
  return rowsOf(rows, '09_ENTITES_ET_PERIMETRE').flatMap((row): EntityNode[] => {
    if (!row.objet) return []
    if (existingNames.has(row.objet.trim().toLowerCase())) return []
    const isCurrent = row.niveau === 'Entité juridique actuelle'
    return [
      {
        name: row.objet,
        type: isCurrent ? 'filiale' : null,
        parent: null,
        region: row.pays ?? null,
        estimated_headcount: null,
        it_autonomy: null,
        relevance: null,
        relevanceReason: [row.niveau, row.constat].filter(Boolean).join(' — ') || null,
        // « Entité juridique actuelle » = active ; les deux autres niveaux
        // (correspondance / statut à vérifier) sont explicitement historiques
        // dans le CSV lui-même — ce n'est pas une déduction, c'est le libellé.
        is_active: isCurrent ? true : false,
        actionable: null,
      },
    ]
  })
}

/* ------------------------------------------------------------------ */
/* 10_IMPLANTATIONS (France uniquement) → sites_france                 */
/* ------------------------------------------------------------------ */

/**
 * Coordonnées publiques du CENTRE-VILLE (même pratique que les six sites déjà
 * écrits à la main juste au-dessus dans `demo-dataset.ts` : « la carte a
 * besoin d'un point, et le registre ne publie pas de latitude » — un centre-
 * ville public n'est pas une donnée inventée, c'est le même repli déjà en
 * usage dans ce fichier). Limité aux `ville` RÉELLEMENT présentes dans les
 * lignes françaises du bloc `10_IMPLANTATIONS`.
 */
const FRENCH_CITY_CENTROIDS: Record<string, { latitude: number; longitude: number }> = {
  Nantes: { latitude: 47.2184, longitude: -1.5536 },
  Nanterre: { latitude: 48.8924, longitude: 2.2065 },
  'Paris La Défense': { latitude: 48.8918, longitude: 2.2394 },
  'La Défense': { latitude: 48.8918, longitude: 2.2394 },
  'Marcq-en-Barœul': { latitude: 50.6664, longitude: 3.0897 },
}

export function mapSgSitesFrance(rows: readonly CompteCsvRow[]): SiteFrance[] {
  return rowsOf(rows, '10_IMPLANTATIONS').flatMap((row): SiteFrance[] => {
    // `SitesFranceCard` est nommée « France » : les implantations hors France
    // du même bloc (Montréal, Prague, Bangalore…) n'ont pas de champ d'accueil
    // et restent hors de ce semis (rapport final, bloc 10 partiel).
    if (!row.ville || row.pays !== 'France') return []
    const centroid = FRENCH_CITY_CENTROIDS[row.ville] ?? null
    return [
      {
        city: row.ville,
        region: null,
        type: null,
        priority: null,
        importance: null,
        latitude: centroid?.latitude ?? null,
        longitude: centroid?.longitude ?? null,
        is_headquarters: false,
      },
    ]
  })
}

/* ------------------------------------------------------------------ */
/* 11_PROGRAMMES_TRANSFORMATION → program_names                        */
/* ------------------------------------------------------------------ */

export function mapSgProgramNames(rows: readonly CompteCsvRow[]): ProgramName[] {
  return rowsOf(rows, '11_PROGRAMMES_TRANSFORMATION').flatMap((row): ProgramName[] => {
    if (!row.objet) return []
    return [{ name: row.objet, entity: null, budget: null, description: row.constat ?? null }]
  })
}

/* ------------------------------------------------------------------ */
/* 12_APPLICATIONS_IA + 13_TECHNOLOGIES (ligne « stack citée dans les   */
/* offres ») → technology_stack / detected_tech_stack                  */
/* ------------------------------------------------------------------ */

export function mapSgAiApplications(rows: readonly CompteCsvRow[]): TechnologyEntry[] {
  return rowsOf(rows, '12_APPLICATIONS_IA').flatMap((row): TechnologyEntry[] => {
    if (!row.objet) return []
    return [{ name: row.objet, usage: row.constat ?? null, maturity: null }]
  })
}

/** Ligne SG-2190 (« Stack citée dans les offres du compte ») — une liste de
 *  technologies séparées par ` | `, un fait observé et non attribuable à une
 *  personne : elle a exactement le même champ d'accueil que le premier semis
 *  (`detected_tech_stack`, déjà peuplé depuis la détection du site public). */
export function mapSgDetectedTechStack(rows: readonly CompteCsvRow[]): string[] {
  const row = rowsOf(rows, '13_TECHNOLOGIES').find(entry => entry.objet === 'Stack citée dans les offres du compte')
  if (!row?.technologies) return []
  return row.technologies
    .split('|')
    .map(entry => entry.trim())
    .filter(Boolean)
}

/* ------------------------------------------------------------------ */
/* 02_STRUCTURE_GROUPE + 03_ORGANIGRAMME_SI → raw_analysis.org.units    */
/* ------------------------------------------------------------------ */

type SgOrgUnit = { entity: string; level: string | null; contacts: string[]; missingRoles: string[] }

export function mapSgOrgUnits(rows: readonly CompteCsvRow[]): SgOrgUnit[] {
  const blocs = ['02_STRUCTURE_GROUPE', '03_ORGANIGRAMME_SI']
  return rows
    .filter(row => row.bloc && blocs.includes(row.bloc))
    .flatMap((row): SgOrgUnit[] => {
      if (!row.objet) return []
      // Aucun nom individuel n'est disponible à ce niveau de granularité
      // (`nb_contacts` est un compte, jamais une liste) : `contacts` reste
      // vide plutôt que d'inventer des occupants — c'est une absence réelle,
      // pas un semis oublié.
      return [{ entity: row.objet, level: row.niveau ?? null, contacts: [], missingRoles: [] }]
    })
}

/* ------------------------------------------------------------------ */
/* 05_CHAINE_ACHATS → raw_analysis.org.decisionChain                   */
/* ------------------------------------------------------------------ */

type SgDecisionStep = { step: string; actors: string[]; duration: string | null }

export function mapSgDecisionChainSteps(rows: readonly CompteCsvRow[]): SgDecisionStep[] {
  return rowsOf(rows, '05_CHAINE_ACHATS').flatMap((row): SgDecisionStep[] => {
    if (!row.objet) return []
    return [{ step: row.objet, actors: [], duration: null }]
  })
}

/* ------------------------------------------------------------------ */
/* 04_GOUVERNANCE_ET_ROLES → contacts NOMMÉS (annonce publique citée)  */
/* ------------------------------------------------------------------ */

type SgGovernanceContact = {
  full_name: string
  title: string
  entity: string
  family: string
  decision_role: string
  priority: number
  profile_summary: string
  why_contact: string
  key_points: string[]
  contact_score: number
  seniority: string
}

const ROLE_DECISION_MAP: Record<string, string> = {
  'Sponsor de périmètre potentiel': 'champion',
  'Technique / delivery': 'technical',
  'Métier / opérations': 'user',
}

const PRIORITY_MAP: Record<string, number> = {
  P1_FONCTION: 1,
  P2: 2,
  P2_FUTUR: 2,
  P3: 3,
  A_REVALIDER: 3,
}

/** Classification déterministe famille métier, par mot-clé du TITRE — le même
 *  principe que le classifieur de production (`decision_role.py`), appliqué ici
 *  à `contactFamilySchema` faute de colonne `famille_metier` sur ce bloc. */
function familyFromTitle(title: string): string {
  const t = title.toLowerCase()
  if (/chief financial|cfo|finance/.test(t)) return 'Finance'
  if (/chief human resources|chro|human resources|\brh\b/.test(t)) return 'RH'
  if (/data|analytics|\bia\b|intelligence artificielle/.test(t)) return 'Data'
  if (/technology|technologie|digital|\bit\b|systèmes d.information|cto|cio/.test(t)) return 'IT'
  if (/security|sécurité|cyber/.test(t)) return 'Cyber'
  return 'C-Level'
}

function seniorityFromTitle(title: string): string {
  return /chief|chairman|ceo|président|directeur général|deputy chief executive/i.test(title) ? 'c_suite' : 'director'
}

function splitTitleEntity(fonction: string): { title: string; entity: string } {
  const [first, ...rest] = fonction.split(' — ')
  return rest.length > 0
    ? { title: first.trim(), entity: rest.join(' — ').trim() }
    : { title: fonction, entity: 'Société Générale' }
}

/** `existingFullNames` : dédoublonne contre les contacts déjà écrits à la main
 *  (Bini Smaghi, Palmieri…) — comparaison insensible à la casse. */
export function mapSgGovernanceContacts(
  rows: readonly CompteCsvRow[],
  existingFullNames: ReadonlySet<string>,
): SgGovernanceContact[] {
  const seen = new Set<string>()
  return rowsOf(rows, '04_GOUVERNANCE_ET_ROLES').flatMap((row): SgGovernanceContact[] => {
    if (!row.objet || !row.fonction) return []
    const key = row.objet.trim().toLowerCase()
    if (existingFullNames.has(key) || seen.has(key)) return []
    seen.add(key)

    const { title, entity } = splitTitleEntity(row.fonction)
    const priority = (row.priorite ? PRIORITY_MAP[row.priorite] : undefined) ?? 3
    const decisionRole = (row.role_decision ? ROLE_DECISION_MAP[row.role_decision] : undefined) ?? 'unknown'
    const sourceCitation = row.linkedin
      ? ` Fonction publiée publiquement (relevé du ${CSV_IMPORT_DATE}) : ${row.linkedin}.`
      : ` Fonction relevée dans une source publique (relevé du ${CSV_IMPORT_DATE}).`
    return [
      {
        full_name: row.objet,
        title,
        entity,
        family: familyFromTitle(title),
        decision_role: decisionRole,
        priority,
        profile_summary: `${row.constat ?? ''}${sourceCitation}`.trim(),
        why_contact: row.implication ?? row.interpretation ?? 'Rôle de gouvernance identifié dans une source publique.',
        key_points: [row.interpretation, row.niveau].filter((value): value is string => Boolean(value)),
        contact_score: 60 - priority * 10,
        seniority: seniorityFromTitle(title),
      },
    ]
  })
}

/* ------------------------------------------------------------------ */
/* 06/07/08 (contacts réels non publiquement annoncés) → sièges         */
/* anonymes agrégés par famille métier RÉELLE — jamais un nom individuel*/
/* ------------------------------------------------------------------ */

type SgFamilyRoleSeat = {
  title: string
  entity: string
  family: string
  decision_role: string
  priority: number
  why_contact: string
  key_points: string[]
  contact_score: number
}

const FAMILY_ENUM_MAP: Record<string, string> = {
  'Développement logiciel': 'Dev',
  'Data / IA': 'Data',
  'Gestion de projet / PMO': 'PMO',
  'Infrastructure / Cloud / SRE': 'Infra',
  'Finance / Juridique': 'Finance',
  Cybersécurité: 'Cyber',
  'RH / Recrutement': 'RH',
}

const FAMILY_DECISION_ROLE: Record<string, string> = {
  Dev: 'technical',
  Data: 'technical',
  Infra: 'technical',
  Cyber: 'technical',
  Finance: 'economic',
  RH: 'user',
  PMO: 'user',
}

const FAMILY_TITLE_LABEL: Record<string, string> = {
  Dev: 'Développement logiciel — fonction identifiée',
  Data: 'Data / intelligence artificielle — fonction identifiée',
  PMO: 'Gestion de projet / PMO — fonction identifiée',
  Infra: 'Infrastructure / Cloud / SRE — fonction identifiée',
  Finance: 'Finance / juridique — fonction identifiée',
  Cyber: 'Cybersécurité — fonction identifiée',
  RH: 'RH / recrutement — fonction identifiée',
}

/**
 * Répartition RÉELLE des 91 profils identifiés en poste (ligne SG-2192,
 * bloc `13_TECHNOLOGIES`) — le bloc lui-même agrège déjà `06`/`07`/`08` par
 * famille métier. On en reprend les familles qui ont un bucket
 * `contactFamilySchema` (`Dev`, `Data`, `PMO`, `Infra`, `Finance`, `Cyber`,
 * `RH`) : les familles sans bucket (« Autre / à qualifier », « Marketing /
 * Communication »… — pas de catégorie `contactFamilySchema` correspondante)
 * restent hors de ce semis, avec leur compte réel dans le rapport final —
 * jamais rabattues sur une famille voisine qui leur ferait dire autre chose.
 */
export function buildSgFamilyRoleSeats(rows: readonly CompteCsvRow[]): SgFamilyRoleSeat[] {
  const row = rowsOf(rows, '13_TECHNOLOGIES').find(
    entry => entry.objet === 'Répartition des profils par famille métier',
  )
  if (!row?.technologies) return []
  const entries = row.technologies
    .split('|')
    .map(part => part.trim())
    .flatMap(part => {
      const match = /^(.+?)\s*\((\d+)\)$/.exec(part)
      if (!match) return []
      const [, label, countText] = match
      const family = FAMILY_ENUM_MAP[label]
      if (!family) return []
      return [{ family, count: Number(countText) }]
    })
    .sort((a, b) => b.count - a.count)

  return entries.map(({ family, count }, index) => ({
    title: FAMILY_TITLE_LABEL[family] ?? family,
    entity: 'Société Générale',
    family,
    decision_role: FAMILY_DECISION_ROLE[family] ?? 'unknown',
    priority: index === 0 ? 2 : 3,
    why_contact: `Famille métier réelle observée dans la base de contacts du compte (recherche du ${CSV_IMPORT_DATE}) : ${count} profil(s) sur 91 identifiés en poste. Aucun nom individuel n'est publié sur ce jeu de démonstration public — la fonction, réelle, reste seule montrée (voir docblock de sg-csv-mapping.ts).`,
    key_points: [`${count} profil(s) identifié(s), famille ${family}`, 'Nom non publié — jeu de démonstration public'],
    contact_score: Math.max(20, Math.min(50, count)),
  }))
}

/* ------------------------------------------------------------------ */
/* 01/14/15/16/17 → KeyNote générique (FINIR-V2-27-09)                 */
/* ------------------------------------------------------------------ */

/**
 * Les cinq blocs sans champ d'accueil dédié (rapport FINIR-V2-27-09, décision
 * 1 : « un bloc sans champ d'accueil est listé, pas inventé dans un nouveau
 * schéma ») partagent tous la MÊME forme dans le CSV source : un libellé
 * (`objet`) et quatre colonnes de lecture (`constat`/`interpretation`/
 * `implication`/`fiabilite`) — exactement `keyNoteSchema`
 * (`@bellum/contracts`). Un seul mappeur générique, réutilisé cinq fois avec
 * le nom de bloc qui change — jamais cinq fonctions qui répètent la même
 * lecture de colonnes (GA-26).
 *
 * `amount`/`currency`/`period` restent `null` ici : seul le bloc
 * `16_INDICATEURS` (voir `mapSgFinancialIndicators` plus bas) porte un
 * chiffre daté à ces trois colonnes.
 */
function mapSgKeyNotes(rows: readonly CompteCsvRow[], bloc: string): KeyNote[] {
  return rowsOf(rows, bloc).flatMap((row): KeyNote[] => {
    if (!row.objet) return []
    return [
      {
        label: row.objet,
        constat: row.constat ?? null,
        interpretation: row.interpretation ?? null,
        implication: row.implication ?? null,
        reliability: row.fiabilite ?? null,
        amount: null,
        currency: null,
        period: null,
      },
    ]
  })
}

/** Bloc `01_LECTURE_STRUCTURELLE` (14 lignes) → `raw_analysis.structural_reading_axes`. */
export function mapSgStructuralReadingAxes(rows: readonly CompteCsvRow[]): KeyNote[] {
  return mapSgKeyNotes(rows, '01_LECTURE_STRUCTURELLE')
}

/** Bloc `14_ECOSYSTEME` (15 lignes) → `raw_analysis.ecosystem_third_parties`. */
export function mapSgEcosystemThirdParties(rows: readonly CompteCsvRow[]): KeyNote[] {
  return mapSgKeyNotes(rows, '14_ECOSYSTEME')
}

/** Bloc `15_DOMAINES_OPPORTUNITE` (14 lignes) → `raw_analysis.opportunity_domains`. */
export function mapSgOpportunityDomains(rows: readonly CompteCsvRow[]): KeyNote[] {
  return mapSgKeyNotes(rows, '15_DOMAINES_OPPORTUNITE')
}

/** Bloc `17_GARDE_FOUS` (20 lignes) → `raw_analysis.data_reliability_notes`. */
export function mapSgDataReliabilityNotes(rows: readonly CompteCsvRow[]): KeyNote[] {
  return mapSgKeyNotes(rows, '17_GARDE_FOUS')
}

/**
 * Bloc `16_INDICATEURS` (48 lignes) → `raw_analysis.financial_indicators`.
 *
 * Seul bloc des cinq à porter un chiffre daté : `montant`/`devise`/`periode`
 * du CSV alimentent les trois colonnes que `mapSgKeyNotes` laisse à `null`. Le
 * séparateur de milliers du CSV source est une espace simple (« 3 309 ») —
 * jamais recalculé ni arrondi, seulement dépouillé de ses espaces avant
 * `Number(...)`. Huit lignes du bloc (repères de taille sans chiffre publié,
 * ex. « Clients BoursoBank ») n'ont pas de `montant` : `amount` reste `null`,
 * jamais `0` (GA-18/19) — la note se lit quand même par son constat.
 */
export function mapSgFinancialIndicators(rows: readonly CompteCsvRow[]): KeyNote[] {
  return rowsOf(rows, '16_INDICATEURS').flatMap((row): KeyNote[] => {
    if (!row.objet) return []
    const parsedAmount = row.montant ? Number(row.montant.replace(/[\s\u00a0\u202f]/gu, '')) : null
    return [
      {
        label: row.objet,
        constat: row.constat ?? null,
        interpretation: row.interpretation ?? null,
        implication: row.implication ?? null,
        reliability: row.fiabilite ?? null,
        amount: parsedAmount != null && Number.isFinite(parsedAmount) ? parsedAmount : null,
        currency: row.devise ?? null,
        period: row.periode ?? null,
      },
    ]
  })
}

/**
 * Comptage brut, par bloc, pour le rapport final (§ commit) — jamais écrit
 * dans le dossier de démonstration. Confirme qu'aucune ligne n'est perdue en
 * silence : chaque bloc est soit mappé ci-dessus, soit listé comme n'ayant pas
 * de champ d'accueil (la part hors-France du bloc 10, et les 2 lignes
 * agrégées du bloc 13).
 */
export function sgCsvBlocCounts(rows: readonly CompteCsvRow[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    if (!row.bloc) continue
    counts[row.bloc] = (counts[row.bloc] ?? 0) + 1
  }
  return counts
}
