import type {
  AccountPlan,
  EntityDraft,
  EsnDraft,
  Fields,
  PeoplePlan,
  PersonDraft,
  LayerPlan,
  PersonRole,
  PriceChannel,
  PriceDraft,
  SheetPlan,
  SiteDraft,
} from './plan-types'
import type { Row, Table } from './table'
import { OWN_PERFORMANCE_REWRITES } from './text-rules'

/**
 * Les cinq plans (un par classeur). Chaque entrée est une ligne du tableau
 * « onglet → champ du contrat » ; les choix tranchés par Louis / le CEO sont
 * commentés à l'endroit où ils s'appliquent.
 */

const ascii = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (value: string | undefined): string =>
  ascii(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const OWN_STATUS =
  'notre propre performance commerciale (CEO 01/10/2026) : statut de relation, jamais un fait sur le compte'
const NO_FIELD_PRIORITY =
  'priorité de qualification du commercial (P1, Pertinent…) : aucun champ du contrat ; les totaux restent au COCKPIT (graphique « PRIORITÉ DES CONTACTS »)'

/** « Puteaux (92) » → « Puteaux » ; « Régions », « Île-de-France » restent tels quels. */
const cityOf = (localisation: string): string => localisation.replace(/\s*\(\d{2,3}\)\s*$/, '').trim()

/** « 510 € / jour » → 510 ; échoue sur tout autre format (jamais un prix deviné). */
const eurPerDay = (text: string): number => {
  const match = /^\s*(\d[\d\s]*)(?:[.,](\d+))?\s*€/.exec(text)
  if (!match) throw new Error(`prix illisible : « ${text} »`)
  const value = Number(`${match[1].replace(/\s/g, '')}${match[2] ? `.${match[2]}` : ''}`)
  if (!(value > 0)) throw new Error(`prix nul : « ${text} »`)
  return value
}

const esnLevel = (reliability: string): EsnDraft['evidence_level'] => {
  const key = norm(reliability)
  if (key.startsWith('confirme')) return 'confirmed'
  if (key.startsWith('observe')) return 'observed'
  if (key.startsWith('indice')) return 'hint'
  throw new Error(`FIABILITÉ d'ESN inconnue : « ${reliability} »`)
}

/** ESN PRESENTES (BPCE, Engie, SG) : FIABILITÉ Confirmé / Observé / Indice → confirmed / observed / hint. */
const esnSheet = (): SheetPlan => ({
  sheet: 'ESN PRESENTES',
  esn: {
    map: (r): EsnDraft => {
      const reliability = r.get('FIABILITÉ') as string
      return {
        name: r.get('ESN / CABINET') as string,
        evidence_level: esnLevel(reliability),
        proof: r.get('PREUVE DE PRÉSENCE') as string,
        perimeter: r.get('PÉRIMÈTRE'),
        reliability,
      }
    },
  },
})

const siteKind = (type: string): SiteDraft['kind'] | 'rest' => {
  if (type === 'SIÈGE') return 'headquarters'
  if (type === 'SORTI') return 'rest'
  return 'secondary'
}

/** SITES UTILES (Engie, BPCE, SG). Un seul siège par compte : un second « SIÈGE » du classeur est rétrogradé (`secondary`) par `demotedHeadquarters`. */
const sitesSheet = (demotedHeadquarters: readonly string[], restRule: (row: Row) => string | undefined): SheetPlan => ({
  sheet: 'SITES UTILES',
  sites: {
    map: (r, f): SiteDraft | { rest: string } => {
      const name = r.get('SITE') as string
      const rest = restRule(r)
      if (rest) return { rest }
      const kind = siteKind(r.get('TYPE') as string)
      if (kind === 'rest') return { rest: 'Périmètre sorti du groupe : voir les entités' }
      return {
        name,
        city: cityOf(r.get('LOCALISATION') as string),
        kind: kind === 'headquarters' && demotedHeadquarters.includes(name) ? 'secondary' : kind,
        why: f.join(' — ', r.get('ACTIVITÉ'), r.get('POURQUOI Y ALLER')),
      }
    },
  },
})

const externalsSheet = (sheet: string): SheetPlan => ({
  sheet,
  people: {
    role: 'external',
    mode: 'add',
    map: (r, f, t): PersonDraft => {
      const technos = t.headers.includes('TECHNOS') ? r.get('TECHNOS') : undefined
      return {
        name: f.name(r.get('NOM')),
        function: r.get('POSTE'),
        entity: r.get('ENTITÉ'),
        department: r.get('FAMILLE'),
        city: r.get('VILLE'),
        email: f.email(r.get('E-MAIL')),
        mobile: f.phone(r.get('MOBILE'), 'MOBILE'),
        linkedin: f.link(r, 'LINKEDIN'),
        hook: technos ? `Technos : ${technos}` : undefined,
      }
    },
  },
})

const plainSheet = (sheet: string): SheetPlan => ({ sheet, section: {} })

const guardrailsSheet = (): SheetPlan => ({ sheet: 'GARDE-FOUS', guardrails: true })

/** DECIDEURS ET ROLES (TotalEnergies, Alstom) : seules les lignes nommées sont des personnes ; fonctions à rechercher et rôles publiés restent dans la section. */
const namedDecisionMakers = (named: readonly string[], mode: PeoplePlan['mode']): PeoplePlan => ({
  role: 'decision_maker',
  mode,
  also: {},
  map: (r, f): PersonDraft | { rest: string } => {
    const nature = r.get('NATURE') as string
    if (!named.includes(nature)) return { rest: `${nature} : pas une personne` }
    return {
      name: f.name(r.get('NOM OU RÔLE')),
      function: r.get('FONCTION'),
      department: r.get('RATTACHEMENT / SITE'),
      hook: f.join(' — ', r.get('CE QUE JE SAIS'), r.get('LECTURE')),
      reliability: r.get('FIABILITÉ'),
    }
  },
})

// ───────────────────────────── ENGIE ─────────────────────────────

/** Mobile ou fixe : un numéro de portable français commence par 06/07 (ou +33 6/7). */
const isMobile = (value: string): boolean => /^(\+?33|0)[67]/.test(value.replace(/[\s.]/g, ''))
const isPhoneLike = (value: string): boolean => /^[\d\s.+()/-]+$/.test(value) && value.replace(/\D/g, '').length >= 6

const engieHomeServices = (r: Row, f: Fields): PersonDraft | { rest: string } => {
  const post = r.get('POSTE')
  const town = r.get('VILLE')
  const number = r.get('NUMÉRO')
  if (!post && !town && !number)
    return { rest: "Ligne d'intitulé seul (regroupement ou référence), sans poste ni coordonnée" }
  // Les colonnes VILLE / NUMÉRO du classeur sont mêlées : VILLE porte parfois le numéro, NUMÉRO un e-mail ou une note.
  let city: string | undefined
  let phone: string | undefined
  let mobile: string | undefined
  let email: string | undefined
  if (town) {
    if (isPhoneLike(town)) {
      if (isMobile(town)) mobile = f.phone(town, 'VILLE (numéro)')
      else phone = f.phone(town, 'VILLE (numéro)')
    } else if (norm(town) === 'n existe pas')
      f.skip("VILLE : « N'existe pas » (issue d'un appel de notre prospection), écarté")
    else if (norm(town) === '') f.skip('VILLE : « ? », écarté')
    else city = town
  }
  if (number) {
    if (number.includes('@')) email = f.email(number)
    else if (isPhoneLike(number)) {
      if (isMobile(number)) mobile = mobile ?? f.phone(number, 'NUMÉRO')
      else phone = phone ?? f.phone(number, 'NUMÉRO')
    } else f.skip('NUMÉRO : note de suivi de notre prospection (hors compte), écartée')
  }
  return {
    name: f.name(r.get('NOM')),
    function: post,
    entity: 'Engie Home Services',
    city,
    phone,
    mobile,
    email,
  }
}

/** RESPONSABLE : « Prénom NOM (fonction) » est un manager ; THA, MCL, « envoyé mail »… sont notre suivi interne. */
const engieManager = (r: Row, f: Fields): string | undefined => {
  const attachment = r.get('RATTACHEMENT')
  const responsable = r.get('RESPONSABLE')
  if (attachment) return attachment
  if (responsable && /\(.+\)/.test(responsable)) return responsable
  if (responsable) f.skip('RESPONSABLE : code ou action de notre suivi interne (THA, MCL, « envoyé mail »…), écarté')
  return undefined
}

const engie: AccountPlan = {
  slug: 'engie',
  name: 'ENGIE',
  titlePrefix: 'ENGIE',
  source: 'ENGIE_BELLUM_BRIEF.xlsx',
  headquarters: {
    champ: 'Siège',
    label: 'Tour T1',
    city: 'Paris La Défense',
    address: '1 place Samuel de Champlain, 92930 Paris La Défense',
  },
  // Equans (Cofely, Ineo, Axima, Endel) : cédé à Bouygues en 2022 — décision CEO, périmètre SORTI. Le classeur
  // désigne ce périmètre par le département « Engie Solutions » ou par l'entité (COFELY, INEO, ENDEL, AXIMA…).
  exitedAliases: {
    aliases: ['Engie Solutions', 'COFELY', 'INEO', 'ENDEL', 'AXIMA', 'AXIMA CONCEPT', 'ENGIE.SOLUTIONS', 'EQUANS'],
    nature: 'Périmètre sorti du groupe (Equans)',
    note: 'Cédé à Bouygues en 2022 : à traiter comme un compte Bouygues, pas ENGIE.',
  },
  rewrites: OWN_PERFORMANCE_REWRITES.engie,
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    { sheet: 'FICHE COMPTE', fiche: true },
    plainSheet('ACHATS AVANT D APPELER'),
    {
      sheet: 'ORGANIGRAMME',
      dropped: { PRIORITÉ: NO_FIELD_PRIORITY, 'STATUT RELATION': OWN_STATUS },
      people: {
        role: 'contact',
        mode: 'add',
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('FONCTION'),
          department: r.get('DÉPARTEMENT'),
          entity: r.get('ENTITÉ'),
          manager: engieManager(r, f),
          email: f.email(r.get('E-MAIL')),
          mobile: f.phone(r.get('MOBILE'), 'MOBILE'),
          phone: f.phone(r.get('FIXE'), 'FIXE'),
          linkedin: f.link(r, 'LINKEDIN'),
          hook: r.get('ACCROCHE'),
        }),
      },
    },
    {
      sheet: 'MANAGERS',
      people: {
        role: 'manager',
        mode: 'merge',
        also: {},
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('MANAGER')),
          function: r.get('FONCTION'),
          department: r.get('DÉPARTEMENT'),
          email: f.email(r.get('E-MAIL')),
          mobile: f.phone(r.get('MOBILE'), 'MOBILE'),
          hook: r.get('LECTURE'),
        }),
      },
    },
    {
      sheet: 'DECIDEURS',
      dropped: { 'STATUT RELATION': OWN_STATUS },
      people: {
        role: 'decision_maker',
        mode: 'merge',
        also: {},
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('FONCTION'),
          department: r.get('DÉPARTEMENT'),
          entity: r.get('ENTITÉ'),
          manager: r.get('RATTACHEMENT'),
          email: f.email(r.get('E-MAIL')),
          mobile: f.phone(r.get('MOBILE'), 'MOBILE'),
          phone: f.phone(r.get('FIXE'), 'FIXE'),
          hook: r.get('ACCROCHE'),
        }),
      },
    },
    plainSheet('FONCTIONS OBSERVEES'),
    // Equans : sorti du périmètre (décision CEO) — une ligne « SORTI » n'est pas un site.
    sitesSheet([], () => undefined),
    {
      sheet: 'ENTITES',
      entities: {
        map: (r, f): EntityDraft | { rest: string } => {
          const name = r.get('ENTITÉ') as string
          // France uniquement (décision CEO) : UK Power Networks n'est ni site ni entité, cité dans les textes.
          if (norm(name) === 'uk power networks')
            return { rest: 'Hors France : cité uniquement comme chantier d’intégration' }
          return {
            name,
            nature: r.get('NATURE'),
            status: /SORTI/i.test(r.get('STATUT') ?? '') ? 'exited' : 'active',
            note: f.join(' — ', r.get('CE QUE JE SAIS'), r.get('LECTURE')),
          }
        },
      },
    },
    esnSheet(),
    plainSheet('TECHNOS A VENDRE'),
    plainSheet('BESOINS ET TENDANCES'),
    plainSheet('PROJETS 2026-2028'),
    plainSheet('PLAN D ACTION'),
    externalsSheet('EXTERNES EN POSTE'),
    {
      sheet: 'ENGIE HOME SERVICES',
      people: { role: 'contact', mode: 'merge', map: (r, f) => engieHomeServices(r, f) },
    },
    guardrailsSheet(),
  ],
  // Prix d'ENGIE : deux points observés (650 € et 750 €) que le GARDE-FOUS qualifie de « référence sectorielle à
  // défaut d'historique plus large » → canal `sector_reference` (décision Louis/CEO : « si le classeur le dit »).
  derivedPrices: (text): PriceDraft[] => {
    const needs = text('BESOINS ET TENDANCES')
    for (const phrase of [
      'Coach acquisition digitale à Courbevoie, senior, 750 € par jour, en 2022',
      "Business analyst marché de l'énergie à 650 € par jour, en 2026",
      'médiane 700 € par jour',
    ]) {
      if (!needs.includes(phrase)) throw new Error(`phrase de prix absente du classeur ENGIE : « ${phrase} »`)
    }
    if (!text('GARDE-FOUS').includes('Référence sectorielle à défaut d')) {
      throw new Error(
        'GARDE-FOUS ENGIE : la mention « Référence sectorielle » a disparu, le canal des prix est à revoir',
      )
    }
    const channel: PriceChannel = 'sector_reference'
    return [
      {
        label: 'Coach acquisition digitale, Courbevoie (senior, 2022)',
        amount_eur_per_day: 750,
        channel,
        note: 'Prix observé chez ENGIE ; le classeur le retient comme référence sectorielle « à défaut d’historique plus large ».',
      },
      {
        label: "Business analyst marché de l'énergie (2026)",
        amount_eur_per_day: 650,
        channel,
        note: 'Prix observé chez ENGIE ; le classeur le retient comme référence sectorielle « à défaut d’historique plus large ».',
      },
      {
        label: 'Référence secteur énergie et industrie (médiane de l’historique marché)',
        amount_eur_per_day: 700,
        channel,
        note: 'Médiane du secteur énergie et industrie dans l’historique marché ; ENGIE observé : 650-750 €.',
      },
    ]
  },
}

// ───────────────────────────── BPCE ─────────────────────────────

// COUCHE TOULOUSE (démo Thélio, 06/10/2026) : `BPCE_TOULOUSE_THELIO_BELLUM_BRIEF.xlsx` (25 onglets) = les 13 onglets du
// groupe (identiques à BPCE_BELLUM_BRIEF : seul le titre diffère ; le plan de base les lit une fois) + 11 onglets propres
// à Toulouse + son COCKPIT. Décision Louis 04/10/2026 : UN seul compte BPCE, la couche s'AJOUTE (voir `brief-layer.ts`).

/** Villes des entités d'Occitanie, telles que l'onglet ENTITES OCCITANIE (colonne ADRESSE) les situe. */
const OCCITANIE_CITY: readonly (readonly [RegExp, string])[] = [
  [/Estreem/i, "L'Union"],
  [/Languedoc/i, 'Montpellier'],
  [/Midi-Pyr/i, 'Toulouse'],
  [/Banque Populaire du Sud/i, 'Perpignan'],
  [/Banque Populaire Occitane|BPCE SI|BPCE-IT|BPCE Solutions|BPCE Infog/i, 'Balma'],
]
const occitanieCity = (entity: string | undefined): string | undefined =>
  entity ? OCCITANIE_CITY.find(([pattern]) => pattern.test(entity))?.[1] : undefined

/** « BPCE-IT Balma — 05 67 06 17 30 » → l'entité d'un côté, le numéro (recopié en clair) de l'autre. */
const splitEntityPhone = (value: string | undefined): { entity?: string; phone?: string } => {
  const match = value ? /^(.*?) — (\+?[\d\s.()]{8,})$/.exec(value) : null
  return match ? { entity: match[1].trim(), phone: match[2].trim() } : { entity: value }
}

/** Ville d'une ADRESSE : « 56 route de Lavaur, 31130 Balma » → Balma ; « L'Union (31) » → L'Union ; « Toulouse (profil identifié) » → Toulouse. */
const addressCity = (address: string): string =>
  (address.split(',').pop() ?? address)
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/^\s*\d{4,5}\s+/, '')
    .trim()

const toulouseSection = (sheet: string, key: string): SheetPlan => ({ sheet, section: { key: `toulouse-${key}` } })

const BPCE_SHARED_SHEET = 'Identique à l’onglet du même nom de BPCE_BELLUM_BRIEF (compte de base) : lu une seule fois.'
const BPCE_SHARED_SHEETS: readonly string[] = [
  'FICHE COMPTE',
  'ACHATS AVANT D APPELER',
  'SITES UTILES',
  'DECIDEURS',
  'CONTACTS',
  'ESN PRESENTES',
  'TECHNOS A VENDRE',
  'BESOINS RECENTS',
  'PROJETS 2026-2027',
  'PLAN D ACTION',
  'EXTERNES EN POSTE',
  'POSTES OUVERTS',
  'GARDE-FOUS',
]

const bpceToulouse: LayerPlan = {
  key: 'toulouse',
  label: 'Toulouse',
  department: 'Toulouse — Occitanie',
  source: 'BPCE_TOULOUSE_THELIO_BELLUM_BRIEF.xlsx',
  titlePrefix: 'GROUPE BPCE — TOULOUSE',
  rewrites: [],
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    ...BPCE_SHARED_SHEETS.map((sheet): SheetPlan => ({ sheet, skip: BPCE_SHARED_SHEET })),
    {
      sheet: 'ENTITES OCCITANIE',
      section: { key: 'toulouse-entites-occitanie' },
      // Une entité par ligne ; un site par ligne aussi, dédoublonné par VILLE contre les sites du groupe (`applyLayer`).
      sites: {
        map: (r, f): SiteDraft => ({
          name: r.get('ENTITÉ') as string,
          city: addressCity(r.get('ADRESSE') as string),
          kind: 'secondary',
          why: f.join(' — ', r.get('NATURE'), r.get('TAILLE')),
        }),
      },
      entities: {
        map: (r, f): EntityDraft => ({
          name: r.get('ENTITÉ') as string,
          nature: r.get('NATURE'),
          status: 'active',
          note: f.join(' — ', r.get('ADRESSE'), r.get('TAILLE'), r.get('LECTURE POUR UN CABINET DATA')),
        }),
      },
    },
    {
      sheet: 'DECIDEURS OCCITANIE',
      people: {
        // « Manager opérationnel… », « Manager du service sécurité… » : relais, pas décideurs (GARDE-FOUS TOULOUSE).
        role: r => (/^Manager/i.test(r.get('FONCTION') ?? '') ? 'manager' : 'decision_maker'),
        mode: 'add',
        // L'onglet entier reste en section : les trois « à identifier » (rôles sans nom) n'y sont pas perdus.
        also: { key: 'toulouse-decideurs-occitanie' },
        map: (r, f): PersonDraft | { rest: string } => {
          if (norm(r.get('FIABILITÉ')).startsWith('a identifier'))
            return { rest: 'Rôle à identifier : pas une personne' }
          const { entity, phone } = splitEntityPhone(r.get('ENTITÉ'))
          return {
            name: f.name(r.get('NOM OU RÔLE')),
            function: r.get('FONCTION'),
            entity,
            city: occitanieCity(entity),
            phone: f.phone(phone, 'TÉLÉPHONE'),
            hook: r.get('RÔLE POUR UN CABINET DATA'),
            reliability: r.get('FIABILITÉ'),
          }
        },
      },
    },
    toulouseSection('POSTES DATA TOULOUSE', 'postes-data'),
    toulouseSection('COMPETENCES DATA A VENDRE', 'competences-data-a-vendre'),
    {
      sheet: 'PROFILS TOULOUSE',
      people: {
        // STATUT « En poste » / « Ancien » ; EXTERNE « oui » = prestataire en poste, « non » = salarié.
        role: r => {
          if (norm(r.get('STATUT')) === 'ancien') return 'alumni'
          return norm(r.get('EXTERNE')) === 'oui' ? 'external' : 'contact'
        },
        mode: 'add',
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('POSTE'),
          entity: r.get('ENTITÉ'),
          city: r.get('VILLE'),
          email: f.email(r.get('E-MAIL')),
          mobile: f.phone(r.get('MOBILE'), 'MOBILE'),
          linkedin: f.link(r, 'LINKEDIN'),
          hook: r.get('TECHNOS') ? `Technos : ${r.get('TECHNOS')}` : undefined,
        }),
      },
    },
    toulouseSection('ESN TOULOUSE', 'esn'),
    toulouseSection('COMPTES SIMILAIRES', 'comptes-similaires'),
    toulouseSection('MARCHE TOULOUSE', 'marche-toulouse'),
    toulouseSection('PLAN D ACTION TOULOUSE', 'plan-d-action'),
    { sheet: 'GARDE-FOUS TOULOUSE', guardrails: true },
    toulouseSection('CE QUE JE SAIS NATIONAL', 'ce-que-je-sais-national'),
  ],
}

const bpce: AccountPlan = {
  slug: 'bpce',
  name: 'BPCE',
  titlePrefix: 'GROUPE BPCE',
  source: 'BPCE_BELLUM_BRIEF.xlsx',
  layers: [bpceToulouse],
  // D11 (Louis 05/10/2026) — la tuile « CONTACTS 304 » est écrite à la main dans le classeur : elle contredit la
  // liste des contacts (427 / 469 / 304 selon l'endroit où on compte). On n'affiche pas un chiffre qui se contredit.
  droppedKpis: [
    {
      label: 'CONTACTS',
      value: 304,
      reason: 'contredit la liste des contacts (427 / 469 / 304) — décision Louis 05/10/2026',
    },
  ],
  // Siège : Tours Duo, Paris 13e — PAS Strasbourg (incident du 01/10/2026 : Strasbourg = site secondaire de BPCE SI).
  headquarters: {
    champ: 'Siège social',
    label: 'Tours Duo',
    city: 'Paris',
    address: '7 promenade Germaine Sablon, 75013 Paris',
  },
  exitedAliases: { aliases: [], nature: '', note: '' },
  rewrites: OWN_PERFORMANCE_REWRITES.bpce,
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    { sheet: 'FICHE COMPTE', fiche: true },
    plainSheet('ACHATS AVANT D APPELER'),
    // Le classeur type aussi Natixis « SIÈGE » : Natixis est une entité hébergée à Tours Duo, pas un second siège.
    sitesSheet(['Natixis — Paris 13e'], () => undefined),
    {
      sheet: 'DECIDEURS',
      people: {
        role: 'decision_maker',
        mode: 'merge',
        also: {},
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('FONCTION'),
          entity: r.get('ENTITÉ'),
          hook: r.get('RÔLE POTENTIEL'),
          linkedin: f.link(r, 'LINKEDIN'),
          reliability: r.get('FIABILITÉ'),
        }),
      },
    },
    {
      sheet: 'CONTACTS',
      dropped: { STATUT: 'statut de notre CRM (Not Attempted, Reached, Qualified…) : ' + OWN_STATUS },
      people: {
        // « les 9 managers opérationnels de la filiale IT avec ligne directe » (sous-titre du classeur)
        role: r => (/^Manager opérationnel/i.test(r.get('FONCTION') ?? '') ? 'manager' : 'contact'),
        mode: 'add',
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('FONCTION'),
          entity: r.get('ENTITÉ'),
          city: r.get('VILLE'),
          email: f.email(r.get('E-MAIL'), r.get('E-MAIL PRO')),
          phone: f.phone(r.get('TÉLÉPHONE'), 'TÉLÉPHONE'),
          mobile: f.phone(r.get('MOBILE'), 'MOBILE'),
          linkedin: f.link(r, 'LINKEDIN'),
          reliability: r.get('FIABILITÉ'),
        }),
      },
    },
    esnSheet(),
    plainSheet('TECHNOS A VENDRE'),
    {
      sheet: 'BESOINS RECENTS',
      section: {},
      prices: {
        map: (r, f): PriceDraft | null => {
          const price = r.get('PRIX OBSERVÉ')
          const channelText = r.get('CANAL')
          if (!price) return null
          // Le BON canal (incident : prix MSP « avant marge » mélangés aux prix directs) : jamais moyenné, jamais deviné.
          let channel: PriceChannel
          if (channelText?.startsWith('Via intermédiaire MSP')) channel = 'msp'
          else if (channelText?.startsWith('Sourcing direct')) channel = 'direct'
          else
            throw new Error(
              `BESOINS RECENTS ligne ${r.n} : prix « ${price} » sans canal reconnu (« ${channelText ?? ''} »)`,
            )
          return {
            label: r.get('BESOIN') as string,
            amount_eur_per_day: eurPerDay(price),
            channel,
            note: r.get('LECTURE'),
          }
        },
      },
    },
    plainSheet('PROJETS 2026-2027'),
    plainSheet('PLAN D ACTION'),
    externalsSheet('EXTERNES EN POSTE'),
    plainSheet('POSTES OUVERTS'),
    guardrailsSheet(),
  ],
}

// ───────────────────────── SOCIÉTÉ GÉNÉRALE ─────────────────────────

const SG_PRICE_CHANNEL: Record<string, PriceChannel> = {
  // « Référence directe mais unique » (LECTURE du classeur) : le seul prix observé chez SG est un freelance en direct.
  'Prix observé chez SG': 'direct',
}

const societeGenerale: AccountPlan = {
  slug: 'societe-generale',
  name: 'Société Générale',
  titlePrefix: 'SOCIÉTÉ GÉNÉRALE',
  source: 'SG_BELLUM_BRIEF.xlsx',
  headquarters: {
    champ: 'Siège',
    label: 'Tours Société Générale',
    city: 'Puteaux',
    address: '17 cours Valmy, 92800 Puteaux',
  },
  exitedAliases: { aliases: [], nature: '', note: '' },
  rewrites: OWN_PERFORMANCE_REWRITES['societe-generale'],
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    { sheet: 'FICHE COMPTE', fiche: true },
    plainSheet('ACHATS AVANT D APPELER'),
    plainSheet('ORGANIGRAMME SI'),
    // Paris 9e Haussmann est la « direction historique » : le siège est Tours SG, Puteaux. Bangalore / Bucarest : hors France.
    sitesSheet(['Paris 9e — Haussmann'], r =>
      norm(r.get('LOCALISATION')) === 'hors france'
        ? 'Hors France : cité uniquement comme référence de coût'
        : undefined,
    ),
    {
      sheet: 'FILIALES ET STARTUPS',
      entities: {
        map: (r, f): EntityDraft | { rest: string } => {
          const name = r.get('ENTITÉ') as string
          const note = f.join(' — ', r.get('CE QUE JE SAIS'), r.get('PROFILS IDENTIFIÉS'), r.get('LECTURE COMMERCIALE'))
          if (norm(name) === 'global solution centre') return { rest: 'Hors France : Bangalore, Bucarest' }
          if (norm(name) === 'credit du nord')
            return { rest: 'Fusionné dans le réseau SG : ne plus traiter comme entité distincte' }
          return {
            name,
            nature: r.get('NATURE'),
            // Treezor : en cours de cession à Shares (décision CEO) → entité sortie.
            status: norm(name) === 'treezor' ? 'exited' : 'active',
            note,
          }
        },
      },
    },
    {
      sheet: 'DECIDEURS',
      people: {
        role: 'decision_maker',
        mode: 'merge',
        also: {},
        map: (r, f): PersonDraft | { rest: string } => {
          // « Rôle type non nominatif » (12 lignes, « aucun nom inventé ») : un rôle à rencontrer, pas une personne.
          if (r.get('NATURE') === 'Rôle type non nominatif')
            return { rest: 'Rôle type non nominatif : pas une personne' }
          // La colonne LINKEDIN de cet onglet porte la page institutionnelle d'où vient la fonction, pas un profil :
          // elle reste dans la section, pas dans `linkedin`.
          return {
            name: f.name(r.get('NOM OU RÔLE')),
            function: r.get('FONCTION'),
            hook: r.get('RÔLE POTENTIEL'),
            reliability: r.get('FIABILITÉ'),
          }
        },
      },
    },
    {
      sheet: 'CONTACTS',
      people: {
        role: 'contact',
        mode: 'add',
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('FONCTION'),
          department: r.get('CODE SI'),
          email: f.email(r.get('E-MAIL'), r.get('E-MAIL PRO')),
          phone: f.phone(r.get('TÉLÉPHONE'), 'TÉLÉPHONE'),
          mobile: f.phone(r.get('MOBILE'), 'MOBILE'),
          linkedin: f.link(r, 'LINKEDIN'),
          reliability: r.get('FIABILITÉ'),
        }),
      },
    },
    esnSheet(),
    plainSheet('TECHNOS A VENDRE'),
    plainSheet('BESOINS ET TENDANCES SG'),
    plainSheet('BESOINS OBSERVES SG'),
    plainSheet('SIGNAUX TERRAIN'),
    plainSheet('METIERS EXTERNALISES'),
    {
      sheet: 'PRIX SG',
      prices: {
        map: (r, f): PriceDraft => {
          const label = r.get('RÉFÉRENCE') as string
          const price = r.get('PRIX') as string
          return {
            label,
            amount_eur_per_day: eurPerDay(price),
            // Une référence de secteur ou de métier est `sector_reference` ; le prix observé chez SG est direct.
            channel: SG_PRICE_CHANNEL[label] ?? 'sector_reference',
            note: f.join(' — ', price, r.get('BASE'), r.get('LECTURE')),
          }
        },
      },
    },
    plainSheet('PROJETS 2026-2029'),
    plainSheet('PLAN D ACTION'),
    externalsSheet('EXTERNES EN POSTE'),
    guardrailsSheet(),
  ],
}

// ───────────────────────── TOTALENERGIES ─────────────────────────

const totalenergies: AccountPlan = {
  slug: 'totalenergies',
  name: 'TotalEnergies',
  titlePrefix: 'TOTALENERGIES',
  source: 'TOTALENERGIES_ONESIDE_BRIEF.xlsx',
  headquarters: { champ: 'Siège', label: 'La Défense', city: 'Courbevoie' },
  exitedAliases: { aliases: [], nature: '', note: '' },
  rewrites: OWN_PERFORMANCE_REWRITES.totalenergies,
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    { sheet: 'FICHE COMPTE', fiche: true },
    plainSheet('ACHATS AVANT D APPELER'),
    {
      sheet: 'SITES INDUSTRIELS',
      sites: {
        map: (r, f): SiteDraft => ({
          name: r.get('SITE') as string,
          city: cityOf(r.get('LOCALISATION') as string),
          // la ligne « Siège La Défense » (STATUT = SIÈGE) est le siège ; les autres sont des sites industriels
          kind: r.get('STATUT') === 'SIÈGE' ? 'headquarters' : 'industrial',
          why: f.join(' — ', r.get('ACTIVITÉ'), r.get('STATUT'), r.get('CE QUE JE SAIS'), r.get('POURQUOI Y ALLER')),
        }),
      },
    },
    {
      sheet: 'ORGANISATION METIER',
      people: {
        // « ORGANISATION MÉTIER — QUI DÉCIDE » : fonctions de direction des branches.
        role: 'decision_maker',
        mode: 'add',
        also: {},
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('FONCTION'),
          department: r.get('BRANCHE'),
          hook: r.get('LECTURE'),
        }),
      },
    },
    {
      sheet: 'DECIDEURS ET ROLES',
      people: namedDecisionMakers(['Organigramme de branche', 'Personne nommée'], 'merge'),
    },
    plainSheet('PROGRAMMES'),
    {
      sheet: 'PRESTATAIRES',
      esn: {
        map: (r, f): EsnDraft => {
          const presence = r.get('PRÉSENCE') as string
          return {
            name: r.get('PRESTATAIRE') as string,
            // Niveau dérivé de PRÉSENCE (le classeur n'a pas de colonne FIABILITÉ ici) :
            //  intervention documentée → observed ; « relation publique, pas panel ESN » et tout code inconnu → hint.
            evidence_level: presence === 'INTERVENTION_PROJET_HISTORIQUE_DOCUMENTEE' ? 'observed' : 'hint',
            proof: f.join(' — ', r.get('CE QUE JE SAIS'), presence) as string,
            perimeter: f.join(' — ', r.get('CATÉGORIE'), r.get('LIMITE'), r.get('LECTURE')),
          }
        },
      },
    },
    plainSheet('COMPETENCES A VENDRE'),
    plainSheet('HYPOTHESES'),
    plainSheet('BESOINS ET TENDANCES'),
    plainSheet('PLAN D ACTION'),
    {
      sheet: 'CONTACTS METIER',
      people: {
        role: 'contact',
        mode: 'add',
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('POSTE'),
          entity: r.get('ENTITÉ'),
          department: r.get('FAMILLE'),
          city: r.get('VILLE'),
          email: f.email(r.get('E-MAIL')),
          mobile: f.phone(r.get('MOBILE'), 'MOBILE'),
          linkedin: f.link(r, 'LINKEDIN'),
        }),
      },
    },
    externalsSheet('EXTERNES METIER'),
    guardrailsSheet(),
  ],
}

// ───────────────────────────── ALSTOM ─────────────────────────────

const alstom: AccountPlan = {
  slug: 'alstom',
  name: 'Alstom',
  titlePrefix: 'ALSTOM',
  source: 'ALSTOM_ONESIDE_BRIEF.xlsx',
  headquarters: { champ: 'Siège', label: 'Saint-Ouen-sur-Seine', city: 'Saint-Ouen-sur-Seine' },
  exitedAliases: { aliases: [], nature: '', note: '' },
  rewrites: OWN_PERFORMANCE_REWRITES.alstom,
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    { sheet: 'FICHE COMPTE', fiche: true },
    plainSheet('ACHATS AVANT D APPELER'),
    {
      sheet: 'SITES INDUSTRIELS',
      sites: {
        map: (r, f): SiteDraft => {
          const isHeadquarters = r.get('STATUT') === 'SIÈGE'
          const name = r.get('SITE') as string
          return {
            name,
            // La fiche compte donne « Saint-Ouen-sur-Seine (93) » ; la ligne du site porte « Saint-Ouen (93) ».
            city: isHeadquarters ? 'Saint-Ouen-sur-Seine' : cityOf(r.get('LOCALISATION') as string),
            kind: isHeadquarters ? 'headquarters' : 'industrial',
            why: f.join(' — ', r.get('ACTIVITÉ'), r.get('STATUT'), r.get('CE QUE JE SAIS'), r.get('POURQUOI Y ALLER')),
          }
        },
      },
    },
    plainSheet('POSTES OUVERTS'),
    { sheet: 'DECIDEURS ET ROLES', people: namedDecisionMakers(['Personne nommée'], 'add') },
    plainSheet('PROGRAMMES'),
    plainSheet('COMPETENCES A VENDRE'),
    plainSheet('HYPOTHESES'),
    plainSheet('BESOINS ET TENDANCES'),
    plainSheet('PLAN D ACTION'),
    externalsSheet('EXTERNES METIER'),
    {
      sheet: 'ANCIENS DU COMPTE',
      people: {
        role: 'alumni',
        mode: 'add',
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('POSTE ACTUEL'),
          entity: r.get('EMPLOYEUR ACTUEL'),
          city: r.get('VILLE'),
          email: f.email(r.get('E-MAIL')),
          mobile: f.phone(r.get('MOBILE'), 'MOBILE'),
          linkedin: f.link(r, 'LINKEDIN'),
          hook: (chez => (chez ? `Poste chez Alstom : ${chez}` : undefined))(r.get('POSTE CHEZ ALSTOM')),
        }),
      },
    },
    guardrailsSheet(),
  ],
  // Reichshoffen : site cédé (décision CEO) → entité sortie, dérivée de la ligne du GARDE-FOUS.
  derivedEntities: (tables): EntityDraft[] => {
    const guard = tables.get('GARDE-FOUS')
    const row = guard?.rows.find(r => r.get('POINT') === 'Reichshoffen')
    const detail = row?.get("CE QU'IL FAUT SAVOIR")
    if (!detail)
      throw new Error('GARDE-FOUS Alstom : la ligne « Reichshoffen » a disparu, le périmètre sorti est à revoir')
    return [{ name: 'Reichshoffen', nature: 'Site cédé', status: 'exited', note: detail }]
  },
}

// ───────────── DÉMO ESN NANTES (05/10/2026) : Naval Group Indret, Chantiers de l'Atlantique ─────────────
// Cadrage hors IT (ingénierie, qualité, méthodes, essais, supply chain) : du CONTENU, rien à changer au contrat.
// « Habilitation défense », « compte vierge », « plateforme achats non trouvée » : des garde-fous, gardés tels quels.

/** Une ligne de la FICHE COMPTE par son champ ; échoue si elle a disparu (jamais une valeur devinée). */
const ficheRow = (tables: ReadonlyMap<string, Table>, champ: string): Row => {
  const row = tables.get('FICHE COMPTE')?.rows.find(r => norm(r.get('CHAMP')) === norm(champ))
  if (!row) throw new Error(`FICHE COMPTE : la ligne « ${champ} » a disparu`)
  return row
}

/** DECIDEURS ET ROLES (démo Nantes) : seules les « Personne nommée » sont des personnes ; les fonctions à rechercher restent dans la section. */
const namedDecisionMakersNantes = (): SheetPlan => ({
  sheet: 'DECIDEURS ET ROLES',
  people: {
    role: 'decision_maker',
    mode: 'add',
    also: {},
    map: (r, f): PersonDraft | { rest: string } => {
      const nature = r.get('NATURE') as string
      if (nature !== 'Personne nommée') return { rest: `${nature} : pas une personne` }
      return {
        name: f.name(r.get('NOM OU RÔLE')),
        function: r.get('FONCTION'),
        hook: r.get('RÔLE DANS LA DÉCISION'),
        reliability: r.get('FIABILITÉ'),
      }
    },
  },
})

const navalGroup: AccountPlan = {
  slug: 'naval-group',
  name: 'Naval Group',
  titlePrefix: 'NAVAL GROUP',
  source: 'NAVAL_GROUP_INDRET_BELLUM_BRIEF.xlsx',
  headquarters: { champ: 'Siège groupe', label: 'Paris', city: 'Paris' },
  exitedAliases: { aliases: [], nature: '', note: '' },
  rewrites: OWN_PERFORMANCE_REWRITES['naval-group'],
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    { sheet: 'FICHE COMPTE', fiche: true },
    plainSheet('PROGRAMMES'),
    plainSheet('COMPETENCES A VENDRE'),
    {
      sheet: 'PROFILS EN POSTE',
      people: {
        // La colonne EXTERNE (oui / non) dit si la personne est un prestataire chez Naval Group.
        role: (r): PersonRole => (r.get('EXTERNE') === 'oui' ? 'external' : 'contact'),
        mode: 'add',
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('POSTE'),
          entity: r.get('ENTITÉ'),
          department: r.get('FAMILLE'),
          city: r.get('VILLE'),
          email: f.email(r.get('E-MAIL')),
          mobile: f.phone(r.get('MOBILE'), 'MOBILE'),
          linkedin: f.link(r, 'LINKEDIN'),
        }),
      },
    },
    {
      sheet: 'ANCIENS',
      people: {
        role: 'alumni',
        mode: 'add',
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('POSTE ACTUEL'),
          entity: r.get('EMPLOYEUR ACTUEL'),
          city: r.get('VILLE'),
          email: f.email(r.get('E-MAIL')),
          linkedin: f.link(r, 'LINKEDIN'),
          hook: (chez => (chez ? `Poste chez Naval Group : ${chez}` : undefined))(r.get('POSTE CHEZ NAVAL GROUP')),
        }),
      },
    },
    namedDecisionMakersNantes(),
    plainSheet('PLAN D ACTION'),
    guardrailsSheet(),
  ],
  // Le classeur n'a pas d'onglet de sites : le site d'Indret (le compte de la démo) est lu dans la FICHE COMPTE.
  derivedSites: (tables): SiteDraft[] => {
    const site = ficheRow(tables, "Site d'Indret")
    const why = [site, ficheRow(tables, 'Effectif Indret'), ficheRow(tables, 'Capacité')]
      .map(r => r.get('VALEUR'))
      .filter((v): v is string => !!v)
      .join(' — ')
    return [
      {
        name: 'Naval Group — site de Nantes-Indret',
        city: cityOf((site.get('VALEUR') as string).split(' — ')[0]),
        kind: 'industrial',
        why,
        reliability: site.get('FIABILITÉ'),
      },
    ]
  },
}

const chantiersAtlantique: AccountPlan = {
  slug: 'chantiers-atlantique',
  name: "Chantiers de l'Atlantique",
  titlePrefix: "CHANTIERS DE L'ATLANTIQUE",
  source: 'CHANTIERS_ATLANTIQUE_BELLUM_BRIEF.xlsx',
  headquarters: { champ: 'Siège et site', label: 'Saint-Nazaire', city: 'Saint-Nazaire' },
  exitedAliases: { aliases: [], nature: '', note: '' },
  rewrites: OWN_PERFORMANCE_REWRITES['chantiers-atlantique'],
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    { sheet: 'FICHE COMPTE', fiche: true },
    plainSheet('PROGRAMMES'),
    plainSheet('COMPETENCES A VENDRE'),
    // 3 personnes nommées ; les 5 « fonctions à rechercher » restent dans la section (titulaire à identifier).
    namedDecisionMakersNantes(),
    plainSheet('PLAN D ACTION'),
    guardrailsSheet(),
  ],
}

// ═══════════════ DÉMO CLIENTS (04/10/2026) : QuickSort (mardi 06/10) et Meedz (mercredi 07/10) ═══════════════
//
// Cinq briefs écrits pour des démos RÉELLES : BNP Paribas, Bpifrance, Sanofi (deux classeurs fusionnés), ADEO - Leroy
// Merlin, Kiabi. Classeurs dans `agent_docs/sources/briefs-comptes-2026-10-04/` (hors dépôt). Décisions tranchées :
// tous les onglets sont mappés, coordonnées en clair, noms des ESN prospects neutralisés (text-rules.ts), aucune donnée
// de NOTRE performance commerciale, jamais un prix moyenné ni un canal deviné.

const DEMO_CLIENTS_SOURCE_DIR = 'briefs-comptes-2026-10-04'

/** « 435 € (n=18) » → 435 ; « — » ou vide → null ; tout autre format échoue (jamais un prix deviné). */
const gridAmount = (text: string | undefined): number | null => {
  if (!text || text.trim() === '—') return null
  const match = /^\s*(\d[\d\s]*)\s*€/.exec(text)
  if (!match) throw new Error(`prix de grille illisible : « ${text} »`)
  const value = Number(match[1].replace(/\s/g, ''))
  if (!(value > 0)) throw new Error(`prix de grille nul : « ${text} »`)
  return value
}

/** Prescripteurs nommés (BNP, Bpifrance) : un manager qui a exprimé des besoins est une PERSONNE (manager) + l'onglet entier en section. */
const prescribersSheet = (sheet: string): SheetPlan => ({
  sheet,
  people: {
    role: 'manager',
    mode: 'merge',
    also: {},
    map: (r, f, t): PersonDraft => {
      const domains = t.headers.includes('DOMAINES') ? r.get('DOMAINES') : undefined
      return {
        name: f.name(r.get('PRESCRIPTEUR')),
        entity: r.get('ENTITÉ'),
        department: domains,
        hook: f.join(
          ' — ',
          `Besoins exprimés : ${r.get('BESOINS EXPRIMÉS') ?? '—'}`,
          r.get("CE QU'IL A CHERCHÉ") ? `A cherché : ${r.get("CE QU'IL A CHERCHÉ")}` : undefined,
          r.get('LECTURE'),
        ),
      }
    },
  },
})

/** DECIDEURS (NOM ; FONCTION ; RÔLE ; …) : décideurs nommés + l'onglet entier en section (PRIORITÉ, NATURE, PÉRIMÈTRE y restent). */
const decisionMakersSheet = (role: PeoplePlan['role'] = 'decision_maker'): SheetPlan => ({
  sheet: 'DECIDEURS',
  people: {
    role,
    mode: 'merge',
    also: {},
    map: (r, f, t): PersonDraft => ({
      name: f.name(r.get('NOM')),
      function: r.get('FONCTION'),
      department: t.headers.includes('PÉRIMÈTRE') ? r.get('PÉRIMÈTRE') : undefined,
      hook: r.get('RÔLE'),
      linkedin: t.headers.includes('LINKEDIN') ? f.link(r, 'LINKEDIN') : undefined,
      reliability: r.get('FIABILITÉ'),
    }),
  },
})

/** ANCIENS : un ancien du compte (alumni) — poste actuel, employeur actuel, ce qu'il faisait chez le compte. */
const alumniSheet = (
  sheet: string,
  chezHeader: string,
  chezLabel: string,
  extra?: (r: Row, f: Fields) => Partial<PersonDraft>,
): SheetPlan => ({
  sheet,
  people: {
    role: 'alumni',
    mode: 'add',
    also: {},
    map: (r, f, t): PersonDraft => ({
      name: f.name(r.get('NOM')),
      function: r.get('POSTE ACTUEL'),
      entity: r.get('EMPLOYEUR ACTUEL'),
      city: r.get('VILLE'),
      email: f.email(r.get('E-MAIL')),
      mobile: t.headers.includes('MOBILE') ? f.phone(r.get('MOBILE'), 'MOBILE') : undefined,
      linkedin: f.link(r, 'LINKEDIN'),
      hook: ((chez: string | undefined) => (chez ? `${chezLabel} : ${chez}` : undefined))(r.get(chezHeader)),
      ...extra?.(r, f),
    }),
  },
})

/** EXTERNE oui/non d'un onglet de profils en poste → rôle `external` ou `contact`. */
const externalFlag = (r: Row): PersonRole => (norm(r.get('EXTERNE')) === 'oui' ? 'external' : 'contact')

/** Profils en poste (Bpifrance, Kiabi) : externes (EXTERNE = oui) ou salariés ; la STRUCTURE du prestataire et les technos vont au hook. */
const profilesSheet = (sheet: string, mode: PeoplePlan['mode'], withEntity: boolean): SheetPlan => ({
  sheet,
  people: {
    role: externalFlag,
    mode,
    also: {},
    map: (r, f, t): PersonDraft => {
      const structure = r.get('STRUCTURE')
      const technos = r.get('TECHNOS')
      return {
        name: f.name(r.get('NOM')),
        function: r.get('POSTE'),
        entity: withEntity ? r.get('ENTITÉ') : undefined,
        department: r.get('FAMILLE'),
        city: r.get('VILLE'),
        email: f.email(r.get('E-MAIL')),
        mobile: t.headers.includes('MOBILE') ? f.phone(r.get('MOBILE'), 'MOBILE') : undefined,
        linkedin: f.link(r, 'LINKEDIN'),
        hook: f.join(
          ' — ',
          structure ? `Structure : ${structure}` : undefined,
          technos ? `Technos : ${technos}` : undefined,
        ),
      }
    },
  },
})

/** Externes en poste avec STRUCTURE (ADEO) : comme `externalsSheet`, plus la structure du prestataire. */
const externalsWithStructureSheet = (sheet: string): SheetPlan => ({
  sheet,
  people: {
    role: 'external',
    mode: 'add',
    map: (r, f): PersonDraft => {
      const structure = r.get('STRUCTURE')
      const technos = r.get('TECHNOS')
      return {
        name: f.name(r.get('NOM')),
        function: r.get('POSTE'),
        entity: r.get('ENTITÉ'),
        department: r.get('FAMILLE'),
        city: r.get('VILLE'),
        email: f.email(r.get('E-MAIL')),
        mobile: f.phone(r.get('MOBILE'), 'MOBILE'),
        linkedin: f.link(r, 'LINKEDIN'),
        hook: f.join(
          ' — ',
          structure ? `Structure : ${structure}` : undefined,
          technos ? `Technos : ${technos}` : undefined,
        ),
      }
    },
  },
})

/**
 * Sites nommés par une ligne de la FICHE COMPTE (BNP, Bpifrance, ADEO : leurs classeurs n'ont pas d'onglet de sites) :
 * chaque phrase est VÉRIFIÉE dans la source, la conversion échoue si elle a changé — jamais un site deviné.
 */
const ficheSites = (champ: string, sites: readonly { phrase: string; site: SiteDraft }[]) => {
  return (tables: ReadonlyMap<string, Table>): SiteDraft[] => {
    const row = tables.get('FICHE COMPTE')?.rows.find(r => norm(r.get('CHAMP')) === norm(champ))
    const value = row?.get('VALEUR')
    if (!value) throw new Error(`FICHE COMPTE : ligne « ${champ} » absente, sites dérivés à revoir`)
    return sites.map(({ phrase, site }) => {
      if (!value.includes(phrase))
        throw new Error(`FICHE COMPTE « ${champ} » : « ${phrase} » a disparu de « ${value} »`)
      return site
    })
  }
}

// ───────────────────────────── BNP PARIBAS ─────────────────────────────

/** Statuts de preuve d'un prestataire de BNP qui ne sont qu'un indice (client nommé sans détail, preuve partielle, accord à revalider…). */
const BNP_HINT_STATUSES = /CLIENT_NOMME_SANS_DETAIL|PREUVE_PARTIELLE|ACCORD_ANNONCE|REFERENCE_PARTIELLE|TEMOIGNAGE/

const bnpEsn = (r: Row, f: Fields): EsnDraft | { rest: string } => {
  const name = r.get('PRESTATAIRE') as string
  const status = r.get('STATUT')
  const known = r.get('CE QUE JE SAIS')
  const limit = r.get('LIMITE')
  const reading = r.get('LECTURE')
  // Ageas, BPCE, Société Générale, Crédit Mutuel, Holmarcom : la LECTURE du classeur dit « Ne vaut ni panel ni sous-traitance ».
  if (/^Ne vaut ni panel/.test(reading ?? ''))
    return { rest: 'Partenaire tiers (ne vaut ni panel ni sous-traitance) : pas une ESN' }
  // France uniquement (décision CEO) : Belgique (Fortis), Italie (BNL), Luxembourg (BGL), Pologne.
  if (/Belgium|Luxembourg|Italie|Polska/.test(name) || /Fortis|\bBNL\b|Polska/.test(known ?? ''))
    return { rest: 'Hors France : Belgique, Italie, Luxembourg ou Pologne' }
  return {
    name,
    // Le classeur n'a pas de colonne FIABILITÉ ici : niveau dérivé du STATUT de preuve — jamais « confirmé ».
    evidence_level: BNP_HINT_STATUSES.test(status ?? '') ? 'hint' : 'observed',
    proof: f.join(' — ', known, status) as string,
    perimeter: f.join(' — ', limit, reading),
  }
}

const bnpParibas: AccountPlan = {
  slug: 'bnp-paribas',
  name: 'BNP Paribas',
  titlePrefix: 'BNP PARIBAS',
  source: 'BNP_PARIBAS_QUICKSORT_BELLUM_BRIEF.xlsx',
  sourceDir: DEMO_CLIENTS_SOURCE_DIR,
  headquarters: {
    champ: 'Siège',
    label: '16 boulevard des Italiens',
    city: 'Paris',
    address: '16 boulevard des Italiens, Paris 9e',
  },
  exitedAliases: { aliases: [], nature: '', note: '' },
  rewrites: [],
  // « Hubs internes : Montreuil (IT Group), Lisbonne et Porto, Nanjing, CubeHouse Amsterdam » : seul Montreuil est en France.
  derivedSites: ficheSites('Hubs internes', [
    {
      phrase: 'Montreuil (IT Group)',
      site: {
        name: 'Montreuil — IT Group',
        city: 'Montreuil',
        kind: 'secondary',
        why: 'Hub interne de BNP Paribas (fiche compte) ; c’est là que sont situés la plupart des besoins observés (IT Group et banque de grande clientèle).',
      },
    },
  ]),
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    { sheet: 'FICHE COMPTE', fiche: true },
    plainSheet('ACHATS AVANT D APPELER'),
    {
      sheet: 'BESOINS AVEC PRIX',
      section: {},
      prices: {
        // 13 besoins observés en sourcing direct : le canal est celui du classeur, jamais moyenné avec un autre.
        map: (r, f): PriceDraft | null => {
          const price = r.get('PRIX OBSERVÉ (€/J)')
          if (!price) return null
          const channelText = r.get('CANAL')
          if (!channelText?.startsWith('Sourcing direct'))
            throw new Error(`BESOINS AVEC PRIX ligne ${r.n} : canal « ${channelText ?? ''} » inconnu`)
          return {
            label: `${r.get('BESOIN')} (${r.get('SÉNIORITÉ')}, ${r.get('ANNÉE')})`,
            amount_eur_per_day: Number(price),
            channel: 'direct',
            note: f.join(
              ' — ',
              r.get('ENTITÉ'),
              r.get('SITE'),
              r.get('DURÉE'),
              r.get('PRÉSENCE'),
              r.get('PRESCRIPTEUR') ? `Prescripteur : ${r.get('PRESCRIPTEUR')}` : undefined,
            ),
          }
        },
      },
    },
    prescribersSheet('PRESCRIPTEURS CIB'),
    plainSheet('BESOINS EXPRIMES CIB'),
    plainSheet('DYNAMIQUE 2027+'),
    plainSheet('COMPETENCES A VENDRE'),
    decisionMakersSheet(),
    plainSheet('STRUCTURE'),
    {
      sheet: 'FILIALES ET ENTITES',
      entities: {
        // France uniquement (décision CEO) : les 346 entités hors France restent lisibles dans « non retenus » avec leur motif.
        map: (r, f): EntityDraft | { rest: string } => {
          if (norm(r.get('PAYS')) !== 'france')
            return { rest: `Hors France : ${r.get('PAYS') ?? 'pays non renseigné'}` }
          const parent = r.get('SOCIÉTÉ MÈRE')
          if (parent === 'NON_ETABLIE' || parent === 'SANS_OBJET_SUCCURSALE_RATTACHEE')
            f.skip('SOCIÉTÉ MÈRE : code technique du classeur (NON_ETABLIE, SANS_OBJET_SUCCURSALE_RATTACHEE), écarté')
          const stake = r.get('DÉTENTION')
          const votes = r.get('DROITS DE VOTE')
          return {
            name: r.get('ENTITÉ') as string,
            nature: r.get('PÔLE'),
            // « Sortie » est une MÉTHODE DE CONSOLIDATION du classeur (l'entité a quitté le périmètre de consolidation),
            // pas une sortie du groupe : AXA IM, par exemple, est en cours d'intégration. Le statut reste `active`.
            status: 'active',
            note: f.join(
              ' — ',
              stake || votes ? `Détention ${stake ?? '—'} % · droits de vote ${votes ?? '—'} %` : undefined,
              r.get('MÉTHODE') ? `Méthode de consolidation : ${r.get('MÉTHODE')}` : undefined,
              parent && parent !== 'NON_ETABLIE' && parent !== 'SANS_OBJET_SUCCURSALE_RATTACHEE'
                ? `Société mère : ${parent}`
                : undefined,
              r.get('LECTURE'),
            ),
          }
        },
      },
    },
    { sheet: 'PRESTATAIRES EN PLACE', section: {}, esn: { map: (r, f) => bnpEsn(r, f) } },
    externalsSheet('EXTERNES EN POSTE'),
    alumniSheet('ANCIENS DE BNP', 'POSTE CHEZ BNP', 'Poste chez BNP'),
    {
      sheet: 'CONTACTS',
      people: {
        role: 'contact',
        mode: 'add',
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('FONCTION'),
          entity: r.get('ENTITÉ'),
          email: f.email(r.get('E-MAIL')),
          phone: f.phone(r.get('TÉLÉPHONE'), 'TÉLÉPHONE'),
          mobile: f.phone(r.get('MOBILE'), 'MOBILE'),
          linkedin: f.link(r, 'LINKEDIN'),
        }),
      },
    },
    plainSheet('HYPOTHESES'),
    plainSheet('ACCROCHES'),
    plainSheet('PLAN D ACTION'),
    guardrailsSheet(),
  ],
}

// ───────────────────────────── BPIFRANCE ─────────────────────────────

const bpifrance: AccountPlan = {
  slug: 'bpifrance',
  name: 'Bpifrance',
  titlePrefix: 'BPIFRANCE',
  source: 'BPIFRANCE_QUICKSORT_BELLUM_BRIEF.xlsx',
  sourceDir: DEMO_CLIENTS_SOURCE_DIR,
  headquarters: {
    champ: 'Siège',
    label: '27-31 avenue du Général Leclerc',
    city: 'Maisons-Alfort',
    address: '27-31 avenue du Général Leclerc, Maisons-Alfort',
  },
  exitedAliases: { aliases: [], nature: '', note: '' },
  rewrites: [],
  // « 27-31 avenue du Général Leclerc, Maisons-Alfort ; bureaux 6-8 boulevard Haussmann, Paris » (fiche compte).
  derivedSites: ficheSites('Siège', [
    {
      phrase: 'bureaux 6-8 boulevard Haussmann, Paris',
      site: {
        name: 'Bureaux boulevard Haussmann',
        city: 'Paris',
        kind: 'secondary',
        why: '6-8 boulevard Haussmann, 75009 Paris : bureaux parisiens de Bpifrance (fiche compte).',
      },
    },
  ]),
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    { sheet: 'FICHE COMPTE', fiche: true },
    plainSheet('ACHATS AVANT D APPELER'),
    prescribersSheet('PRESCRIPTEURS'),
    plainSheet('BESOINS OBSERVES'),
    decisionMakersSheet(),
    {
      sheet: 'FILIALES ET ENTITES',
      entities: {
        map: (r, f): EntityDraft => ({
          name: r.get('ENTITÉ') as string,
          nature: r.get('NATURE'),
          status: 'active',
          note: f.join(' — ', r.get('CE QUE JE SAIS'), r.get('LECTURE')),
        }),
      },
    },
    plainSheet('DYNAMIQUE 2026-2030'),
    plainSheet('COMPETENCES A VENDRE'),
    profilesSheet('PROFILS EN POSTE', 'merge', true),
    alumniSheet('ANCIENS', 'POSTE CHEZ BPIFRANCE', 'Poste chez Bpifrance'),
    {
      sheet: 'CONTACTS',
      people: {
        // STATUT = Interne / Externe (« 13 adresses d'externes au format dédié aux prestataires ») ; les boîtes de
        // sourcing DSI (« Dsi Sourcing Lot ») sont des adresses fonctionnelles, pas des personnes : elles restent dans la section.
        role: r => (norm(r.get('STATUT')) === 'externe' ? 'external' : 'contact'),
        mode: 'add',
        also: {},
        map: (r, f): PersonDraft | { rest: string } => {
          if (r.get('BOÎTE DSI')) return { rest: 'Boîte de sourcing DSI : adresse fonctionnelle, pas une personne' }
          return {
            name: f.name(r.get('NOM')),
            email: f.email(r.get('E-MAIL')),
            phone: f.phone(r.get('TÉLÉPHONE'), 'TÉLÉPHONE'),
          }
        },
      },
    },
    plainSheet('ACCROCHES'),
    plainSheet('PLAN D ACTION'),
    guardrailsSheet(),
  ],
}

// ───────────────────────────── SANOFI (deux classeurs) ─────────────────────────────

const sanofi: AccountPlan = {
  slug: 'sanofi',
  name: 'Sanofi',
  titlePrefix: 'SANOFI',
  // Base : le classeur QuickSort (19 onglets, superset). Le classeur Lyon est un supplément (décision 4 du 04/10/2026).
  source: 'SANOFI_QUICKSORT_BELLUM_BRIEF.xlsx',
  sourceDir: DEMO_CLIENTS_SOURCE_DIR,
  supplements: [
    {
      source: 'SANOFI_LYON_BELLUM_BRIEF.xlsx',
      cockpit: { key: 'cockpit-lyon', title: 'COCKPIT — vue Lyon' },
      // Le plan d'action Lyon (7 lignes) ne recoupe aucune ligne du plan QuickSort (6 lignes) : section propre.
      sections: [{ sheet: 'PLAN D ACTION', key: 'plan-d-action-lyon', title: "PLAN D'ACTION — vue Lyon" }],
      // Les projets Lyon sont inclus dans ceux de QuickSort (48 communs sur 48) : on ajoute ce qui manquerait.
      missingRows: [{ sheet: 'PROJETS 2026-2027', into: 'projets-2026-2027' }],
      identical: {
        'LOGIQUE GROUPE': 'LOGIQUE GROUPE',
        'FICHE COMPTE': 'FICHE COMPTE',
        'ACHATS AVANT D APPELER': 'ACHATS AVANT D APPELER',
        'SITES UTILES': 'SITES UTILES',
        DECIDEURS: 'DECIDEURS',
        CONTACTS: 'CONTACTS',
        'BESOINS OBSERVES': 'BESOINS OBSERVES',
        'ESN PRESENTES': 'ESN PRESENTES',
        'ANCIENS DE SANOFI': 'ANCIENS DE SANOFI',
        'POSTES OUVERTS LYON': 'POSTES OUVERTS',
        ENTITES: 'ENTITES',
        'IT SI DATA': 'IT SI DATA',
        DOMAINES: 'DOMAINES',
        'GARDE-FOUS': 'GARDE-FOUS',
      },
    },
  ],
  headquarters: { champ: 'Siège', label: 'Paris', city: 'Paris' },
  // Opella (cédée à 50 % à CD&R) et EuroAPI (scindée) : « SORTIE » dans le classeur, « compte à part ».
  exitedAliases: {
    aliases: ['Opella', 'EuroAPI'],
    nature: 'Périmètre sorti du groupe',
    note: 'Compte à part : à traiter comme un compte distinct, pas Sanofi.',
  },
  rewrites: [],
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    plainSheet('LOGIQUE GROUPE'),
    { sheet: 'FICHE COMPTE', fiche: true },
    plainSheet('ACHATS AVANT D APPELER'),
    plainSheet('COMPETENCES A VENDRE'),
    plainSheet('PROJETS 2026-2027'),
    plainSheet('IT SI DATA'),
    decisionMakersSheet(),
    {
      sheet: 'ENTITES',
      entities: {
        map: (r, f): EntityDraft => ({
          name: r.get('ENTITÉ') as string,
          nature: r.get('NATURE'),
          status: norm(r.get('STATUT')) === 'sortie' ? 'exited' : 'active',
          note: f.join(' — ', r.get('STATUT') === 'PARTENARIAT' ? 'Partenariat' : undefined, r.get('LECTURE')),
        }),
      },
    },
    {
      sheet: 'SITES UTILES',
      section: {},
      sites: {
        map: (r, f): SiteDraft => ({
          name: r.get('SITE') as string,
          city: r.get('VILLE') as string,
          kind: r.get('TYPE') === 'Industriel' ? 'industrial' : 'secondary',
          why: f.join(
            ' — ',
            r.get('ACTIVITÉ'),
            r.get('BESOIN SI SOUS-JACENT'),
            r.get('RÉGION'),
            r.get('LYON') ? 'Site lyonnais' : undefined,
          ),
        }),
      },
    },
    {
      sheet: 'ESN PRESENTES',
      section: {},
      esn: {
        map: (r): EsnDraft | { rest: string } => {
          const reliability = r.get('FIABILITÉ') as string
          // « Panel ESN France — Garde-fou » : la ligne dit que le panel n'est PAS démontré, ce n'est pas une ESN.
          if (norm(reliability) === 'garde fou')
            return { rest: 'Garde-fou : le panel ESN n’est pas démontré, pas une ESN' }
          return {
            name: r.get('ACTEUR') as string,
            // « Déclaré » (intervention déclarée sur l'acquisition de talents, « un signal, pas une preuve de MSP ») = un indice.
            evidence_level: norm(reliability) === 'declare' ? 'hint' : esnLevel(reliability),
            proof: r.get('PREUVE') as string,
            perimeter: r.get('PÉRIMÈTRE'),
            reliability,
          }
        },
      },
    },
    plainSheet('BESOINS OBSERVES'),
    plainSheet('POSTES OUVERTS'),
    alumniSheet('ANCIENS DE SANOFI', "CE QU'IL A FAIT CHEZ SANOFI", 'Chez Sanofi', (r, f) => ({
      department: r.get('FAMILLE'),
      hook: f.join(
        ' — ',
        r.get("CE QU'IL A FAIT CHEZ SANOFI") ? `Chez Sanofi : ${r.get("CE QU'IL A FAIT CHEZ SANOFI")}` : undefined,
        r.get('TECHNOS') ? `Technos : ${r.get('TECHNOS')}` : undefined,
        r.get('LECTURE'),
      ),
    })),
    {
      sheet: 'CONTACTS',
      people: {
        role: r => (r.get('STATUT') === 'Prestataire ou indépendant déclaré' ? 'external' : 'contact'),
        mode: 'add',
        also: {},
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('FONCTION'),
          entity: r.get('ENTITÉ'),
          department: r.get('FAMILLE'),
          city: r.get('VILLE'),
          email: f.email(r.get('E-MAIL'), r.get('E-MAIL PRO')),
          mobile: f.phone(r.get('MOBILE'), 'MOBILE'),
          linkedin: f.link(r, 'LINKEDIN'),
          hook: r.get('TECHNOS') ? `Technos : ${r.get('TECHNOS')}` : undefined,
        }),
      },
    },
    plainSheet('DOMAINES'),
    plainSheet('ACCROCHES'),
    plainSheet('PLAN D ACTION'),
    guardrailsSheet(),
  ],
}

// ───────────────────────────── ADEO - LEROY MERLIN ─────────────────────────────

/** Une cellule de la grille métier × séniorité d'ADEO → un prix, sur le canal de la grille. */
const ADEO_TRANCHES: readonly { header: string; label: string }[] = [
  { header: 'JUNIOR (0-2)', label: 'junior (0-2 ans)' },
  { header: 'CONFIRMÉ (3-4)', label: 'confirmé (3-4 ans)' },
  { header: 'SENIOR (5-10)', label: 'senior (5-10 ans)' },
]

const adeo: AccountPlan = {
  slug: 'adeo-leroy-merlin',
  name: 'ADEO - Leroy Merlin',
  titlePrefix: 'ADEO',
  source: 'ADEO_LEROY_MERLIN_MEEDZ_BELLUM_BRIEF.xlsx',
  sourceDir: DEMO_CLIENTS_SOURCE_DIR,
  // « Ronchin (ADEO Services, siège), Lezennes (Leroy Merlin), Lille, Villeneuve-d'Ascq » (FICHE COMPTE, « Sites lillois »).
  headquarters: { champ: 'Sites lillois', label: 'ADEO Services', city: 'Ronchin' },
  exitedAliases: { aliases: [], nature: '', note: '' },
  rewrites: [],
  // « Ronchin (ADEO Services, siège), Lezennes (Leroy Merlin), Lille, Villeneuve-d'Ascq » (fiche compte, « Sites lillois »).
  derivedSites: ficheSites('Sites lillois', [
    {
      phrase: 'Lezennes (Leroy Merlin)',
      site: {
        name: 'Leroy Merlin — Lezennes',
        city: 'Lezennes',
        kind: 'secondary',
        why: 'Site lillois de Leroy Merlin (fiche compte).',
      },
    },
    {
      phrase: 'Lille',
      site: { name: 'ADEO — Lille', city: 'Lille', kind: 'secondary', why: 'Site lillois du groupe (fiche compte).' },
    },
    {
      phrase: 'Villeneuve-d',
      site: {
        name: 'ADEO — Villeneuve-d’Ascq',
        city: 'Villeneuve-d’Ascq',
        kind: 'secondary',
        why: 'Site lillois du groupe (fiche compte).',
      },
    },
  ]),
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    { sheet: 'FICHE COMPTE', fiche: true },
    plainSheet('ACHATS AVANT D APPELER'),
    {
      sheet: 'GRILLE DE PRIX ADEO',
      section: {},
      prices: {
        // Les besoins d'ADEO sont diffusés par le pôle achats dans le référencement dynamique OBMS (210 des 222, ACHATS) :
        // canal `framework` (panel / référencement), jamais mêlé à un autre canal. Médiane puis tranches de séniorité.
        map: (r): PriceDraft[] => {
          const trade = r.get('MÉTIER') as string
          const needs = r.get('BESOINS')
          const range = r.get('FOURCHETTE')
          const drafts: PriceDraft[] = []
          const median = r.get('PRIX MÉDIAN')
          if (median)
            drafts.push({
              label: `${trade} — médiane des besoins observés`,
              amount_eur_per_day: Number(median),
              channel: 'framework',
              note: `${needs ?? '?'} besoin(s) observé(s) 2021-2024${range ? ` ; fourchette ${range} €` : ''} ; référencement dynamique OBMS`,
            })
          for (const tranche of ADEO_TRANCHES) {
            const cell = r.get(tranche.header)
            const amount = gridAmount(cell)
            if (amount === null) continue
            drafts.push({
              label: `${trade} — ${tranche.label}`,
              amount_eur_per_day: amount,
              channel: 'framework',
              note: `${cell} ; référencement dynamique OBMS`,
            })
          }
          return drafts
        },
      },
    },
    plainSheet('BESOINS DETAILLES'),
    plainSheet('COMPETENCES A VENDRE'),
    plainSheet('PROJETS 2026-2035'),
    {
      sheet: 'DECIDEURS',
      people: {
        // « Manager acheteur » = prescripteur ayant exprimé des besoins ; les autres lignes sont des décideurs.
        role: r => (r.get('RÔLE') === 'Manager acheteur' ? 'manager' : 'decision_maker'),
        mode: 'merge',
        also: {},
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('FONCTION'),
          hook: r.get('RÔLE'),
          reliability: r.get('FIABILITÉ'),
        }),
      },
    },
    {
      sheet: 'ENSEIGNES ET ENTITES',
      entities: {
        map: (r, f): EntityDraft | { rest: string } => {
          const name = r.get('ENTITÉ') as string
          // GARDE-FOUS du classeur : « Bricocenter, Obramat, Obramax : enseignes étrangères, hors cible » ; France uniquement.
          if (norm(name) === 'bricocenter') return { rest: 'Hors France : enseigne italienne' }
          return {
            name,
            nature: r.get('NATURE'),
            status: 'active',
            note: f.join(' — ', r.get('LOCALISATION') === '—' ? undefined : r.get('LOCALISATION'), r.get('LECTURE')),
          }
        },
      },
    },
    externalsWithStructureSheet('EXTERNES EN POSTE'),
    alumniSheet('ANCIENS', 'POSTE CHEZ ADEO', 'Poste chez ADEO', (r, f) => ({
      hook: f.join(
        ' — ',
        r.get('POSTE CHEZ ADEO') ? `Poste chez ADEO : ${r.get('POSTE CHEZ ADEO')}` : undefined,
        r.get('ENTITÉ') ? `Entité : ${r.get('ENTITÉ')}` : undefined,
      ),
    })),
    {
      sheet: 'CONTACTS',
      people: {
        role: 'contact',
        mode: 'add',
        map: (r, f): PersonDraft => ({
          name: f.name(r.get('NOM')),
          function: r.get('FONCTION'),
          entity: r.get('ENTITÉ'),
          email: f.email(r.get('E-MAIL')),
          phone: f.phone(r.get('TÉLÉPHONE'), 'TÉLÉPHONE'),
        }),
      },
    },
    plainSheet('ACCROCHES'),
    plainSheet('PLAN D ACTION'),
    guardrailsSheet(),
  ],
}

// ───────────────────────────── KIABI ─────────────────────────────

const kiabi: AccountPlan = {
  slug: 'kiabi',
  name: 'Kiabi',
  titlePrefix: 'KIABI',
  source: 'KIABI_MEEDZ_BELLUM_BRIEF.xlsx',
  sourceDir: DEMO_CLIENTS_SOURCE_DIR,
  headquarters: {
    champ: 'Siège',
    label: 'Kiabi Village',
    city: 'Lezennes',
    address: '4A rue du Moulin de Lezennes, 59260 Lezennes',
  },
  exitedAliases: { aliases: [], nature: '', note: '' },
  rewrites: [],
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    { sheet: 'FICHE COMPTE', fiche: true },
    plainSheet('ACHATS AVANT D APPELER'),
    plainSheet('DIGITAL ET DATA'),
    plainSheet('COMPETENCES A VENDRE'),
    plainSheet('PROJETS 2026-2036'),
    decisionMakersSheet(),
    profilesSheet('PROFILS EN POSTE', 'add', false),
    alumniSheet('ANCIENS', 'POSTE CHEZ KIABI', 'Poste chez Kiabi'),
    plainSheet('ACCROCHES'),
    plainSheet('PLAN D ACTION'),
    guardrailsSheet(),
  ],
}

// ───────────────────────────── ABB SUISSE ─────────────────────────────

// Démo Alpineo (08/10/2026) — périmètre « suisse » (décision Louis 04/10/2026, D4) : sites et entités en CH, jamais mêlés
// à la France. Aucun prix : le classeur dit lui-même qu'aucune grille ABB n'est publique (TJM, panel, budget) — rien en
// `prices`, jamais une conversion CHF ⇄ €. Les acteurs de ESN ET PARTENAIRES SUISSE sont des acteurs du MARCHÉ suisse, pas
// des ESN prouvées chez ABB : section seulement, jamais `esn` (« on n'affiche pas ce qu'on n'a pas »).

/** Les trois règles du marché suisse que le classeur place en tête de ses pièges (location de services, partenaire ≠ fournisseur, qualification). */
const ABB_RULES_AS_GUARDRAILS: readonly string[] = [
  'location de services depuis l etranger interdite',
  'partenaire de vente fournisseur de prestations',
  'qualifier la prestation reelle avant le contrat',
]

const abbTarget = (r: Row, f: Fields, t: Table): PersonDraft => ({
  name: f.name(r.get('NOM')),
  function: r.get('FONCTION'),
  department: r.get('PÉRIMÈTRE DÉCLARÉ'),
  city: r.get('LOCALITÉ'),
  linkedin: f.link(r, 'LINKEDIN'),
  hook: f.join(' — ', r.get('RÔLE'), r.get('POURQUOI'), t.headers.includes('LECTURE') ? r.get('LECTURE') : undefined),
})

const abbRole = (r: Row): PersonRole =>
  /^(SPONSOR|ARBITRAGE|DIRECTION|RESPONSABLE_PROGRAMME)/.test(r.get('RÔLE') ?? '') ? 'decision_maker' : 'contact'

const abbSuisse: AccountPlan = {
  slug: 'abb-suisse',
  scope: 'suisse',
  name: 'ABB Suisse',
  titlePrefix: 'ABB SUISSE',
  source: 'ABB_SUISSE_BELLUM_BRIEF.xlsx',
  sourceDir: DEMO_CLIENTS_SOURCE_DIR,
  headquarters: { champ: 'Siège', label: 'Zurich', city: 'Zurich' },
  exitedAliases: { aliases: [], nature: '', note: '' },
  rewrites: OWN_PERFORMANCE_REWRITES['abb-suisse'],
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    plainSheet('POSTES OUVERTS SUISSE'),
    plainSheet('ESN ET PARTENAIRES SUISSE'),
    { sheet: 'FICHE COMPTE', fiche: true },
    {
      sheet: 'REGLES SUISSE',
      section: {},
      guardrailRows: {
        map: r => {
          const rule = r.get('RÈGLE') as string
          if (!ABB_RULES_AS_GUARDRAILS.includes(norm(rule))) return null
          return {
            point: `Règle suisse — ${rule}`,
            detail: [r.get('CE QUE JE SAIS'), r.get('CE QUE TU DOIS AVOIR EN TÊTE')].filter(Boolean).join(' '),
          }
        },
      },
    },
    plainSheet('ACHATS AVANT D APPELER'),
    // Aucune autorité budgétaire établie (note du classeur) : des cibles de qualification. Le rôle suit la colonne RÔLE du
    // classeur, qui ne parle qu'au POTENTIEL (SPONSOR_OPERATIONNEL_POTENTIEL, ARBITRAGE_FINANCIER_POTENTIEL, RESPONSABLE_PROGRAMME…) :
    // ces fonctions sont `decision_maker` comme le « rôle potentiel » des DECIDEURS BPCE, et la valeur d'origine voyage
    // telle quelle dans `hook` — jamais présentée comme une autorité confirmée (garde-fou « Aucune autorité budgétaire confirmée »).
    { sheet: 'CIBLES P1', people: { role: abbRole, mode: 'add', also: {}, map: abbTarget } },
    { sheet: 'CIBLES P2', people: { role: abbRole, mode: 'merge', also: {}, map: abbTarget } },
    plainSheet('STRUCTURE'),
    {
      sheet: 'SITES SUISSES',
      sites: {
        map: (r, f): SiteDraft | { rest: string } => {
          const name = r.get('SITE') as string
          const city = r.get('VILLE')
          if (!city) return { rest: 'Futur siège annoncé : pas encore un site' }
          if (norm(city) === 'hors suisse') return { rest: 'Hors Suisse : cité comme concurrent interne' }
          return {
            name,
            city,
            kind: /siège actuel/i.test(name) ? 'headquarters' : /^Turgi/.test(name) ? 'industrial' : 'secondary',
            why: f.join(' — ', r.get('CE QUE JE SAIS'), r.get('LECTURE')),
          }
        },
      },
    },
    plainSheet('IT SI DATA'),
    plainSheet('DOMAINES'),
    {
      sheet: 'ENTITES',
      entities: {
        map: (r, f): EntityDraft | { rest: string } => {
          const country = r.get('PAYS')
          if (!country) return { rest: 'Opération annoncée : pas une entité' }
          if (norm(country) !== 'suisse') return { rest: `Hors Suisse : ${country}` }
          return {
            name: r.get('ENTITÉ') as string,
            nature: r.get('NATURE'),
            status: 'active',
            country: 'CH',
            note: f.join(' — ', r.get('CE QUE JE SAIS'), r.get('LIMITE')),
            reliability: r.get('FIABILITÉ'),
          }
        },
      },
    },
    plainSheet('PLAN D ACTION'),
    guardrailsSheet(),
  ],
}

export const ACCOUNT_PLANS: readonly AccountPlan[] = [
  engie,
  bpce,
  societeGenerale,
  totalenergies,
  alstom,
  navalGroup,
  chantiersAtlantique,
  bnpParibas,
  bpifrance,
  sanofi,
  adeo,
  kiabi,
  abbSuisse,
]
