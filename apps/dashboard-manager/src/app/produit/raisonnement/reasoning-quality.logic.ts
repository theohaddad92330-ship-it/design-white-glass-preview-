/**
 * #3223.4 (#3198) — ce que l'écran « Raisonnement de Laura » DIT, en FR et en EN.
 *
 * Il ne calcule rien : les taux vivent côté API (`reasoning-quality.ts`). Ce
 * fichier ne fait que choisir les mots : une mesure absente se dit « non
 * mesuré » et sa raison, jamais « 0 % » (GA-18 / GA-19).
 */
import type { FiabiliteJuge, MesureRaisonnement } from './reasoning-quality.client'

type Lang = 'fr' | 'en'

const RAISONS: Readonly<Record<'no_observation' | 'sample_too_small', Record<Lang, string>>> = {
  no_observation: { fr: 'aucun tour exploitable', en: 'no usable turn' },
  sample_too_small: { fr: 'échantillon trop petit', en: 'sample too small' },
}

/** « 30 % » si mesuré ; « Non mesuré — <raison> » sinon. Jamais « 0 % » par défaut. */
export function valeurMesure(mesure: MesureRaisonnement, lang: Lang): string {
  if (mesure.state === 'measured') return `${mesure.value} %`
  const prefixe = lang === 'fr' ? 'Non mesuré' : 'Not measured'
  return `${prefixe} — ${RAISONS[mesure.reason][lang]}`
}

/** Les tours qui comptent dans la mesure, et ceux écartés faute du champ. */
export function phraseEchantillon(mesure: MesureRaisonnement, lang: Lang): string {
  if (lang === 'fr') {
    const base = `${mesure.sample} tour${mesure.sample > 1 ? 's' : ''}`
    return mesure.excluded > 0 ? `${base} (${mesure.excluded} écartés, champ absent)` : base
  }
  const base = `${mesure.sample} turn${mesure.sample === 1 ? '' : 's'}`
  return mesure.excluded > 0 ? `${base} (${mesure.excluded} set aside, field missing)` : base
}

const RAISONS_JUGE: Readonly<Record<Extract<FiabiliteJuge, { state: 'unreliable' }>['reason'], Record<Lang, string>>> =
  {
    not_measured: { fr: 'accord pas encore mesuré', en: 'agreement not measured yet' },
    incomplete: { fr: 'calibration incomplète', en: 'incomplete calibration' },
    too_few_cases: { fr: 'trop peu de cas étiquetés', en: 'too few labelled cases' },
    below_threshold: { fr: 'accord sous le seuil', en: 'agreement below the threshold' },
  }

/**
 * #3223 (décision Louis 11/10) — le taux de réponses génériques. Juge non
 * fiable : « Non fiable — <raison> », JAMAIS un chiffre, même si l'API en
 * avait un (elle n'en envoie pas).
 */
export function valeurGenerique(
  rapport: { judge: FiabiliteJuge; measure: MesureRaisonnement | null },
  lang: Lang,
): string {
  if (rapport.judge.state !== 'reliable' || !rapport.measure) {
    const prefixe = lang === 'fr' ? 'Non fiable' : 'Unreliable'
    const raison = rapport.judge.state === 'unreliable' ? RAISONS_JUGE[rapport.judge.reason][lang] : ''
    return raison ? `${prefixe} — ${raison}` : prefixe
  }
  return valeurMesure(rapport.measure, lang)
}

/** L'accord du juge avec le jeu étiqueté, son effectif et le seuil écrit — ou « non mesuré ». */
export function phraseAccord(juge: FiabiliteJuge, lang: Lang): string {
  const seuil = lang === 'fr' ? `seuil ${juge.thresholdPercent} %` : `threshold ${juge.thresholdPercent} %`
  if (juge.agreementPercent === undefined || juge.agreed === undefined || juge.judged === undefined) {
    return `${lang === 'fr' ? 'Non mesuré' : 'Not measured'} (${seuil})`
  }
  const cas = lang === 'fr' ? 'cas' : 'cases'
  return `${juge.agreementPercent} % — ${juge.agreed}/${juge.judged} ${cas} (${seuil})`
}

const TAILLES: Readonly<Record<string, Record<Lang, string>>> = {
  tpe: { fr: 'TPE (moins de 10 salariés)', en: 'Micro (under 10 staff)' },
  pme: { fr: 'PME (10 à 249)', en: 'SME (10 to 249)' },
  eti: { fr: 'ETI (250 à 4 999)', en: 'Mid-cap (250 to 4,999)' },
  ge: { fr: 'Grande entreprise (5 000 et plus)', en: 'Large company (5,000 and more)' },
}

/** Le libellé d'un jeton du classement : `naf_62` → « NAF 62 », une taille INSEE en clair. */
export function libelleSegment(value: string, lang: Lang): string {
  const naf = /^naf_(\d{2})$/.exec(value)
  if (naf) return `NAF ${naf[1]}`
  return TAILLES[value]?.[lang] ?? value
}

/** Les onze couches du reçu de connaissance (`KNOWLEDGE_RECEIPT_LAYERS`). */
const COUCHES: Readonly<Record<string, Record<Lang, string>>> = {
  workspace: { fr: 'Espace de travail', en: 'Workspace' },
  crm: { fr: 'CRM', en: 'CRM' },
  messaging: { fr: 'Messagerie', en: 'Messaging' },
  agenda: { fr: 'Agenda', en: 'Calendar' },
  documents: { fr: 'Documents', en: 'Documents' },
  account_dossier: { fr: 'Dossier de compte', en: 'Account dossier' },
  dataforge: { fr: 'DataForge', en: 'DataForge' },
  market_memory: { fr: 'Market Memory', en: 'Market Memory' },
  current_public_sources: { fr: 'Sources publiques actuelles', en: 'Current public sources' },
  bellum_method: { fr: 'Méthode Bellum', en: 'Bellum method' },
  inference: { fr: 'Inférence', en: 'Inference' },
}

/** Le libellé d'une couche. Inconnue : la valeur telle quelle, jamais un libellé inventé. */
export function libelleCouche(layer: string, lang: Lang): string {
  return COUCHES[layer]?.[lang] ?? layer
}
