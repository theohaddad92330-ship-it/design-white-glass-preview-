import {
  CV_DETECTIONS,
  readEmailFromIdentity,
  readPhoneFromIdentity,
  readProfileUrlFromIdentity,
  type ParsedField,
} from '@bellum/contracts'

/**
 * Le parsing d'un CV en espace de DÉMONSTRATION (parité démo).
 *
 * Le parsing réel appelle un modèle. En salle de démonstration, la règle du
 * dépôt est constante — zéro appel modèle, aucun crédit — et le geste doit
 * quand même se MONTRER, comme la structuration d'un compte rendu.
 *
 * Il est donc SCRIPTÉ, mais pas inventé : chaque champ est extrait du `cv_text`
 * réellement seedé sur le consultant d'exemple, et chaque citation est un
 * passage EXACT de ce texte. Un visiteur qui survole un champ voit le bon
 * passage se surligner — c'est ce que la démonstration doit prouver.
 *
 * Le §14 demande deux CV d'exemple, « dont 1 avec confiance faible ». La
 * confiance faible n'est pas décorative : elle DÉSACTIVE « Tout accepter », et
 * c'est justement la garde qu'un prospect doit voir fonctionner.
 */
export function scriptedDemoParse(cvText: string): ParsedField[] {
  const lines = cvText.split('\n').map(line => line.trim())
  const find = (predicate: (line: string) => boolean): { text: string; offset: number } | null => {
    const line = lines.find(predicate)
    if (!line) return null
    const offset = cvText.indexOf(line)
    return offset >= 0 ? { text: line, offset } : null
  }

  const header = find(line => line.includes('—')) ?? (lines[0] ? { text: lines[0], offset: 0 } : null)
  const skillsLine = find(line => /^[A-ZÉÈ][^:]*,/.test(line) && line.split(',').length >= 3)
  const experience = find(line => /^\d{4}\s*[-–]\s*\d{4}/.test(line))

  const byDetection = new Map<string, ParsedField>()

  if (header) {
    const name = header.text.split('—')[0]?.trim() || header.text
    const title = header.text.split('—')[1]?.trim()
    // #4401.1 — les coordonnées ÉCRITES dans le document (e-mail, téléphone, LinkedIn), lues par les MÊMES
    // lecteurs que la fiche (`@bellum/contracts`) : sans elles la fiche disait « aucun moyen de contact ».
    // Une coordonnée absente du texte n'est pas ajoutée — jamais inventée.
    const contacts = [readEmailFromIdentity(cvText), readPhoneFromIdentity(cvText), readProfileUrlFromIdentity(cvText)]
      .filter((fact): fact is string => fact !== null)
      .filter(fact => !name.includes(fact))
    // La citation reste UN passage contigu du CV : de la première ligne à la dernière coordonnée lue.
    const contactEnds = contacts
      .map(fact => cvText.indexOf(fact))
      .filter(at => at >= 0)
      .map(at => {
        const lineEnd = cvText.indexOf('\n', at)
        return lineEnd < 0 ? cvText.length : lineEnd
      })
    const excerptEnd = Math.max(header.offset + header.text.length, ...contactEnds)
    byDetection.set('identity', {
      detection: 'identity',
      value: contacts.length > 0 ? [name, ...contacts] : name,
      confidence: 0.95,
      sourceExcerpt: cvText.slice(header.offset, excerptEnd).trimEnd(),
      excerptOffset: header.offset,
    })
    if (title && !contacts.some(fact => title.includes(fact))) {
      byDetection.set('job_title', {
        detection: 'job_title',
        value: title.replace(/\s*\(.*\)\s*$/, ''),
        confidence: 0.9,
        sourceExcerpt: header.text,
        excerptOffset: header.offset,
      })
    }
  }

  if (skillsLine) {
    byDetection.set('skills', {
      detection: 'skills',
      value: skillsLine.text
        .replace(/\.$/, '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean),
      confidence: 0.85,
      sourceExcerpt: skillsLine.text,
      excerptOffset: skillsLine.offset,
    })
  }

  if (experience) {
    byDetection.set('experiences', {
      detection: 'experiences',
      value: experience.text,
      confidence: 0.8,
      sourceExcerpt: experience.text,
      excerptOffset: experience.offset,
    })
    // Le SECTEUR se déduit du client cité — et une déduction n'est pas une
    // lecture. La confiance basse est le point de la démonstration : elle
    // désactive « Tout accepter » et oblige à relire.
    byDetection.set('sectors', {
      detection: 'sectors',
      value: [experience.text.split(',').slice(-1)[0]?.trim() ?? 'Non précisé'],
      confidence: 0.45,
      sourceExcerpt: experience.text,
      excerptOffset: experience.offset,
    })
  }

  // Les blocs non trouvés sortent quand même, à `null` : « ce CV ne dit pas où
  // la personne habite » est une information.
  return CV_DETECTIONS.map(
    detection =>
      byDetection.get(detection) ?? {
        detection,
        value: null,
        confidence: 0,
        sourceExcerpt: '',
        excerptOffset: null,
      },
  )
}
