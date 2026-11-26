import { anonymizeForEvalSample, MAX_EVAL_MESSAGE_BODY_CHARS, MAX_SAMPLED_TURN_CHARS } from './chat-eval-anonymizer'

/**
 * #2899 / #2443.10 / #2278.9 — l'anonymisation d'un tour de Laura AVANT stockage.
 * Une garde qui sait dire NON : un tour qui ressemble à un CORPS de message n'est pas
 * échantillonné du tout (`null`), jamais « anonymisé à moitié ».
 */
describe('anonymizeForEvalSample', () => {
  it('masque e-mail, téléphone, lien, SIREN/SIRET et IBAN', () => {
    const out = anonymizeForEvalSample(
      'écris à marie.dupont@nova.fr ou au 06 12 34 56 78, voir https://nova.fr/x, siren 552 100 554, FR76 3000 6000 0112 3456 7890 189',
    )
    expect(out).not.toMatch(/@|nova\.fr|06 12|552 100|FR76/)
    expect(out).toContain('[e-mail]')
    expect(out).toContain('[téléphone]')
    expect(out).toContain('[lien]')
    expect(out).toContain('[identifiant]')
    expect(out).toContain('[iban]')
  })

  it('masque les noms propres (entreprise, personne, ville) hors début de phrase', () => {
    const out = anonymizeForEvalSample(
      'prépare une relance pour le DSI de Nova Logistique à Lille, contact Marie Dupont',
    )
    expect(out).not.toMatch(/Nova|Logistique|Lille|Marie|Dupont/)
    expect(out).toContain('DSI')
    expect(out).toContain('[nom]')
  })

  it('masque un nom en début de phrase quand il est suivi d’un autre nom', () => {
    const out = anonymizeForEvalSample('Marie Dupont a répondu hier')
    expect(out).not.toMatch(/Marie|Dupont/)
  })

  it('garde le vocabulaire métier et les sigles usuels', () => {
    const out = anonymizeForEvalSample('Quels sont les ESN concurrents et le CRM utilisé ?')
    expect(out).toContain('ESN')
    expect(out).toContain('CRM')
    expect(out).toContain('Quels')
  })

  it('un tour trop long (probable corps de message collé) n’est PAS échantillonné', () => {
    expect(anonymizeForEvalSample('a'.repeat(MAX_SAMPLED_TURN_CHARS + 1))).toBeNull()
  })

  it('un tour qui ressemble à un message rédigé (formule d’appel, signature) n’est PAS échantillonné', () => {
    expect(
      anonymizeForEvalSample('Bonjour Madame,\nJe vous écris pour vous proposer un échange.\nCordialement,\nLouis'),
    ).toBeNull()
  })

  describe('#2958.98 — l’exception nommée du rejeu (corps des messages de l’utilisateur nommé)', () => {
    const body = 'Bonjour Madame,\nJe vous écris pour vous proposer un échange.\nCordialement,\nLouis Schlegel'

    it('le corps est versé, anonymisé, quand l’exception est accordée', () => {
      const out = anonymizeForEvalSample(body, { allowMessageBody: true })
      expect(out).toContain('Je vous écris')
      expect(out).not.toMatch(/Louis|Schlegel/)
    })

    it('au-delà de la borne d’un corps, toujours rien', () => {
      expect(anonymizeForEvalSample('a'.repeat(MAX_EVAL_MESSAGE_BODY_CHARS + 1), { allowMessageBody: true })).toBeNull()
      expect(anonymizeForEvalSample('a'.repeat(MAX_SAMPLED_TURN_CHARS + 1), { allowMessageBody: true })).not.toBeNull()
    })

    it('sans l’exception, le même corps reste refusé', () => {
      expect(anonymizeForEvalSample(body, { allowMessageBody: false })).toBeNull()
    })
  })

  it('texte vide : null', () => {
    expect(anonymizeForEvalSample('   ')).toBeNull()
  })
})
