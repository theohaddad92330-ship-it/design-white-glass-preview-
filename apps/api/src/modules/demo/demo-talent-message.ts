/**
 * #4347 (craft rule n°9) — le message au consultant, SEMÉ pour la salle de démonstration.
 *
 * En démo, « Préparer un message » ne joint pas le moteur de rédaction : le texte est SCRIPTÉ à partir
 * des faits de la fiche fictive (prénom, besoin, client), comme `demo-scripts.ts` le fait pour les autres
 * réponses de Laura. Le prospect voit donc, en réunion, la fenêtre s'ouvrir DÉJÀ rédigée — et les gestes
 * « Plus court » / « Plus direct » / « Régénérer » répondent. Aucun fait n'est ajouté : ce qui n'est pas
 * sur la fiche ne s'écrit pas.
 */
import type { DraftTalentMessageInput } from '@bellum/contracts'

type DemoTalentFacts = { firstName: string | null; need: string | null; client: string | null }

export function demoTalentMessage(
  input: Pick<DraftTalentMessageInput, 'channel' | 'variant'>,
  facts: DemoTalentFacts,
): { subject: string | null; body: string } {
  const hello = facts.firstName ? `Bonjour ${facts.firstName}` : 'Bonjour'
  const what = facts.need ? `la mission « ${facts.need} »${facts.client ? ` chez ${facts.client}` : ''}` : null
  const subject =
    input.channel === 'email' ? (facts.need ? `Mission : ${facts.need}` : 'On se tient au courant ?') : null

  if (input.variant === 'shorter') {
    return {
      subject,
      body: what
        ? `${hello}, ${what} pourrait vous intéresser. Seriez-vous partant(e) pour en parler ?`
        : `${hello}, toujours disponible ? Un échange de 10 minutes ?`,
    }
  }
  if (input.variant === 'more_direct') {
    return {
      subject,
      body: what
        ? `${hello}, je vous propose ${what}. Êtes-vous intéressé(e) et disponible ?`
        : `${hello}, êtes-vous disponible pour une prochaine mission ?`,
    }
  }
  if (input.channel === 'phone') {
    return {
      subject: null,
      body: what
        ? `${hello}, Je vous appelle au sujet de ${what}. Auriez-vous deux minutes pour que je vous la présente ?`
        : `${hello}, je vous appelle pour prendre de vos nouvelles et savoir où vous en êtes côté disponibilité.`,
    }
  }
  const variantNote = input.variant === 'regenerate' ? ' (autre formulation)' : ''
  return {
    subject,
    body: what
      ? `${hello},\n\nUne opportunité pourrait vous correspondre : ${what}. Elle s'appuie sur votre profil et vos compétences.\n\nCela vous intéresse-t-il, et seriez-vous disponible pour en discuter cette semaine ?${variantNote}\n\nBien cordialement`
      : `${hello},\n\nJe prends de vos nouvelles : où en êtes-vous côté disponibilité ? Si vous le souhaitez, nous pouvons nous appeler quelques minutes.${variantNote}\n\nBien cordialement`,
  }
}
