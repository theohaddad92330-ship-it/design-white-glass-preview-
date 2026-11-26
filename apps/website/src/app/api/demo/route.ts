import { NextResponse } from 'next/server'

const DEMO_RECIPIENT = process.env.DEMO_RECIPIENT_EMAIL ?? 'contact@bellum-it.com'

type DemoRequest = {
  name?: string
  email?: string
  company?: string
  teamSize?: string
  goal?: string
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Service email non configuré.' }, { status: 500 })
  }

  const data = (await request.json().catch(() => null)) as DemoRequest | null
  if (!data?.name || !data?.email) {
    return NextResponse.json({ error: 'Champs requis manquants.' }, { status: 400 })
  }

  const from = process.env.DEMO_FROM_EMAIL ?? 'BellumAI <onboarding@resend.dev>'
  const lines = [
    `Nom : ${data.name}`,
    `Email : ${data.email}`,
    `Société : ${data.company ?? '-'}`,
    `Taille d'équipe : ${data.teamSize ?? '-'}`,
    `Enjeu principal : ${data.goal ?? '-'}`,
  ]

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [DEMO_RECIPIENT],
      reply_to: data.email,
      subject: `Demande de démo - ${data.company}`,
      text: lines.join('\n'),
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    return NextResponse.json({ error: "L'envoi a échoué.", detail }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
