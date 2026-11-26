import type { ContactFamily } from './contact.js'
import type { CoverageLevel } from './coverage.js'

/**
 * Le registre des FAMILLES DE RÔLES ACHETEURS — le seul endroit où elles vivent.
 *
 * Une ESN ne vend pas qu'à la DSI : elle vend à la cyber, à la data, à l'infra,
 * au développement, à la finance, aux achats, au PMO, à la direction générale et
 * aux RH. Le produit connaît ces onze familles depuis des mois — mais il les
 * connaissait **cinq fois**, dans trois langages, sans qu'aucune des cinq
 * déclarations ne cite les autres :
 *
 *  1. `contactFamilySchema` (`contact.ts`) — l'enum des libellés PERSISTÉS sur
 *     `contacts.family` (`IT`, `Cyber`, … `C-Level`, `Achat`, `RH`) ;
 *  2. `FAMILY_DEFS` (`apps/api/.../coverage-gaps/coverage.service.ts`) — les
 *     clés, libellés d'affichage, alias, cibles et titres par niveau ;
 *  3. `_FAMILY_PRESETS` (`apps/ia/app/services/contact_segments.py`) — recopié à
 *     la main, avec « MIROIR de FAMILY_DEFS » écrit en commentaire ;
 *  4. `FAMILY_RULES` (`apps/api/.../contacts/contact-classifier.ts`) — les
 *     regex du classifieur d'import ;
 *  5. le prompt de classification (`apps/ia/app/prompts/bellum_contacts.py`) —
 *     DIX libellés COMPOSÉS demandés au modèle, plus « Autre ». Dix, pas onze :
 *     il replie `infra` dans « IT / Infrastructure », si bien que le modèle
 *     n'écrit JAMAIS `Infra`, une famille que l'écran affiche pourtant avec ses
 *     zones blanches. Écart nommé et gardé, parqué en D176.
 *
 * ⚠️ **Ce que ce silo coûtait, mesuré le 29/08/2026 : 9 des 10 libellés de
 * famille que le prompt demande au modèle d'écrire ne tombaient sur AUCUNE
 * famille du produit.** L'API persiste la réponse du modèle telle quelle
 * (`family: c.family || null`), la matrice de couverture la comparait à ses
 * alias par égalité EXACTE, et `« Data / BI / Analytics »` ne vaut ni `data`,
 * ni `bi`, ni `analytics`. Seul `« Cybersecurite »` passait. Le champ que le
 * modèle avait rempli était jeté, et le compte retombait sur le repli par
 * mots-clés de titre — donc invisible : l'écran affichait une famille, juste
 * pas pour la raison qu'on croyait, et un contact dont le titre ne portait pas
 * le mot comptait pour une INCOHÉRENCE dans la confiance donnée.
 *
 * ## Ce registre ne crée aucune famille
 *
 * Les onze sont exactement celles de `contactFamilySchema` — le test garde la
 * bijection. Une famille que le produit n'utilise nulle part ne s'ajoute pas
 * « pour être complet » : elle serait du code que personne n'appelle.
 *
 * ⚠️ **Trois libellés OBSERVÉS n'ont volontairement pas de famille ici** :
 * `Métier` (43 lignes du jeu de démo), `Ingénierie` (14), `Conformité` (10). Ils
 * NOMMENT ce qui reste du biais informatique — le produit n'a pas de famille
 * métier, ingénierie ni conformité, et leur en attribuer une par ressemblance
 * ferait dire à la donnée ce qu'elle ne dit pas. Élargir les onze est une
 * migration de taxonomie à part entière (contrat → base → classifieur d'import →
 * prompt) : elle est parquée, avec son ordre, en D176 du dossier du 26/08.
 *
 * ## Ce qui est une famille, et ce qui n'en est pas
 *
 * Une famille de rôles acheteurs est un DOMAINE (à qui l'on vend). Elle est
 * orthogonale au RÔLE DÉCISIONNEL (`decisionRole` : economic / technical /
 * user / champion / procurement — la taxonomie MEDDIC de
 * `apps/ia/app/services/decision_role.py`) et au NIVEAU hiérarchique
 * (`CoverageLevel` : c_level / n1 / n2). Un RSSI est `cyber` × `technical` ×
 * `n1`. Les trois axes ne se remplacent pas.
 */

/** Les onze clés canoniques, en minuscules. L'ordre est celui de l'affichage de
 *  la matrice de couverture : les familles CIBLES d'abord (les BU du centre de
 *  décision), les fonctions support ensuite. Un libellé qui matche plusieurs
 *  familles est résolu sur la PREMIÈRE d'ici. */
export const BUYER_ROLE_FAMILY_KEYS = [
  'it',
  'cyber',
  'data',
  'ia',
  'infra',
  'dev',
  'finance',
  'achat',
  'pmo',
  'clevel',
  'rh',
] as const
export type BuyerRoleFamilyKey = (typeof BUYER_ROLE_FAMILY_KEYS)[number]

interface BuyerRoleFamily {
  key: BuyerRoleFamilyKey
  /** Le libellé tel qu'il est PERSISTÉ sur `contacts.family` — la valeur de
   *  `contactFamilySchema`, jamais réécrite : des lignes la portent déjà. */
  contactFamily: ContactFamily
  /** Le libellé d'affichage servi par l'API, verbatim (aucun écran ne change).
   *  Pas de `labelEn` ici : la matrice rend aujourd'hui la chaîne de l'API et
   *  n'a pas de clé i18n pour elle. Un libellé anglais que personne ne lirait
   *  serait du code que personne n'appelle — le portage i18n est en D176. */
  labelFr: string
  /** Compte vers l'objectif de largeur (« 2-3 familles » de la méthode plan de
   *  compte). Les fonctions support (PMO / Direction générale / RH) sont
   *  suivies et affichées, mais ne comptent pas. */
  isTarget: boolean
  /** Tout ce qui, normalisé, DÉSIGNE cette famille. Contient les alias
   *  historiques de la matrice ET les libellés composés que le prompt de
   *  classification demande au modèle — c'est cette seconde moitié qui manquait.
   *  Écrits en clair : `normalizeBuyerRoleFamilyToken` les réduit au moment du
   *  rapprochement. */
  aliases: readonly string[]
  /** Les intitulés à viser par niveau, pour formuler une zone blanche. */
  titles: Readonly<Record<CoverageLevel, string>>
}

/**
 * Les libellés que le classifieur peut écrire et qui ne sont PAS des familles.
 *
 * « Autre » est la douzième valeur du prompt : le mot que le modèle emploie
 * quand il ne sait pas. Le rattacher à une famille ferait entrer un contact non
 * classé dans une case de la matrice — un « couvert » qui ne l'est pas. Nommé
 * ici pour que personne ne le « corrige » en alias.
 */
export const NON_FAMILY_CLASSIFIER_LABELS = ['Autre'] as const

export const BUYER_ROLE_FAMILIES: readonly BuyerRoleFamily[] = [
  {
    key: 'it',
    contactFamily: 'IT',
    labelFr: 'IT / DSI',
    isTarget: true,
    aliases: ['IT', 'DSI', 'SI', 'informatique', 'information technology', 'IT / Infrastructure'],
    titles: { c_level: 'DSI / CIO', n1: 'Directeur des SI / Adjoint DSI', n2: 'Responsable SI / IT Manager' },
  },
  {
    key: 'cyber',
    contactFamily: 'Cyber',
    labelFr: 'Cyber / Sécurité',
    isTarget: true,
    aliases: ['cyber', 'cybersécurité', 'sécurité', 'security', 'RSSI', 'CISO', 'SSI'],
    titles: {
      c_level: 'CISO / RSSI Groupe',
      n1: 'RSSI / Directeur Cybersécurité',
      n2: 'Responsable SSI / Analyste sécurité',
    },
  },
  {
    key: 'data',
    contactFamily: 'Data',
    labelFr: 'Data',
    isTarget: true,
    aliases: ['data', 'données', 'analytics', 'BI', 'data science', 'Data / BI / Analytics'],
    titles: { c_level: 'Chief Data Officer', n1: 'Head of Data / Directeur Data', n2: 'Data Lead / Data Manager' },
  },
  {
    key: 'ia',
    contactFamily: 'IA',
    labelFr: 'IA',
    isTarget: true,
    // #2635.1 — la famille ne reconnaissait qu'un vocabulaire figé (IA, AI, ML,
    // machine learning) : « Head of AI », « VP AI », « MLOps » et « FDE »
    // (Forward Deployed Engineer) — des intitulés RÉELS vus chez
    // Decathlon/Accor/Carrefour — n'y tombaient pas.
    aliases: ['IA', 'AI', 'ML', 'machine learning', 'IA / ML', 'GenAI', 'MLOps', 'FDE', 'Forward Deployed Engineer'],
    titles: { c_level: 'Chief AI Officer', n1: 'Directeur Data & IA / Head of AI', n2: 'Lead ML / Responsable IA' },
  },
  {
    key: 'infra',
    contactFamily: 'Infra',
    labelFr: 'Infra / Cloud',
    isTarget: true,
    aliases: ['infra', 'infrastructure', 'cloud', 'ops', 'réseau', 'SRE', 'network'],
    titles: {
      c_level: 'CTO Infrastructure',
      n1: 'Directeur Infrastructure / Cloud',
      n2: 'Responsable Infra / SRE Lead',
    },
  },
  {
    key: 'dev',
    contactFamily: 'Dev',
    labelFr: 'Dev / Engineering',
    isTarget: true,
    aliases: [
      'dev',
      'développement',
      'development',
      'engineering',
      'software',
      'études',
      'Developpement / Architecture',
    ],
    titles: { c_level: 'CTO', n1: 'VP Engineering / Directeur Technique', n2: 'Engineering Manager / Tech Lead' },
  },
  {
    key: 'finance',
    contactFamily: 'Finance',
    labelFr: 'Finance',
    isTarget: true,
    aliases: ['finance', 'financier', 'DAF', 'comptabilité', 'gestion', 'Finance / Controle de gestion'],
    titles: { c_level: 'DAF / CFO', n1: 'Directeur Financier / Contrôle de gestion', n2: 'Responsable financier' },
  },
  {
    key: 'achat',
    contactFamily: 'Achat',
    labelFr: 'Achats',
    isTarget: true,
    aliases: ['achat', 'achats', 'procurement', 'purchasing', 'sourcing', 'vendor', 'Achat / Procurement'],
    titles: {
      c_level: 'Directeur Achats Groupe',
      n1: 'Directeur Achats IT / Vendor Manager',
      n2: 'Acheteur IT / Category Manager',
    },
  },
  {
    key: 'pmo',
    contactFamily: 'PMO',
    labelFr: 'PMO / Projet',
    isTarget: false,
    aliases: ['PMO', 'projet', 'project', 'delivery', 'programme', 'PMO / Transformation'],
    titles: { c_level: 'Directeur de programme', n1: 'Head of PMO / Directeur de projets', n2: 'Chef de projet / PMO' },
  },
  {
    key: 'clevel',
    contactFamily: 'C-Level',
    labelFr: 'Direction générale',
    isTarget: false,
    aliases: [
      'C-Level',
      'C-Levels',
      'direction',
      'direction générale',
      'comex',
      'codir',
      'executive',
      'C-suite',
      'Direction generale / C-Level',
    ],
    titles: { c_level: 'DG / PDG', n1: 'Directeur général adjoint', n2: 'Directeur de cabinet' },
  },
  {
    key: 'rh',
    contactFamily: 'RH',
    labelFr: 'RH',
    isTarget: false,
    aliases: ['RH', 'HR', 'ressources humaines', 'talent', 'recrutement', 'recruitment', 'RH / Talent'],
    titles: { c_level: 'DRH', n1: 'Directeur des Ressources Humaines', n2: 'Responsable recrutement tech' },
  },
]

/**
 * Réduit un libellé à sa clé de comparaison : déaccentué, minuscule, sans rien
 * qui ne soit lettre ou chiffre.
 *
 * C'est la normalisation historique de la matrice de couverture (`norm`) et son
 * miroir Python (`_key` de `contact_segments.py`), remontée ici pour que les
 * trois côtés cessent d'en porter chacun une copie.
 */
export function normalizeBuyerRoleFamilyToken(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Index alias normalisé → clé de famille, construit une fois. La première
 *  famille qui revendique un token le garde (l'ordre de `BUYER_ROLE_FAMILIES`
 *  fait foi) ; le test interdit de toute façon qu'un token soit revendiqué deux
 *  fois. */
const FAMILY_BY_TOKEN: ReadonlyMap<string, BuyerRoleFamilyKey> = new Map(
  BUYER_ROLE_FAMILIES.flatMap(family =>
    [family.key, ...family.aliases]
      .map(token => [normalizeBuyerRoleFamilyToken(token), family.key] as const)
      .filter(([token]) => token !== ''),
  ),
)

const NON_FAMILY_TOKENS: ReadonlySet<string> = new Set(NON_FAMILY_CLASSIFIER_LABELS.map(normalizeBuyerRoleFamilyToken))

/**
 * La famille désignée par un libellé, ou `null`.
 *
 * `null` veut dire « ce libellé ne nomme aucune des onze familles » — pas
 * « famille inconnue rangée quelque part ». L'appelant décide quoi en faire
 * (la matrice de couverture retombe sur les mots-clés du titre) ; il ne reçoit
 * jamais une famille devinée.
 *
 * Le refus des libellés NON-familles est explicite plutôt qu'accidentel : si
 * « Autre » se retrouvait un jour dans une liste d'alias, ce garde-fou vaudrait
 * toujours, et la case de la matrice ne se cocherait pas sur un aveu
 * d'ignorance du modèle.
 */
export function resolveBuyerRoleFamily(raw: string | null | undefined): BuyerRoleFamilyKey | null {
  const token = normalizeBuyerRoleFamilyToken(raw)
  if (!token || NON_FAMILY_TOKENS.has(token)) return null
  return FAMILY_BY_TOKEN.get(token) ?? null
}

/**
 * Déaccentue et met en minuscules SANS retirer les espaces — contrairement à
 * `normalizeBuyerRoleFamilyToken`, qui les retire pour comparer un jeton exact.
 * Une regex à frontière de mot (`\bpmo\b`) a besoin de conserver ces frontières :
 * c'est ce que `resolveBuyerRoleFamilyFromTitle` (#2165.37) et le référentiel de
 * niveau (`contact-level.ts`, #2165.35) testent contre un intitulé de poste en
 * texte libre.
 */
export function deaccentLower(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * #2165.37 — l'EXPERTISE d'un contact découvert, déduite UNE FOIS de son
 * intitulé de poste, quand aucun `family` structuré n'existe sur la source.
 *
 * Remontée de `TITLE_FAMILY_HINTS` (`apps/api/.../coverage.service.ts`), qui la
 * déclarait en repli pour les contacts importés sans `family` — même liste,
 * même ordre (familles cibles d'abord, un titre qui matche plusieurs indices
 * résout sur la première). Un intitulé qui ne matche aucun indice rend `null` —
 * « expertise inconnue », jamais une famille devinée par ressemblance.
 */
export const TITLE_TO_FAMILY_HINTS: readonly { re: RegExp; key: BuyerRoleFamilyKey }[] = [
  { re: /\brssi\b|\bciso\b|cyber|securit/, key: 'cyber' },
  { re: /\bdsi\b|directeur\s+des?\s+syst[eè]mes|\bit\s+manager\b|information\s+technology/, key: 'it' },
  { re: /\bdata\b|donn[ée]es|analytics|\bbi\b/, key: 'data' },
  {
    // #2635.1 — élargi au-delà de « IA/ML » : le vocabulaire anglophone
    // (\bai\b) et les intitulés spécialisés (GenAI, MLOps, FDE) manquaient.
    re: /intelligence\s+artificielle|machine\s+learning|\bml\b|\bia\b|\bai\b|genai|mlops|\bfde\b|forward\s+deployed\s+engineer/,
    key: 'ia',
  },
  { re: /infrastructure|\bcloud\b|r[ée]seaux?|\bsre\b|\bops\b/, key: 'infra' },
  { re: /d[ée]veloppement|engineering|software|\bdev\b|\betudes\b/, key: 'dev' },
  { re: /\bdaf\b|financ|comptab|contr[oô]le\s+de\s+gestion/, key: 'finance' },
  { re: /\bachat|procurement|purchasing|sourcing|fournisseur/, key: 'achat' },
  { re: /\bpmo\b|chef\s+de\s+projet|programme|delivery/, key: 'pmo' },
  { re: /ressources\s+humaines|\brh\b|\bhr\b|talent|recrutement/, key: 'rh' },
]

/** L'expertise déduite du seul intitulé de poste (texte libre). `null` = aucun
 *  indice reconnu — nommé « expertise inconnue » côté appelant, jamais deviné. */
export function resolveBuyerRoleFamilyFromTitle(title: string | null | undefined): BuyerRoleFamilyKey | null {
  const text = deaccentLower(title)
  if (!text) return null
  for (const hint of TITLE_TO_FAMILY_HINTS) {
    if (hint.re.test(text)) return hint.key
  }
  return null
}
