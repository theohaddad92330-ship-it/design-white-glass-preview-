/**
 * Ce que Laura fait remonter à l'équipe — par e-mail, comme le formulaire beta.
 *
 * Le site marketing n'a pas de base de données, et lui en donner une pour poser
 * trois leads par jour serait le mauvais côté du compromis : une table à
 * sauvegarder, à purger, à déclarer au RGPD, pour une information qui doit de
 * toute façon atterrir dans la boîte d'un commercial. On réutilise donc le
 * chemin déjà en place (`/api/beta` → Resend), qui a l'avantage d'exister et
 * d'être déjà surveillé.
 *
 * **Un échec est un échec.** La fonction rend `false` et l'appelant le DIT au
 * modèle, qui le dit au visiteur. Le repo pose la règle ailleurs sous le même
 * mot : ne jamais prétendre qu'une action a réussi quand l'outil n'a pas répondu
 * un succès — un « c'est transmis ! » sur un envoi tombé est pire que « je n'ai
 * pas pu, écris-nous directement ».
 */

const DEFAULT_RECIPIENT = 'theo@bellum-it.com'

export function salesRecipient(): string {
  return process.env.SALES_EMAIL?.trim() || DEFAULT_RECIPIENT
}

function fromAddress(): string {
  return (
    process.env.CHATBOT_FROM_EMAIL?.trim() ||
    process.env.BETA_FROM_EMAIL?.trim() ||
    process.env.DEMO_FROM_EMAIL?.trim() ||
    'BellumAI <onboarding@resend.dev>'
  )
}

/** Envoie, ou dit pourquoi il n'a pas pu. Ne lève jamais : un tour de
 *  conversation ne doit pas tomber parce qu'un fournisseur d'e-mail est lent. */
export async function sendTeamEmail(subject: string, lines: readonly string[], replyTo?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return false

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromAddress(),
        to: [salesRecipient()],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        text: lines.join('\n'),
      }),
    })
    return response.ok
  } catch {
    return false
  }
}
