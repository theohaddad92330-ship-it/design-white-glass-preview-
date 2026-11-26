import { z } from 'zod'

/**
 * #2634.1 — LinkedIn comme source de signaux d'achat, UNIQUEMENT par une voie
 * autorisée : saisie manuelle par le commercial, import d'un export que le
 * client possède déjà, ou (à venir) un connecteur officiel sous contrat.
 * JAMAIS de scraping ni de collecte automatisée d'une page LinkedIn — la
 * doctrine `c79_collecte_large_mais_propre` (`doctrine-registry.ts`) autorise
 * déjà « les données que le client branche lui-même » ; ce module en est
 * l'application concrète pour les signaux d'achat.
 *
 * Voir `.claude/notes/registre-2026-09-20-accounts-recentes.md` (`#2634.1`)
 * pour l'historique complet de la décision.
 */

/** Une seule plateforme admise à ce jour. Extensible plus tard — jamais
 *  élargie silencieusement : chaque source ajoutée est un arbitrage produit. */
export const DECLARED_SIGNAL_SOURCES = ['LinkedIn'] as const
export type DeclaredSignalSource = (typeof DECLARED_SIGNAL_SOURCES)[number]

/**
 * La forme STOCKÉE admet `connector`, pour le jour où un connecteur officiel
 * LinkedIn sera branché sous contrat (aucun aujourd'hui — sans clé, aucun code
 * ne produit cette valeur, voir `agent_docs/env-reference.md`).
 */
export const declaredSignalEntryKindSchema = z.enum(['manual', 'import', 'connector'])
export type DeclaredSignalEntryKind = z.infer<typeof declaredSignalEntryKindSchema>

/**
 * Ce qu'une REQUÊTE humaine peut soumettre — jamais `connector` : aucun
 * utilisateur ne peut se faire passer pour une intégration qui n'existe pas.
 */
export const declareSignalEntryKindRequestSchema = z.enum(['manual', 'import'])
export type DeclareSignalEntryKindRequest = z.infer<typeof declareSignalEntryKindRequestSchema>

export const declaredSignalItemInputSchema = z.object({
  /** Le fait tel qu'écrit par le commercial ou lu dans l'export — jamais reformulé. */
  label: z.string().trim().min(1).max(500),
  signalType: z.string().trim().min(1).max(80).optional(),
  /** Texte libre, comme les signaux détectés (`recentSignalSchema.date`) — ex. « publié le 18/09 ». */
  signalDate: z.string().trim().min(1).max(80).optional(),
  /**
   * Import seulement : la date de l'EXPORT tel que le client le possédait,
   * distincte de la date du geste d'import (même raison que `documentDate`
   * sur `orgDeclaredPersonSchema` : un export qui a trois mois ne doit pas se
   * faire passer pour une lecture d'aujourd'hui).
   */
  documentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'documentDate must be YYYY-MM-DD')
    .optional(),
})
export type DeclaredSignalItemInput = z.infer<typeof declaredSignalItemInputSchema>

/** Corps `POST /accounts/:id/signals/declare`. */
export const declareAccountSignalsRequestSchema = z.object({
  source: z.enum(DECLARED_SIGNAL_SOURCES),
  entryKind: declareSignalEntryKindRequestSchema,
  signals: z.array(declaredSignalItemInputSchema).min(1).max(50),
})
export type DeclareAccountSignalsRequest = z.infer<typeof declareAccountSignalsRequestSchema>

/**
 * La forme STOCKÉE (`accounts.declared_signals[]`) — `declaredAt`/`declaredBy`
 * sont posés par le SERVEUR, jamais par le client (même règle que
 * `orgDeclaredPersonSchema.declaredAt`/`declaredBy`) : une date d'origine
 * cliente se règle, et un auteur choisi par l'appelant n'est pas un auteur.
 */
export const declaredSignalSchema = declaredSignalItemInputSchema.extend({
  id: z.string().guid(),
  source: z.enum(DECLARED_SIGNAL_SOURCES),
  entryKind: declaredSignalEntryKindSchema,
  /** ISO — quand la déclaration a été faite (saisie ou import). */
  declaredAt: z.string(),
  /** `null` réservé au futur `entryKind: 'connector'` — aucun humain n'y déclare rien. */
  declaredBy: z.string().guid().nullable(),
  /** Nom d'affichage résolu à l'écriture (`profiles`) — `null` si introuvable. */
  declaredByName: z.string().nullable(),
})
export type DeclaredSignal = z.infer<typeof declaredSignalSchema>
