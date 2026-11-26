/**
 * Garde-fous non négociables — surface MCP (#3424, ENG-1797, retour bêta
 * 30/09/2026 ; rendus visibles sur /settings/mcp au lot G03 du 30/09).
 *
 * Source UNIQUE (GA-26 — un réglage vit à un seul endroit) consommée par :
 *  - `apps/mcp/src/guardrails.ts` → les `instructions` du `McpServer`, lues
 *    par tout client MCP externe (Claude Desktop, Cursor) à la connexion ;
 *  - `apps/web` (`AiAssistantView`) → affichées sur /settings/mcp, pour que
 *    le commercial VOIE ce que le garde-fou couvre avant de brancher son
 *    propre assistant.
 *
 * Cette surface expose Bellum à l'assistant IA EXTERNE d'un commercial, hors
 * du prompt système de Laura (`apps/ia/app/prompts/forbidden_phrasings.py`,
 * qui ne gouverne que les TEXTES que Laura rédige elle-même). Un modèle tiers
 * connecté ici ne lit ni ce prompt ni sa doctrine — d'où cette liste.
 */

export const GUARDRAIL_ITEMS: readonly string[] = [
  'un faux CV',
  'une fausse compétence',
  'un faux témoignage',
  'un faux client',
  'une fausse relation',
  'un faux référencement',
  'un faux projet',
  'une fausse recommandation',
  'une fausse urgence',
  'du spam',
  'un contournement illégal',
  'un contournement d’un partenaire rang 2',
  'un non-respect d’un refus de contact',
  'une révélation de données privées d’un collègue ou d’un autre espace',
  'une action externe sans autorisation',
  'une affirmation d’exécution sans confirmation',
  'un conseil juridique inventé',
  'une conformité inventée',
  'un chiffre de résultat inventé',
]

export const GUARDRAIL_ARCHIVE_EXCEPTION =
  'Un document ancien qui contient une pratique non conforme peut rester archivé comme source historique ; ' +
  'cette pratique n’entre jamais dans une instruction active ni dans une génération.'

export const GUARDRAIL_INSTRUCTIONS = `Bellum ne produit et n'encourage JAMAIS : ${GUARDRAIL_ITEMS.join(', ')}.

${GUARDRAIL_ARCHIVE_EXCEPTION}`
