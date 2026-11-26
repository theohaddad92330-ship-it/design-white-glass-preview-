import { PLAN_FEATURE_KEYS, type PlanFeatureKey } from '@bellum/contracts'
import { FEATURE_USAGE_SIGNALS, type FeatureUsageSignal } from '../modules/analytics/feature-adoption-usage'

/**
 * #1685 — CHAQUE FONCTION DU CATALOGUE A UN SIGNAL, OU UNE RAISON ÉCRITE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `FEATURE_USAGE_SIGNALS` (`feature-adoption-usage.ts`) doit couvrir CHAQUE
 * clé de `PLAN_FEATURE_KEYS` — le catalogue LIVE des 15 fonctions gatées par
 * l'offre — avec soit un signal MESURÉ (une description non vide de la table
 * et de la colonne qui prouve un usage réel), soit une raison ÉCRITE de ne pas
 * en avoir (`not_wired`, une phrase non vide). Une fonction absente des deux
 * ferait planter `buildFeatureAdoptionReport` en silence côté valeur (`entrée
 * undefined`) — jamais côté type, `FEATURE_USAGE_SIGNALS` étant un littéral
 * entièrement vérifié par le compilateur tant que personne n'ajoute une clé
 * à `PLAN_FEATURE_KEYS` sans toucher ce fichier.
 *
 * ⚠️ Ce n'est délibérément PAS le même test que celui de
 * `feature-adoption-usage.spec.ts` : cette garde-ci embarque son PROPRE
 * validateur (`offensesOf`, ci-dessous), pour ne pas dépendre du code qu'elle
 * surveille — si `buildFeatureAdoptionReport` changeait un jour sa façon de
 * lire le catalogue, cette garde continuerait de voir le même défaut.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PEUT PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Qu'une description ou une raison écrite dise VRAI (qu'une table nommée
 * existe réellement, qu'une colonne porte bien ce nom). Elle vérifie que la
 * PLACE est remplie, pas que le contenu est exact — la revue humaine du lot
 * couvre cette part.
 */

/** Le reproche fait à une entrée, ou `null` si elle est complète. Isolé pour
 *  qu'on puisse la nourrir d'un catalogue FABRIQUÉ et vérifier qu'elle sait
 *  dire non. */
function offenseFor(feature: PlanFeatureKey, signal: FeatureUsageSignal | undefined): string | null {
  if (!signal) return `${feature} : aucune entrée dans le catalogue`
  if (signal.kind === 'measured') {
    return signal.description.trim().length >= 10 ? null : `${feature} : description mesurée trop courte ou vide`
  }
  if (signal.kind === 'not_wired') {
    return signal.reason.trim().length >= 10 ? null : `${feature} : raison écrite trop courte ou vide`
  }
  return `${feature} : nature de signal inconnue`
}

/** Toutes les offenses d'un catalogue, sur l'ensemble RÉEL des clés vivantes
 *  (`PLAN_FEATURE_KEYS`, jamais une liste recopiée — une fonction ajoutée là-bas
 *  doit apparaître ici sans qu'on retouche cette garde). */
function offensesOf(catalog: Partial<Record<PlanFeatureKey, FeatureUsageSignal>>): string[] {
  return PLAN_FEATURE_KEYS.map(feature => offenseFor(feature, catalog[feature])).filter(
    (offense): offense is string => offense !== null,
  )
}

describe('#1685 — chaque fonction du catalogue a un signal, ou une raison écrite', () => {
  it('LIT quelque chose — le catalogue réel n’est pas vide, et couvre les 15 fonctions', () => {
    expect(PLAN_FEATURE_KEYS.length).toBe(15)
    expect(Object.keys(FEATURE_USAGE_SIGNALS).length).toBe(15)
  })

  it('le catalogue RÉEL ne soulève AUCUNE offense', () => {
    expect(offensesOf(FEATURE_USAGE_SIGNALS)).toEqual([])
  })

  it('sait dire NON — une fonction absente du catalogue est REPROCHÉE', () => {
    const troue: Partial<Record<PlanFeatureKey, FeatureUsageSignal>> = { ...FEATURE_USAGE_SIGNALS }
    delete troue.crm_native
    expect(offensesOf(troue)).toEqual(['crm_native : aucune entrée dans le catalogue'])
  })

  it('sait dire NON — une description mesurée vide (ou trop courte) est REPROCHÉE', () => {
    const vide: Partial<Record<PlanFeatureKey, FeatureUsageSignal>> = {
      ...FEATURE_USAGE_SIGNALS,
      chat_ai: { kind: 'measured', description: '' },
    }
    expect(offensesOf(vide)).toEqual(['chat_ai : description mesurée trop courte ou vide'])
  })

  it('sait dire NON — une raison `not_wired` vide (ou trop courte) est REPROCHÉE', () => {
    const vide: Partial<Record<PlanFeatureKey, FeatureUsageSignal>> = {
      ...FEATURE_USAGE_SIGNALS,
      exports: { kind: 'not_wired', reason: 'non' },
    }
    expect(offensesOf(vide)).toEqual(['exports : raison écrite trop courte ou vide'])
  })

  it('n’attrape PAS ce qu’elle ne vise pas — un `not_wired` avec une VRAIE raison écrite passe', () => {
    // Témoin du cas légitime : `exports` n'a aujourd'hui aucun signal branché,
    // et c'est une décision ASSUMÉE, pas un trou. La garde ne doit jamais
    // confondre « honnêtement non branché, avec sa raison » et « oublié ».
    const catalogueAvecUnNonBranche: Partial<Record<PlanFeatureKey, FeatureUsageSignal>> = {
      ...FEATURE_USAGE_SIGNALS,
      exports: {
        kind: 'not_wired',
        reason: 'aucune ligne écrite par les endpoints de documents — flux binaire sans trace persistée par espace.',
      },
    }
    expect(offensesOf(catalogueAvecUnNonBranche)).toEqual([])
  })
})
