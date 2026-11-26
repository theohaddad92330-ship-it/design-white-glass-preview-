import type { CommercialBrief } from '@bellum/contracts'

import { parseSemicolonCsv } from './account-dossier'

/**
 * Convertisseur du DOSSIER DE COMPTE Orange (12/10/2026) → `CommercialBrief`.
 *
 * Source : le pack que Théo (CEO) a déposé pour la démo — `orange_account.json` (source de vérité de la fiche),
 * `contacts_orange.csv` (477 contacts AVEC coordonnées, `;`, BOM), `sources.csv` (URL + date de consultation). Hors
 * dépôt, comme les classeurs xlsx des autres comptes. Même contrat (`commercialBriefSchema`), mêmes contrôles
 * (`checkCommercialBrief`, lancés par le CLI), même logique d'échec : tout ce qui n'a pas de case connue LÈVE, rien
 * n'est recopié « au mieux ».
 *
 * Règles tranchées (Louis, 12/10/2026) :
 *  - niveaux de confiance recopiés TELS QUELS (`fort`, `moyen`, `faible`, `indice faible`, `non trouvé`,
 *    `issu des fichiers`) ; « non trouvé » reste « non trouvé » — jamais 0, jamais deviné ;
 *  - coordonnées PROFESSIONNELLES en clair : seules les adresses du domaine du groupe Orange sont reprises. Une
 *    adresse d'un autre domaine (employeur tiers, boîte personnelle, webmail) n'est JAMAIS semée, et le dit dans la
 *    colonne « valeurs écartées » du README ;
 *  - les sources internes ne se nomment pas (doctrine : nos fournisseurs ne se nomment jamais) ;
 *  - « en poste » = export 2024 ; l'organigramme est reconstitué ; seul le SIREN est confirmé.
 */

export type OrangeAccountJson = {
  meta: { account: string; as_of: string; siren: string }
  kpis: Record<string, number>
  marche: Record<string, number | string | string[]>
  legal: {
    denomination: string
    siren: string
    secteur: string
    taille: string
    effectif_public: string
    siege: { base: string; hypothese: string; statut: string }
    forme_capital_naf_bilans: string
    dirigeants_publics: string[]
  }
  structure: { entite: string; role: string; confiance: string }[]
  sites: {
    villes_consultants: { metropole: string; consultants: number; en_poste_2024: number; avec_email: number }[]
    note: string
    sites_confirmes: string[]
    sites_indice_faible: string[]
  }
  esn_sur_place: { esn: string; consultants: number; confiance: string }[]
  achats: {
    plateformes: { outil: string; detail: string; url: string; confiance: string }[]
    base_accessibilite: string
    non_trouve: string[]
    corrections_base: string[]
  }
  besoins: {
    titre: string
    date: string | null
    statut: string
    tjm_annonce_eur?: number
    contact: string | null
    origine: string
  }[]
  projets: { date: string; projet: string; detail: string; source: string; url: string; confiance: string }[]
  decideurs: { nom: string; fonction: string; entite?: string; ville?: string; emails?: string[]; mobile?: string }[]
  limites: string[]
}

type OrangeDossierInput = {
  account: OrangeAccountJson
  /** `contacts_orange.csv`, tel quel (BOM et `;` compris). */
  contactsCsv: string
  /** `sources.csv`, tel quel. */
  sourcesCsv: string
}

type OrangeConversion = {
  brief: CommercialBrief
  coverage: { sheet: string; field: string; rows: number; note: string }[]
  skipped: Record<string, number>
  anomalies: string[]
}

/* ------------------------------------------------------------------ */
/* Lecture CSV                                                          */
/* ------------------------------------------------------------------ */

// 15/10/2026 — la lecture CSV vit dans le cœur partagé des dossiers de compte (`account-dossier.ts`).
export { parseSemicolonCsv }

/* ------------------------------------------------------------------ */
/* Aides                                                                */
/* ------------------------------------------------------------------ */

const NBSP = ' '

const norm = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const frNumber = (value: number): string => {
  const [integer = '', decimals] = String(value).split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  return decimals ? `${grouped},${decimals}` : grouped
}

const joinParts = (parts: readonly (string | false | null | undefined)[], separator: string): string =>
  parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(separator)

/** Les domaines du groupe Orange : seules adresses PROFESSIONNELLES reprises. */
const ORANGE_DOMAIN =
  /@(?:[\w-]+\.)*(?:orange\.com|orange-business\.com|orangecyberdefense\.com|orange-ftgroup\.com|francetelecom\.com)$/i

/** Boîtes de webmail grand public : comptées à part dans le README (adresse personnelle, jamais semée). */
const WEBMAIL_DOMAIN =
  /@(?:gmail|googlemail|yahoo|hotmail|outlook|live|msn|icloud|me|free|wanadoo|orange|sfr|neuf|laposte|aol|gmx|proton|protonmail)\.[a-z.]+$/i

/** `https:/www.linkedin.com/…` (une barre perdue dans l'export) → `https://www.linkedin.com/…`. */
const fixUrl = (value: string): string => value.replace(/^(https?):\/(?!\/)/i, '$1://')

/** Le texte d'une source interne devient un libellé qu'on peut afficher : jamais « MARKET MEMORY », « ORION », « DataForge ». */
export function publicLabel(value: string): string {
  return value
    .replace(/\(ORION (\d{2}\/\d{2}\/\d{4})\)/g, '(relevé du $1)')
    .replace(/BELLUM MARKET MEMORY(?: v[\w.]+)?/gi, 'base interne de l’espace')
    .replace(/faits ORION\/DataForge/gi, 'faits de marché')
    .replace(/ORION\/DataForge/gi, 'faits de marché')
}

const FORBIDDEN_NAMES = /market\s*memory|\borion\b|dataforge/i

const cellText = (value: string | undefined): string | undefined => {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : undefined
}

type Section = CommercialBrief['sections'][number]

const column = (key: string, label: string): { key: string; label: string } => ({ key, label })

/* ------------------------------------------------------------------ */
/* Personnes                                                            */
/* ------------------------------------------------------------------ */

type Person = CommercialBrief['people'][number]

const ORIGINE_LABEL: Record<string, string> = {
  'Contact nommé': 'Contact nommé dans les fichiers',
  'Consultant observé': 'Consultant observé chez Orange',
}

function convertPeople(
  rows: readonly Record<string, string>[],
  skipped: Record<string, number>,
): { people: Person[]; withOrangeEmail: number; withMobile: number } {
  const count = (reason: string, n = 1): void => {
    skipped[reason] = (skipped[reason] ?? 0) + n
  }
  const people: Person[] = []
  let withOrangeEmail = 0
  let withMobile = 0
  for (const row of rows) {
    const name = cellText(row['nom'])
    if (!name) throw new Error(`Contact sans nom (rang ${row['rang_exploitabilite'] ?? '?'})`)

    const orangeEmails = (row['emails_domaine_orange'] ?? '')
      .split(/[|,]/)
      .map(email => email.trim())
      .filter(Boolean)
    for (const email of orangeEmails) {
      if (!ORANGE_DOMAIN.test(email))
        throw new Error(`« ${name} » : « ${email} » n'est pas une adresse du groupe Orange`)
    }
    for (const other of (row['autres_emails'] ?? '')
      .split(/[|,]/)
      .map(email => email.trim())
      .filter(Boolean)) {
      if (ORANGE_DOMAIN.test(other)) orangeEmails.push(other)
      else if (WEBMAIL_DOMAIN.test(other)) count('adresse personnelle (webmail) : non reprise')
      else count('adresse d’un employeur tiers ou d’un domaine personnel : non reprise')
    }
    const email = [...new Set(orangeEmails)].join(' | ')
    if (email) withOrangeEmail += 1

    let mobile = cellText(row['mobile'])
    if (mobile && !/^\+?[\d\s.()-]{8,}$/.test(mobile)) {
      count('mobile : valeur qui n’est pas un numéro')
      mobile = undefined
    }
    if (mobile) withMobile += 1

    const decisionMaker = row['decideur_identifie'] === 'Oui'
    const inPost = row['en_poste_export_2024'] === 'Oui'
    const esn = cellText(row['esn_actuelle'])
    const role: Person['role'] = decisionMaker ? 'decision_maker' : inPost ? (esn ? 'external' : 'contact') : 'alumni'

    const origine = ORIGINE_LABEL[row['origine'] ?? ''] ?? cellText(row['origine'])
    const person: Person = {
      name,
      ...(cellText(row['fonction']) ? { function: row['fonction'] } : {}),
      ...(cellText(row['entite']) ? { entity: row['entite'] } : {}),
      ...(cellText(row['ville']) ? { city: row['ville'] } : {}),
      ...(email ? { email } : {}),
      ...(mobile ? { mobile } : {}),
      ...(cellText(row['linkedin']) ? { linkedin: fixUrl(row['linkedin'] ?? '') } : {}),
      hook: joinParts(
        [
          origine,
          cellText(row['famille_fonction']) && `Famille : ${row['famille_fonction']}`,
          inPost ? 'En poste dans l’export 2024 (à revalider)' : 'Non listé en poste dans l’export 2024',
          esn && `ESN actuelle : ${esn}`,
        ],
        ' · ',
      ),
      role,
      reliability: 'issu des fichiers',
    }
    people.push(person)
  }
  return { people, withOrangeEmail, withMobile }
}

/* ------------------------------------------------------------------ */
/* Conversion                                                           */
/* ------------------------------------------------------------------ */

const ESN_EVIDENCE: Record<string, CommercialBrief['esn'][number]['evidence_level']> = {
  confirmé: 'confirmed',
  probable: 'observed',
  'indice faible': 'hint',
}

const LIMITS: readonly { startsWith: string; point: string | null }[] = [
  { startsWith: 'Organigramme officiel non trouvé', point: 'Organigramme reconstitué, pas officiel' },
  { startsWith: 'Aucun signal ni appel d', point: 'Signaux, appels d’offres, roadmap DSI et budgets IT : non trouvés' },
  { startsWith: 'Export consultants de 2024', point: '« En poste » = export 2024' },
  { startsWith: 'PDF résultats S1', point: 'Résultats S1 2026 lus par extraction automatique' },
  // `point: null` = note INTERNE de l'équipe (pas un garde-fou commercial) : jamais affichée, comptée aux valeurs écartées.
  { startsWith: 'Contacts : base légale', point: null },
]

const MARKET_ROWS: readonly {
  key: string
  label: string
  format: (value: number | string) => string
  source: 'results' | 'lightreading'
}[] = [
  {
    key: 'ca_2025_md_eur',
    label: 'Chiffre d’affaires 2025',
    format: v => `${frNumber(Number(v))} Md€`,
    source: 'lightreading',
  },
  { key: 'ebitdaal_2025_md_eur', label: 'EBITDAaL 2025', format: v => `${frNumber(Number(v))} Md€`, source: 'results' },
  {
    key: 'ca_s1_2026_md_eur',
    label: 'Chiffre d’affaires S1 2026',
    format: v => `${frNumber(Number(v))} Md€`,
    source: 'results',
  },
  {
    key: 'ebitdaal_s1_2026_md_eur',
    label: 'EBITDAaL S1 2026',
    format: v => `${frNumber(Number(v))} Md€`,
    source: 'results',
  },
  { key: 'objectif_2026', label: 'Objectif 2026', format: v => String(v), source: 'results' },
  {
    key: 'dette_nette_s1_2026_md_eur',
    label: 'Dette nette S1 2026',
    format: v => `${frNumber(Number(v))} Md€`,
    source: 'results',
  },
  {
    key: 'orange_business_ca_s1_2026_m_eur',
    label: 'Orange Business — chiffre d’affaires S1 2026',
    format: v => `${frNumber(Number(v))} M€`,
    source: 'results',
  },
  {
    key: 'orange_business_evolution_pct',
    label: 'Orange Business — évolution du chiffre d’affaires',
    format: v => `${frNumber(Number(v))} %`,
    source: 'results',
  },
  {
    key: 'cyberdefense_ca_evolution_pct',
    label: 'Orange Cyberdefense — évolution du chiffre d’affaires',
    format: v => `+${frNumber(Number(v))} %`,
    source: 'results',
  },
  {
    key: 'cyberdefense_commandes_evolution_pct',
    label: 'Orange Cyberdefense — évolution des commandes',
    format: v => `+${frNumber(Number(v))} %`,
    source: 'results',
  },
]

export function convertOrangeDossier(input: OrangeDossierInput): OrangeConversion {
  const { account } = input
  const skipped: Record<string, number> = {}
  const anomalies: string[] = []
  const coverage: OrangeConversion['coverage'] = []
  const cover = (sheet: string, field: string, rows: number, note = ''): void => {
    coverage.push({ sheet, field, rows, note })
  }

  const contactRows = parseSemicolonCsv(input.contactsCsv)
  const sourceRows = parseSemicolonCsv(input.sourcesCsv)
  const sourceOf = (prefix: string): Record<string, string> => {
    const found = sourceRows.find(row => (row['source'] ?? '').toLowerCase().startsWith(prefix.toLowerCase()))
    if (!found) throw new Error(`sources.csv : aucune source « ${prefix} »`)
    return found
  }

  /* ---- personnes ---- */
  const converted = convertPeople(contactRows, skipped)
  const people = converted.people
  cover(
    'contacts_orange.csv',
    'people',
    people.length,
    'rang d’exploitabilité du fichier conservé ; adresses hors domaine Orange non reprises',
  )

  // Les décideurs du dossier : chacun est dans le CSV (même nom) sauf une personne citée par un tiers, ajoutée SANS coordonnée.
  const byName = new Map(people.map(person => [norm(person.name), person]))
  const decideurRows: Record<string, string | number | boolean | null>[] = []
  for (const decider of account.decideurs) {
    const key = norm(decider.nom)
    const inCsv = byName.get(key)
    if (inCsv) {
      if (inCsv.role !== 'decision_maker') {
        anomalies.push(`« ${decider.nom} » est décideur au dossier mais pas au CSV : rôle forcé à decision_maker`)
        inCsv.role = 'decision_maker'
      }
    } else {
      people.push({
        name: decider.nom,
        function: decider.fonction,
        entity: account.meta.account,
        role: 'decision_maker',
        hook: 'Cité dans le dossier du compte ; titre à vérifier sur le terrain',
        reliability: 'moyen',
      })
      byName.set(key, people[people.length - 1] as Person)
      anomalies.push(`« ${decider.nom} » : décideur du dossier absent du CSV de contacts, ajouté sans coordonnée`)
    }
    const kept = (decider.emails ?? []).filter(email => ORANGE_DOMAIN.test(email))
    const dropped = (decider.emails ?? []).length - kept.length
    if (dropped > 0)
      skipped['adresse hors domaine Orange (décideurs) : non reprise'] =
        (skipped['adresse hors domaine Orange (décideurs) : non reprise'] ?? 0) + dropped
    decideurRows.push({
      nom: decider.nom,
      fonction: decider.fonction || null,
      entite: decider.entite ?? null,
      ville: decider.ville || null,
      email: kept.length > 0 ? kept.join(' | ') : null,
      mobile: decider.mobile || null,
      fiabilite: inCsv ? 'issu des fichiers' : 'moyen — titre à vérifier terrain',
    })
  }
  // Décideurs d'abord, puis l'ordre du fichier (déjà classé par exploitabilité).
  const order: Record<NonNullable<Person['role']>, number> = {
    decision_maker: 0,
    manager: 1,
    contact: 2,
    external: 3,
    alumni: 4,
  }
  const ranked = people.map((person, index) => ({ person, index }))
  ranked.sort((a, b) => order[a.person.role ?? 'contact'] - order[b.person.role ?? 'contact'] || a.index - b.index)
  const sortedPeople = ranked.map(({ person }) => person)
  cover('decideurs', 'people (role=decision_maker)', account.decideurs.length, 'remontés en tête avec leur rôle')

  /* ---- entités ---- */
  const entities: CommercialBrief['entities'] = account.structure.map(entry => ({
    name: entry.entite,
    nature: entry.role,
    status: 'active',
    country: 'FR',
    reliability: entry.confiance,
  }))
  cover('structure', 'entities', entities.length, 'confiance recopiée (confirmé / probable / indice faible)')

  /* ---- sites ---- */
  const sites: CommercialBrief['sites'] = []
  for (const confirmed of account.sites.sites_confirmes) {
    const match = /^Datacenters (.+?) \(([^)]+)\)$/.exec(confirmed)
    if (!match) throw new Error(`sites_confirmes : forme inconnue « ${confirmed} »`)
    for (const city of (match[1] ?? '').split(',').map(part => part.trim())) {
      sites.push({
        name: `Datacenter ${city}`,
        city,
        country: 'FR',
        kind: 'industrial',
        why: 'Datacenter du groupe',
        reliability: match[2],
      })
    }
  }
  const weakNote = account.sites.sites_indice_faible
    .map(entry => /\(([^)]+)\)$/.exec(entry)?.[1])
    .find((note): note is string => Boolean(note))
  if (account.sites.sites_indice_faible.length > 0 && !weakNote) {
    throw new Error('sites_indice_faible : la raison de l’indice (entre parenthèses) est introuvable')
  }
  for (const entry of account.sites.sites_indice_faible) {
    const city = entry.replace(/\s*\([^)]*\)$/, '').trim()
    sites.push({
      name: `Site de ${city}`,
      city,
      country: 'FR',
      kind: 'other',
      why: `Cité par ${weakNote}`,
      reliability: 'indice faible',
    })
  }
  cover(
    'sites',
    'sites',
    sites.length,
    'datacenters confirmés (fort) + trois sites en indice faible ; aucun site siège (siège non confirmé)',
  )

  /* ---- ESN ---- */
  const esn: CommercialBrief['esn'] = account.esn_sur_place.map(entry => {
    const level = ESN_EVIDENCE[entry.confiance]
    if (!level) throw new Error(`ESN « ${entry.esn} » : confiance inconnue « ${entry.confiance} »`)
    return {
      name: entry.esn,
      evidence_level: level,
      proof: `${entry.consultants} consultant${entry.consultants > 1 ? 's' : ''} observé${entry.consultants > 1 ? 's' : ''} en poste chez Orange (export 2024, à revalider). Présence observée : aucun référencement confirmé.`,
      reliability: entry.confiance,
    }
  })
  cover('esn_sur_place', 'esn', esn.length, 'jamais « confirmé » : aucun panel ESN public trouvé')

  /* ---- sections ---- */
  const sections: Section[] = []

  const results = sourceOf('Résultats S1 2026')
  const lightReading = sourceOf('Light Reading')
  const ivalua = sourceOf('Étude de cas Ivalua')

  sections.push({
    key: 'fiche-compte',
    title: 'FICHE COMPTE',
    columns: [column('champ', 'CHAMP'), column('valeur', 'VALEUR'), column('fiabilite', 'FIABILITÉ')],
    rows: [
      { champ: 'Dénomination', valeur: account.legal.denomination, fiabilite: 'fort' },
      {
        champ: 'SIREN',
        valeur: account.legal.siren,
        fiabilite: 'fort (titre de la fiche annuaire-entreprises ; fiche non lue)',
      },
      { champ: 'Secteur', valeur: account.legal.secteur, fiabilite: 'issu des fichiers' },
      { champ: 'Taille', valeur: account.legal.taille, fiabilite: 'issu des fichiers' },
      { champ: 'Effectif public', valeur: account.legal.effectif_public, fiabilite: `moyen (${ivalua['source']})` },
      {
        champ: 'Siège',
        valeur: `${account.legal.siege.base} dans la base ; ${account.legal.siege.hypothese} en hypothèse — ${account.legal.siege.statut}`,
        fiabilite: 'faible',
      },
      {
        champ: 'Forme juridique, capital, NAF, bilans',
        valeur: account.legal.forme_capital_naf_bilans,
        fiabilite: 'non trouvé',
      },
      { champ: 'Dirigeants publics', valeur: account.legal.dirigeants_publics.join(' ; '), fiabilite: 'moyen' },
    ],
  })
  cover(
    'legal',
    'sections[fiche-compte]',
    8,
    'seul le SIREN est confirmé ; le reste « non trouvé » est recopié tel quel',
  )

  const marketSource = (which: 'results' | 'lightreading'): Record<string, string> =>
    which === 'results' ? results : lightReading
  sections.push({
    key: 'marche',
    title: 'MARCHÉ — CHIFFRES PUBLICS',
    columns: [
      column('indicateur', 'INDICATEUR'),
      column('valeur', 'VALEUR'),
      column('source', 'SOURCE'),
      column('url', 'LIEN'),
      column('consulte_le', 'CONSULTÉ LE'),
      column('fiabilite', 'FIABILITÉ'),
    ],
    rows: MARKET_ROWS.map(entry => {
      const raw = account.marche[entry.key]
      if (raw === undefined) throw new Error(`marche : « ${entry.key} » absent du dossier`)
      const source = marketSource(entry.source)
      return {
        indicateur: entry.label,
        valeur: entry.format(raw as number | string),
        source: source['source'] ?? '',
        url: source['url'] ?? '',
        consulte_le: source['date_consultation'] ?? '',
        fiabilite: source['fiabilite'] ?? '',
      }
    }),
  })
  cover(
    'marche',
    'sections[marche]',
    MARKET_ROWS.length,
    'chaque chiffre porte sa source, son lien et sa date de consultation (sources.csv)',
  )

  sections.push({
    key: 'projets-2026-2027',
    title: 'PROJETS 2026-2027',
    columns: [
      column('projet_tendance', 'PROJET / TENDANCE'),
      column('horizon', 'HORIZON'),
      column('ce_qui_est_public', 'CE QUI EST PUBLIC'),
      column('url', 'LIEN'),
    ],
    rows: account.projets.map(project => ({
      projet_tendance: project.projet,
      horizon: project.date,
      ce_qui_est_public: `${project.detail}. Source : ${project.source}. Confiance : ${project.confiance}.`,
      url: project.url,
    })),
  })
  cover(
    'projets',
    'sections[projets-2026-2027]',
    account.projets.length,
    'horizon et confiance recopiés ; aucune « offre à monter » inventée',
  )

  sections.push({
    key: 'achats-avant-d-appeler',
    title: 'ACHATS',
    columns: [
      column('numero', '#'),
      column('element', 'ÉLÉMENT'),
      column('nom', 'NOM'),
      column('ce_que_c_est', 'CE QUE C’EST'),
      column('ce_que_tu_dois_avoir_en_tete', 'CE QUE TU DOIS AVOIR EN TÊTE'),
      column('source', 'SOURCE'),
      column('fiabilite', 'FIABILITÉ'),
    ],
    rows: [
      ...account.achats.plateformes.map((platform, index) => ({
        numero: index + 1,
        element: platform.outil === 'Group Sourcing Department' ? 'Direction des achats' : 'Plateforme ou portail',
        nom: platform.outil,
        ce_que_c_est: platform.detail,
        ce_que_tu_dois_avoir_en_tete:
          platform.outil === 'Ivalua'
            ? joinParts(
                account.achats.corrections_base.map(c => `À ne pas affirmer : ${c}.`),
                ' ',
              )
            : null,
        source: platform.url,
        fiabilite: platform.confiance,
      })),
      {
        numero: account.achats.plateformes.length + 1,
        element: 'Accessibilité de la base',
        nom: publicLabel(account.achats.base_accessibilite),
        ce_que_c_est: null,
        ce_que_tu_dois_avoir_en_tete: null,
        source: null,
        fiabilite: 'issu des fichiers',
      },
      {
        numero: account.achats.plateformes.length + 2,
        element: 'Non trouvé',
        nom: account.achats.non_trouve.join(' · '),
        ce_que_c_est: 'Aucun élément public ou interne trouvé',
        ce_que_tu_dois_avoir_en_tete: 'Ne rien affirmer : à qualifier directement auprès de l’acheteur.',
        source: null,
        fiabilite: 'non trouvé',
      },
    ],
  })
  cover(
    'achats',
    'sections[achats-avant-d-appeler]',
    account.achats.plateformes.length + 2,
    'plateformes + accessibilité + « non trouvé » ; deux lignes erronées de la base écartées (corrections_base)',
  )

  sections.push({
    key: 'besoins-en-base',
    title: 'BESOINS EN BASE',
    columns: [
      column('besoin', 'BESOIN'),
      column('date', 'DATE'),
      column('statut', 'STATUT'),
      column('tjm_annonce', 'TJM ANNONCÉ (€/J)'),
      column('contact', 'CONTACT'),
    ],
    rows: account.besoins.map(need => ({
      besoin: need.titre,
      date: need.date ?? 'non trouvé',
      statut: need.statut,
      tjm_annonce: need.tjm_annonce_eur ?? 'non trouvé',
      contact: need.contact ?? 'non trouvé',
    })),
  })
  cover(
    'besoins',
    'sections[besoins-en-base]',
    account.besoins.length,
    'colonne « origine » (fichiers internes) écartée ; date, TJM ou contact absents = « non trouvé »',
  )
  skipped['origine du besoin : nom d’un fichier interne, non repris'] = account.besoins.length

  sections.push({
    key: 'decideurs',
    title: 'DÉCIDEURS',
    columns: [
      column('nom', 'NOM'),
      column('fonction', 'FONCTION'),
      column('entite', 'ENTITÉ'),
      column('ville', 'VILLE'),
      column('email', 'E-MAIL'),
      column('mobile', 'MOBILE'),
      column('fiabilite', 'FIABILITÉ'),
    ],
    rows: decideurRows,
  })
  cover('decideurs', 'sections[decideurs]', decideurRows.length, 'adresses hors domaine Orange non reprises')

  const cities = account.sites.villes_consultants
  sections.push({
    key: 'villes-consultants',
    title: 'VILLES DES CONSULTANTS (PAS DES SITES ORANGE CONFIRMÉS)',
    columns: [
      column('metropole', 'MÉTROPOLE'),
      column('consultants', 'CONSULTANTS'),
      column('en_poste_2024', 'EN POSTE (EXPORT 2024)'),
      column('avec_email', 'AVEC E-MAIL (TOUTES ADRESSES CONNUES)'),
    ],
    rows: cities.map(city => ({
      metropole: city.metropole,
      consultants: city.consultants,
      en_poste_2024: city.en_poste_2024,
      avec_email: city.avec_email,
    })),
  })
  cover('sites', 'sections[villes-consultants]', cities.length, account.sites.note)

  const sourcesRows = sourceRows.map(row => ({
    source: publicLabel(row['source'] ?? ''),
    url: /^https?:/.test(row['url'] ?? '') ? row['url'] : null,
    date_consultation: row['date_consultation'] ?? '',
    utilise_pour: publicLabel(row['utilise_pour'] ?? ''),
    fiabilite: row['fiabilite'] ?? '',
  }))
  sections.push({
    key: 'sources',
    title: 'SOURCES',
    columns: [
      column('source', 'SOURCE'),
      column('url', 'LIEN'),
      column('date_consultation', 'CONSULTÉ LE'),
      column('utilise_pour', 'UTILISÉE POUR'),
      column('fiabilite', 'FIABILITÉ'),
    ],
    rows: sourcesRows,
  })
  cover(
    'sources.csv',
    'sections[sources]',
    sourcesRows.length,
    'lien et date de consultation de chaque source ; la base interne est nommée « base interne de l’espace »',
  )

  /* ---- bandeau, rubriques, graphiques ---- */
  const k = account.kpis
  const kpis: CommercialBrief['kpis'] = [
    {
      label: 'CONSULTANTS OBSERVÉS',
      value: k['consultants_observes_groupe'] ?? 0,
      caption: `Groupe Orange · ${k['consultants_observes_avec_non_rattaches']} avec les ${k['comptes_orange_non_rattaches']} comptes non rattachés`,
    },
    {
      label: 'EN POSTE (EXPORT 2024)',
      value: k['consultants_en_poste_export_2024'] ?? 0,
      caption: 'À revalider avant tout usage commercial',
    },
    {
      label: 'ESN VUES EN POSTE',
      value: k['esn_vues_en_poste'] ?? 0,
      caption: `${k['esn_anciennes']} anciennes · ${k['esn_rang2_ouvert']} en rang 2 ouvert`,
    },
    { label: 'RÉFÉRENCEMENT ESN', value: 'Aucun confirmé', caption: 'Aucun panel ESN public trouvé' },
    {
      label: 'CONTACTS',
      value: contactRows.length,
      caption: `${converted.withOrangeEmail} avec e-mail Orange · ${converted.withMobile} avec mobile`,
    },
    {
      label: 'CA 2025',
      value: `${frNumber(Number(account.marche['ca_2025_md_eur']))} Md€`,
      caption: `${lightReading['source']}, consulté le 12/10/2026`,
    },
  ]
  if (k['esn_referencement_confirme'] !== 0) {
    throw new Error('esn_referencement_confirme n’est plus 0 : le libellé « Aucun confirmé » du bandeau est à revoir')
  }
  cover('kpis', 'kpis', kpis.length, 'six tuiles tirées des 13 indicateurs du dossier')

  const metros = cities.filter(city => city.metropole !== '(non renseignée)').slice(0, 10)
  const charts: CommercialBrief['charts'] = [
    {
      title: 'CONSULTANTS OBSERVÉS PAR MÉTROPOLE (VILLE DU CONSULTANT)',
      items: metros.map(city => ({ label: city.metropole, value: city.consultants })),
    },
    {
      title: 'ESN VUES EN POSTE (CONSULTANTS, EXPORT 2024)',
      items: account.esn_sur_place.map(entry => ({ label: entry.esn, value: entry.consultants })),
    },
  ]
  cover('sites + esn_sur_place', 'charts', charts.length, `${metros.length + account.esn_sur_place.length} points`)

  const projectsByKey = (needle: string): string => {
    const found = account.projets.find(project => project.projet.toLowerCase().includes(needle.toLowerCase()))
    if (!found) throw new Error(`projets : « ${needle} » introuvable`)
    return `${found.projet} (${found.date})`
  }
  const whatIKnow: CommercialBrief['what_i_know'] = [
    {
      rubric: 'IDENTITÉ',
      known: `Orange (SA), SIREN ${account.legal.siren} confirmé. ${account.legal.taille}. ${account.legal.effectif_public}. Forme juridique, capital, NAF, bilans et siège exact : non trouvés.`,
      meaning:
        'Seul l’identifiant est sûr : ne rien affirmer d’autre sur la société tant qu’un registre ne l’a pas confirmé.',
    },
    {
      rubric: 'MARCHÉ',
      known: `Chiffre d’affaires S1 2026 de ${frNumber(Number(account.marche['ca_s1_2026_md_eur']))} Md€ (EBITDAaL ${frNumber(Number(account.marche['ebitdaal_s1_2026_md_eur']))} Md€) ; Orange Business à ${frNumber(Number(account.marche['orange_business_ca_s1_2026_m_eur']))} M€ (${frNumber(Number(account.marche['orange_business_evolution_pct']))} %), Orange Cyberdefense en hausse (chiffre d’affaires +${frNumber(Number(account.marche['cyberdefense_ca_evolution_pct']))} %, commandes +${frNumber(Number(account.marche['cyberdefense_commandes_evolution_pct']))} %). Source : résultats S1 2026, lus par extraction automatique.`,
      meaning:
        'Deux dynamiques opposées dans le groupe : à recouper avec le PDF des résultats avant de citer un chiffre à un client.',
    },
    {
      rubric: 'STRUCTURE',
      known: `${entities.length} entités rattachées, dont Orange Business (filiale ESN/intégrateur), Orange Cyberdefense et Orange Labs, confirmées. Aucun organigramme officiel trouvé : l’arbre est reconstitué à partir des entités et des villes des profils.`,
      meaning:
        'Orange Business est à la fois un concurrent et un canal de rang 2 : deux logiques d’achat à distinguer, et un organigramme à présenter comme une reconstitution.',
    },
    {
      rubric: 'ESN SUR PLACE',
      known: `${k['esn_vues_en_poste']} ESN vues en poste dans l’export 2024, ${k['esn_anciennes']} anciennes, ${k['esn_rang2_ouvert']} en rang 2 ouvert. Référencement confirmé : aucun. Aucun panel ESN public trouvé.`,
      meaning:
        'Une présence observée n’est pas un référencement : ne jamais dire à un acheteur qu’une ESN est référencée.',
    },
    {
      rubric: 'ACHATS',
      known:
        'Plateforme achats Ivalua (discours éditeur, confiance moyenne), portail fournisseurs OFusion, plateforme d’appels d’offres Sprint et catalogues PunchOut (sources officielles). Panel ESN, grille tarifaire et procédure prestataire IT : non trouvés.',
      meaning:
        'Pour répondre à Orange : passer par le portail fournisseurs officiel ; le reste se qualifie auprès de l’acheteur.',
    },
    {
      rubric: 'PROJETS',
      known: `${projectsByKey('SFR')}, ${projectsByKey('datacenters souverains avec')}, ${projectsByKey('Tech Mahindra')}, ${projectsByKey('Trust the Future')}.`,
      meaning: 'Plusieurs chantiers lourds mobilisent le groupe : à qualifier avant d’y voir un besoin de prestation.',
    },
    {
      rubric: 'CONTACTS',
      known: `${contactRows.length} contacts classés par exploitabilité : ${converted.withOrangeEmail} avec e-mail Orange, ${converted.withMobile} avec mobile, ${account.decideurs.length} décideurs listés au dossier. « En poste » vient de l’export 2024.`,
      meaning:
        'Un contact « en poste » est à revalider avant tout usage commercial ; les décideurs passent en premier.',
    },
    {
      rubric: 'BESOINS',
      known: `${k['besoins_en_base']} besoins en base : une présentation en cours et deux missions terminées, aucun perdu.`,
      meaning: 'Historique trop mince pour en tirer une tendance : à ne présenter que comme un point de départ.',
    },
  ]

  const guardrails: CommercialBrief['guardrails'] = account.limites.flatMap((limit, index) => {
    const expected = LIMITS[index]
    if (!expected || !limit.startsWith(expected.startsWith)) {
      throw new Error(`limites[${index}] : forme inconnue « ${limit} »`)
    }
    if (expected.point === null) {
      skipped['limite « base légale des contacts » : note interne de l’équipe, pas un garde-fou commercial'] = 1
      return []
    }
    return [{ point: expected.point, detail: limit }]
  })
  if (account.limites.length !== LIMITS.length)
    throw new Error(`limites : ${account.limites.length} lignes, ${LIMITS.length} attendues`)
  guardrails.push(
    { point: 'Villes des consultants', detail: account.sites.note + ' : les villes ne sont pas des sites Orange.' },
    {
      point: 'Coordonnées',
      detail:
        'Seules les adresses du groupe Orange sont reprises ; les autres adresses (employeur tiers, boîte personnelle) ne le sont pas. Aucune coordonnée n’est devinée.',
    },
    {
      point: 'Ivalua',
      detail:
        'Étude de cas de l’éditeur (confiance moyenne) : ce n’est ni un référencement ni la preuve de « tous les modules ».',
    },
  )
  cover(
    'limites',
    'guardrails',
    guardrails.length,
    'quatre limites du dossier recopiées (la cinquième est une note interne, écartée) + trois garde-fous de lecture',
  )

  const brief: CommercialBrief = {
    account_name: account.meta.account,
    generated_at: `${account.meta.as_of}T00:00:00.000Z`,
    scope: 'france',
    headquarters: { label: 'Siège non confirmé', city: account.legal.siege.base },
    kpis,
    what_i_know: whatIKnow,
    charts,
    entities,
    sites,
    prices: [],
    esn,
    people: sortedPeople,
    sections,
    guardrails,
  }

  const everything = JSON.stringify(brief)
  const forbidden = FORBIDDEN_NAMES.exec(everything)
  if (forbidden) throw new Error(`Un nom interne se lirait à l’écran : « ${forbidden[0]} »`)

  return { brief, coverage, skipped, anomalies }
}
