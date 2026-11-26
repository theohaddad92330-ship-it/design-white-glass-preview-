import {
  DEDUP_KEYS,
  type DryRunReport,
  type ImportMapping,
  type ImportObject,
  type ImportRowError,
  type NormalisationRule,
  type SkipReason,
} from './import.js'

/**
 * Le moteur d'import — pur, sans réseau, sans base.
 *
 * Tout ce qui décide de ce qui sera écrit vit ici, et rien de ce qui écrit. La
 * raison est celle du PDF 7 §7.1 : « 67 % découvrent les problèmes de qualité en
 * cours de route ». Un moteur qui parle à la base pendant qu'il décide ne peut
 * pas être simulé honnêtement — et une simulation qui ne rejoue pas exactement
 * ce que fera l'import ne prouve rien.
 */

/* ------------------------------------------------------------------ */
/*  Normalisation (§7.4)                                              */
/* ------------------------------------------------------------------ */

/**
 * Un numéro au format international, ou `null`.
 *
 * `null` et non la valeur d'origine : une chaîne qui ne ressemble pas à un
 * numéro n'en devient pas un parce qu'on l'a recopiée. Le format français
 * (`06…`, `+33…`, avec espaces, points ou tirets) est traité ; le reste passe
 * si et seulement s'il porte déjà un indicatif.
 */
export function normalisePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s.\-()/]/g, '')
  if (!cleaned) return null
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned
  if (/^00[1-9]\d{7,14}$/.test(cleaned)) return `+${cleaned.slice(2)}`
  // Numéro national français : 10 chiffres commençant par 0.
  if (/^0[1-9]\d{8}$/.test(cleaned)) return `+33${cleaned.slice(1)}`
  return null
}

/** Une adresse en minuscules, ou `null` si ce n'en est pas une. */
export function normaliseEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  // Volontairement simple : la validation d'e-mail exhaustive n'existe pas, et
  // une expression trop stricte rejette des adresses valides. Ce qu'on refuse
  // ici, ce sont les colonnes qui ne contiennent visiblement pas une adresse.
  if (!/^[^\s@,;]+@[^\s@,;.]+\.[^\s@,;]{2,}$/.test(value)) return null
  return value
}

/**
 * Une date ISO (`AAAA-MM-JJ`), ou `null`.
 *
 * Le piège que ce code évite : `01/02/2026` est le 1er février en France et le
 * 2 janvier aux États-Unis. On refuse donc de trancher quand les deux lectures
 * sont possibles — sauf si le jour dépasse 12, auquel cas il n'y a plus
 * d'ambiguïté. Une date mal lue ne se voit qu'à la relance, trois semaines plus
 * tard, chez un client.
 */
export function normaliseDate(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const slashed = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(value)
  if (slashed) {
    const first = Number(slashed[1])
    const second = Number(slashed[2])
    // Ambigu ET plausible dans les deux sens : on ne devine pas.
    if (first <= 12 && second <= 12 && first !== second) return null
    const day = first > 12 ? first : second
    const month = first > 12 ? second : first
    if (day > 31 || month > 12 || month < 1 || day < 1) return null
    return `${slashed[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return null
}

/**
 * Un montant en CENTIMES, ou `null`.
 *
 * Les centimes, jamais les flottants : un montant qui traverse deux conversions
 * affiche 1 999,99 € là où la facture dit 2 000 €. Le séparateur français
 * (virgule) et l'espace insécable des milliers sont traités — ce sont les deux
 * formes qu'un export Excel FR produit.
 */
export function normaliseAmountCents(raw: string): number | null {
  const cleaned = raw.replace(/[\s\u00a0\u202f\u20ac]/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null
  return Math.round(Number(cleaned) * 100)
}

/** Le domaine d'un site ou d'une adresse, sans `www.`, ou `null`. */
export function normaliseDomain(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  if (!value) return null
  const fromEmail = value.includes('@') ? value.split('@').pop() : null
  const host = (fromEmail ?? value)
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
  if (!host || !host.includes('.')) return null
  return host
}

/** La forme juridique retirée d'une raison sociale — « ACME SAS » → « acme ». */
export function normaliseCompanyName(raw: string): string {
  return (
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // Les points partent AVANT la reconnaissance des formes : un export
      // comptable écrit « S.A.S. » là où l'export commercial écrit « SAS », et
      // les traiter différemment ferait de deux lignes de la même société deux
      // sociétés — le doublon le plus courant d'une reprise de base.
      .replace(/\./g, '')
      .replace(/\b(sas|sasu|sarl|eurl|sa|snc|sci|gie|scop|selarl|inc|ltd|llc|gmbh|bv|nv|ab|oy)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  )
}

/** Applique les règles ACTIVES à une valeur. Une règle éteinte laisse la valeur telle quelle. */
export function applyNormalisation(
  field: string,
  raw: string,
  disabled: readonly NormalisationRule[],
): { value: string | number | null; rule: NormalisationRule | null } {
  const off = (rule: NormalisationRule) => disabled.includes(rule)
  if (/mail/i.test(field) && !off('email_lowercase')) return { value: normaliseEmail(raw), rule: 'email_lowercase' }
  if (/phone|tel/i.test(field) && !off('phone_international')) {
    return { value: normalisePhone(raw), rule: 'phone_international' }
  }
  if (/date|debut|fin|start|end/i.test(field) && !off('date_iso'))
    return { value: normaliseDate(raw), rule: 'date_iso' }
  if (/amount|montant|tjm|rate|price/i.test(field) && !off('amount_cents')) {
    return { value: normaliseAmountCents(raw), rule: 'amount_cents' }
  }
  if (/website|site|url|domain/i.test(field) && !off('domain_from_website')) {
    return { value: normaliseDomain(raw), rule: 'domain_from_website' }
  }
  return { value: raw.trim() || null, rule: null }
}

/* ------------------------------------------------------------------ */
/*  Mapping (§7.4, étape 3)                                            */
/* ------------------------------------------------------------------ */

/** Un en-tête ramené à sa forme comparable : sans accent, sans casse, sans ponctuation. */
export function normaliseHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Les en-têtes qui SIGNALENT une catégorie de donnée sensible — #2079.7.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SIGNALEMENT À PART DE `ignoredColumns`
 * ─────────────────────────────────────────────────────────────────────────────
 * Une colonne « Date de naissance », « IBAN » ou « Nationalité » n'a pas
 * d'alias au catalogue : elle finit dans `ignoredColumns`, une liste où rien ne
 * la distingue d'une colonne « Commentaire libre ». Le fichier a pourtant DÉJÀ
 * transité par nos serveurs au moment de la simulation — le signalement existe
 * pour que l'opérateur SACHE que son export porte une catégorie de donnée
 * sensible, avant même de décider quoi en faire.
 *
 * ⚠️ Ce n'est ni un blocage ni une nouvelle raison d'écarter la ligne : la
 * colonne suit le sort que le mapping lui donne (rattachée ou ignorée) — le
 * signalement lit l'EN-TÊTE du fichier, pas ce que le mapping en a fait.
 *
 * La liste couvre les catégories spéciales du RGPD (santé, origine,
 * religion, orientation sexuelle, casier judiciaire) et les identifiants dont
 * la fuite est directement exploitable (IBAN, numéro de sécurité sociale,
 * carte bancaire, mot de passe) — pas les champs professionnels ordinaires
 * (fonction, société), qui ne sont pas plus sensibles ici qu'ailleurs dans le
 * produit.
 */
const SENSITIVE_HEADER_PATTERNS: readonly RegExp[] = [
  /^iban$/,
  /^bic$/,
  /^rib$/,
  /numero_.*securite_sociale|^nir$|^ssn$/,
  /date_.*naissance|^birth_?date$|^date_of_birth$/,
  /^nationalite$|^nationality$/,
  /^origine(_ethnique)?$|^ethnicity$/,
  /^religion$/,
  /^sante$|^health$|handicap|^disability$/,
  /orientation_sexuelle|sexual_orientation/,
  /casier_judiciaire|criminal_record/,
  /^numero_carte(_bancaire)?$|^credit_card$|^card_number$/,
  /^mot_de_passe$|^password$/,
]

/** Les colonnes du fichier dont l'en-tête signale une donnée sensible, DANS L'ORDRE du fichier. */
export function sensitiveHeaders(headers: readonly string[]): string[] {
  return headers.filter(header => SENSITIVE_HEADER_PATTERNS.some(pattern => pattern.test(normaliseHeader(header))))
}

/**
 * La proposition de mapping — automatique, et MODIFIABLE.
 *
 * Ce qu'elle ne fait jamais : deviner. Une colonne qu'aucun alias ne reconnaît
 * sort en `ignored`, elle est LISTÉE à l'écran, et l'utilisateur la rattache
 * s'il le veut. Le repli positionnel (« la 3ᵉ colonne est sûrement l'e-mail »)
 * est exactement ce qui fait entrer des numéros de téléphone dans un champ
 * société.
 */
export function proposeMapping(
  headers: readonly string[],
  aliases: Readonly<Record<string, string>>,
  options: { object?: ImportObject } = {},
): ImportMapping {
  const columns: Record<string, string> = {}
  const ignored: string[] = []
  const normalised = headers.map(normaliseHeader)
  // M2.1 (Meyer 20/10) — un « Prénom » à côté d'un « Nom » : « Nom » est le NOM DE FAMILLE (même règle que le planner
  // universel) ; sans « Prénom », « Nom » reste le nom complet de la source.
  const hasFirstName = normalised.some(key => aliases[key] === 'firstName')
  // M2.1 — une colonne « Société - … » réclame son champ AVANT une colonne nue du même nom : la « Ville » d'un
  // contact n'est pas la ville de sa société. Sur un import de contacts, elle ne va JAMAIS au siège.
  const companyScoped = new Set(
    normalised.filter(key => key.startsWith('societe_') && aliases[key]).map(key => aliases[key] as string),
  )
  headers.forEach((header, index) => {
    const key = normalised[index] as string
    let field: string | undefined = aliases[key]
    if (field === 'name' && hasFirstName) field = 'lastName'
    const bareCity = field === 'headquarters' && (key === 'ville' || key === 'city')
    // La référence d'un CONTACT n'est pas celle d'un compte : sur un import de sociétés, « Société - Référence
    // interne » (`companyRef`) fait foi, la colonne nue ne rattache pas la société à la fiche du contact.
    const contactRefOnAccounts =
      field === 'sourceRef' && options.object === 'account' && companyScoped.has('companyRef')
    if (
      field &&
      !key.startsWith('societe_') &&
      (companyScoped.has(field) || (bareCity && options.object === 'contact') || contactRefOnAccounts)
    ) {
      field = undefined
    }
    if (field) columns[header] = field
    else ignored.push(header)
  })
  return { columns, ignored, disabledRules: [] }
}

/**
 * La distance de Levenshtein, sans borne de longueur — les deux mots comparés
 * ici sont toujours des en-têtes de colonne et des alias, jamais des textes
 * longs.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] =
        a[i - 1] === b[j - 1] ? previous[j - 1]! : 1 + Math.min(previous[j - 1]!, previous[j]!, current[j - 1]!)
    }
    previous = current
  }
  return previous[b.length]!
}

export const MAPPING_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const
export type MappingConfidence = (typeof MAPPING_CONFIDENCE_LEVELS)[number]

/**
 * #2159.17/.21/.22/.24/.25/.27 — la confiance d'un rattachement colonne →
 * champ, JAMAIS un pourcentage (doctrine, CLAUDE.md § Code rules : « JAMAIS de
 * données fictives… pas de fallback inventé » — un chiffre entre 0 et 100 sans
 * modèle statistique derrière EST une donnée inventée). Trois paliers, chacun
 * mesuré sur le TEXTE de l'en-tête, jamais sur sa position dans le fichier —
 * le repli positionnel est exactement ce que {@link proposeMapping} refuse
 * déjà de faire :
 *  - `'high'`   : l'en-tête normalisé EST un alias déclaré pour ce champ —
 *    c'est exactement ce que `proposeMapping` vient de rattacher.
 *  - `'medium'` : l'en-tête normalisé CONTIENT un alias de ce champ en entier
 *    (« adresse_email_pro » contient « email ») — l'orthographe exacte
 *    n'est pas au catalogue, le mot y est déjà.
 *  - `'low'`    : l'en-tête normalisé est à une ou deux lettres d'un alias de
 *    ce champ (une faute de frappe d'export, « telphone » pour
 *    « telephone ») — mesuré par la distance de Levenshtein.
 *  - `null`     : aucune parenté textuelle entre l'en-tête et ce champ — un
 *    rattachement à ce champ-là n'engage que la personne qui l'a choisi, et
 *    une correction humaine n'a besoin d'aucun badge pour gagner.
 */
export function mappingConfidence(
  header: string,
  field: string,
  aliases: Readonly<Record<string, string>>,
): MappingConfidence | null {
  const normalised = normaliseHeader(header)
  const aliasesForField = Object.keys(aliases).filter(alias => aliases[alias] === field)
  if (aliasesForField.includes(normalised)) return 'high'

  let sawContainment = false
  let bestDistance = Infinity
  for (const alias of aliasesForField) {
    // Un alias de moins de trois lettres (aucun aujourd'hui) matcherait
    // n'importe quel en-tête par simple inclusion — exclu par prudence.
    if (alias.length < 3) continue
    if (normalised.includes(alias) || alias.includes(normalised)) sawContainment = true
    bestDistance = Math.min(bestDistance, levenshtein(normalised, alias))
  }
  if (sawContainment) return 'medium'
  if (normalised.length >= 4 && bestDistance <= 2) return 'low'
  return null
}

/**
 * La meilleure suggestion pour une colonne que le catalogue N'A PAS reconnue
 * (elle est dans `ignored`) — jamais rattachée d'office. « On propose, on
 * n'exécute jamais tout seul » vaut ici comme pour une fusion de doublons
 * (doctrine) : l'écran affiche la suggestion, un clic humain la rattache.
 */
export function suggestMapping(
  header: string,
  aliases: Readonly<Record<string, string>>,
): { field: string; confidence: 'medium' | 'low' } | null {
  let best: { field: string; confidence: 'medium' | 'low' } | null = null
  for (const field of new Set(Object.values(aliases))) {
    const confidence = mappingConfidence(header, field, aliases)
    if (confidence !== 'medium' && confidence !== 'low') continue
    if (!best || (confidence === 'medium' && best.confidence === 'low')) best = { field, confidence }
  }
  return best
}

/**
 * #2159.11/.13 — la détection NOMMÉE d'un export BoondManager, et son repli
 * honnête quand elle n'est pas certaine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE SIGNATURE PRÉCISE, ET PAS UNE AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les cinq en-têtes ci-dessous sont les colonnes de l'export « Besoins » de
 * BoondManager, telles que documentées PUBLIQUEMENT par l'éditeur (centre
 * d'aide, article « Importer vos données dans BoondManager », consulté le
 * 27/09/2026 : Titre, Société - Nom, Pôle, Responsable manager, Domaine
 * d'intervention, CA Envisagé HT, Pondération, Date de clôture, État,
 * Référence interne, Agence, Date de démarrage, Type). On ne reprend QUE
 * celles qui ne se retrouvent dans AUCUNE autre source du catalogue
 * (`import-catalog.ts`) : ni « pôle », ni « référence interne », ni « ca
 * envisagé ht », ni « pondération », ni « domaine d'intervention » n'ont
 * d'alias ailleurs. C'est ce qui rend la signature SÛRE plutôt que devinée —
 * la doctrine (CLAUDE.md : jamais de donnée fictive, un motif ne s'invente pas
 * plus qu'une donnée) l'exige : on n'invente pas la forme d'un format qu'on
 * n'a jamais observé.
 *
 * Deux en-têtes suffisent pour NOMMER l'outil : le hasard qui produirait deux
 * de ces cinq colonnes précises dans un export d'un autre éditeur est
 * négligeable. Une seule ne suffit pas à nommer BoondManager (« pôle » seule
 * pourrait venir d'un tableur RH quelconque) — mais elle suffit à dire que le
 * fichier ressemble à un export de suivi de candidats/ressources, SANS nommer
 * l'outil : la doctrine interdit d'inventer une identité, pas de rester
 * honnête sur l'incertitude.
 */
const BOONDMANAGER_SIGNATURE_HEADERS = [
  'pole',
  'reference_interne',
  'ca_envisage_ht',
  'ponderation',
  'domaine_intervention',
] as const

const MANAGEMENT_CONTACTS_SIGNATURE_HEADERS = ['societe_nom', 'email_1', 'reference_interne'] as const

export type ImportSourceDetection =
  | { certainty: 'named'; key: 'boondmanager_export' }
  | { certainty: 'family'; family: 'ats' | 'management_contacts' }
  | { certainty: 'none' }

/** Ce que les en-têtes du fichier déposé laissent deviner de sa provenance. */
export function detectImportSource(headers: readonly string[]): ImportSourceDetection {
  const normalised = new Set(headers.map(normaliseHeader))
  // M2.2 (Meyer 20/10) — un export de CONTACTS d'un outil de gestion : « Société - Nom » + « Email 1 » + « Référence
  // interne ». Testé AVANT la signature ci-dessous, dont « Référence interne » seule ferait un faux « suivi de candidats ».
  if (MANAGEMENT_CONTACTS_SIGNATURE_HEADERS.every(signature => normalised.has(signature))) {
    return { certainty: 'family', family: 'management_contacts' }
  }
  const hits = BOONDMANAGER_SIGNATURE_HEADERS.filter(signature => normalised.has(signature)).length
  if (hits >= 2) return { certainty: 'named', key: 'boondmanager_export' }
  if (hits === 1) return { certainty: 'family', family: 'ats' }
  return { certainty: 'none' }
}

/* ------------------------------------------------------------------ */
/*  Déduplication (§7.6)                                               */
/* ------------------------------------------------------------------ */

/**
 * La clé de dédup d'une ligne, ou `null` si la ligne n'en porte aucune.
 *
 * `null` est une réponse valable et importante : une ligne sans clé n'est PAS
 * un doublon de toutes les autres lignes sans clé. Les regrouper produirait
 * exactement le rapprochement le plus destructeur d'un CRM — deux personnes
 * différentes fusionnées parce qu'aucune n'avait d'e-mail.
 */
/**
 * Complète une ligne mappée avec les champs DÉRIVÉS dont la déduplication a
 * besoin, et qu'aucun fichier ne porte jamais en colonne.
 *
 * ⚠️ Trouvé en recette live, après un correctif qui semblait suffire : les clés
 * de `DEDUP_KEYS` incluent `normalizedName` pour un compte et `name+company`
 * pour un contact — mais aucune table d'alias ne peut produire ces champs, un
 * export n'ayant pas de colonne « nom normalisé ». `dedupKeyOf` rendait donc
 * `null` pour tout compte, et la simulation annonçait « 3 créations, 0 mise à
 * jour » sur trois sociétés déjà présentes.
 *
 * L'écriture, elle, dérivait ces champs à la main de son côté. Deux dérivations
 * dans deux fichiers, c'est la garantie qu'elles finiront par différer : celle-ci
 * est la seule, et les deux chemins l'appellent.
 */
export function withDedupInputs(object: ImportObject, row: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const enriched: Record<string, unknown> = { ...row }
  const company = typeof row['company'] === 'string' ? row['company'].trim() : ''
  if (company) {
    // #1889 — le PROJET rejoint le compte : sa clé est `normalizedName+label`,
    // et sans cette dérivation elle rendait `null` sur toutes les lignes.
    if (object === 'account' || object === 'project') enriched['normalizedName'] = normaliseCompanyName(company)
  }
  // Le domaine sert de deuxième clé de compte. Il vient d'une colonne dédiée,
  // sinon du site — JAMAIS de l'adresse e-mail (#4053.7, recette prod 14/10) : le domaine d'une
  // boîte personnelle n'est pas l'identité d'une société (gmail.com), et deux personnes
  // différentes, aux noms et e-mails différents, sur le même domaine étaient écartées « doublon
  // dans le fichier ». Un doublon de contact se décide sur l'e-mail (ou nom+société), jamais sur
  // le seul domaine.
  if (object === 'account' && !enriched['domain']) {
    const source = row['domain'] ?? row['website']
    if (typeof source === 'string') {
      const host = normaliseDomain(source)
      if (host) enriched['domain'] = host
    }
  }
  // Contact : `name+company` est la clé de repli quand l'e-mail manque. Le nom
  // arrive en `name` ou en `fullName` selon la source.
  if (object === 'contact' && !enriched['name']) {
    const last = row['lastName']
    const first = row['firstName']
    const composed =
      typeof last === 'string' && last.trim() && typeof first === 'string' && first.trim()
        ? `${first.trim()} ${last.trim()}`
        : null
    const name = row['name'] ?? row['fullName'] ?? composed ?? last
    if (typeof name === 'string' && name.trim()) enriched['name'] = name.trim()
  }
  return enriched
}

/**
 * TOUTES les clés que cette ligne satisfait, dans l'ordre de `DEDUP_KEYS`.
 *
 * #2079.10 — les deux côtés de l'import ne posent pas la même question. La
 * LIGNE du fichier demande « quelle est MA clé ? » et n'en veut qu'une, la plus
 * forte ({@link dedupKeyOf}). Le compte DÉJÀ EN BASE, lui, doit être INDEXÉ sur
 * toutes les siennes : une ligne qui n'a que le domaine doit le retrouver, une
 * autre qui n'a que le nom aussi.
 *
 * Les deux questions partagent donc la même dérivation, et c'est tout l'objet
 * de cette fonction : `dedupKeyOf` n'est plus qu'un `[0]` sur elle. L'écriture
 * d'import recopiait sa propre version côté base — `domain:${website}` BRUT, là
 * où la ligne passait par `normaliseDomain` — et un compte enregistré
 * « https://www.acme.fr/ » ne rencontrait jamais une ligne portant « acme.fr ».
 * Deux chemins qui refont la même dérivation divergent toujours.
 */
export function dedupKeysOf(object: ImportObject, row: Readonly<Record<string, unknown>>): string[] {
  const keys: string[] = []
  for (const key of DEDUP_KEYS[object]) {
    const parts = key.map(field => {
      const value = row[field]
      return typeof value === 'string' ? value.trim().toLowerCase() : value == null ? '' : String(value)
    })
    if (parts.every(part => part.length > 0)) keys.push(`${key.join('+')}:${parts.join('|')}`)
  }
  return keys
}

/**
 * La clé de dédup la PLUS FORTE que porte cette ligne, ou `null`.
 *
 * Un `[0]` sur {@link dedupKeysOf} depuis #2079.10, et pas une seconde boucle :
 * l'ordre de `DEDUP_KEYS` décide de la priorité, et deux parcours de la même
 * liste finiraient par ne plus la lire pareil.
 */
export function dedupKeyOf(object: ImportObject, row: Readonly<Record<string, unknown>>): string | null {
  return dedupKeysOf(object, row)[0] ?? null
}

/** Les doublons DANS le fichier — repérés avant toute écriture. */
export function duplicatesInFile(
  object: ImportObject,
  rows: readonly Readonly<Record<string, unknown>>[],
): { row: number; matchedOn: string[]; confidence: number }[] {
  const seen = new Map<string, number>()
  const out: { row: number; matchedOn: string[]; confidence: number }[] = []
  rows.forEach((row, index) => {
    const key = dedupKeyOf(object, withDedupInputs(object, row))
    if (!key) return
    if (seen.has(key)) {
      out.push({ row: index + 1, matchedOn: [key.split(':')[0] ?? ''], confidence: 1 })
      return
    }
    seen.set(key, index + 1)
  })
  return out
}

/**
 * #4053.8 — la fiche DÉJÀ EN BASE que cette ligne reconnaîtrait, avec la clé qui la reconnaît.
 *
 * La simulation ne cherchait que la clé la plus forte de la ligne, là où l'écriture d'un compte essaie
 * TOUTES les siennes dans l'ordre (SIREN → domaine → nom) : « 1 création » annoncée sur un fichier déjà
 * importé, et le réel retrouvait le compte. Les deux côtés posent désormais la même question, avec la
 * même exception : un nom SEUL ne rapproche jamais un compte déjà en base (#2079.13 — deux homonymes ne
 * se fusionnent pas), la ligne en crée un.
 */
function recogniseExisting(
  object: ImportObject,
  row: Readonly<Record<string, unknown>>,
  existing: Readonly<Record<string, string>>,
): { key: string | null; existingId: string | undefined } {
  const keys = dedupKeysOf(object, withDedupInputs(object, row))
  if (object !== 'account') {
    const key = keys[0] ?? null
    return { key, existingId: key ? existing[key] : undefined }
  }
  for (const key of keys) {
    const existingId = existing[key]
    if (existingId && !key.startsWith('normalizedName:')) return { key, existingId }
  }
  return { key: keys[0] ?? null, existingId: undefined }
}

/** Les champs qui portent un signal FAIBLE de doublon — jamais une clé de dédup. */
const WEAK_DUPLICATE_FIELDS = ['phone', 'linkedin_url'] as const

/**
 * #2159.32/#2159.33 — un téléphone ou un profil LinkedIn partagé par deux
 * lignes DU MÊME fichier, sans que ce soit leur clé forte de dédup.
 *
 * Volontairement séparé de {@link duplicatesInFile} : ce signal ne SKIPPE
 * jamais une ligne (voir la doc de `possibleDuplicates`, `import.ts`) — il ne
 * fait que l'annoter pour une revue humaine. `excludedRows` retire les lignes
 * déjà écartées par un doublon FORT, pour ne pas signaler deux fois la même
 * ligne pour deux raisons différentes.
 */
function weakDuplicatesInFile(
  object: ImportObject,
  rows: readonly Readonly<Record<string, unknown>>[],
  excludedRows: ReadonlySet<number>,
): { row: number; matchedOn: string[]; confidence: number }[] {
  if (object !== 'contact') return []
  const out: { row: number; matchedOn: string[]; confidence: number }[] = []
  for (const field of WEAK_DUPLICATE_FIELDS) {
    const seen = new Map<string, number>()
    rows.forEach((row, index) => {
      const rowNumber = index + 1
      if (excludedRows.has(rowNumber)) return
      const raw = row[field]
      const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
      if (!value) return
      if (seen.has(value)) {
        out.push({ row: rowNumber, matchedOn: [field], confidence: 0.4 })
        return
      }
      seen.set(value, rowNumber)
    })
  }
  return out
}

/* ------------------------------------------------------------------ */
/*  Le rapport de simulation (§7.5)                                    */
/* ------------------------------------------------------------------ */

/** Les objets qui se rattachent à un compte existant. */
const PARENTED = new Set<ImportObject>(['contact', 'project', 'mission', 'activity'])

export type DryRunInput = {
  object: ImportObject
  headers: readonly string[]
  rows: readonly Readonly<Record<string, string>>[]
  mapping: ImportMapping
  /** Les champs sans lesquels une ligne ne veut rien dire. */
  required: readonly string[]
  /** Les clés de dédup DÉJÀ présentes en base, avec leur identifiant. */
  existing: Readonly<Record<string, string>>
  /** Les champs déjà renseignés en base, par clé de dédup — pour compter les écrasements. */
  filledFields?: Readonly<Record<string, readonly string[]>>
  /**
   * Les objets PARENTS déjà présents, sous leur forme normalisée.
   *
   * Sans eux, la simulation annonce des créations que l'import ne fera pas : une
   * ligne dont la société est inconnue est écartée à l'écriture
   * (`unknown_company`) mais comptée comme création à la simulation. Mesuré en
   * recette live — « 2 créations » promises, « 0 créé » obtenu.
   *
   * C'est la propriété centrale du §7 : une simulation qui ne rejoue pas
   * exactement ce que fera l'import ne prouve rien. `undefined` = on ne sait pas,
   * et alors on ne prétend rien (aucune ligne n'est écartée pour cette raison).
   */
  knownParents?: ReadonlySet<string>
  /**
   * Les propriétaires connus de l'espace, normalisés (nom ou adresse).
   *
   * ⚠️ `unknown_owner` était déclaré dans la liste fermée, traduit à l'écran, et
   * JAMAIS émis. Une reprise d'ancien CRM porte une colonne « responsable » dont
   * la moitié des valeurs sont des gens partis depuis : les importer en silence
   * attribue des fiches à personne, et un portefeuille orphelin ne remonte dans
   * aucune vue.
   *
   * `undefined` = on ne sait pas qui travaille ici, et alors on ne prétend rien :
   * aucune ligne n'est écartée pour cette raison. Refuser sur une donnée absente
   * serait pire que de laisser passer.
   */
  knownOwners?: ReadonlySet<string>
  truncated?: boolean
}

/**
 * La simulation — exactement ce que l'import ferait, et rien d'écrit.
 *
 * Elle est la SEULE porte : `apply` refuse tant qu'aucun rapport n'a été
 * enregistré. Le PDF le pose comme premier test à écrire, et pour une raison
 * mesurée par le marché : nettoyer après coûte 3 à 10 fois plus cher.
 */
export function simulateImport(input: DryRunInput): DryRunReport {
  const mapped = Object.entries(input.mapping.columns)
  const mappedFields = new Set(mapped.map(([, field]) => field))
  const missingRequiredColumns = input.required.filter(field => !mappedFields.has(field))

  const skipped: DryRunReport['skipped'] = []
  const normalisedRows: Record<string, unknown>[] = []

  input.rows.forEach((row, index) => {
    const line = index + 1
    const out: Record<string, unknown> = {}
    let fatal: { reason: SkipReason; field: string | null } | null = null

    for (const [column, field] of mapped) {
      const raw = row[column]
      if (raw === undefined || raw.trim() === '') continue
      const { value } = applyNormalisation(field, raw, input.mapping.disabledRules)
      if (value === null) {
        // Une valeur que la normalisation a REFUSÉE. On dit laquelle et
        // pourquoi : « 8 dates invalides » se corrige, « 8 lignes ignorées » non.
        if (/mail/i.test(field)) fatal ??= { reason: 'invalid_email', field }
        else if (/date|debut|fin|start|end/i.test(field)) fatal ??= { reason: 'invalid_date', field }
        continue
      }
      out[field] = value
    }

    // Une ligne qui porte des valeurs, mais AUCUNE dans une colonne qu'on lit.
    // Évalué AVANT `missing_required_field` parce que les deux motifs appellent
    // des gestes différents : celui-ci dit « ta correspondance de colonnes est à
    // revoir », l'autre dit « ton fichier est incomplet ». Les confondre envoie
    // l'opérateur corriger le mauvais bout.
    if (!fatal && Object.keys(out).length === 0) {
      const carriesSomething = Object.entries(row).some(([, value]) => (value ?? '').trim() !== '')
      if (carriesSomething) fatal = { reason: 'out_of_scope_column', field: null }
    }

    const missing = input.required.find(field => out[field] === undefined)
    if (missing) fatal ??= { reason: 'missing_required_field', field: missing }

    // Le propriétaire, quand la colonne est rattachée ET qu'on sait qui travaille
    // ici. Une fiche attribuée à quelqu'un qui n'existe pas est un portefeuille
    // orphelin, et un portefeuille orphelin ne remonte dans aucune vue.
    if (!fatal && input.knownOwners && typeof out['owner'] === 'string') {
      const owner = out['owner'].trim().toLowerCase()
      if (owner && !input.knownOwners.has(owner)) fatal = { reason: 'unknown_owner', field: 'owner' }
    }

    // #4053.1 — une ligne SANS société : l'écriture ne crée aucun compte pour elle (et ne rattache
    // aucun contact), mais le rapport la comptait en création. Elle sort « à valider », nommée.
    // (Un contact n'est jugé que si l'on SAIT quelles sociétés existent — `knownParents` —, comme pour
    // `unknown_company` : refuser sur une donnée absente serait pire que de laisser passer.)
    if (!fatal && (input.object === 'account' || (input.object === 'contact' && input.knownParents))) {
      const company = typeof out['company'] === 'string' ? out['company'].trim() : ''
      if (!company) fatal = { reason: 'company_to_validate', field: 'company' }
    }

    // La société est-elle connue ? Un contact dont le compte n'existe pas sera
    // écarté à l'écriture ; l'annoncer ICI est ce qui rend la simulation fidèle.
    if (!fatal && input.knownParents && PARENTED.has(input.object)) {
      const company = typeof out['company'] === 'string' ? normaliseCompanyName(out['company']) : ''
      if (!company || !input.knownParents.has(company)) {
        fatal = { reason: 'unknown_company', field: 'company' }
      }
    }

    if (fatal) {
      skipped.push({ row: line, reason: fatal.reason, field: fatal.field })
      return
    }
    normalisedRows.push(out)
  })

  // Les doublons DANS le fichier sont écartés — mais comptés à part : ce ne sont
  // pas des lignes invalides, ce sont des lignes en trop.
  const inFile = duplicatesInFile(input.object, normalisedRows)
  const inFileRows = new Set(inFile.map(duplicate => duplicate.row))
  for (const duplicate of inFile) {
    skipped.push({ row: duplicate.row, reason: 'duplicate_in_file', field: null })
  }

  const duplicates: DryRunReport['duplicates'] = inFile.map(duplicate => ({
    row: duplicate.row,
    existingId: null,
    matchedOn: duplicate.matchedOn,
    confidence: duplicate.confidence,
    // Un doublon INTRA-fichier est ignoré à l'écriture (`duplicate_in_file`) :
    // il n'écrase jamais rien en base, donc jamais de conflit.
    overwrites: false,
  }))

  // #2159.32/#2159.33 — signal FAIBLE (téléphone, LinkedIn) : jamais un skip,
  // les deux lignes restent créées/mises à jour normalement ci-dessous.
  const possibleDuplicates: DryRunReport['possibleDuplicates'] = weakDuplicatesInFile(
    input.object,
    normalisedRows,
    inFileRows,
  )

  // #4053.8 — un compte déjà en base que SEUL le nom rapproche : la ligne en crée un (l'écriture ne
  // fusionne jamais sur un nom, #2079.13), et le rapport le PROPOSE comme doublon possible.
  const nameOnlyProposals: DryRunReport['possibleDuplicates'] = []

  let creations = 0
  let updates = 0
  let overwrittenFields = 0
  let withoutLegalBasis = 0

  normalisedRows.forEach((row, index) => {
    if (inFileRows.has(index + 1)) return
    const { key, existingId } = recogniseExisting(input.object, row, input.existing)
    if (existingId) {
      updates += 1
      // Un champ déjà rempli en base ET présent dans le fichier serait ÉCRASÉ.
      // C'est le seul chiffre du rapport qui annonce une PERTE — et c'est ce
      // qui distingue une simple mise à jour (des champs VIDES se remplissent)
      // d'un CONFLIT (#2159.39, une valeur déjà là serait remplacée).
      const filled = input.filledFields?.[key ?? ''] ?? []
      const overwritten = filled.filter(field => row[field] !== undefined)
      overwrittenFields += overwritten.length
      duplicates.push({
        row: index + 1,
        existingId,
        matchedOn: [key?.split(':')[0] ?? ''],
        confidence: 0.95,
        overwrites: overwritten.length > 0,
      })
    } else {
      creations += 1
      if (input.object === 'account') {
        const nameKey = dedupKeysOf(input.object, withDedupInputs(input.object, row)).find(k =>
          k.startsWith('normalizedName:'),
        )
        if (nameKey && input.existing[nameKey]) {
          nameOnlyProposals.push({ row: index + 1, matchedOn: ['normalizedName'], confidence: 0.6 })
        }
      }
    }
    if (input.object === 'contact' && row['legalBasis'] === undefined) withoutLegalBasis += 1
  })

  return {
    rowsRead: input.rows.length,
    creations,
    updates,
    overwrittenFields,
    duplicates,
    skipped,
    mappedColumns: mapped.map(([column]) => column),
    ignoredColumns: [...input.mapping.ignored],
    missingRequiredColumns,
    withoutLegalBasis,
    truncated: input.truncated ?? false,
    // La simulation n'écrit rien : rien ne peut y échouer. Ce seau se peuple
    // seulement à l'exécution, dans `writeSession` — voir `import.ts`.
    errors: [],
    // #2079.7 — lu sur l'EN-TÊTE du fichier, pas sur ce que le mapping en a
    // fait : une colonne sensible RATTACHÉE se signale autant qu'ignorée.
    sensitiveColumns: sensitiveHeaders(input.headers),
    possibleDuplicates: [...possibleDuplicates, ...nameOnlyProposals],
  }
}

/** Un rapport BLOQUE-t-il l'import ? (§11, critères d'acceptation de 602) */
export function blocksApply(report: DryRunReport): boolean {
  return report.missingRequiredColumns.length > 0
}

/**
 * Retire une ligne du compte « aurait été écrite » pour la ranger en ÉCHEC.
 *
 * Utilisée par l'écriture réelle (`writeSession`, `import.service.ts`) : une
 * ligne que la simulation comptait en création ou en mise à jour peut échouer
 * à l'écriture — par exemple une ligne partie sans réponse qu'un humain choisit
 * de SAUTER plutôt que de rejouer (« un timeout n'est pas un échec »).
 *
 * Sans cette fonction, la ligne resterait comptée DEUX fois : une fois dans
 * `creations`/`updates` (ce qui ÉTAIT prévu), une fois dans `errors` (ce qui
 * EST arrivé) — et `rowsRead === creations + updates + skipped.length +
 * errors.length` cesserait d'être vrai. C'est ce test-là qui prouve que rien
 * ne se perd : voir `import-engine.test.ts`.
 *
 * Le compte à décrémenter (création ou mise à jour) se lit dans `duplicates` :
 * une ligne qui y figure avec un `existingId` non nul allait à la mise à jour ;
 * sinon, à la création. `Math.max(0, …)` protège contre un appel en double sur
 * la même ligne — décrémenter deux fois un compte déjà à zéro le laisserait
 * NÉGATIF, ce qui n'a pas de sens pour un total de lignes.
 */
export function withRowError(report: DryRunReport, error: ImportRowError): DryRunReport {
  const wasUpdate = report.duplicates.some(duplicate => duplicate.row === error.row && duplicate.existingId !== null)
  return {
    ...report,
    creations: wasUpdate ? report.creations : Math.max(0, report.creations - 1),
    updates: wasUpdate ? Math.max(0, report.updates - 1) : report.updates,
    errors: [...report.errors, error],
  }
}
