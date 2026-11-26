import { z } from 'zod'

/**
 * #1911.1 / #1911.12 / #1955.1 — le TITRE d'un fil de Laura.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT, ET POURQUOI ÇA NE SUFFISAIT PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Un fil s'appelait par son PREMIER message, brut (`listHistory`,
 * `chat-messages.service.ts`). Dès la troisième conversation, « Utiliser ta
 * connaissance sur AIRBUS et trouve… » et « Compare mes comptes suivis… » se
 * lisaient pareil, et rien ne permettait de les renommer.
 *
 * Décision de Louis (12/09/2026) : **« Rédigé par Laura, sans quota »** — un
 * titre court écrit par un petit modèle après le 2e échange, hors des 50
 * messages du jour, et modifiable à la main.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX AUTEURS, ET L'UN GAGNE TOUJOURS
 * ─────────────────────────────────────────────────────────────────────────────
 * `laura` : rédigé en tâche de fond. `user` : saisi par une personne. Une
 * correction humaine gagne toujours, quelle que soit sa date — le générateur
 * n'écrit que là où AUCUN titre n'existe, et le renommage écrase tout.
 *
 * Valeurs gardées par la contrainte SQL `chat_thread_titles_title_source_check`
 * (GA-12). Un ajout ici se fait EN FIN d'énumération, après avoir élargi la
 * contrainte.
 */
export const CHAT_THREAD_TITLE_SOURCES = z.enum(['laura', 'user'])
export type ChatThreadTitleSource = z.infer<typeof CHAT_THREAD_TITLE_SOURCES>

/**
 * La longueur d'un titre SAISI. Deux lignes de la colonne des conversations
 * (240 px, `line-clamp-2`) en tiennent une soixantaine ; au-delà on tronque à
 * l'écran, mais la personne garde ce qu'elle a écrit. Laura, elle, vise une
 * ligne — 60, borné côté service IA (`TITLE_MAX_CHARS`,
 * `apps/ia/app/services/chat_thread_title.py`).
 */
export const CHAT_THREAD_TITLE_MAX_LENGTH = 120

/**
 * Un titre tel qu'une personne le saisit : blancs repliés, espaces retirés,
 * 1 à 120 caractères. La longueur se mesure APRÈS le repli — des espaces de trop
 * ne font pas refuser un titre court.
 */
export const chatThreadTitleSchema = z
  .string()
  .transform(value => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1).max(CHAT_THREAD_TITLE_MAX_LENGTH))
