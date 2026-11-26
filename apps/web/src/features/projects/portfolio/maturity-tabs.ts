import type { NeedStage } from './model/needs'

/**
 * LES TROIS NIVEAUX DE MATURITÉ — #1330 (3/7).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI TROIS ET PLUS CINQ
 * ─────────────────────────────────────────────────────────────────────────
 * Ton retour : « les onglets actuels manquent de clarté… éviter les libellés
 * trop proches les uns des autres ("projets qualifiés", "projets plausibles",
 * "signaux"), qui demandent un effort mental inutile ». Cinq onglets dont trois
 * se ressemblaient : le lecteur devait choisir avant de comprendre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI NE CHANGE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ Les QUATRE étapes du contrat restent intactes. Elles portent des
 * définitions que le produit tient ailleurs, et les fondre les perdrait :
 *
 *   · `signal`    — « un fait daté et sourcé. Il annonce peut-être un besoin ;
 *                    il n'en est pas un. »
 *   · `confirmed` — « quelqu'un l'a exprimé. La seule position qui mérite le
 *                    mot "besoin". »
 *
 * Seul le REGROUPEMENT des onglets change, et chaque ligne garde son étiquette
 * d'étape exacte : le regroupement guide le regard, il n'efface rien.
 *
 * Le nom du niveau intermédiaire est le tien : « Opportunités à creuser ».
 */
export const MATURITY_LEVELS = ['confirmed', 'to_dig', 'detected'] as const
export type MaturityLevel = (typeof MATURITY_LEVELS)[number]

/**
 * Les étapes que porte un niveau. Ordre du plus engageant au moins engageant,
 * comme les onglets eux-mêmes.
 */
const STAGES_BY_LEVEL: Record<MaturityLevel, NeedStage[]> = {
  confirmed: ['confirmed'],
  to_dig: ['qualified', 'plausible'],
  detected: ['signal'],
}

export function stagesOfMaturity(level: MaturityLevel): NeedStage[] {
  return STAGES_BY_LEVEL[level]
}

/**
 * Le niveau d'une étape — la lecture inverse, pour classer une ligne.
 *
 * Dérivée de la même table plutôt que retapée : deux tables de correspondance
 * divergent le jour où une étape s'ajoute, et l'écran rangerait alors une ligne
 * sous un onglet qui ne la filtre pas.
 */
export function maturityOfStage(stage: NeedStage): MaturityLevel {
  const trouve = MATURITY_LEVELS.find(level => STAGES_BY_LEVEL[level].includes(stage))
  // Une étape neuve non classée serait invisible : la ranger dans « détecté »
  // la montre au moins, sous le niveau le moins engageant — jamais sous
  // « confirmé », qui affirmerait plus que ce qu'on sait.
  return trouve ?? 'detected'
}
