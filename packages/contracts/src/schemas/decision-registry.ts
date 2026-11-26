/**
 * Les numéros de décision — ce qu'ils identifient, et ce qu'ils n'identifient pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON A DÉCOUVERT LE 25/08/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Le dépôt cite des décisions par un numéro — « D82 », « D51 », « D70 » — dans
 * les trackers, dans `CLAUDE.md`, dans des commentaires de garde et dans des
 * messages de commit. On les lit comme des identifiants.
 *
 * Ils n'en sont pas. **Vingt-cinq numéros désignent deux décisions différentes
 * selon le tracker qu'on ouvre**, et il ne s'agit pas de cas isolés : des plages
 * entières se recouvrent (D43→D50 entre le PDF 6 et le PDF 10, D56/D57 entre la
 * dette et le tome 1, D70→D72 entre le PDF 9 et le tome 1, D80→D82 entre les
 * règles de design et le tome 5).
 *
 * Le cas qui l'a révélé est ironique : le §5 du tracker du PDF 9 consacre une
 * page à choisir ses numéros « pour éviter une collision » avec les gardes — et
 * prend D70/D71/D72, déjà pris par le tome 1 deux jours plus tôt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * **On ne renumérote pas.** C'est la règle posée par le PDF 9 lui-même pour les
 * gardes, et elle vaut ici pour la même raison : ces numéros vivent dans des
 * commits, des commentaires et huit trackers. Les changer casserait toutes les
 * citations existantes pour rendre uniques des numéros que personne ne lit sans
 * contexte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, DONC
 * ─────────────────────────────────────────────────────────────────────────────
 * **Un numéro de décision est unique DANS SON CHANTIER, jamais globalement.**
 * Une citation qui ne nomme pas son chantier est ambiguë — et depuis
 * aujourd'hui, elle est fausse dans un quart des cas. La forme correcte est
 * « D70 (tome 1) » ou « D70 du PDF 9 ».
 *
 * Ce que la garde `decision-registry.test.ts` tient : elle RECALCULE les
 * ambiguïtés depuis `agent_docs/` à chaque exécution et les compare au cliquet
 * ci-dessous. Elle ne peut donc pas vieillir — et un nouveau chantier qui
 * réutiliserait un numéro dans SON propre périmètre, ou qui ferait monter le
 * total, fait échouer la CI.
 */

/**
 * Le nombre de numéros AMBIGUS au moment du gel, mesuré et non estimé.
 *
 * C'est un cliquet : il ne peut que descendre. Il descend quand un tracker
 * historique est corrigé pour nommer son chantier, jamais par renumérotation.
 */
export const AMBIGUOUS_DECISION_NUMBERS_AT_FREEZE = 25

/**
 * Les chantiers qui ont attribué des numéros, et le fichier qui fait foi pour
 * chacun. Sert à écrire une citation non ambiguë : « D70 (tome 1) ».
 *
 * ⚠️ Ce n'est PAS une liste de plages réservées. Tenter d'attribuer des plages
 * disjointes a déjà échoué deux fois — un chantier ne sait pas, en commençant,
 * combien de décisions il produira. La règle qui tient est de NOMMER le
 * chantier à la citation, pas de réserver.
 */
export const DECISION_SCOPES: readonly { scope: string; tracker: string }[] = [
  // ⚠️ Ajouté le 30/08/2026. Ce tracker porte D1→D22 et manquait au registre,
  // alors que D1→D14 figurent tous dans `KNOWN_AMBIGUOUS_DECISIONS`. La raison
  // est mécanique et vaut d'être écrite : ses décisions sont des TITRES de
  // section (`### D7.`), pas des lignes de tableau, et le parseur de GA-40 ne
  // reconnaît que les lignes de tableau — le fichier lui est donc invisible.
  // L'étendre ferait remonter le cliquet d'ambiguïté : parqué en D330
  // (`agent_docs/iteration-3-precedence-et-certificat-2026-08-30.md`). En
  // attendant, le déclarer ici lui donne au moins la vérification de chemin, et
  // GA-116 rend ses statuts comptables.
  { scope: 'aout-2026', tracker: 'agent_docs/decisions-aout-2026.md' },
  { scope: 'restitution-v2', tracker: 'agent_docs/audit-restitution-v2-2026-07-23.md' },
  { scope: 'credits', tracker: 'agent_docs/credits-accounting-audit.md' },
  { scope: 'pdf1', tracker: 'agent_docs/pdf1-architecture-globale-2026-08-19.md' },
  { scope: 'pdf2', tracker: 'agent_docs/pdf2-crm-interne-2026-08-19.md' },
  { scope: 'pdf3', tracker: 'agent_docs/pdf3-ats-talent-vivier-2026-08-20.md' },
  { scope: 'pdf5', tracker: 'agent_docs/pdf5-missions-cra-facturation-2026-08-20.md' },
  { scope: 'pdf6', tracker: 'agent_docs/pdf6-automatisations-requetes-2026-08-21.md' },
  { scope: 'pdf7', tracker: 'agent_docs/pdf7-integrations-connecteurs-2026-08-21.md' },
  { scope: 'pdf8', tracker: 'agent_docs/pdf8-dashboards-pilotage-2026-08-22.md' },
  { scope: 'pdf9', tracker: 'agent_docs/pdf9-backlog-claude-code-2026-08-22.md' },
  { scope: 'pdf10', tracker: 'agent_docs/pdf10-laura-chatbot-2026-08-22.md' },
  { scope: 'dette-pdf1-6', tracker: 'agent_docs/dette-pdf1-6-2026-08-21.md' },
  { scope: 'tome1', tracker: 'agent_docs/tome1-pivot-accessibilite-2026-08-20.md' },
  { scope: 'tome3', tracker: 'agent_docs/tome3-barriere-achat-scoring-2026-08-21.md' },
  { scope: 'tome4', tracker: 'agent_docs/tome4-second-marche-esn-2026-08-23.md' },
  { scope: 'tome5', tracker: 'agent_docs/tome5-plan-de-compte-2026-08-23.md' },
  { scope: 'design', tracker: 'agent_docs/regles-design-2026-08-23.md' },
  { scope: 'recovery-juin', tracker: 'agent_docs/recovery-juin-2026-2026-08-24.md' },
]

/**
 * Les numéros dont on sait qu'ils sont ambigus, pour que le prochain lecteur ne
 * cherche pas d'où vient la contradiction. Liste indicative — la garde ne s'en
 * sert pas : elle recalcule.
 *
 * Les plus piégeux sont ceux qui portent une doctrine citée ailleurs :
 * `D82` vaut « le copilote s'appelle Laura » (design) ET « la charte du deck
 * exporté » (tome 5) ; `D72` vaut « la numérotation des gardes » (PDF 9) ET
 * « le nom de la notion à l'écran » (tome 1).
 */
export const KNOWN_AMBIGUOUS_DECISIONS: readonly string[] = [
  'D1',
  'D2',
  'D3',
  'D4',
  'D5',
  'D7',
  'D11',
  'D12',
  'D13',
  'D14',
  'D43',
  'D44',
  'D45',
  'D46',
  'D47',
  'D48',
  'D49',
  'D50',
  'D56',
  'D57',
  'D70',
  'D71',
  'D72',
  'D80',
  'D82',
]

/** Une citation non ambiguë. « D70 » seul ne veut rien dire ; « D70 (tome1) »
 *  se retrouve. */
export function citeDecision(scope: string, number: number): string {
  return `D${number} (${scope})`
}

/** Le numéro est-il de ceux qu'on ne peut pas citer sans son chantier ? */
export function isAmbiguousDecision(number: number): boolean {
  return KNOWN_AMBIGUOUS_DECISIONS.includes(`D${number}`)
}
