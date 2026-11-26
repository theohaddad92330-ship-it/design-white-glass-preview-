import { createHash, createHmac, randomBytes } from 'node:crypto'
import { SUPPORT_REFERENCE_PREFIX, supplierNamesIn } from '@bellum/contracts'

/**
 * #2442.1 / .5 / .6 / .7 / .8 / .9 / .19 — LA CONVENTION D'OBSERVABILITÉ :
 * ce qui ne sort JAMAIS d'un journal ni d'un écran d'erreur, et la référence
 * que le support demande au téléphone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SEUL FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/api/src/modules` compte plus de mille appels à `logger.*`. Une règle
 * « n'écris pas le corps du message dans le journal » tenue à mille endroits
 * est une opinion, pas une règle : le mille-et-unième appel la perdra. Elle
 * est donc tenue AU PUITS — `createLogger()` (`common/logger.service.ts`)
 * passe chaque méta par {@link redactForLog} avant que winston ne sérialise,
 * et `AllExceptionsFilter` passe chaque corps d'erreur par
 * {@link sanitizeUserFacingText} avant qu'il n'atteigne le navigateur.
 *
 * Avant ce fichier, le dépôt tenait la même intention à TROIS endroits qui
 * ne se connaissaient pas (GA-26 — un réglage vit à un seul endroit) :
 *   — `sentry/instrument.ts` caviardait par NOM DE CLÉ, mais seulement ce qui
 *     partait vers Sentry ;
 *   — `common/journey-error.ts` caviardait par FORME (jeton, IBAN, mot de
 *     passe d'URL), mais seulement les erreurs du parcours d'onboarding ;
 *   — la console, elle, n'avait AUCUN caviardage : `logger.error('échec', {
 *     draft })` écrivait le corps du brouillon en clair dans les journaux de
 *     production.
 * Les deux listes vivent ici désormais, et les trois chemins les lisent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE ARBITRAGES — chacun est un refus, pas une préférence
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. UNE PILE D'APPELS RESTE DANS LE JOURNAL, ET NE SORT JAMAIS À L'ÉCRAN.
 *    Une pile est à NOUS : elle ne porte aucune donnée client (JavaScript ne
 *    met pas les arguments dans `stack`). La retirer des journaux nous
 *    aveuglerait sans protéger personne ; la laisser atteindre l'utilisateur
 *    expose notre arborescence. #2442.6 vise l'ÉCRAN, #2442.7 vise le brut
 *    des données PRIVÉES — ce ne sont pas les mêmes choses.
 *
 * 2. UNE EMPREINTE NE S'ATTACHE JAMAIS À UN SECRET. Pour un contenu privé,
 *    l'empreinte répond à la seule question utile du diagnostic : « est-ce le
 *    même que la ligne d'avant ? » Pour un secret, elle répondrait à « est-ce
 *    bien la valeur que je devine ? » — c'est un oracle de confirmation. Un
 *    secret est donc décrit par son TYPE et sa TAILLE seulement (« le jeton
 *    était vide » est le diagnostic le plus fréquent, et il ne coûte rien).
 *
 * 3. L'EMPREINTE EST SALÉE PAR PROCESSUS, et ce n'est pas un défaut. Doctrine :
 *    « l'analytique produit mesure le PRODUIT, jamais la personne — jamais par
 *    quelqu'un, même par hash ». Un SHA nu d'une adresse se vérifie par
 *    dictionnaire, et se recolle d'un mois sur l'autre : ce serait un
 *    identifiant de personne déguisé. Salée par processus, l'empreinte
 *    reconnaît deux occurrences d'une même valeur DANS UNE MÊME fenêtre de
 *    journal, et rien d'autre. Elle n'est volontairement pas configurable :
 *    une clé stable la rendrait joignable dans le temps.
 *
 * 4. LA RÉFÉRENCE SUPPORT EST DÉRIVÉE, JAMAIS RECOPIÉE. L'identifiant de
 *    corrélation peut venir de l'en-tête `X-Correlation-ID` de la requête,
 *    donc de l'appelant (`correlation-id.middleware.ts`). {@link supportReference}
 *    n'en laisse sortir que des hexadécimaux : la valeur affichée à l'écran ne
 *    peut porter ni balise, ni retour chariot, ni phrase.
 *
 * ⚠️ Ce fichier est chargé par `sentry/instrument.ts`, qui s'exécute AVANT que
 * Nest ne démarre. Il ne doit donc jamais importer `@nestjs/*` ni rien qui
 * ouvre une connexion. Il reste PUR : des fonctions, aucune injection, aucun
 * effet de bord hors le sel tiré au chargement.
 */

/* ════════════════════════════════════════════════════════════════════════ */
/*  #2442.5 — LA RÉFÉRENCE SUPPORT                                          */
/* ════════════════════════════════════════════════════════════════════════ */

// Le préfixe et la forme vivent dans `@bellum/contracts`
// (`schemas/support-reference.ts`) : l'API les CALCULE, l'écran les LIT, et
// une forme recopiée des deux côtés dériverait (GA-26).

/**
 * #2442.5 — la référence courte à afficher sur toute erreur utilisateur.
 *
 * Elle est GREPPABLE : pour un identifiant de corrélation canonique (celui que
 * `correlation-id.middleware.ts` tire lui-même), ce sont exactement les huit
 * premiers hexadécimaux de `correlation_id`, c'est-à-dire ce que la ligne de
 * journal de développement imprime déjà entre crochets (`logger.service.ts`).
 * Le support lit la référence à l'écran, la cherche dans les journaux, et
 * tombe sur la requête — sans que l'écran ait rien exposé d'autre.
 *
 * Un identifiant non hexadécimal (en-tête fourni par un appelant) passe par un
 * SHA-256 : reproductible hors ligne, donc toujours joignable, et sans jamais
 * recopier la chaîne de l'appelant.
 *
 * Rend `null` quand il n'y a pas d'identifiant : « non mesuré » n'est jamais
 * une valeur inventée.
 */
export function supportReference(correlationId: string | null | undefined): string | null {
  const id = correlationId?.trim() ?? ''
  if (id.length === 0) return null
  const compact = id.replace(/-/g, '')
  const head = compact.slice(0, 8)
  const digits = /^[0-9a-fA-F]{8}$/.test(head) ? head : createHash('sha256').update(id).digest('hex').slice(0, 8)
  return `${SUPPORT_REFERENCE_PREFIX}-${digits.toUpperCase()}`
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  #2442.8 — LE DESCRIPTEUR QUI REMPLACE LE BRUT                           */
/* ════════════════════════════════════════════════════════════════════════ */

/** Ce qui a été retiré : un contenu privé (décrit) ou un secret (effacé). */
type RedactionKind = 'private-content' | 'secret'

/**
 * #2442.8 — ce qui reste d'une valeur privée : son type, sa taille, son
 * empreinte. Jamais son contenu. C'est aussi avec ça qu'on EXPLIQUE un échec
 * (#2442.1) : « corps de 4 210 caractères, même empreinte qu'à la tentative
 * précédente » diagnostique une boucle sans montrer une ligne du message.
 */
type RedactedValue = {
  redacted: RedactionKind
  /** `string`, `number`, `array`, `object`, `Buffer`, `null`, `undefined`… */
  kind: string
  /** Taille d'une chaîne, en caractères. */
  chars?: number
  /** Taille d'un binaire, en octets. */
  bytes?: number
  /** Nombre d'éléments d'un tableau. */
  items?: number
  /** Nombre de clés d'un objet. */
  keys?: number
  /** #2442.8 — reconnaît deux occurrences de la même valeur. Salée par
   *  processus, donc inutilisable comme identifiant de personne. JAMAIS posée
   *  sur un secret (arbitrage 2 du docbloc). */
  fingerprint?: string
}

/**
 * Le sel des empreintes — tiré une fois par processus, jamais configurable,
 * jamais journalisé. Voir l'arbitrage 3 du docbloc : c'est ce qui empêche une
 * empreinte de devenir un identifiant de personne joignable dans le temps.
 */
const FINGERPRINT_SALT = randomBytes(32)

function fingerprintOf(value: unknown): string {
  let canonical: string
  try {
    canonical = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value))
  } catch {
    canonical = String(value)
  }
  return createHmac('sha256', FINGERPRINT_SALT).update(canonical).digest('hex').slice(0, 8)
}

/**
 * #2442.8 — remplace une valeur par sa description. `kind` vaut `'secret'`
 * quand la valeur est un secret : elle n'a alors pas d'empreinte.
 */
export function describeInsteadOfRaw(value: unknown, kind: RedactionKind = 'private-content'): RedactedValue {
  const withFingerprint = (base: RedactedValue): RedactedValue =>
    kind === 'secret' ? base : { ...base, fingerprint: fingerprintOf(value) }

  if (value === null) return { redacted: kind, kind: 'null' }
  if (value === undefined) return { redacted: kind, kind: 'undefined' }
  if (typeof value === 'string') return withFingerprint({ redacted: kind, kind: 'string', chars: value.length })
  if (Buffer.isBuffer(value)) return { redacted: kind, kind: 'Buffer', bytes: value.byteLength }
  if (Array.isArray(value)) return withFingerprint({ redacted: kind, kind: 'array', items: value.length })
  if (typeof value === 'object') {
    return withFingerprint({ redacted: kind, kind: 'object', keys: Object.keys(value).length })
  }
  return withFingerprint({ redacted: kind, kind: typeof value })
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  #2442.7 — LES DEUX LISTES DE NOMS DE CLÉ                                */
/* ════════════════════════════════════════════════════════════════════════ */

/**
 * Les MOTS d'un nom de clé, casse et séparateurs normalisés.
 *
 * Un nom de clé se découpe, il ne se cherche pas en sous-chaîne : `context`
 * CONTIENT « text » (con + text), et `context` est la clé de contexte du
 * logger Nest, présente sur presque chaque ligne. Une liste cherchée en
 * sous-chaîne aurait donc caviardé le nom du service sur toutes les lignes du
 * produit. Même piège pour `count` / `content`, `attempt` / `tempt`.
 */
function keyTokens(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(token => token.length > 0)
    .map(token => token.toLowerCase())
}

/**
 * #2442.7 — les noms de clé dont la VALEUR est du contenu privé : le corps
 * d'un message, une coordonnée de personne, un texte saisi, une sortie de
 * modèle.
 *
 * `message` n'y est PAS, et c'est délibéré : `error.message` est le champ le
 * plus journalisé du dépôt et la première chose qu'on lit pour diagnostiquer.
 * Un message passe par le caviardage de FORME ({@link redactSecrets}) et, s'il
 * doit atteindre l'écran, par {@link sanitizeUserFacingText}. Ce que #2442.7
 * vise est le CORPS (`body`, `content`, `text`, `subject`), pas l'étiquette.
 *
 * `name` n'y est pas non plus : `error.name`, `tool.name`, `provider.name`
 * sont partout, et un nom de personne isolé n'est pas le corps d'un échange.
 * Les formes explicitement nominatives sont couvertes en composé ci-dessous.
 */
const PRIVATE_CONTENT_TOKENS: ReadonlySet<string> = new Set([
  'body',
  'content',
  'contents',
  'text',
  'texte',
  'subject',
  'objet',
  'snippet',
  'excerpt',
  'extrait',
  'transcript',
  'transcription',
  'note',
  'notes',
  'comment',
  'commentaire',
  'email',
  'emails',
  'mail',
  'phone',
  'telephone',
  'tel',
  'mobile',
  'address',
  'adresse',
  'iban',
  'bic',
  'rib',
  'prompt',
  'prompts',
  'completion',
  'answer',
  'cv',
  'resume',
  'raw',
  'payload',
  // #2442.7 — PostgREST met la LIGNE qui a échoué dans `details`, et sa
  // reformulation dans `hint` : « Key (email)=(…) already exists ». C'est la
  // fuite la plus discrète du dépôt, parce qu'elle a l'air d'une métadonnée.
  'details',
  'hint',
])

/** Les formes nominatives explicites — reconnues sur les mots RECOLLÉS, donc
 *  `firstName`, `first_name` et `FIRSTNAME` à la fois, sans que `name` seul
 *  n'attrape `error.name`. */
const PRIVATE_CONTENT_COMPOUNDS: ReadonlySet<string> = new Set([
  'firstname',
  'lastname',
  'fullname',
  'displayname',
  'contactname',
  'personname',
  'messagebody',
  'rawanalysis',
])

/**
 * #2442.7 — les noms de clé dont la valeur est un SECRET. Reprend, mot pour
 * mot, la liste que `sentry/instrument.ts` tenait seul : ce qui ne devait pas
 * atteindre Sentry ne doit pas davantage atteindre la console.
 */
const SECRET_TOKENS: ReadonlySet<string> = new Set([
  'authorization',
  'cookie',
  'cookies',
  'password',
  'passwd',
  'passphrase',
  'secret',
  'token',
  'jwt',
  'bearer',
  'credential',
  'credentials',
  'signature',
])

/** `key` seul est trop large (`cacheKey`, `workKey`, `idempotencyKey`) : il ne
 *  dit « secret » que précédé d'un de ces mots. */
const SECRET_KEY_QUALIFIERS: ReadonlySet<string> = new Set([
  'api',
  'service',
  'secret',
  'private',
  'signing',
  'encryption',
  'anon',
  'publishable',
  'access',
])

/** #2442.7 — cette clé porte-t-elle un secret ? */
export function isSecretKey(key: string): boolean {
  const tokens = keyTokens(key)
  if (tokens.some(token => SECRET_TOKENS.has(token))) return true
  const last = tokens[tokens.length - 1]
  if (last === 'key' || last === 'keys') {
    return tokens.slice(0, -1).some(token => SECRET_KEY_QUALIFIERS.has(token))
  }
  return false
}

/** #2442.7 — cette clé porte-t-elle du contenu privé ? */
export function isPrivateContentKey(key: string): boolean {
  const tokens = keyTokens(key)
  if (tokens.some(token => PRIVATE_CONTENT_TOKENS.has(token))) return true
  return PRIVATE_CONTENT_COMPOUNDS.has(tokens.join(''))
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  #2084.37 / #2442.7 — LE CAVIARDAGE PAR FORME                            */
/* ════════════════════════════════════════════════════════════════════════ */

/** `scheme://user:pass@host` — les identifiants d'une chaîne de connexion. */
const URL_CREDENTIALS_PATTERN = /:\/\/[^\s/:@]+:[^\s/:@]+@/g
const BEARER_TOKEN_PATTERN = /\bBearer\s+\S+/gi
const SECRET_KEY_VALUE_PATTERN = /\b(api[_-]?key|token|secret|password|passwd)\s*[:=]\s*\S+/gi
/** IBAN : deux lettres pays, deux chiffres de contrôle, puis 10 à 30
 *  caractères alphanumériques (BBAN) — la forme générique tous pays. */
const IBAN_PATTERN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g

/**
 * #2084.37 — retire d'un texte ce qui ressemble à un secret. N'attrape pas une
 * phrase normale : les motifs ciblent une FORME (jeton, identifiants d'URL,
 * IBAN), jamais un mot isolé du français courant.
 *
 * Venu de `common/journey-error.ts`, qui l'appelle toujours : il vit ici pour
 * que la console, Sentry et les erreurs du parcours lisent la même liste
 * (GA-26).
 */
export function redactSecrets(text: string): string {
  return text
    .replace(URL_CREDENTIALS_PATTERN, '://[secret]@')
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [secret]')
    .replace(SECRET_KEY_VALUE_PATTERN, (_match, key: string) => `${key}=[secret]`)
    .replace(IBAN_PATTERN, '[secret]')
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  #2442.7 / #2442.8 — LE CAVIARDAGE D'UN MÉTA DE JOURNAL                  */
/* ════════════════════════════════════════════════════════════════════════ */

/** Au-delà, on décrit au lieu de descendre : un méta de journal profond de
 *  plus de six niveaux n'est plus une explication, c'est un dump. */
const MAX_DEPTH = 6

/**
 * #2442.7 / #2442.8 — la valeur telle qu'un journal peut la porter.
 *
 * Par défaut (`rawCapture` absent ou faux) : toute valeur sous une clé de
 * contenu privé devient un descripteur, tout secret est effacé, toute chaîne
 * passe par {@link redactSecrets}. Les métadonnées — statut, code, compteur,
 * durée, identifiants techniques — passent INTACTES : c'est avec elles qu'on
 * explique (#2442.1).
 *
 * `rawCapture` (#2442.9) lève le caviardage du CONTENU PRIVÉ, jamais celui des
 * SECRETS : aucune fenêtre de support n'autorise un jeton dans un journal.
 */
export function redactForLog(value: unknown, options?: { rawCapture?: boolean }): unknown {
  return walk(value, options?.rawCapture === true, 0, new WeakSet<object>())
}

function walk(value: unknown, rawCapture: boolean, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactSecrets(value)
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  if (depth >= MAX_DEPTH) return describeInsteadOfRaw(value)

  // Une pile d'appels est à NOUS : elle reste (arbitrage 1 du docbloc). On la
  // reconstruit à plat, comme `logger.service.ts` le fait déjà, parce que
  // `message` et `stack` ne sont pas énumérables.
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSecrets(value.message),
      ...(value.stack ? { stack: value.stack } : {}),
      ...(value.cause !== undefined ? { cause: walk(value.cause, rawCapture, depth + 1, seen) } : {}),
    }
  }

  seen.add(value)
  if (Buffer.isBuffer(value)) return describeInsteadOfRaw(value)
  if (Array.isArray(value)) return value.map(item => walk(item, rawCapture, depth + 1, seen))

  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretKey(key)) {
      out[key] = describeInsteadOfRaw(child, 'secret')
    } else if (isPrivateContentKey(key) && !rawCapture) {
      out[key] = describeInsteadOfRaw(child)
    } else {
      out[key] = walk(child, rawCapture, depth + 1, seen)
    }
  }
  return out
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  #2442.6 — CE QUI NE VA JAMAIS À L'ÉCRAN                                 */
/* ════════════════════════════════════════════════════════════════════════ */

/** Une trame de pile : `at X (…)` ou `at /chemin:12:34`, toujours en début de
 *  ligne — jamais le mot « at » au fil d'une phrase. */
const STACK_FRAME_PATTERN = /(^|\n)[ \t]*at\s+\S+[^\n]*/g
/** Une position dans un fichier source — ce qui reste d'une pile recopiée
 *  dans un message. */
const SOURCE_POSITION_PATTERN = /[\w./@-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py):\d+(?::\d+)?/g
/** Des fragments de requête : les deux mots-clés anglais ENSEMBLE, jamais un
 *  seul — « mise à jour » ne doit pas devenir « requête SQL ». */
const SQL_PATTERNS: readonly RegExp[] = [
  /\bselect\b[\s\S]{0,300}?\bfrom\b/gi,
  /\binsert\s+into\b[\s\S]{0,300}/gi,
  /\bdelete\s+from\b[\s\S]{0,300}/gi,
  /\bupdate\b[^\n]{0,120}?\bset\b[\s\S]{0,200}/gi,
  /\bon\s+conflict\b[\s\S]{0,200}/gi,
]
/** Ce que PostgreSQL répond quand une contrainte refuse : le nom de la
 *  contrainte porte celui de la table et de la colonne. */
const DB_CONSTRAINT_PATTERNS: readonly RegExp[] = [
  /duplicate key value[^\n]*/gi,
  /violates\s+(?:unique|foreign key|check|not-null)\s+constraint[^\n]*/gi,
  /null value in column\s+"[^"]*"[^\n]*/gi,
  /relation\s+"[^"]*"\s+does not exist/gi,
  /column\s+"[^"]*"\s+(?:does not exist|of relation)[^\n]*/gi,
  /constraint\s+"[^"]*"/gi,
]

/** Le marqueur qui remplace un détail interne. Court et muet : il dit qu'on a
 *  retiré quelque chose, il ne dit pas quoi. */
const REMOVED = '[retiré]'

/**
 * #2442.6 — ce qu'un texte porte d'interne, nommé. C'est ce que lit la garde
 * d'architecture : elle a besoin de DIRE quoi, pas seulement de refuser.
 *
 * Rend une liste vide sur une phrase d'erreur normale — une garde qui accuse
 * le bien n'en est pas une.
 */
export function internalDetailsIn(text: string): string[] {
  const found: string[] = []
  if (new RegExp(STACK_FRAME_PATTERN.source, 'g').test(text)) found.push('pile d’appels')
  else if (new RegExp(SOURCE_POSITION_PATTERN.source, 'g').test(text)) found.push('position de fichier source')
  if (SQL_PATTERNS.some(pattern => new RegExp(pattern.source, pattern.flags).test(text))) found.push('requête SQL')
  if (DB_CONSTRAINT_PATTERNS.some(pattern => new RegExp(pattern.source, pattern.flags).test(text))) {
    found.push('contrainte de base')
  }
  // Doctrine : « on nomme ce que l'espace a BRANCHÉ, jamais ce qui NOUS sert ».
  // La liste des fournisseurs vit dans `@bellum/contracts` (`tool-naming.ts`),
  // pas ici : elle est déjà lue par l'écran, l'i18n et le changelog.
  for (const supplier of supplierNamesIn(text)) found.push(`fournisseur : ${supplier}`)
  if (redactSecrets(text) !== text) found.push('secret')
  return found
}

/**
 * #2442.6 — le FILET de dernier recours sur un texte qui part vers l'écran.
 *
 * Ce n'est pas un rédacteur de messages : une bonne phrase d'erreur est écrite
 * par le code qui la lève (`journeyError` en donne la forme). C'est la
 * garantie que, si une phrase n'a pas été écrite, rien d'interne ne passe : ni
 * pile, ni position de fichier, ni fragment de requête, ni nom de contrainte,
 * ni nom d'un de NOS fournisseurs, ni secret.
 *
 * Laisse une phrase normale RIGOUREUSEMENT intacte — un filet qui réécrit le
 * bien finirait par être désactivé.
 */
export function sanitizeUserFacingText(text: string, options?: { suppliers?: boolean }): string {
  let out = redactSecrets(text)
  out = out.replace(new RegExp(STACK_FRAME_PATTERN.source, 'g'), `$1${REMOVED}`)
  for (const pattern of [...SQL_PATTERNS, ...DB_CONSTRAINT_PATTERNS]) {
    out = out.replace(new RegExp(pattern.source, pattern.flags), REMOVED)
  }
  out = out.replace(new RegExp(SOURCE_POSITION_PATTERN.source, 'g'), REMOVED)
  // `suppliers: false` sur une DONNÉE plutôt que sur une PHRASE. Un nom de
  // fournisseur est reconnu à la MARQUE, et une marque est parfois le nom d'un
  // client : un compte qui s'appelle « Apollo » verrait son propre nom effacé
  // dans le diff que lui rend un 409. Les détecteurs STRUCTURELS (pile, SQL,
  // contrainte, secret), eux, n'ont pas ce risque et passent partout.
  if (options?.suppliers === false) return out
  for (const supplier of supplierNamesIn(out)) {
    out = out.replace(new RegExp(escapeForRegExp(supplier), 'gi'), REMOVED)
    const brand = supplier.split(/\s+/)[0] as string
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeForRegExp(brand)}(?![\\p{L}\\p{N}])`, 'giu'), REMOVED)
  }
  return out
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  #2442.9 / #2442.19 — LA PORTE DE LA CAPTURE BRUTE                       */
/* ════════════════════════════════════════════════════════════════════════ */

/**
 * #2442.9 — la variable qui OUVRE une fenêtre de capture brute. Absente, rien
 * ne change : no-op STRICT, chemin byte-identique, aucune capture.
 *
 * Forme : `<contexte>|<échéance ISO>|<référence d'audit>`, plusieurs fenêtres
 * séparées par des virgules. Documentée dans `agent_docs/env-reference.md`.
 *
 * ⚠️ La barre verticale, et pas le deux-points : mesuré en écrivant la garde,
 * `ChatService:2026-09-21T18:00:00Z:SUP-1234` se découpait en QUATRE champs —
 * l'heure ISO porte ses propres deux-points — et « 00Z » devenait la référence
 * d'audit, si bien qu'une fenêtre s'ouvrait avec une échéance décalée que
 * personne n'avait posée.
 */
export const RAW_CAPTURE_WINDOWS_ENV = 'SUPPORT_RAW_CAPTURE_WINDOWS'

/** Une fenêtre de capture brute — ouverte par un humain, pour UN contexte,
 *  jusqu'à une échéance, sous une référence d'audit. */
type RawCaptureWindow = {
  /** Le contexte de journal visé (`ChatService`…). Jamais un joker. */
  context: string
  expiresAt: string
  /** #2442.19 — la trace sous laquelle l'accès est justifié et le consentement
   *  du client consigné. Sans elle, la fenêtre n'existe pas. */
  auditReference: string
}

/** Pourquoi la porte est restée fermée — nommé, jamais muet. */
type RawCaptureRefusal = 'not_configured' | 'no_window' | 'expired'

type RawCaptureDecision = { allowed: true; auditReference: string } | { allowed: false; reason: RawCaptureRefusal }

/**
 * #2442.9 / #2442.19 — lit les fenêtres posées. Une entrée incomplète est
 * IGNORÉE, jamais interprétée au mieux : la porte échoue FERMÉE.
 *
 * Trois refus explicites, et chacun a coûté quelque chose ailleurs :
 *   — pas de référence d'audit → #2442.19 : un accès manuel aux données brutes
 *     d'un client sans trace est exactement ce qui est interdit ;
 *   — pas d'échéance lisible → une porte sans fin ne se referme jamais, et
 *     personne ne relit une variable d'environnement ;
 *   — un joker (`*`) → une fenêtre nomme UN contexte. « Tout » n'est pas un
 *     périmètre, c'est l'absence de périmètre.
 */
export function parseRawCaptureWindows(raw: string | null | undefined): RawCaptureWindow[] {
  const value = raw?.trim() ?? ''
  if (value.length === 0) return []
  const windows: RawCaptureWindow[] = []
  for (const entry of value.split(',')) {
    const parts = entry.split('|')
    // Exactement trois champs : ni deux (une fenêtre sans audit n'existe pas),
    // ni quatre (rien à deviner).
    if (parts.length !== 3) continue
    const context = (parts[0] ?? '').trim()
    const expiresRaw = (parts[1] ?? '').trim()
    const auditReference = (parts[2] ?? '').trim()
    if (context.length === 0 || !/^[A-Za-z0-9_.-]+$/.test(context)) continue
    if (auditReference.length === 0) continue
    if (expiresRaw.length === 0) continue
    const expires = new Date(expiresRaw)
    if (Number.isNaN(expires.getTime())) continue
    windows.push({ context, expiresAt: expires.toISOString(), auditReference })
  }
  return windows
}

/**
 * #2442.9 — la porte. Fermée par défaut, elle ne s'ouvre que pour le contexte
 * NOMMÉ, avant l'échéance, et rend la référence d'audit sous laquelle la
 * capture est justifiée — l'appelant la journalise, ce qui rend la fenêtre
 * elle-même visible dans les journaux (#2442.19).
 */
export function rawCaptureDecision(input: {
  context: string | undefined
  now: Date
  windows?: readonly RawCaptureWindow[]
}): RawCaptureDecision {
  const windows = input.windows ?? parseRawCaptureWindows(process.env[RAW_CAPTURE_WINDOWS_ENV])
  if (windows.length === 0) return { allowed: false, reason: 'not_configured' }
  const matching = input.context === undefined ? [] : windows.filter(window => window.context === input.context)
  if (matching.length === 0) return { allowed: false, reason: 'no_window' }
  const open = matching.find(window => new Date(window.expiresAt).getTime() > input.now.getTime())
  if (!open) return { allowed: false, reason: 'expired' }
  return { allowed: true, auditReference: open.auditReference }
}
