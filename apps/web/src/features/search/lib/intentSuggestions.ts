import type { AnalysisContextPreset } from '@bellum/contracts'

/**
 * #1589 (première moitié) — « Qu'est-ce que tu veux obtenir ? »
 *
 * Le dépôt possède déjà sept presets de contexte (`searchComposerPresets.ts`)
 * — pousser une offre, compte connu, concurrent en place, signal détecté,
 * compte stratégique, reprise d'analyse, texte libre — mais ils vivaient
 * cachés dans un menu déroulant (`PresetDropdown`) jamais monté nulle part.
 * Cette liste ne RECRÉE aucun preset : chaque entrée pointe une clé
 * `AnalysisContextPreset` EXISTANTE, et un clic délègue à `emptyContext(preset)`
 * — la même fonction que le menu déroulant utilisait déjà. Si un preset change
 * de forme, cette liste suit sans modification.
 *
 * « free » (texte libre) n'y figure pas : il reste « Autre », la porte de
 * sortie toujours proposée à part (`IntentPicker.tsx`).
 *
 * #2162.20 — décision de Louis du 17/09/2026 (QCM), sur la question posée
 * (« remplacer la taxonomie de 6 presets » vs « ajouter en parallèle une
 * seconde taxonomie ») : NI L'UN NI L'AUTRE. « Étendre les presets avec un
 * MAPPING vers les 8 libellés, ne pas remplacer. » Concrètement :
 *   - les 6 clés `AnalysisContextPreset` NE bougent pas (aucun renommage,
 *     aucun ajout d'enum — GA-08/GA-26, `searchComposerPresets.ts` reste la
 *     seule source) ;
 *   - les LIBELLÉS affichés deviennent les 8 exacts de l'issue #2162 (le 8ᵉ,
 *     « Autre », existait déjà à part) ;
 *   - 5 des 8 labels ont un preset dédié évident (Ouvrir ce compte→strategic,
 *     Vérifier un signal→signal, Préparer un référencement→push-offer,
 *     Analyser la concurrence→incumbent, Autre→free) ; les 2 restants
 *     (Préparer un rendez-vous, Comprendre les filiales) n'ont pas de preset
 *     dédié et sont mappés sur les presets les plus proches déjà câblés
 *     (`known-account` : relation existante) plutôt que d'inventer une
 *     septième forme structurée. « Trouver les décideurs » réutilise
 *     `strategic`, qui porte déjà le champ `targetDecisionMaker`.
 *
 * #2162.20 (CORRIGÉ — défaut mesuré en prod le 17/09) : `retry` (« Approfondir
 * une analyse ») avait été ajouté ICI EN PLUS des 7, portant le total à 9
 * pastilles (8 + Autre) — Louis en demandait 8 (7 + Autre). La raison donnée
 * alors (« son SEUL point d'entrée dans l'UI avant ce lot ») était FAUSSE :
 * `PresetDropdown.tsx`, qui seul expose `retry`, n'était monté NULLE PART
 * (`grep -rn "<PresetDropdown" apps/web/src` ne rend rien, avant comme après
 * ce lot) — `retry` n'avait donc AUCUN point d'entrée à préserver. Retiré :
 * cette liste ne porte plus que les 7 libellés exacts de l'issue #2162.
 * `retry` reste un preset VALIDE de `searchComposerPresets.ts` (GA-08/GA-26 —
 * rien n'est renommé ni retiré côté enum) ; le rendre atteignable un jour est
 * une décision distincte, hors de ce lot.
 */
export const INTENT_SUGGESTIONS: readonly { preset: AnalysisContextPreset; labelKey: string }[] = [
  { preset: 'strategic', labelKey: 'intent.openAccount' },
  { preset: 'known-account', labelKey: 'intent.knownAccount' },
  { preset: 'strategic', labelKey: 'intent.findDecisionMakers' },
  { preset: 'known-account', labelKey: 'intent.understandSubsidiaries' },
  { preset: 'signal', labelKey: 'intent.exploitSignal' },
  { preset: 'push-offer', labelKey: 'intent.pushExpertise' },
  { preset: 'incumbent', labelKey: 'intent.displaceIncumbent' },
]
