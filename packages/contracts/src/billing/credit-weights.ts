/**
 * Ce que chaque action coûte, en crédits (recette finale du 02/08, §8-9).
 *
 * **Pourquoi une pondération.** Le produit affichait « chaque crédit vaut une
 * action : une analyse de compte, un enrichissement de contact, un besoin
 * traité ». C'était faux à un facteur près de 8 : l'audit interne chiffre une
 * analyse complète entre 0,65 € et 1,08 € selon la taille du compte, contre
 * environ 0,08 € pour un enrichissement. Un client qui dépense tout son pool en
 * analyses dégradait donc fortement la marge, pendant que les actions bon marché
 * étaient sur-facturées. Le mot « crédit » n'aidait personne tant que le coût
 * réel de chaque action n'était pas annoncé avant confirmation.
 *
 * **Ce qu'on garde.** Un seul compteur visible — un client ne veut pas suivre
 * deux monnaies. La pondération se voit à l'usage : « cette analyse coûtera
 * 8 crédits », affiché AVANT le clic.
 *
 * **Arbitrage Louis du 02/08** : grille du rapport adoptée telle quelle, avec
 * les volumes 160 / 600 / 1 600 aux prix 119 / 259 / 599 €.
 *
 * ⚠️ **Ce paragraphe décrit une grille PÉRIMÉE, et c'est volontaire de l'avoir
 * laissé** : il date l'arbitrage qui a introduit la pondération. **Aucun prix
 * ni aucun volume de crédits ne se lit dans ce fichier** — la grille vit à un
 * seul endroit, `shipped-plan-grid.ts`, et c'est le seul endroit où la lire.
 *
 * La note est ajoutée le 27/08 parce qu'un croisement a pris ces « 160 » pour
 * la capacité réelle de l'offre d'entrée et conclu à une contradiction de
 * facturation en production. Il n'y en avait pas : un commentaire n'est pas un
 * chemin d'exécution. Mais un chiffre écrit dans un fichier de facturation sert
 * d'argument à qui le lit — c'est la cause racine que ce dépôt paie le plus
 * souvent, appliquée cette fois à sa propre documentation.
 *
 * ⚠️ Et la note s'est elle-même périmée EN VINGT-QUATRE HEURES, ce qui est la
 * démonstration la plus courte qu'on puisse en donner : sa première version
 * recopiait « Starter 119 € / 80 crédits, Growth 249 € / 250, Team sur devis »
 * en la présentant comme la grille en vigueur. Le MÊME jour, Starter passait
 * `selfServe: false` (retiré de la vente) et Growth passait à **199 €**. Trois
 * affirmations sur trois étaient fausses le lendemain. C'est pourquoi la
 * correction du 28/08 ne remplace pas les chiffres par des chiffres justes :
 * elle les RETIRE. Un miroir juste redevient faux ; un renvoi, jamais.
 */

/**
 * Louis 10/10 — la grille UNIQUE des paliers d'analyse : le multiplicateur du
 * poids plein (`CREDIT_WEIGHTS.account_analysis`, 8). Rapide = 8 × 0.625 = 5,
 * Approfondie = 8 × 1.25 = 10 ; « verified » (8) ne sert plus qu'à chiffrer/lire
 * un run passé. Lue par `ANALYSIS_DEPTH_PRESETS` (écran + débit) ET par
 * `creditCostOf('account_analysis')` : jamais une copie.
 */
export const ANALYSIS_DEPTH_COST_MULTIPLIERS = { quick: 0.625, verified: 1, deep: 1.25 } as const

/**
 * Louis 10/10 — le palier appliqué quand aucun n'est choisi (écran de lancement
 * non touché, Laura, relance, lanceurs par lot…) : « Approfondie ».
 */
export const DEFAULT_ANALYSIS_DEPTH: keyof typeof ANALYSIS_DEPTH_COST_MULTIPLIERS = 'deep'

/** Les actions que le produit sait facturer. */
export type CreditedAction =
  /** Analyse complète d'un compte — la collecte, les quatre phases, le dossier. */
  | 'account_analysis'
  /** Actualisation globale : réutilise le dossier, ne relance que les sources datées. */
  | 'account_refresh'
  /** Refresh ciblé d'une dimension (signaux, entités, contacts) sur un périmètre. */
  | 'targeted_refresh'
  /** Enrichissement d'un contact : e-mail, téléphone, profil professionnel. */
  | 'contact_enrichment'
  /** Vérification d'UNE relation de l'organigramme — recherche ciblée sur un lien. */
  | 'relation_verification'
  /** Génération d'un message. Inclus, avec garde-fou de débit. */
  | 'message_generation'
  /** Un échange avec le copilote. Inclus, borné par le plafond quotidien. */
  | 'copilot_message'
  /** Export, favori, note — aucun coût fournisseur significatif. */
  | 'export_or_note'
  /**
   * Classement du vivier contre un besoin. Douze axes DÉTERMINISTES, aucun
   * appel de modèle : deux exécutions identiques rendent le même classement
   * (PDF 4). C'est ce qui le rend gratuit, et le dire est un argument — pas
   * une omission d'affichage.
   */
  | 'need_matching'
  /** Plan d'attaque d'un besoin. Débité depuis le 03/08 (`reason: 'need_play'`). */
  | 'need_play'
  /** Réécriture du CV d'un consultant pour une mission (`reason: 'cv_rewrite'`). */
  | 'cv_rewrite'
  /** Photo d'un territoire — quatre sources publiques, aucun fournisseur payant. */
  | 'territory_snapshot'
  /**
   * #2809 (#2293.11, #2294.*) — découverte FRAÎCHE de contacts sur un compte
   * déjà connu : des personnes jamais collectées, un appel fournisseur par
   * compte ciblé. Distincte de `contact_enrichment` (reveal d'UN contact déjà
   * identifié) et de `targeted_refresh` (rejeu d'un axe sur un dossier déjà
   * analysé, `RefreshContactsDialog`) : ici, rien n'a encore été collecté.
   */
  | 'contact_discovery'
  /**
   * Brief d'un MARCHÉ LOCAL (capacité « Marchés locaux », 04/10/2026, D8) — un
   * appel de modèle par zone générée : 2 crédits, annoncés avant le clic. La
   * lecture d'un brief déjà généré ne débite rien.
   */
  | 'market_brief'

/**
 * Le poids de chaque action.
 *
 * **Deux zéros différents, et il ne faut pas les confondre.** Les actions
 * « incluses » (message, copilote) ne sont pas gratuites à produire : elles sont
 * bornées autrement — plafond quotidien du copilote, garde-fou de débit sur les
 * messages. Facturer au crédit ce qu'on veut voir utilisé serait un contresens
 * produit. Les actions DÉTERMINISTES (`need_matching`) et celles qui ne lisent
 * que de l'open data (`territory_snapshot`) sont, elles, réellement sans coût
 * fournisseur : aucune borne ne les protège parce qu'aucune n'est nécessaire.
 *
 * L'écran a le droit de le DIRE dans les deux cas — « 0 crédit » est vrai des
 * deux — mais seul le second peut se promettre reproductible.
 */
export const CREDIT_WEIGHTS: Readonly<Record<CreditedAction, number>> = {
  account_analysis: 8,
  account_refresh: 4,
  targeted_refresh: 1,
  contact_enrichment: 1,
  relation_verification: 1,
  message_generation: 0,
  copilot_message: 0,
  export_or_note: 0,
  need_matching: 0,
  need_play: 1,
  cv_rewrite: 1,
  contact_discovery: 1,
  territory_snapshot: 0,
  market_brief: 2,
}

/**
 * Les actions dont le coût DÉPEND du périmètre demandé, avec leur borne haute.
 *
 * Le rapport les écrit « 1 à 3 crédits » et « 1 à 2 crédits ». On garde la
 * fourchette plutôt que de figer un maximum : ce qui compte, c'est que l'écran
 * annonce le chiffre EXACT avant le clic, et que ce chiffre soit celui débité.
 * Une fourchette affichée sans montant final serait une promesse molle.
 */
export const CREDIT_WEIGHT_MAX: Readonly<Partial<Record<CreditedAction, number>>> = {
  targeted_refresh: 3,
  relation_verification: 2,
}

/** Combien d'unités de périmètre au-delà de la première ajoutent un crédit. */
const UNITS_PER_EXTRA_CREDIT = 1

/**
 * Ce que CETTE action va coûter, exactement.
 *
 * `perimeterUnits` compte ce sur quoi porte l'action : une case famille × niveau
 * relancée, une entité re-scannée, une relation à vérifier. Absent ⇒ 1 unité,
 * c'est-à-dire le prix plancher. Le résultat est borné par {@link CREDIT_WEIGHT_MAX}
 * quand l'action en a un : au-delà, l'action reste possible mais le prix ne
 * monte plus — un plafond protège l'utilisateur, pas la marge.
 */
export function creditCostOf(action: CreditedAction, options?: { perimeterUnits?: number }): number {
  const base = CREDIT_WEIGHTS[action]
  if (base === 0) return 0
  // Louis 10/10 — « approfondi devient la norme à 10 crédits » : ce qu'on ANNONCE
  // pour « une analyse » est le prix du palier PAR DÉFAUT (poids plein × palier),
  // celui que `resolveAnalysisCost` débite quand rien n'est choisi. Le poids plein
  // (8) reste l'unité de base des périmètres et des volumes d'offre.
  if (action === 'account_analysis') return Math.round(base * ANALYSIS_DEPTH_COST_MULTIPLIERS[DEFAULT_ANALYSIS_DEPTH])

  const max = CREDIT_WEIGHT_MAX[action]
  if (max === undefined) return base

  // `Math.max(1, Math.floor(NaN))` vaut NaN, pas 1 : une valeur non numérique
  // venue d'une URL ou d'un appel mal formé produirait un débit NaN. On teste
  // donc la finitude AVANT d'arrondir.
  const raw = options?.perimeterUnits
  const units = Number.isFinite(raw) ? Math.max(1, Math.floor(raw as number)) : 1
  return Math.min(max, base + Math.floor((units - 1) / UNITS_PER_EXTRA_CREDIT))
}

/**
 * La fourchette à afficher quand le périmètre n'est pas encore choisi
 * (« 1 à 3 crédits »). Une action à prix fixe rend deux fois le même nombre —
 * l'appelant n'a pas à distinguer les deux cas.
 */
export function creditCostRange(action: CreditedAction): { min: number; max: number } {
  const min = CREDIT_WEIGHTS[action]
  return { min, max: CREDIT_WEIGHT_MAX[action] ?? min }
}

/** Cette action est-elle incluse dans l'abonnement (aucun crédit débité) ? */
export function isIncludedAction(action: CreditedAction): boolean {
  return CREDIT_WEIGHTS[action] === 0
}

/**
 * Tout ce qui reste utilisable quand il ne reste PLUS UN crédit (#2003.22).
 *
 * **Un solde à zéro n'est pas une panne, c'est un état nommé** — et ce qui le
 * rend tenable est de pouvoir dire ce qui marche encore. Un espace arrêté sans
 * qu'on lui dise ce qui lui reste conclut que le produit entier est fermé, ce
 * qui est faux : le copilote, les messages, les exports, le classement du vivier
 * et la photo d'un territoire ne débitent rien et ne s'arrêtent pas.
 *
 * La liste se DÉRIVE de la grille, elle ne se recopie pas. Une énumération
 * écrite à la main promettrait un jour une action devenue payante entre-temps —
 * exactement le genre de promesse qu'un client répète, puis reproche.
 *
 * Ce n'est pas une liste de ce qui est GRATUIT à produire : les actions incluses
 * sont bornées autrement (plafond quotidien du copilote, garde-fou de débit des
 * messages). C'est une liste de ce que le manque de crédits n'arrête pas — et
 * c'est vérifiable côté serveur : aucun des chemins qui refusent
 * `insufficient_credits` ne porte une action de poids nul.
 */
export function includedActions(): readonly CreditedAction[] {
  return (Object.keys(CREDIT_WEIGHTS) as CreditedAction[]).filter(isIncludedAction)
}

/**
 * Combien d'analyses complètes un solde permet encore. Sert à traduire un solde
 * en une grandeur que le commercial manipule vraiment : il ne compte pas des
 * crédits, il compte des comptes qu'il peut ouvrir.
 */
export function analysesAffordable(credits: number): number {
  if (!Number.isFinite(credits) || credits <= 0) return 0
  // RAB2 (Louis 10/10 soir) — le volume annoncé se calcule au prix de l'analyse
  // PAR DÉFAUT (Approfondie), pas au poids plein 8 : on promet ce qu'on tient.
  return Math.floor(credits / creditCostOf('account_analysis'))
}
