/**
 * Garde-fous non négociables — surface MCP (#3424, ENG-1797, retour bêta
 * 30/09/2026).
 *
 * La liste elle-même vit dans `@bellum/contracts` (`schemas/mcp-guardrails.ts`,
 * GA-26 — un réglage vit à un seul endroit) : c'est la même source que celle
 * affichée sur /settings/mcp (`apps/web`, lot G03 du 30/09), pour que ce qui
 * est injecté dans le serveur et ce que le commercial VOIT ne divergent
 * jamais. Ce fichier ne fait que rebrancher `GUARDRAIL_INSTRUCTIONS` sur
 * `apps/mcp/src/main.ts:57`, dans les `instructions` du `McpServer` : un
 * champ lu par TOUT client MCP à la connexion, donc présent pour CHAQUE appel
 * d'outil qui suit, plutôt que répété outil par outil.
 */

export { GUARDRAIL_ARCHIVE_EXCEPTION, GUARDRAIL_INSTRUCTIONS, GUARDRAIL_ITEMS } from '@bellum/contracts'
