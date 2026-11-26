import type { ZeroLayerSource } from './zero-layer-format'

/**
 * Les notes écrites à la main sur un compte, en source de couche zéro.
 *
 * #1082, #1083, #1088 — « j'imagine Bellum comme Ice breaker et aussi comme
 * appui au développement. Je connais un compte, quelques personnes côté DSI et
 * j'ai envie de me développer. Je renseigne un max d'info dans Bellum et il
 * m'aide à apporter de l'info en se servant aussi de ce que je fais ». Les
 * notes étaient stockées, datées, attribuées — et n'atteignaient aucun prompt.
 *
 * Elles rejoignent la couche zéro plutôt qu'un chemin à elles : l'annexe p8
 * énumère « l'ATS, le Drive, les e-mails, les NOTES, les CV déjà envoyés », et
 * un second chemin d'injection aurait deux formats, deux plafonds et deux
 * façons d'oublier une règle de prudence.
 *
 * Elles en héritent donc l'asymétrie du bloc : une note est CITÉE, jamais
 * interprétée, et elle ne sort PAS le compte du « froid » — seul un historique
 * CRM (une relation enregistrée) le fait. Quelqu'un peut très bien avoir écrit
 * « à creuser » sur un compte que personne n'a jamais appelé.
 */

/**
 * Place laissée à une note dans le prompt.
 *
 * Plus large que les 160 caractères d'un titre de document : une note est de la
 * PROSE, et la couper de moitié reviendrait à jeter ce que le commercial a pris
 * le temps d'écrire — c'est-à-dire exactement ce qu'on veut capitaliser. Le
 * plafond du bloc entier (4000 caractères) borne le tout de toute façon.
 */
export const NOTE_BODY_MAX_CHARS = 400

/** Nombre de notes citées. Les plus récentes d'abord — l'appelant trie. */
export const MAX_NOTES_CITED = 6

export type AccountNote = {
  body: string
  createdAt: string
  /** Auteur résolu, ou `null` quand le profil n'est pas lisible. Jamais deviné. */
  author: string | null
  /** #3895 — le compte d'origine quand la note a été écrite sur une AUTRE entité du groupe. */
  fromAccount?: string | null
}

/** #3895 — l'auteur, puis l'origine quand la note vient d'une autre entité du groupe. */
function noteDetail(note: AccountNote): string | null {
  const origin = note.fromAccount ? `note de ${note.fromAccount} (même groupe)` : null
  return [note.author, origin].filter(Boolean).join(' · ') || null
}

/**
 * Une source de couche zéro à partir des notes, ou `null` quand il n'y en a
 * aucune d'exploitable.
 *
 * `null` et non une source vide : « une absence de résultat n'est pas une
 * information, et injectée dans un prompt elle se lit comme un fait établi ».
 */
export function accountNotesSource(notes: AccountNote[]): ZeroLayerSource | null {
  const findings = notes
    .filter(note => note.body.trim().length > 0)
    .slice(0, MAX_NOTES_CITED)
    .map(note => ({
      title: note.body.trim(),
      detail: noteDetail(note),
      date: note.createdAt,
    }))
  if (findings.length === 0) return null
  return {
    key: 'account_notes',
    label: "Notes saisies sur ce compte par l'équipe",
    findings,
    titleMaxChars: NOTE_BODY_MAX_CHARS,
  }
}
