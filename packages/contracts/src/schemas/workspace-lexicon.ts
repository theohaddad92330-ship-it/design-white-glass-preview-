import { z } from 'zod'

/**
 * Le lexique d'un espace (D17, 28/08/2026) — les mots qu'une ESN emploie pour
 * nommer les objets du produit, et ceux qu'elle refuse d'y lire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * La MOITIÉ « textes générés » est livrée depuis l'addendum Stelya :
 * `offer_portfolio.preferred_terms` / `.forbidden_terms` (deux listes de
 * chaînes) descendent jusqu'au prompt de TOUS les modèles — y compris Laura —
 * par `seller_context.py` → `offerPortfolioContext` → `portfolio_context_block`
 * → `domain_brief`. Un message généré respecte donc déjà le vocabulaire de
 * l'espace, et le commentaire du contrat le disait explicitement : « appliqué
 * aux textes GÉNÉRÉS, jamais à l'interface ».
 *
 * Ce qui manquait est l'INTERFACE, et deux choses l'empêchaient :
 *
 *  1. Une liste plate de chaînes ne peut PAS renommer un libellé. « Affaire »
 *     ne dit pas ce qu'il remplace : ni le produit ni le modèle ne peuvent
 *     deviner que c'est le mot pour « Projet ». Il faut une surcharge par
 *     CONCEPT, ce que ce fichier ajoute.
 *  2. Un terme interdit n'empêchait rien à l'écran. Il ne teintait que du texte
 *     généré ; le mot refusé restait dans la navigation.
 *
 * D17 tranche : on livre l'interface. Ce fichier est le delta, et il se pose
 * DANS le portefeuille d'offre — pas à côté. Un réglage vit à un seul endroit
 * (GA-26) : mettre les mots préférés dans une table neuve pendant que les mots
 * interdits restent en JSONB aurait donné deux domiciles au même réglage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST BORNÉ, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Un lexique « appliqué à tous les libellés » ne tient pas : l'application
 * compte 9 430 libellés français, dont 502 emploient le mot « compte », 372
 * « contact » et 170 « besoin » — presque tous À L'INTÉRIEUR d'une phrase
 * (« Aucun compte ne correspond à cette recherche »). Remplacer un mot dans une
 * phrase demande d'en accorder le déterminant, le nombre et le participe : la
 * première ESN qui écrit « Affaire » à la place de « Projet » lirait « Aucun
 * Affaire ne correspond ».
 *
 * D'où la borne, qui est une RÈGLE et pas une liste d'exceptions :
 *
 *   **Le lexique remplace un libellé dont la valeur ENTIÈRE est le nom de
 *   l'objet. Il ne réécrit JAMAIS une phrase.**
 *
 * « Comptes » (l'entrée de navigation) se remplace ; « Aucun compte ne
 * correspond » ne se remplace pas. La règle est vérifiable à l'œil, elle ne
 * dépend d'aucune analyse grammaticale, et elle ne peut pas produire une phrase
 * fausse. Ce qu'elle NE COUVRE PAS est écrit dans {@link LEXICON_OUT_OF_SCOPE}
 * et AFFICHÉ sur l'écran de réglage — un lexique partiel qui dit ce qu'il ne
 * fait pas vaut mieux qu'un lexique total qui ment sur la moitié.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA VALEUR PAR DÉFAUT RESTE CELLE DU PRODUIT (D3)
 * ─────────────────────────────────────────────────────────────────────────────
 * D3 a tranché le 26/08 que le vocabulaire par défaut est « Besoin », et cela ne
 * change pas. Le lexique SURCHARGE, pour l'espace qui le demande. Un espace sans
 * lexique lit exactement les libellés d'aujourd'hui — no-op strict, prouvé clé
 * par clé par `apps/web/src/i18n/workspace-lexicon.test.ts`.
 *
 * ⚠️ À ne pas confondre avec `account_vocabulary` (migration
 * `1783400000000-AccountVocabulary.ts`), qui est la grille de lecture d'un
 * COMPTE PROSPECT — les entités, programmes et acronymes du groupe analysé,
 * dérivés d'un run, écrits par `AccountVocabularyService.saveVocabulary`. Rien à
 * voir : celle-là décrit le client, celle-ci décrit l'ESN qui s'en sert.
 */

/**
 * Les concepts dont le nom se surcharge.
 *
 * Huit, pas plus, et chacun mérite sa place pour la même raison : deux ESN
 * clientes ne le nomment pas pareil, et le mot est un OBJET du produit (il a un
 * écran, une entrée de navigation, un type dans le lanceur) — donc il apparaît
 * SEUL, comme libellé, quelque part. Un concept qui n'apparaît jamais seul ne
 * serait pas surchargeable par la règle ci-dessus.
 *
 * Ce qui n'y est PAS, et pourquoi : « crédit », « analyse », « espace » et
 * « intégration » ne varient pas d'une ESN à l'autre — ce sont les mots du
 * produit qu'on achète, pas ceux du métier qu'on exerce. « Laura » est un NOM
 * (D82), elle ne se renomme pas.
 */
export const LEXICON_CONCEPTS = [
  'need',
  'project',
  'account',
  'contact',
  'consultant',
  'talent_pool',
  'mission',
  'submission',
] as const
export const lexiconConceptSchema = z.enum(LEXICON_CONCEPTS)
export type LexiconConcept = (typeof LEXICON_CONCEPTS)[number]

/** Les langues de l'interface. Un terme se pose PAR LANGUE : « Affaire » n'a pas
 *  de traduction évidente, et la deviner en écrirait une fausse. */
export const LEXICON_LOCALES = ['fr', 'en'] as const
export const lexiconLocaleSchema = z.enum(LEXICON_LOCALES)
export type LexiconLocale = (typeof LEXICON_LOCALES)[number]

/** Un terme se décline au singulier et au pluriel — et rien d'autre. Le genre
 *  n'est pas demandé : il ne servirait qu'à accorder un déterminant DANS une
 *  phrase, et le lexique ne touche pas aux phrases. */
export const LEXICON_FORMS = ['one', 'other'] as const
export type LexiconForm = (typeof LEXICON_FORMS)[number]

export type LexiconTerm = { one: string; other: string }

/**
 * Le vocabulaire PAR DÉFAUT du produit — ce que lit un espace sans lexique.
 *
 * Chaque valeur est RECOPIÉE du libellé livré, pas choisie ici : c'est ce qui
 * rend la preuve de non-régression possible.
 *
 * ⚠️ L'anglais du dépôt n'est pas stable sur `mission` : la navigation dit
 * « Missions », la liste et les raccourcis disent « Assignments ». Le défaut
 * retenu est « Assignment » (le mot du métier), et les trois libellés qui
 * disent « Missions » restent byte-identiques sans surcharge — la table de
 * liaison porte la chaîne d'origine de CHAQUE clé, pas celle du concept.
 */
export const LEXICON_DEFAULTS: Record<LexiconConcept, Record<LexiconLocale, LexiconTerm>> = {
  need: { fr: { one: 'Besoin', other: 'Besoins' }, en: { one: 'Need', other: 'Needs' } },
  // #2152.1, #2182 (décision de Louis du 16/09/2026) — « Opportunités » devient
  // le DÉFAUT. C'est le mot du métier de l'ESN, et la table SQL s'appelle déjà
  // `opportunities`. L'espace qui préfère « Projets » le pose lui-même : c'est
  // exactement ce que ce lexique sert à faire, et c'est pour ça que le
  // renommage n'est pas un chantier de trente-cinq chaînes.
  project: { fr: { one: 'Opportunité', other: 'Opportunités' }, en: { one: 'Opportunity', other: 'Opportunities' } },
  account: { fr: { one: 'Compte', other: 'Comptes' }, en: { one: 'Account', other: 'Accounts' } },
  contact: { fr: { one: 'Contact', other: 'Contacts' }, en: { one: 'Contact', other: 'Contacts' } },
  consultant: { fr: { one: 'Consultant', other: 'Consultants' }, en: { one: 'Consultant', other: 'Consultants' } },
  talent_pool: { fr: { one: 'Vivier', other: 'Viviers' }, en: { one: 'Talent pool', other: 'Talent pools' } },
  mission: { fr: { one: 'Mission', other: 'Missions' }, en: { one: 'Assignment', other: 'Assignments' } },
  submission: {
    fr: { one: 'Positionnement', other: 'Positionnements' },
    en: { one: 'Submission', other: 'Submissions' },
  },
}

/**
 * Ce que chaque concept désigne, et le FAIT qui justifie qu'il soit
 * surchargeable — les variantes ne sont pas supposées, elles sont celles que le
 * dépôt emploie déjà ailleurs pour la même chose.
 */
export const LEXICON_CONCEPT_EVIDENCE: Record<LexiconConcept, string> = {
  need: 'Le rôle recherché sur un projet. D3 a fixé « Besoin » comme défaut ; le produit écrit aussi « rôle recherché », et une ESN venue du recrutement dit « Poste ».',
  project:
    'L’affaire client dans le pipe. Le défaut est « Opportunité » depuis le 16/09/2026 — le mot du métier de l’ESN, et celui de la table SQL (`opportunities`). « Projet » reste le mot d’une ESN qui vend au forfait : il se pose par le lexique.',
  account:
    'L’entreprise suivie. Le produit écrit « Compte », mais aussi « Dossier » sur l’écran de création de contact.',
  contact: 'La personne chez le client. « Interlocuteur » est le mot du métier, déjà employé par les prompts.',
  consultant:
    'La personne que l’ESN positionne. Le catalogue des types de talent distingue déjà salarié, indépendant et sous-traitant : « Collaborateur » et « Intervenant » ne disent pas la même chose selon le contrat.',
  talent_pool:
    'L’ensemble des consultants. « Vivier » en français, « Talent pool » en anglais, « Pool » dans un onglet — trois mots pour un objet.',
  mission:
    'La prestation vendue. La navigation dit « Missions » et la liste « Assignments » : l’anglais du dépôt n’est déjà pas d’accord avec lui-même.',
  submission:
    'La proposition d’un consultant sur un besoin. « Positionnement » côté ESN, « Candidature » côté recrutement, « Proposition » côté conseil.',
}

/**
 * Ce que le lexique NE FAIT PAS.
 *
 * Écrit pour être lu par quelqu'un qui vient de s'en servir et se demande
 * pourquoi un mot n'a pas bougé. Cette liste est affichée TELLE QUELLE sur
 * l'écran de réglage : ce n'est pas une note interne.
 */
export const LEXICON_OUT_OF_SCOPE = [
  /** Les 9 000 libellés où le mot est DANS une phrase. Les accorder demanderait
   *  une grammaire ; les remplacer sans accorder écrirait « Aucun Affaire ». */
  'sentences',
  /** Les titres d'onglet du navigateur (« Bellum AI - Comptes ») : une chaîne
   *  composée, donc une phrase au sens de la règle. */
  'document_titles',
  /** Les objets d'un SYSTÈME TIERS sur les écrans de connecteurs. Renommer
   *  « Contacts » en « Interlocuteurs » là mentirait sur ce que l'outil lit. */
  'third_party_objects',
  /** La grille tarifaire : commune à tous les espaces, elle sert d'argument
   *  commercial. Un espace ne renomme pas ce qu'il achète. */
  'pricing_grid',
  /** Les indicateurs comparables entre espaces — les renommer casserait la
   *  seule chose qui rend deux espaces comparables. */
  'cross_workspace_metrics',
] as const
export type LexiconOutOfScope = (typeof LEXICON_OUT_OF_SCOPE)[number]

/** Une surcharge : le mot de cette équipe pour ce concept, dans cette langue. */
export const lexiconOverrideSchema = z.object({
  concept: lexiconConceptSchema,
  locale: lexiconLocaleSchema,
  one: z.string().trim().min(1).max(40),
  other: z.string().trim().min(1).max(40),
})
export type LexiconOverride = z.infer<typeof lexiconOverrideSchema>

/**
 * Le lexique STRUCTURÉ, tel qu'il se pose dans `offer_portfolio.lexicon`.
 *
 * `.catch()` partout : une forme écrite par un build plus récent dégrade vers
 * « aucune surcharge », jamais vers une exception — ce réglage est lu sur le
 * chemin d'une analyse, et un portefeuille illisible ferait tomber toutes les
 * analyses de l'espace.
 *
 * #2862 (#2437.8) — `version`/`updatedAt` répondent à la moitié VERSIONNÉE de
 * l'épopée, sans toucher à sa moitié bornée (métier/secteur — voir la borne à
 * deux dimensions plus haut dans ce fichier, `LEXICON_OUT_OF_SCOPE`, qui reste
 * entière). `null` tant qu'aucune modification n'a jamais été enregistrée
 * (« non mesuré n'est jamais 0 ») ; un entier POSITIF dès la première, incrémenté
 * uniquement quand `overrides` change RÉELLEMENT — jamais à chaque écriture du
 * portefeuille d'offre, dont le lexique n'est qu'un champ parmi d'autres.
 * Calculé côté serveur (`OfferPortfolioService.write`), jamais fourni par
 * l'écran : un client ne se croit pas sur parole pour son propre historique.
 */
export const structuredLexiconSchema = z.object({
  overrides: z
    .array(lexiconOverrideSchema)
    .max(LEXICON_CONCEPTS.length * LEXICON_LOCALES.length)
    .catch([])
    .default([]),
  version: z.number().int().positive().nullable().catch(null).default(null),
  updatedAt: z.string().datetime().nullable().catch(null).default(null),
  /**
   * #2862 — QUI a posé la dernière version : l'id du membre, jamais son nom
   * (le nom se résout côté écran depuis `WorkspaceTeam.members`, comme
   * ailleurs — même convention que `MissionRenewalRail.updatedBy`). Calculé
   * SERVEUR, comme `version`/`updatedAt` : un client ne se signe pas lui-même.
   */
  updatedBy: z.string().guid().nullable().catch(null).default(null),
})
export type StructuredLexicon = z.infer<typeof structuredLexiconSchema>

export const EMPTY_STRUCTURED_LEXICON: StructuredLexicon = {
  overrides: [],
  version: null,
  updatedAt: null,
  updatedBy: null,
}

/**
 * #2862 (#2437.8) — la clé de comparaison d'une LISTE de surcharges, pour
 * décider si `overrides` a RÉELLEMENT changé (et mérite d'incrémenter
 * `version`) — indépendante de l'ordre, comme `normaliseLexiconTerm` l'est
 * déjà pour un terme seul.
 */
export function lexiconOverridesFingerprint(overrides: readonly LexiconOverride[]): string {
  return [...overrides]
    .map(entry => `${entry.concept}:${entry.locale}:${entry.one}:${entry.other}`)
    .sort()
    .join('|')
}

/**
 * La clé de comparaison d'un terme : minuscules, sans accent, espaces réduits.
 *
 * Sans elle, « Régie » et « regie » seraient deux interdits différents, et
 * l'utilisateur qui a déjà écrit l'un ne verrait pas que l'autre est là. C'est
 * le même geste que `term_key` dans `account_vocabulary` — un seul normaliseur.
 */
export function normaliseLexiconTerm(term: string): string {
  return term.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * LA dérivation — la seule. Résout, pour une langue, le terme de chaque concept.
 *
 * Un espace sans surcharge ⇒ {@link LEXICON_DEFAULTS} à l'identique. Une
 * surcharge posée dans l'AUTRE langue ⇒ aucun effet ici : un terme choisi en
 * français ne se traduit pas tout seul, et le deviner écrirait un mot que
 * personne n'a choisi.
 *
 * Un réglage vit à UN seul endroit (GA-26) : le web l'appelle pour ses libellés,
 * l'écran de réglage pour son aperçu. Deux chemins qui la referaient
 * divergeraient.
 */
export function resolveLexicon(
  lexicon: Pick<StructuredLexicon, 'overrides'>,
  locale: LexiconLocale,
): Record<LexiconConcept, LexiconTerm> {
  const resolved = {} as Record<LexiconConcept, LexiconTerm>
  for (const concept of LEXICON_CONCEPTS) {
    const override = lexicon.overrides.find(entry => entry.concept === concept && entry.locale === locale)
    resolved[concept] = override ? { one: override.one, other: override.other } : LEXICON_DEFAULTS[concept][locale]
  }
  return resolved
}

/** Un espace a-t-il posé quoi que ce soit ? Sert à ne RIEN faire quand non. */
export function isEmptyStructuredLexicon(lexicon: Pick<StructuredLexicon, 'overrides'>): boolean {
  return lexicon.overrides.length === 0
}

/**
 * Ce qu'un terme INTERDIT empêche, exprimé en refus vérifiables.
 *
 * Un interdit qui n'empêche rien est une case décorative. Celui-ci fait TROIS
 * choses. Les deux premières sont ici — des refus d'enregistrement, donc des
 * erreurs que l'utilisateur LIT :
 *
 *  1. `preferred_is_forbidden` — on ne peut pas préférer un mot qu'on s'interdit.
 *     Sans ce refus, un espace pouvait s'interdire « mission » et l'écrire
 *     lui-même dans la case d'à côté : l'interdit ne voulait alors rien dire.
 *
 *  2. `forbidden_without_replacement` — interdire le mot PAR DÉFAUT du produit
 *     sans dire par quoi le remplacer laisserait le mot à l'écran. C'est le
 *     refus qui fait mordre l'interdit sur les LIBELLÉS : il force à poser la
 *     surcharge, qui est le seul mécanisme capable de changer un écran. Un
 *     espace qui interdit « Vivier » DOIT donc nommer ce qu'il dit à la place,
 *     et l'entrée de navigation change vraiment.
 *
 * La TROISIÈME chose vit ailleurs et n'est pas un refus : la liste descend dans
 * le prompt de tous les modèles, Laura comprise, par `portfolio_context_block`
 * (apps/ia/app/services/portfolio_context.py). Elle était déjà branchée avant ce
 * lot — c'est la moitié « textes générés » du lexique.
 */
export const LEXICON_VIOLATIONS = ['preferred_is_forbidden', 'forbidden_without_replacement'] as const
export type LexiconViolationCode = (typeof LEXICON_VIOLATIONS)[number]

export type LexiconViolation = {
  code: LexiconViolationCode
  /** Le mot en cause, tel que l'utilisateur l'a écrit. */
  term: string
  /** Le concept concerné, quand il y en a un. */
  concept: LexiconConcept
  locale: LexiconLocale
}

/**
 * Les refus, calculés sans base de données.
 *
 * Pure exprès : c'est la seule règle du lot qui mérite d'être testée sans rien
 * brancher, et les DEUX côtés l'appellent — l'écran pour prévenir avant le clic,
 * l'API parce qu'un client ne se croit pas sur parole.
 */
export function lexiconViolations(
  lexicon: Pick<StructuredLexicon, 'overrides'>,
  forbiddenTerms: readonly string[],
): LexiconViolation[] {
  const violations: LexiconViolation[] = []
  const forbiddenKeys = new Set(forbiddenTerms.map(normaliseLexiconTerm))
  if (forbiddenKeys.size === 0) return violations

  // 1. Un terme préféré ne peut pas être un terme interdit.
  for (const override of lexicon.overrides) {
    for (const form of LEXICON_FORMS) {
      const written = override[form]
      if (forbiddenKeys.has(normaliseLexiconTerm(written))) {
        violations.push({
          code: 'preferred_is_forbidden',
          term: written,
          concept: override.concept,
          locale: override.locale,
        })
      }
    }
  }

  // 2. Interdire un mot PAR DÉFAUT du produit oblige à donner le remplaçant —
  //    sinon le mot reste à l'écran et l'interdit n'aura rien empêché.
  for (const concept of LEXICON_CONCEPTS) {
    for (const locale of LEXICON_LOCALES) {
      const fallback = LEXICON_DEFAULTS[concept][locale]
      const hit = [fallback.one, fallback.other].find(word => forbiddenKeys.has(normaliseLexiconTerm(word)))
      if (hit === undefined) continue
      const override = lexicon.overrides.find(entry => entry.concept === concept && entry.locale === locale)
      if (!override) {
        violations.push({ code: 'forbidden_without_replacement', term: hit, concept, locale })
      }
    }
  }

  return violations
}
