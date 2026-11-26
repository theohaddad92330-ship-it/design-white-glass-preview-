import { z } from 'zod'
import type { Rank1Incumbent } from './account-entity.js'
import type { SellingPosture } from './profile-context.js'

/**
 * Les ESN présentes sur un compte (PDF 2 §4.1, décision D11 de Louis : oui, un
 * onglet dédié, « la stratégie rang 1 se pilote au niveau compte »).
 *
 * `partnerScore` et `rank1Recommendation` sont les deux dernières des cinq
 * fonctions pures que le PDF 1 avait nommées sans les écrire, faute de
 * consommateur. Cet onglet est ce consommateur.
 */
export const PARTNER_RANKS = ['rank1', 'rank2', 'unknown'] as const
export const partnerRankSchema = z.enum(PARTNER_RANKS)
export type PartnerRank = (typeof PARTNER_RANKS)[number]

/**
 * Ce qu'est cette ESN POUR NOUS sur ce compte.
 *
 * La nuance est tout le sujet : un rang 1 avec qui on travaille est une porte
 * d'entrée, un rang 1 avec qui on ne travaille pas est un mur. Les ranger tous
 * les deux sous « présent » ferait rater la moitié des ouvertures.
 */
export const PARTNER_RELATIONSHIPS = ['partner', 'competitor', 'unknown'] as const
export const partnerRelationshipSchema = z.enum(PARTNER_RELATIONSHIPS)
export type PartnerRelationship = (typeof PARTNER_RELATIONSHIPS)[number]

/**
 * Trois niveaux, repris du champ voisin `esnSynergies` plutôt qu'inventés.
 *
 * Une ESN présente sur un compte PRIVÉ est une INFÉRENCE : aucune source
 * publique ne publie les panels fournisseurs privés (tome 3 §3). La certitude
 * n'est donc jamais décorative — c'est elle qui empêche de présenter une
 * déduction comme un fait.
 */
export const ESN_PRESENCE_CERTAINTIES = ['forte', 'moyenne', 'faible'] as const
export const esnPresenceCertaintySchema = z.enum(ESN_PRESENCE_CERTAINTIES)
export type EsnPresenceCertainty = (typeof ESN_PRESENCE_CERTAINTIES)[number]

/**
 * #1605 — LES ORIGINES DE PREUVE D'UNE LIGNE, ET POURQUOI ELLES SONT PLUSIEURS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE RETOUR CORRIGE, ET IL A RAISON
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ne pas utiliser un seul enum `source` comme vérité finale. » `source` dit
 * comment la LIGNE a été créée — c'est un fait d'origine, il ne bouge plus.
 * Mais une même ESN peut être connue de trois façons EN MÊME TEMPS : déclarée
 * par l'équipe, observée dans les parcours du corpus, et déduite d'une source
 * actuelle. Écraser les trois dans un champ unique, c'est perdre l'information
 * la plus forte de l'écran — que trois chemins indépendants pointent au même
 * endroit.
 *
 * ⚠️ **Ce que ça change par rapport à #1579**, et il faut le dire : l'onglet
 * gardait deux listes séparées, avec un drapeau `alsoKnown` pour éviter d'écrire
 * « ALTEN » deux fois. Le raisonnement d'alors — « fusionner perdrait ce qui
 * distingue AUJOURD'HUI de STRUCTURELLEMENT » — était juste, et c'est
 * exactement ce que cette liste préserve : on fusionne la LIGNE, on garde les
 * PREUVES. Le drapeau `alsoKnown` en était la première approximation.
 */
/**
 * `declared_subcontracting` — #1624.7 — AJOUTÉE À LA FIN (GA-08 : un enum
 * n'insère jamais une valeur au milieu). Ce n'est ni une déclaration de
 * l'espace (`workspace_declared`) ni une observation du corpus de parcours
 * (`market_observation`) : c'est l'ESN ELLE-MÊME qui a déclaré, ailleurs dans
 * le produit (le référentiel ESN lu par `/consultants`), être ouverte à la
 * sous-traitance. `openToSubcontracting` existait déjà côté référentiel et
 * n'était branché sur AUCUN écran de compte — cette origine est ce
 * branchement, derrière le drapeau `market_memory_partners_enabled`
 * (déploiement progressif, #1624.9).
 */
export const PARTNER_EVIDENCE_ORIGINS = [
  'workspace_declared',
  'market_observation',
  'current_inference',
  'declared_subcontracting',
] as const
export const partnerEvidenceOriginSchema = z.enum(PARTNER_EVIDENCE_ORIGINS)
export type PartnerEvidenceOrigin = (typeof PARTNER_EVIDENCE_ORIGINS)[number]

export const accountPartnerSchema = z.object({
  id: z.string().guid(),
  account_id: z.string().guid(),
  entity_id: z.string().guid().nullable(),
  name: z.string(),
  rank: partnerRankSchema,
  relationship: partnerRelationshipSchema,
  note: z.string().nullable(),
  /** `declared` = quelqu'un l'a saisi. `analysis` = le pipeline l'a détecté et
   *  personne ne l'a encore confirmé. La distinction se voit à l'écran. */
  source: z.enum(['declared', 'analysis']),
  placements: z.number().int().min(0),
  /** Le niveau de confiance de la DÉTECTION. `null` sur une ligne saisie à la
   *  main : personne ne l'a évaluée, et la dire « faible » serait un jugement
   *  que nul n'a porté. */
  certainty: esnPresenceCertaintySchema.nullable(),
  /**
   * #1605 — TOUTES les façons dont cette ESN est connue, simultanément.
   *
   * `.optional()` pour le deploy-skew : une API antérieure au champ ne le rend
   * pas, et l'écran retombe alors sur `source` seul, comme avant.
   *
   * ⚠️ **`current_inference_certainty` n'existe pas, et c'est délibéré.** Le
   * retour le demande nommément, mais {@link accountPartnerSchema.certainty}
   * porte DÉJÀ exactement cela — « le niveau de confiance de la DÉTECTION ».
   * Un second champ au même contenu diverge du premier au premier changement de
   * règle, et c'est celui des deux qu'on croit qui décide de ce qu'on dit au
   * client. Un réglage vit à un seul endroit.
   */
  evidence_origins: z.array(partnerEvidenceOriginSchema).optional(),
  /**
   * #1605 — combien de parcours du corpus relient cette société au compte.
   *
   * `null` quand la mémoire marché ne l'observe pas : « non observée » n'est
   * jamais « zéro parcours », et la liste ne s'ordonne pas dessus.
   */
  market_observation_count: z.number().int().min(0).nullable().optional(),
  /** Le périmètre estimé chez ce client. */
  scope: z.string().nullable(),
  /** Quand l'analyse l'a détectée — l'écran refuse d'afficher une ESN détectée
   *  sans sa date (tome 1 §21.5). */
  detected_at: z.string().nullable(),
  created_at: z.string(),
  /**
   * #1818.2 — LE LOGO, QUAND IL EST SANS AMBIGUÏTÉ.
   *
   * `account_partners` ne porte ni domaine ni site (voir le docblock de
   * `AccountPartnerEntity`), et `esn_directory.domain` est une colonne
   * documentée comme jamais écrite (`unwritten-columns.ts` — 93 % des
   * domaines dérivés du nom étaient faux). Deviner un domaine a déjà été
   * essayé puis retiré : ce n'est donc pas repris ici.
   *
   * La seule source réelle : un compte DÉJÀ ANALYSÉ du même espace, dont le
   * nom normalisé correspond exactement à celui du partenaire — l'ESN
   * partenaire a alors été elle-même analysée comme client, et porte un vrai
   * `logo_url`. `PartnersService.attachLogos` applique EXACTEMENT la règle
   * posée pour les homonymes THALES (#1756.3, lot 14, `companies.controller.ts`) :
   * un rapprochement par nom seul ne vaut que quand il est SANS AMBIGUÏTÉ.
   * Deux comptes ou plus portant ce nom normalisé → aucun des deux ne
   * l'emporte, `logo_url`/`website` restent absents, et la pastille à
   * initiale reste — jamais une fusion, jamais un choix arbitraire.
   *
   * `.optional()` pour le deploy-skew (comme `evidence_origins` ci-dessus) :
   * une API antérieure à ce champ ne le rend pas du tout.
   */
  logo_url: z.string().nullable().optional(),
  /** Le site du compte apparié, pour le seul repli favicon d'affichage — la
   *  même paire que `accounts.logo_url` / `accounts.website` ailleurs dans le
   *  produit. Jamais persisté ici : recalculé à chaque lecture, depuis le
   *  MÊME compte unique que `logo_url`. */
  website: z.string().nullable().optional(),
  /**
   * #2151.42 / #2166.38 — LA RELATION WORKSPACE.
   *
   * L'id du compte DÉJÀ POSSÉDÉ par cet espace quand ce partenaire lui
   * correspond SANS AMBIGUÏTÉ (même rapprochement que `logo_url` ci-dessus,
   * §PartnersService.attachLogos) — vrai même quand ce compte connu ne porte
   * ni logo ni site à afficher. `undefined` (clé absente) quand aucun
   * rapprochement n'a été tenté ou qu'il est ambigu ; jamais un compte deviné.
   *
   * `.optional()` pour le deploy-skew : une API antérieure à ce champ ne le
   * porte pas, et l'écran n'affiche alors aucune relation, comme avant.
   */
  workspace_account_id: z.string().guid().optional(),
  /**
   * #2298.7 — QUI a déclaré cette relation, résolu en NOM (jamais un id brut
   * sur le fil, même geste que `invoicedByName` sur `InvoiceReadiness`).
   *
   * `null` sur toute ligne du pipeline (`source = 'analysis'`) et sur toute
   * ligne déclarée AVANT ce lot — `account_partners.declared_by` n'existait
   * sous aucun nom avant la migration, et l'auteur ne se devine pas.
   * `.optional()` pour le deploy-skew, comme `logo_url` ci-dessus.
   */
  declared_by_name: z.string().nullable().optional(),
  /**
   * #2316.22-.27 — LES CINQ CRITÈRES DE QUALIFICATION D'UN RANG 2.
   *
   * `null` = non mesuré (personne n'a répondu), `false` = mesuré et absent,
   * `true` = mesuré et présent. `.optional()` pour le deploy-skew : une API
   * antérieure à ces cinq colonnes ne les rend pas, et `qualifyRank2` traite
   * une clé absente comme `null` — jamais comme un échec.
   */
  rank2_scope_accessible: z.boolean().nullable().optional(),
  rank2_brief_precise: z.boolean().nullable().optional(),
  rank2_contact_accountable: z.boolean().nullable().optional(),
  rank2_economics_clear: z.boolean().nullable().optional(),
  rank2_next_steps_ready: z.boolean().nullable().optional(),
  /**
   * #3205.4 (épopée #3239) — TROIS des quatre champs manquants de la fiche
   * prestataire (LAU-FINAL-211). Le quatrième, `domaine`, n'est PAS repris :
   * un domaine de site a déjà été tenté et retiré du produit
   * (`esn_directory.domain`, voir le docblock de `logo_url` ci-dessus — 93 %
   * des domaines dérivés du nom étaient faux). `.optional()` pour le
   * deploy-skew, comme les cinq critères de rang 2 ci-dessus.
   */
  /** Le risque concurrentiel, nommé SÉPARÉMENT de `relationship` : une ESN
   *  `partner` sur ce compte peut porter un risque ailleurs dans le groupe.
   *  `null` = non évalué, jamais un risque par défaut. */
  competitive_risk: z.string().nullable().optional(),
  /** Comment ce prestataire COMPLÈTE le périmètre déjà couvert — texte libre
   *  porté par un humain, jamais un score calculé. */
  complementarity: z.string().nullable().optional(),
  /** Quand REVÉRIFIER cette ligne. Jamais calculé : posé par un geste humain. */
  next_verification_at: z.string().nullable().optional(),
  /**
   * #3404.5 — LE LIEN VERS MA RELATION GOUVERNÉE (`partner_relations.id`).
   *
   * Fait de cette présence rang 2 un objet métier structuré (marge plancher,
   * partage, propriétaire du compte, propriétaire du consultant, clause de
   * non-sollicitation, délais de paiement, durée, sortie…) plutôt qu'un badge
   * « partenaire » — ce cadre vit déjà en entier sur `partner_relations`
   * (`partnerGovernanceReadiness`, module `partner-pipeline`) ; ce champ ne le
   * duplique pas, il le DÉSIGNE. `null` = non rapprochée. `.optional()` pour
   * le deploy-skew, comme les autres champs additifs de cette ligne.
   */
  partner_relation_id: z.string().guid().nullable().optional(),
})
export type AccountPartner = z.infer<typeof accountPartnerSchema>

export const createAccountPartnerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  entity_id: z.string().guid().nullish(),
  rank: partnerRankSchema.optional(),
  relationship: partnerRelationshipSchema.optional(),
  note: z.string().trim().max(500).nullish(),
  placements: z.number().int().min(0).max(9999).optional(),
})
export type CreateAccountPartner = z.infer<typeof createAccountPartnerSchema>

/**
 * #2122.46 — « QUALIFIER » UNE RELATION QUE L'ESPACE CONNAÎT DÉJÀ.
 *
 * ⚠️ Ce n'est PAS un doublon de `createAccountPartnerSchema`, et la nuance est
 * tout le sujet. Créer, c'est apprendre à l'espace une ESN qu'il ne connaissait
 * pas — et `PartnersService.create` refuse par un 400 un nom déjà présent,
 * parce que deux lignes pour la même ESN donneraient deux rangs contradictoires
 * et que la recommandation dépendrait de l'ordre de lecture. Il n'existait donc
 * AUCUN geste positif sur une ligne canonique : celle que le pipeline a
 * détectée, dont le rang et la relation valent `unknown`, et qui est justement
 * celle qu'il y a à qualifier.
 *
 * Les deux champs sont facultatifs SÉPARÉMENT — on sait souvent que l'ESN est
 * un concurrent bien avant de savoir si elle est rang 1 — mais le corps VIDE
 * est refusé : « qualifier » sans rien dire n'écrit rien, et une route qui
 * accepte un no-op se lit comme un enregistrement réussi.
 *
 * Aucune valeur nouvelle n'entre en base : `rank` et `relationship` réutilisent
 * les énumérations déjà écrites par le pipeline (GA-11 — la contrainte SQL n'a
 * rien à élargir).
 */
export const qualifyAccountPartnerSchema = z
  .object({
    rank: partnerRankSchema.optional(),
    relationship: partnerRelationshipSchema.optional(),
    /**
     * #2316.34 — LE FAIT TERRAIN, structuré comme le rang et la relation.
     *
     * `note` existe déjà sur la ligne (posé par `create` ou par le pipeline) ;
     * ce champ ne l'invente pas, il ouvre juste `qualify` à l'écrire — le seul
     * chemin qui manquait pour corriger un fait terrain sans passer par le
     * texte libre d'une création. `null` efface, `undefined` laisse intact.
     */
    note: z.string().trim().max(500).nullable().optional(),
    /** #2316.22-.27 — les cinq critères de qualification d'un rang 2, écrits
     *  par ce même formulaire générique (pas un treizième dédié, doctrine
     *  `c75`). `undefined` laisse le critère intact, `null` le repasse à « non
     *  mesuré », `true`/`false` le tranche. */
    rank2_scope_accessible: z.boolean().nullable().optional(),
    rank2_brief_precise: z.boolean().nullable().optional(),
    rank2_contact_accountable: z.boolean().nullable().optional(),
    rank2_economics_clear: z.boolean().nullable().optional(),
    rank2_next_steps_ready: z.boolean().nullable().optional(),
    /** #3205.4 (épopée #3239) — même geste que `note` ci-dessus : UN
     *  formulaire générique, pas un treizième dédié (doctrine `c75`).
     *  `undefined` laisse intact, `null` efface, une valeur la pose. */
    competitive_risk: z.string().trim().max(500).nullable().optional(),
    complementarity: z.string().trim().max(500).nullable().optional(),
    next_verification_at: z.string().nullable().optional(),
    /** #3404.5 — même geste que les champs ci-dessus : `undefined` laisse le
     *  lien intact, `null` le rompt, un id le pose. `PartnersService.qualify`
     *  vérifie que l'id désigne une relation du MÊME espace avant d'écrire. */
    partner_relation_id: z.string().guid().nullable().optional(),
  })
  .refine(
    body =>
      body.rank !== undefined ||
      body.relationship !== undefined ||
      body.note !== undefined ||
      body.rank2_scope_accessible !== undefined ||
      body.rank2_brief_precise !== undefined ||
      body.rank2_contact_accountable !== undefined ||
      body.rank2_economics_clear !== undefined ||
      body.rank2_next_steps_ready !== undefined ||
      body.competitive_risk !== undefined ||
      body.complementarity !== undefined ||
      body.next_verification_at !== undefined ||
      body.partner_relation_id !== undefined,
    {
      message:
        'Dis au moins le rang, la relation ou une information terrain : une qualification vide n’en est pas une.',
    },
  )
export type QualifyAccountPartner = z.infer<typeof qualifyAccountPartnerSchema>

/** « Ce n'est pas exact ». Le motif est OBLIGATOIRE : un écartement sans raison
 *  est invérifiable six mois plus tard, et c'est justement ce qu'on relira pour
 *  savoir si le pipeline se trompe souvent, et sur quoi. */
export const dismissAccountPartnerSchema = z.object({
  reason: z.string().trim().min(1).max(500),
})
export type DismissAccountPartner = z.infer<typeof dismissAccountPartnerSchema>

/**
 * #2316.22-.27 — LES CINQ CRITÈRES QUI QUALIFIENT UN RANG 2, NOMMÉS UNE FOIS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CINQ, ET POURQUOI UNE RÈGLE NO-GO
 * ─────────────────────────────────────────────────────────────────────────────
 * #2316 demande qu'un rang 2 soit qualifié sur cinq critères avant tout
 * CV/positionnement — un commercial qui pousse un CV chez un partenaire dont
 * il ne connaît ni le brief ni l'interlocuteur ne positionne rien, il devine.
 * La règle NO-GO n'est donc pas une préférence : c'est ce qui empêche le
 * chemin rang2 → rang1 (`Rank2PathCard`) de proposer ses trois pas avant que
 * les cinq critères soient au moins mesurés.
 *
 * L'ordre est celui du retour, et il est ADDITIF, comme
 * {@link ECOSYSTEM_RELATION_TYPES} : cinq clés, nommées une fois, jamais
 * recopiées côté écran.
 */
export const RANK2_QUALIFICATION_CRITERIA = [
  'scope_accessible',
  'brief_precise',
  'contact_accountable',
  'economics_clear',
  'next_steps_ready',
] as const
export type Rank2QualificationCriterion = (typeof RANK2_QUALIFICATION_CRITERIA)[number]

/** Le sous-ensemble de {@link AccountPartner} que {@link qualifyRank2} lit —
 *  jamais la ligne entière, pour que le calcul reste pur et testable seul. */
export type Rank2QualificationInput = {
  rank2_scope_accessible?: boolean | null
  rank2_brief_precise?: boolean | null
  rank2_contact_accountable?: boolean | null
  rank2_economics_clear?: boolean | null
  rank2_next_steps_ready?: boolean | null
}

const RANK2_CRITERION_KEYS: Record<Rank2QualificationCriterion, keyof Rank2QualificationInput> = {
  scope_accessible: 'rank2_scope_accessible',
  brief_precise: 'rank2_brief_precise',
  contact_accountable: 'rank2_contact_accountable',
  economics_clear: 'rank2_economics_clear',
  next_steps_ready: 'rank2_next_steps_ready',
}

/** `go` : les cinq critères sont mesurés et vrais — le CV/positionnement peut
 *  s'écrire. `no_go` : au moins un critère MESURÉ est faux — la règle NO-GO
 *  du retour. `incomplete` : aucun critère faux, mais au moins un reste « non
 *  mesuré » — ni un refus, ni un feu vert, nommé comme tel. */
export type Rank2Decision = 'go' | 'no_go' | 'incomplete'

export type Rank2Qualification = {
  decision: Rank2Decision
  /** Les cinq critères, dans l'ordre du retour — jamais un score nu : chaque
   *  axe reste NOMMÉ, y compris ceux qu'on n'a pas mesurés (doctrine : « un
   *  score n'est jamais nu »). */
  criteria: { key: Rank2QualificationCriterion; met: boolean | null }[]
  /** Sort du dénominateur tout critère `null` (doctrine : « non mesuré » ≠
   *  0) — jamais 5, tant que tout n'est pas mesuré. */
  measuredCount: number
  metCount: number
}

/**
 * #2316.22-.27 — QUALIFIE UN RANG 2 SUR SES CINQ CRITÈRES.
 *
 * Pure : ne lit que les cinq colonnes, ne suppose rien d'absent — une clé
 * manquante (deploy-skew) vaut `null`, comme une valeur explicitement `null`.
 */
export function qualifyRank2(input: Rank2QualificationInput): Rank2Qualification {
  const criteria = RANK2_QUALIFICATION_CRITERIA.map(key => ({
    key,
    met: input[RANK2_CRITERION_KEYS[key]] ?? null,
  }))
  const measured = criteria.filter(criterion => criterion.met !== null)
  const met = measured.filter(criterion => criterion.met === true)
  const decision: Rank2Decision = measured.some(criterion => criterion.met === false)
    ? 'no_go'
    : measured.length < criteria.length
      ? 'incomplete'
      : 'go'
  return { decision, criteria, measuredCount: measured.length, metCount: met.length }
}

/**
 * Combien ce partenaire compte sur ce compte, de 0 à 100.
 *
 * Trois facteurs seulement, et volontairement : le RANG (un rang 1 tient la
 * porte), la RELATION (partenaire ou concurrent), et ce qu'on a DÉJÀ placé chez
 * lui — la seule preuve qu'une relation existe vraiment.
 *
 * Aucun facteur n'est deviné : un partenaire dont on ignore le rang reçoit la
 * part de rang la plus basse, pas une moyenne. Une moyenne ferait passer une
 * ignorance pour une position moyenne.
 */
export function partnerScore(input: {
  rank: PartnerRank
  relationship: PartnerRelationship
  placements: number
}): number {
  const rank = input.rank === 'rank1' ? 45 : input.rank === 'rank2' ? 25 : 5
  const relationship = input.relationship === 'partner' ? 30 : input.relationship === 'competitor' ? 10 : 5
  // Trois placements suffisent à prouver une relation ; au-delà, l'information
  // n'apprend plus rien de neuf sur le lien lui-même.
  const placements = Math.min(25, input.placements * 8)
  return Math.max(0, Math.min(100, rank + relationship + placements))
}

/**
 * Comment attaquer ce périmètre, selon qui y est déjà.
 *
 * SIX issues (#3205.6, épopée #3239 — les deux dernières ajoutées à un
 * classifieur qui en rendait déjà quatre) : `find_out` (« on ne sait pas ») et
 * `direct` (« il n'y en a pas ») mènent à deux stratégies opposées, et les
 * confondre fait attaquer en direct un compte verrouillé. `target_other_subsidiary`
 * et `differentiate` sont les deux issues QUE LA SPEC NOMME et qui manquaient :
 * elles ne s'ajoutent que quand une DONNÉE RÉELLE les justifie — jamais
 * devinées sur le seul fait qu'un rang 1 non partenaire est en place.
 */
export function rank1Recommendation(input: {
  rank1Incumbent: Rank1Incumbent
  partners: readonly { name: string; rank: PartnerRank; relationship: PartnerRelationship }[]
  /**
   * #3205.6 — le nom d'une AUTRE entité du même compte dont le rang 1 est
   * ouvert (`direct`/`through_partner`), calculée par l'appelant en
   * comparant les recommandations des entités SŒURS (`PartnersService`,
   * même compte, `account_entities`/`AccountEntityRow` déjà tracées — jamais
   * une filiale devinée hors de ce qui est déjà structuré). `undefined`/`null`
   * = aucune autre entité ouverte connue, jamais recherchée à sa place ici.
   */
  otherOpenEntity?: string | null
  /**
   * #3205.6 — le positionnement DÉCLARÉ de l'ESN utilisatrice à l'accueil
   * (`layeredProfileSchema`/`profileContextSchema`, champ existant). Sert
   * UNIQUEMENT à choisir entre « déplacer » et « se différencier » : une
   * posture construite sur la différence (`nicheVerticals`/`expertiseRare`)
   * ne joue pas le même jeu qu'une posture de volume/prix face à un rang 1
   * verrouillé. `undefined` = non déclaré, le comportement historique
   * (`displace`) ne change pas.
   */
  sellingPosture?: SellingPosture
}): {
  play: 'direct' | 'through_partner' | 'displace' | 'find_out' | 'target_other_subsidiary' | 'differentiate'
  partner?: string
  reason: string
} {
  if (input.rank1Incumbent === 'no') {
    return { play: 'direct', reason: 'Aucun rang 1 en place : le chemin direct est ouvert.' }
  }
  if (input.rank1Incumbent === 'unknown') {
    return {
      play: 'find_out',
      reason:
        'On ignore si un rang 1 tient ce périmètre. Attaquer en direct sans le savoir, c’est jouer à pile ou face.',
    }
  }

  const incumbent = input.partners.find(partner => partner.rank === 'rank1')
  if (!incumbent) {
    return {
      play: 'find_out',
      reason: 'Un rang 1 est en place mais personne ne l’a nommé. Savoir QUI change toute l’approche.',
    }
  }
  if (incumbent.relationship === 'partner') {
    return {
      play: 'through_partner',
      partner: incumbent.name,
      reason: 'Le rang 1 en place est un partenaire : c’est une porte d’entrée, pas un mur.',
    }
  }
  // #3205.6 — un rang 1 verrouillé (non partenaire) n'a plus une seule sortie.
  // Une AUTRE entité du même compte, déjà connue ouverte, est le chemin le
  // plus concret : on n'attaque pas un mur quand une porte voisine est
  // ouverte.
  if (input.otherOpenEntity) {
    return {
      play: 'target_other_subsidiary',
      partner: input.otherOpenEntity,
      reason: `Le rang 1 en place n’est pas un partenaire ici, mais ${input.otherOpenEntity} — la même structure — est ouverte : c’est là que l’énergie commerciale rend le plus.`,
    }
  }
  // Une posture construite sur la différence (niche, expertise rare) ne
  // déplace pas un rang 1 verrouillé au même jeu que lui : elle se positionne
  // À CÔTÉ, sur ce que le rang 1 ne couvre pas.
  if (input.sellingPosture === 'nicheVerticals' || input.sellingPosture === 'expertiseRare') {
    return {
      play: 'differentiate',
      partner: incumbent.name,
      reason:
        'Le rang 1 en place n’est pas un partenaire, et ton positionnement se joue sur la différence, pas le volume : la bonne entrée est un périmètre qu’il ne couvre pas, pas un déplacement frontal.',
    }
  }
  return {
    play: 'displace',
    partner: incumbent.name,
    reason: 'Le rang 1 en place n’est pas un partenaire : l’ouverture se joue sur ce qu’il ne couvre pas.',
  }
}

/* ------------------------------------------------------------------ */
/*  #2646.1 — NOMMER l'accès, jamais une chance de réussite            */
/* ------------------------------------------------------------------ */

/**
 * Les quatre états d'accès à un compte, décision Louis du 20/09/2026.
 *
 * ⚠️ Un ÉTAT D'ACCÈS, jamais une probabilité — la doctrine a refusé six fois
 * d'afficher une chance de closing, et ce badge n'en est pas une réintroduction
 * discrète. Il nomme QUI tient la porte, pas la chance de la passer.
 *
 * - `direct` — aucun rang 1 n'est en place : le chemin est ouvert.
 * - `rang2` — un rang 1 est en place, et l'espace a un partenaire déclaré sur
 *   ce compte (lui-même ou un autre) : la porte se prend PAR ce partenaire.
 * - `rang3_plus` — un rang 1 CONCURRENT est en place et l'espace n'a déclaré
 *   AUCUN partenaire chez lui. Louis a explicitement écarté l'alternative
 *   (modéliser une chaîne à deux intermédiaires ou plus) : ce n'est pas un
 *   COMPTAGE d'intermédiaires, c'est la constatation qu'aucune porte connue
 *   n'existe.
 * - `inconnu` — ni l'un ni l'autre n'est établi. Reste `inconnu` : une absence
 *   de donnée ne bascule JAMAIS en `rang3_plus` par défaut (GA-18/GA-19).
 */
export const ACCOUNT_ACCESS_LEVELS = ['direct', 'rang2', 'rang3_plus', 'inconnu'] as const
export const accountAccessLevelSchema = z.enum(ACCOUNT_ACCESS_LEVELS)
export type AccountAccessLevel = (typeof ACCOUNT_ACCESS_LEVELS)[number]

/**
 * Dérive le niveau d'accès depuis ce que le produit sait DÉJÀ — aucune donnée
 * neuve, aucune collecte (#2646.1). Une seule fonction pure (GA-26), deux
 * appelants : un compte réel (rang 1 lu sur `account_entities`, partenaire lu
 * sur `account_partners`) et un candidat Découvrir SANS fiche compte (rang 1
 * lu sur un signal d'attribution de marché public — DECP —, jamais de
 * partenaire déclaré puisqu'aucun compte n'existe encore pour en porter un).
 */
export function accountAccessLevel(input: {
  /** Un rang 1 est-il installé sur ce périmètre ? */
  rank1Incumbent: Rank1Incumbent
  /** Un partenaire (nous ou déclaré) est-il présent sur ce compte ? */
  hasDeclaredPartner: boolean
}): AccountAccessLevel {
  if (input.rank1Incumbent === 'no') return 'direct'
  if (input.rank1Incumbent === 'unknown') return 'inconnu'
  return input.hasDeclaredPartner ? 'rang2' : 'rang3_plus'
}

/**
 * #2646.1 (badge sans preuve, corrigé le 21/09/2026) — LE FAIT qui fonde
 * `accountAccessLevel`, jamais l'état seul.
 *
 * Le badge d'accès (`TabAccess.tsx`) rendait un état — « rang 2 » — sans
 * jamais dire sur QUELLE entité ni QUEL partenaire il s'appuyait. Doctrine :
 * un score n'est jamais nu, et on n'affiche pas ce qu'on n'a pas — inventer
 * une justification serait pire que n'en montrer aucune.
 *
 * Consomme le MÊME `rank1Incumbent` déjà agrégé par l'appelant pour
 * `accountAccessLevel` (GA-26 : une dérivation vit à un seul endroit) — cette
 * fonction ne fait que NOMMER les entités et le partenaire qui l'ont produit.
 * `null` pour `inconnu` : aucun fait n'est établi, en inventer un violerait
 * « on n'affiche pas ce qu'on n'a pas ».
 */
export const ACCESS_LEVEL_FACT_KINDS = ['no_incumbent', 'incumbent_with_partner', 'incumbent_without_partner'] as const
export const accessLevelFactSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('no_incumbent'), entities: z.array(z.string()).min(1) }).strict(),
  z
    .object({ kind: z.literal('incumbent_with_partner'), entities: z.array(z.string()).min(1), partner: z.string() })
    .strict(),
  z.object({ kind: z.literal('incumbent_without_partner'), entities: z.array(z.string()).min(1) }).strict(),
])
export type AccessLevelFact = z.infer<typeof accessLevelFactSchema>

export function accessLevelFact(input: {
  rank1Incumbent: Rank1Incumbent
  /** Les entités DÉCLARÉES du compte — mêmes lignes qui ont produit
   *  `rank1Incumbent` (jamais recalculées ici, GA-26). */
  entities: { name: string; rank1Incumbent: Rank1Incumbent }[]
  /** Le nom du partenaire déclaré, ou `null` si aucun. */
  partnerName: string | null
}): AccessLevelFact | null {
  if (input.rank1Incumbent === 'unknown') return null
  if (input.rank1Incumbent === 'no') {
    const entities = input.entities.filter(entity => entity.rank1Incumbent === 'no').map(entity => entity.name)
    return entities.length > 0 ? { kind: 'no_incumbent', entities } : null
  }
  const entities = input.entities.filter(entity => entity.rank1Incumbent === 'yes').map(entity => entity.name)
  if (entities.length === 0) return null
  return input.partnerName
    ? { kind: 'incumbent_with_partner', entities, partner: input.partnerName }
    : { kind: 'incumbent_without_partner', entities }
}

/* ------------------------------------------------------------------ */
/*  Les ESN détectées par l'analyse (tome 1 §14)                       */
/* ------------------------------------------------------------------ */

/** Une entrée d'`esnPresence`, telle que la produit `apps/ia`. Tolérante en
 *  lecture : un dossier analysé AVANT le tome 1 ne porte ni certitude ni date. */
export const esnPresenceEntrySchema = z.object({
  name: z.string(),
  certainty: esnPresenceCertaintySchema.optional(),
  scope: z.string().nullish(),
  detectedAt: z.string().nullish(),
  evidence: z.string().nullish(),
  competeAngle: z.string().nullish(),
  partnershipAngle: z.string().nullish(),
  // La MÊME entrée, relue depuis `accounts.raw_analysis` : la persistance
  // snake_case tout le dossier avant de l'écrire. Sans ces trois alias, la
  // reprise d'un dossier déjà analysé perdrait sa date de détection et ses deux
  // angles — c'est-à-dire tout ce qui fait la valeur de la ligne.
  detected_at: z.string().nullish(),
  compete_angle: z.string().nullish(),
  partnership_angle: z.string().nullish(),
})
export type EsnPresenceEntry = z.infer<typeof esnPresenceEntrySchema>

/** Ce que le pipeline propose d'écrire dans `account_partners`. */
export interface DetectedPartner {
  name: string
  certainty: EsnPresenceCertainty
  scope: string | null
  detectedAt: string | null
  note: string | null
}

/**
 * `esnPresence` → lignes de partenaires détectés.
 *
 * Pure, pour que la règle soit testable sans base et qu'aucun writer ne la
 * réinvente. Trois refus délibérés :
 *
 * - **une entrée sans nom est écartée** — une ligne anonyme dans un paysage
 *   concurrentiel n'est pas une information, c'est du bruit qu'on ne peut ni
 *   corriger ni supprimer ;
 * - **la certitude n'est jamais devinée** — absente, elle vaut `faible`, le
 *   niveau qui appelle une vérification, jamais `forte` ;
 * - **on ne déduit PAS le rang ni la relation.** Qu'une ESN soit rang 1 ou
 *   rang 2, concurrente ou partenaire, dépend de ce que l'ESN utilisatrice
 *   veut en faire — c'est le double usage que Loïc réclame (« concurrencer ou
 *   solliciter en rang 2 »). Les deviner choisirait à sa place.
 */
export function detectedPartnersFrom(entries: readonly unknown[] | null | undefined): DetectedPartner[] {
  if (!Array.isArray(entries)) return []
  const seen = new Set<string>()
  const out: DetectedPartner[] = []
  for (const raw of entries) {
    const parsed = esnPresenceEntrySchema.safeParse(raw)
    if (!parsed.success) continue
    const name = parsed.data.name.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    // #2298.7 — décision Louis 18/09/2026 : la preuve AVANT la stratégie.
    // `evidence` porte ce que la source dit vraiment ; les deux angles portent
    // ce qu'on en FAIT. Les fusionner dans le même ordre (preuve d'abord)
    // évite un second champ pour une distinction que `note` peut déjà porter
    // — et qui existait déjà côté IA (`esnPresenceEntrySchema.evidence`) sans
    // jamais être lue ici.
    const angles = [
      parsed.data.evidence,
      parsed.data.competeAngle ?? parsed.data.compete_angle,
      parsed.data.partnershipAngle ?? parsed.data.partnership_angle,
    ]
      .map(a => (a ?? '').trim())
      .filter(Boolean)
    // Incident 24/09 : `detectedAt` part en `account_partners.detected_at`
    // (timestamptz). Un texte illisible (« None ») y annulait la transaction de
    // l'analyse : il devient une absence, jamais le texte brut.
    const detectedAt = (parsed.data.detectedAt ?? parsed.data.detected_at)?.trim() || null
    out.push({
      name,
      certainty: parsed.data.certainty ?? 'faible',
      scope: parsed.data.scope?.trim() || null,
      detectedAt: detectedAt !== null && !Number.isNaN(Date.parse(detectedAt)) ? detectedAt : null,
      note: angles.length > 0 ? angles.join(' · ') : null,
    })
  }
  return out
}
