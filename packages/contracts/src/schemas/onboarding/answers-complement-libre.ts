import { z } from 'zod'

/**
 * #2060 — « QUESTIONNAIRE — CE QUE BELLUMAI DOIT ABSOLUMENT SAVOIR — P0 ».
 *
 * Le parcours Temps-1 se termine par UNE question ouverte, libellé exact de
 * l'issue :
 *
 *   « Y a-t-il quelque chose d'important sur ton activité que mes questions
 *   n'ont pas couvert ? »
 *
 * avec huit amorces (#2060.2 → .8, `questions.uncoveredActivityNote.subtitle`
 * côté écran, pas ici — ce fichier ne porte que le contrat) : contrainte
 * interne, nouveau marché, client stratégique, associé, conflit de
 * territoire, offre en construction, objectif personnel, projet parallèle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2060.10 — JAMAIS TRANSFORMÉ AUTOMATIQUEMENT EN PLUSIEURS FAITS CERTAINS
 * ─────────────────────────────────────────────────────────────────────────
 * Le champ reste UNE chaîne, verbatim, jamais un tableau ni un objet : la
 * forme même du type interdit à un appelant de le lire comme plusieurs faits
 * distincts sans d'abord écrire son propre parsing (que la garde
 * `uncovered-activity-note-stays-opaque.spec.ts`, apps/api, surveille). Lu
 * verbatim par le prompt du profiler (`bellum_profiler.py` —
 * `_COMPLEMENT_SECTIONS`), couvert par sa garde générique « tout autre champ
 * ouvert » (`test_profiler_untrusted_free_text.py`) : une donnée à
 * interpréter, jamais une instruction. Doctrine « JAMAIS de donnée fictive » :
 * personne ne déduit ce texte, il est repris tel quel ou pas du tout.
 *
 * #2060.9 (« Laura reformule, l'utilisateur valide avant enregistrement »)
 * N'EST PAS dans ce lot : ce que « reformuler » veut dire concrètement (un
 * gabarit local qui répète le texte, ou un appel IA) est une décision
 * produit qui manque encore — laissé `retenu`, voir le registre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * « NON MESURÉ » N'EST JAMAIS « 0 » (GA-18/GA-19)
 * ─────────────────────────────────────────────────────────────────────────
 * Une question passée reste `null`, jamais une chaîne vide qui se lirait
 * comme une réponse donnée.
 */
export const COMPLEMENT_LIBRE_ANSWER_FIELDS = {
  uncovered_activity_note: z.string().nullable().optional(),
}

type UncoveredActivityNoteAnswers = {
  uncovered_activity_note?: string | null
}

/** Chaîne rognée, non vide, sinon `null` — jamais `''`. */
export function readUncoveredActivityNote(answers: UncoveredActivityNoteAnswers): string | null {
  const value = answers.uncovered_activity_note
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
