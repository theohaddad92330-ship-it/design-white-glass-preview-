import type { PlaybookKey } from '@bellum/contracts'

/**
 * Le TEXTE qu'un playbook envoie — écrit en dur, jamais par un modèle.
 *
 * C'est un choix, et il mérite d'être défendu : ces trois messages sont les
 * seuls du produit qui atteignent un client sans qu'un humain les ait relus.
 * Un texte généré à la volée serait relu par personne, varierait d'un envoi à
 * l'autre, et il suffirait d'une phrase malheureuse pour abîmer une relation
 * commerciale que Bellum est censé protéger. Un gabarit se relit une fois, en
 * revue, et vaut pour tous les envois suivants.
 *
 * Trois règles portent chaque gabarit :
 *
 *  1. **Rien qui ne soit su.** Une variable manquante fait retirer sa phrase,
 *     jamais apparaître un blanc ni un « N/A ». Le message reste vrai, il est
 *     seulement plus court.
 *  2. **Courts, et faciles à répondre.** Une relance qui pose UNE question
 *     obtient une réponse ; une qui résume le dossier obtient un silence.
 *  3. **Aucune pression.** Pas de fausse urgence, pas de « dernière chance » :
 *     l'expéditeur est une ESN qui veut garder son client, pas une plateforme
 *     d'e-mailing.
 *
 * Le module est PUR : il ne lit ni horloge, ni base, ni réseau. La signature
 * n'est pas ajoutée ici — c'est `MailboxService.sendBatch` qui la pose, avec
 * celle du compte réellement connecté.
 */

/** Ce que le gabarit a besoin de savoir. Tout est optionnel : un contexte
 *  incomplet raccourcit le message, il ne l'empêche pas. */
type PlaybookMessageContext = {
  /** Le prénom du destinataire, quand on le connaît. */
  contactFirstName?: string | null
  /** Le consultant positionné (`submission_no_reply`). */
  consultantName?: string | null
  /** La société cliente. */
  accountName?: string | null
  /** L'intitulé de la mission (`mission_renewal`) ou du projet. */
  subjectLabel?: string | null
  /** Jours de silence écoulés — jamais affichés au client, mais utiles au
   *  choix du ton. On ne les écrit pas : « cela fait 34 jours » se lit comme un
   *  reproche. */
  silenceDays?: number | null
  /** Fin de mission au format `YYYY-MM-DD` (`mission_renewal`). */
  endsOn?: string | null
}

export type PlaybookLanguage = 'fr' | 'en'

type PlaybookMessage = { subject: string; body: string }

/** `2026-09-30` → `30/09/2026` (fr) ou `2026-09-30` (en, format ISO lisible). */
function formatDate(iso: string, language: PlaybookLanguage): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return iso
  return language === 'fr' ? `${match[3]}/${match[2]}/${match[1]}` : `${match[1]}-${match[2]}-${match[3]}`
}

/** L'appel du message. Sans prénom connu, une formule neutre — inventer
 *  « Bonjour Jean » sur une adresse générique se voit immédiatement. */
function greeting(context: PlaybookMessageContext, language: PlaybookLanguage): string {
  const name = context.contactFirstName?.trim()
  if (name) return language === 'fr' ? `Bonjour ${name},` : `Hi ${name},`
  return language === 'fr' ? 'Bonjour,' : 'Hello,'
}

/** Assemble les lignes non vides. C'est ce qui fait qu'une variable absente
 *  retire sa phrase au lieu de laisser un trou dans le texte. */
function join(lines: (string | null)[]): string {
  return lines.filter((line): line is string => Boolean(line && line.trim())).join('\n\n')
}

/**
 * Le message d'un playbook, dans la langue de l'expéditeur.
 *
 * L'objet ne porte JAMAIS le nom du client seul (« ACME ») : un objet qui ne
 * dit que la société ressemble à un envoi de masse. Il nomme ce dont il est
 * question — un profil, une mission, une proposition.
 */
export function playbookMessage(
  playbook: PlaybookKey,
  context: PlaybookMessageContext,
  language: PlaybookLanguage = 'fr',
): PlaybookMessage {
  const hello = greeting(context, language)
  const fr = language === 'fr'

  switch (playbook) {
    case 'submission_no_reply': {
      const who = context.consultantName?.trim() || null
      const subject = who
        ? fr
          ? `Profil de ${who} — as-tu pu le regarder ?`
          : `${who}'s profile — did you get a chance to look?`
        : fr
          ? 'Le profil envoyé — as-tu pu le regarder ?'
          : 'The profile we sent — did you get a chance to look?'
      return {
        subject,
        body: join([
          hello,
          who
            ? fr
              ? `Je reviens vers toi au sujet du profil de ${who} que je t'ai transmis.`
              : `I'm following up on ${who}'s profile, which I sent over.`
            : fr
              ? 'Je reviens vers toi au sujet du profil que je t’ai transmis.'
              : "I'm following up on the profile I sent over.",
          fr
            ? 'Est-ce qu’il correspond à ce que tu cherches ? Si le besoin a évolué ou s’il n’est plus d’actualité, dis-le-moi simplement — je préfère le savoir que te relancer pour rien.'
            : "Does it match what you're looking for? If the need has changed or is no longer live, just tell me — I'd rather know than keep following up.",
        ]),
      }
    }

    case 'mission_renewal': {
      const label = context.subjectLabel?.trim() || null
      const subject = label
        ? fr
          ? `${label} — on prépare la suite ?`
          : `${label} — shall we plan what's next?`
        : fr
          ? 'La suite de la mission en cours'
          : "What's next for the current assignment"
      return {
        subject,
        body: join([
          hello,
          label
            ? fr
              ? `La mission « ${label} » arrive à son terme.`
              : `The "${label}" assignment is coming to an end.`
            : fr
              ? 'La mission en cours arrive à son terme.'
              : 'The current assignment is coming to an end.',
          context.endsOn
            ? fr
              ? `L’échéance prévue est le ${formatDate(context.endsOn, 'fr')}.`
              : `The planned end date is ${formatDate(context.endsOn, 'en')}.`
            : null,
          fr
            ? 'Souhaites-tu qu’on prolonge, qu’on ajuste le périmètre, ou qu’on s’arrête là ? Un mot de ta part suffit pour que je prépare ce qu’il faut.'
            : 'Would you like to extend, adjust the scope, or wrap up? A quick word from you and I’ll prepare what’s needed.',
        ]),
      }
    }

    case 'proposal_no_reply': {
      const label = context.subjectLabel?.trim() || null
      const subject = label
        ? fr
          ? `${label} — où en es-tu ?`
          : `${label} — where do you stand?`
        : fr
          ? 'Notre proposition — où en es-tu ?'
          : 'Our proposal — where do you stand?'
      return {
        subject,
        body: join([
          hello,
          label
            ? fr
              ? `Je reviens vers toi au sujet de la proposition sur « ${label} ».`
              : `I'm following up on our proposal for "${label}".`
            : fr
              ? 'Je reviens vers toi au sujet de la proposition que je t’ai envoyée.'
              : "I'm following up on the proposal I sent you.",
          fr
            ? 'Y a-t-il un point à clarifier de mon côté ? Et si le sujet est reporté ou fermé, dis-le-moi — ça m’évite de te relancer.'
            : 'Is there anything I can clarify? And if this is postponed or closed, do tell me — it saves me following up again.',
        ]),
      }
    }
  }
}
