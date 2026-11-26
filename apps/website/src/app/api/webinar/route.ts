import { NextResponse } from 'next/server'

/**
 * Le destinataire des candidatures. Réglage, plus une constante : une adresse
 * nominative en dur dans un fichier suivi part avec le dépôt, et suit la
 * personne quand elle change de poste.
 */
const WEBINAR_RECIPIENT = process.env.WEBINAR_RECIPIENT_EMAIL ?? 'contact@bellum-it.com'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/

type WebinarRegistration = {
  name?: string
  email?: string
  company?: string
  role?: string
  /** Honeypot — real users leave this empty. */
  website?: string
}

export async function POST(request: Request) {
  const data = (await request.json().catch(() => null)) as WebinarRegistration | null

  // Honeypot: a filled hidden field means a bot. Return a fake success so we
  // never send an email and never hint the trap.
  if (data?.website) {
    return NextResponse.json({ ok: true })
  }

  const name = data?.name?.trim()
  const email = data?.email?.trim()
  const company = data?.company?.trim()
  if (!name || !email || !company || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Champs requis manquants ou invalides.' }, { status: 400 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "L'inscription n'est pas encore configurée. Écrivez-nous à contact@bellum-it.com." },
      { status: 503 },
    )
  }

  const from =
    process.env.WEBINAR_FROM_EMAIL ??
    process.env.BETA_FROM_EMAIL ??
    process.env.DEMO_FROM_EMAIL ??
    'BellumAI <onboarding@resend.dev>'
  const lines = [
    'Nouvelle inscription au webinaire BellumAI du 5 septembre 2026',
    '',
    `Nom : ${name}`,
    `Email : ${email}`,
    `ESN : ${company}`,
    `Rôle : ${data?.role?.trim() || '-'}`,
  ]

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [WEBINAR_RECIPIENT],
      reply_to: email,
      subject: `Inscription webinaire 5 septembre - ${company}`,
      text: lines.join('\n'),
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    return NextResponse.json({ error: "L'envoi a échoué.", detail }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
