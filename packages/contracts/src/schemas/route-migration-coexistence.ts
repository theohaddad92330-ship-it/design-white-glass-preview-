import { z } from 'zod'
import {
  ROUTE_MIGRATION_REGISTRY,
  routeMigrationKeySchema,
  type RouteMigrationKey,
} from './route-migration-registry.js'

/**
 * La coexistence ancienne/nouvelle projection — #2154.8.
 *
 * #2154 (section PARALLÈLE TEMPORAIRE) demande que, « lorsque nécessaire »,
 * l'ancienne et la nouvelle projection fonctionnent SUR LA MÊME DONNÉE
 * CANONIQUE — « ne pas maintenir deux bases ». Aucun fichier ne répondait à
 * « est-ce que CETTE route a deux projections vivantes, et lisent-elles la
 * même donnée ? » avant ce commit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX SITUATIONS RÉELLES, PAS UNE SEULE CASE À COCHER
 * ─────────────────────────────────────────────────────────────────────────
 * #4197 (L6, 14/10/2026) — le mode `vue_partagee` est RETIRÉ : Positionnements
 * n'est plus une vue de `/consultants` mais une route à part entière (troisième
 * onglet de Talents), et le Vivier n'a plus de vues. Il ne reste plus aucune
 * route qui rende deux projections par un paramètre `view`.
 *
 * `redirection_pure` : les cinq autres routes redirigées (Veille, Favoris,
 * Mémoire collective, Besoins, Écritures) n'ont PLUS d'ancienne projection —
 * leur fichier ne rend rien, il redirige. Rien ne « coexiste » : il n'y a
 * qu'UNE projection vivante. Le classer comme un manque inventerait un
 * problème qui n'existe pas ; le test vérifie que c'est bien vrai (le fichier
 * ne rend AUCUN écran) plutôt que de l'affirmer.
 *
 * `non_verifiable` : les routes non `redirected` du registre #2154.3 —
 * la question ne se pose même pas sans preuve qu'une ancienne route ait
 * existé (clone superficiel, même gap que le registre).
 */

export const COEXISTENCE_MODES = ['redirection_pure', 'non_verifiable'] as const
export const coexistenceModeSchema = z.enum(COEXISTENCE_MODES)
export type CoexistenceMode = (typeof COEXISTENCE_MODES)[number]

export const routeMigrationCoexistenceEntrySchema = z.object({
  key: routeMigrationKeySchema,
  sourceIssue: z.literal('#2154.8'),
  mode: coexistenceModeSchema,
  /** L'objet canonique partagé — `null` en `redirection_pure` (une seule
   *  projection vivante, rien à partager) et en `non_verifiable`. */
  canonicalDataSource: z.string().min(1).nullable(),
  evidence: z.string().min(1),
})
export type RouteMigrationCoexistenceEntry = z.infer<typeof routeMigrationCoexistenceEntrySchema>

function buildEntry(key: RouteMigrationKey): RouteMigrationCoexistenceEntry {
  const source = ROUTE_MIGRATION_REGISTRY.find(entry => entry.key === key)
  if (!source) throw new Error(`route-migration-coexistence: clé inconnue du registre — ${key}`)

  // #4359 — `removed` : l'ancienne adresse n'a plus de fichier de route, donc plus aucune projection
  // à coexister non plus.
  if (source.targetStatus === 'removed') {
    return {
      key,
      sourceIssue: '#2154.8',
      mode: 'redirection_pure',
      canonicalDataSource: null,
      evidence: `\`${source.currentRoute}\` n'a plus de fichier de route (#4359, vérifié par le test) : la page « introuvable » répond, une seule projection est vivante. Rien ne coexiste.`,
    }
  }
  if (source.targetStatus === 'redirected') {
    return {
      key,
      sourceIssue: '#2154.8',
      mode: 'redirection_pure',
      canonicalDataSource: null,
      evidence: `\`${source.holderFile}\` ne rend aucun écran — il ne fait que rediriger (vérifié par le test) : une seule projection est vivante, l'ancienne a été retirée. Rien ne coexiste, donc rien à faire fonctionner « sur la même donnée » — la question ne se pose plus.`,
    }
  }
  return {
    key,
    sourceIssue: '#2154.8',
    mode: 'non_verifiable',
    canonicalDataSource: null,
    evidence: `Non vérifiable : ${source.gap}`,
  }
}

export const ROUTE_MIGRATION_COEXISTENCE: readonly RouteMigrationCoexistenceEntry[] = ROUTE_MIGRATION_REGISTRY.map(
  entry => buildEntry(entry.key),
)
