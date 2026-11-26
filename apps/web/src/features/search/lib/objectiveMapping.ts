import type { AnalysisContextPreset } from '@bellum/contracts'

/**
 * #2163.31-36 — l'axe « OBJECTIF » du cadrage (Comprendre / Trouver les
 * personnes / Trouver une porte / Vérifier un besoin / Préparer une action /
 * Comparer), section A de l'épopée #2973.
 *
 * DÉCISION Louis 17/09 (registre `.claude/notes/registre-2026-09-16-ecrans-secondaires.md`,
 * lignes 2163.31-36, QCM) : étendre la taxonomie de presets EXISTANTE
 * (`searchComposerPresets.ts`, 7 clés `AnalysisContextPreset`) avec un mapping
 * objectif-par-objectif, plutôt que d'ajouter un second mécanisme de stockage
 * (pas de nouvelle clé sur `analysisScopeSelectionSchema` — GA-26 : un réglage,
 * un seul endroit). Le preset est déjà choisi plus haut dans le composeur
 * (`context.preset`) ; ce mapping ne fait QUE le traduire dans le vocabulaire
 * exact des 6 libellés de #2163, pour l'afficher en recap avant le débit
 * (`ScopeConfirmPanel`) — comme `confirm.modeLabel` / `confirm.expectedResultLabel`
 * juste au-dessus (#2163.62/.70), pas un champ éditable de plus.
 *
 * tranché sans Louis : l'appariement objectif → preset lui-même (quel des 6
 * libellés correspond à quel des 7 presets). Chaque champ structuré du preset
 * porte la preuve du choix :
 *   - known-account (statut commercial, dernière interaction) → Comprendre
 *   - strategic (décideur ciblé) → Trouver les personnes
 *   - push-offer (offre, différenciation) → Trouver une porte
 *   - signal (type de signal, implication) → Vérifier un besoin
 *   - retry (angle à creuser, hypothèse) → Préparer une action
 *   - incumbent (concurrent en place, faiblesse) → Comparer
 *   - free (texte libre, aucun gabarit) → Autre — même mot que `intent.other`
 *     (`IntentPicker.tsx`), pas une invention : un preset libre n'a pas
 *     d'objectif nommable parmi les six.
 */
export const OBJECTIVE_LABEL_KEY_BY_PRESET: Record<AnalysisContextPreset, string> = {
  'known-account': 'confirm.objective.values.understand',
  strategic: 'confirm.objective.values.findPeople',
  'push-offer': 'confirm.objective.values.findEntryPoint',
  signal: 'confirm.objective.values.verifyNeed',
  retry: 'confirm.objective.values.prepareAction',
  incumbent: 'confirm.objective.values.compare',
  free: 'confirm.objective.values.other',
}

export function objectiveLabelKeyForPreset(preset: AnalysisContextPreset): string {
  return OBJECTIVE_LABEL_KEY_BY_PRESET[preset]
}
