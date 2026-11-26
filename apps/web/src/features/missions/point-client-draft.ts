/**
 * Théo missions-dossier — LE BROUILLON DU « POINT CLIENT ».
 *
 * La fenêtre « Préparer le point client » s'ouvre DÉJÀ rédigée (décision de Louis, 23/10/2026 : « jamais un
 * champ vide »), relisible et modifiable, avec « Régénérer ». Le texte est composé ici, à partir des seuls
 * faits de la mission — son intitulé, la personne affectée, la fin prévue, le prénom de l'interlocuteur.
 *
 * ⚠️ Ce n'est PAS une rédaction du modèle : aucune route de rédaction n'existe pour une mission (celle des
 * fiches consultant est propre aux candidats). Le texte ne dit que ce que le dossier sait, ne présume jamais
 * d'une prolongation, et n'invente aucune échéance quand la fin est inconnue.
 */
type PointClientVariant = 'default' | 'shorter' | 'direct'

export function pointClientDraft(input: {
  missionLabel: string
  consultantName: string | null
  clientFirstName: string | null
  senderFirstName: string | null
  endsOnLabel: string | null
  variant: PointClientVariant
}): { subject: string; body: string } {
  const greeting = input.clientFirstName ? `Bonjour ${input.clientFirstName},` : 'Bonjour,'
  const who = input.consultantName ? ` avec ${input.consultantName}` : ''
  const next = input.endsOnLabel ? `la suite après le ${input.endsOnLabel}` : 'la suite de la mission'
  const signature = input.senderFirstName ?? ''

  const lines =
    input.variant === 'shorter'
      ? [
          greeting,
          `Peut-on faire un point rapide sur « ${input.missionLabel} »${who} ? Je voudrais surtout parler de ${next}, sans présumer d’une prolongation.`,
          'Bonne journée,',
          signature,
        ]
      : input.variant === 'direct'
        ? [
            greeting,
            `Comment envisages-tu ${next} pour « ${input.missionLabel} » ?`,
            `Je te propose un point${who} pour préparer la continuité ou la passation, sans présumer d’une prolongation. Quels éléments restent à sécuriser sur le périmètre actuel ?`,
            'Bonne journée,',
            signature,
          ]
        : [
            greeting,
            `Je te propose de faire le point sur « ${input.missionLabel} »${who}. Quels éléments restent à sécuriser sur le périmètre actuel, et comment envisages-tu ${next} ?`,
            'Cela nous permettra de préparer la continuité ou la passation sans présumer d’une prolongation.',
            'Bonne journée,',
            signature,
          ]

  return {
    subject: `Point de suivi — ${input.missionLabel}`,
    body: lines.filter(line => line !== '').join('\n\n'),
  }
}
