import { encodeGmailRaw } from './google.client'

/**
 * L'encodage MIME est le genre de code qui « marche » jusqu'au jour où un
 * client d'e-mail affiche la pièce jointe comme du texte au milieu du message.
 * Ces tests relisent le message produit, ligne par ligne.
 */
function decode(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8')
}

describe('encodeGmailRaw', () => {
  it('reste un message simple quand il n’y a pas de pièce jointe', () => {
    const mime = decode(encodeGmailRaw({ to: 'jean@acme.com', subject: 'Bonjour', body: 'Corps' }))
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(mime).not.toContain('multipart/mixed')
  })

  it('encode un objet accentué en RFC 2047 plutôt que de l’envoyer brut', () => {
    const mime = decode(encodeGmailRaw({ to: 'a@b.com', subject: 'Réunion café', body: 'x' }))
    expect(mime).toContain('Subject: =?UTF-8?B?')
  })

  it('pose In-Reply-To ET References — sans quoi la réponse ouvre un nouveau fil', () => {
    const mime = decode(encodeGmailRaw({ to: 'a@b.com', subject: 'Re: x', body: 'y', inReplyTo: '<msg-1@acme.com>' }))
    expect(mime).toContain('In-Reply-To: <msg-1@acme.com>')
    expect(mime).toContain('References: <msg-1@acme.com>')
  })

  it('bascule en multipart et joint le fichier RÉEL', () => {
    const raw = encodeGmailRaw({
      to: 'a@b.com',
      subject: 'CV',
      body: 'Voici le profil.',
      attachments: [{ filename: 'cv-sofia.pdf', mimeType: 'application/pdf', contentBase64: 'QUJD' }],
    })
    const mime = decode(raw)

    expect(mime).toContain('Content-Type: multipart/mixed; boundary="bellum_')
    expect(mime).toContain('Content-Disposition: attachment; filename="cv-sofia.pdf"')
    expect(mime).toContain('Content-Transfer-Encoding: base64')
    expect(mime).toContain('QUJD')
    // Le corps reste lisible en texte, avant la pièce jointe.
    expect(mime).toContain('Voici le profil.')
  })

  it('ferme correctement la frontière multipart', () => {
    const mime = decode(
      encodeGmailRaw({
        to: 'a@b.com',
        subject: 'x',
        body: 'y',
        attachments: [{ filename: 'f.pdf', mimeType: 'application/pdf', contentBase64: 'QQ==' }],
      }),
    )
    const boundary = /boundary="([^"]+)"/.exec(mime)?.[1]
    expect(boundary).toBeTruthy()
    // La frontière finale porte deux tirets de plus : sans elle, certains
    // clients affichent la pièce jointe comme du texte.
    expect(mime).toContain(`--${boundary}--`)
  })

  it('découpe le base64 à 76 caractères (RFC 2045)', () => {
    const long = 'A'.repeat(500)
    const mime = decode(
      encodeGmailRaw({
        to: 'a@b.com',
        subject: 'x',
        body: 'y',
        attachments: [{ filename: 'f.bin', mimeType: 'application/octet-stream', contentBase64: long }],
      }),
    )
    const payloadLines = mime.split('\r\n').filter(line => /^A+$/.test(line))
    expect(payloadLines.length).toBeGreaterThan(1)
    expect(payloadLines.every(line => line.length <= 76)).toBe(true)
  })

  it('n’utilise jamais deux fois la même frontière', () => {
    // Une frontière fixe finirait par apparaître dans un fichier, et couperait
    // le message en deux au mauvais endroit.
    const build = () =>
      /boundary="([^"]+)"/.exec(
        decode(
          encodeGmailRaw({
            to: 'a@b.com',
            subject: 'x',
            body: 'y',
            attachments: [{ filename: 'f.pdf', mimeType: 'application/pdf', contentBase64: 'QQ==' }],
          }),
        ),
      )?.[1]
    expect(build()).not.toBe(build())
  })
})
