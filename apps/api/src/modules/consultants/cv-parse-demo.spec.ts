import {
  CV_DETECTIONS,
  canAutoAccept,
  readEmailFromIdentity,
  readPhoneFromIdentity,
  readProfileUrlFromIdentity,
} from '@bellum/contracts'
import { DEMO_CONSULTANTS } from '../demo/demo-dataset'
import { scriptedDemoParse } from './cv-parse-demo'

/**
 * Le parsing scripté de la salle de démonstration (parité démo + §14).
 *
 * Ce que ces tests protègent : « scripté » ne veut pas dire « inventé ». Chaque
 * citation doit se retrouver TELLE QUELLE dans le CV d'exemple — sinon le
 * surlignage tombe à côté et la démonstration prouve l'inverse de ce qu'elle
 * veut montrer.
 */
describe('scriptedDemoParse', () => {
  const cvs = DEMO_CONSULTANTS.map(consultant => consultant.cv_text)

  it('couvre au moins deux CV du jeu de démonstration', () => {
    // Le §14 en demande deux, « dont 1 avec confiance faible ».
    expect(cvs.length).toBeGreaterThanOrEqual(2)
  })

  it.each(cvs.slice(0, 2))('cite le CV MOT POUR MOT (%#)', cvText => {
    for (const field of scriptedDemoParse(cvText)) {
      if (field.value === null) continue
      expect(field.sourceExcerpt.length).toBeGreaterThan(0)
      // La citation doit être retrouvable, et à l'OFFSET annoncé : c'est cet
      // offset qui surligne le bon passage au survol.
      expect(cvText).toContain(field.sourceExcerpt)
      expect(cvText.slice(field.excerptOffset ?? 0, (field.excerptOffset ?? 0) + field.sourceExcerpt.length)).toBe(
        field.sourceExcerpt,
      )
    }
  })

  it('rend les treize blocs, y compris ceux que le CV ne dit pas', () => {
    const fields = scriptedDemoParse(cvs[0] ?? '')
    expect(fields).toHaveLength(CV_DETECTIONS.length)
    expect(fields.some(field => field.value === null)).toBe(true)
  })

  it('produit une confiance FAIBLE sur ce qui est déduit — la garde se voit à l’écran', () => {
    // Le secteur se DÉDUIT du client cité, et une déduction n'est pas une
    // lecture. La confiance basse désactive « Tout accepter » : c'est
    // précisément la garde qu'un prospect doit voir fonctionner.
    const fields = scriptedDemoParse(cvs[0] ?? '')
    const sectors = fields.find(field => field.detection === 'sectors')
    expect(sectors?.value).not.toBeNull()
    expect(sectors?.confidence).toBeLessThan(0.6)
    // Et « Tout accepter » est refusé : la démonstration montre la garde en
    // train de fonctionner, pas seulement l'écran.
    expect(canAutoAccept(fields)).toBe(false)
  })

  it('ne casse pas sur un texte vide', () => {
    const fields = scriptedDemoParse('')
    expect(fields).toHaveLength(CV_DETECTIONS.length)
    expect(fields.every(field => field.value === null)).toBe(true)
  })

  // #4401.1 — un CV importé en démonstration rendait le nom mais « aucun moyen de contact » : la lecture
  // scriptée ne sortait que la première ligne. Les coordonnées ÉCRITES se lisent, citées mot pour mot.
  describe('coordonnées (#4401.1)', () => {
    const cv = [
      'Hugo Verdier',
      'Développeur backend senior',
      'hugo.verdier@example.fr | 06 12 34 56 78',
      'linkedin.com/in/hugo-verdier',
      '',
      'Compétences',
      'Java, Spring, PostgreSQL, Kafka',
    ].join('\n')

    it('lit e-mail, téléphone et LinkedIn du document, cités à leur offset', () => {
      const identity = scriptedDemoParse(cv).find(field => field.detection === 'identity')
      expect(readEmailFromIdentity(identity?.value ?? null)).toBe('hugo.verdier@example.fr')
      expect(readPhoneFromIdentity(identity?.value ?? null)).toBe('06 12 34 56 78')
      expect(readProfileUrlFromIdentity(identity?.value ?? null)).toContain('linkedin.com/in/hugo-verdier')
      const excerpt = identity?.sourceExcerpt ?? ''
      expect(cv.slice(identity?.excerptOffset ?? 0, (identity?.excerptOffset ?? 0) + excerpt.length)).toBe(excerpt)
      expect(excerpt).toContain('hugo.verdier@example.fr')
    })

    it('lit les coordonnées d’une première ligne « Nom — e-mail »', () => {
      const identity = scriptedDemoParse('Hugo Verdier — hugo@example.fr').find(f => f.detection === 'identity')
      expect(readEmailFromIdentity(identity?.value ?? null)).toBe('hugo@example.fr')
    })

    it('contrôle négatif : un CV sans coordonnée n’en invente aucune', () => {
      const identity = scriptedDemoParse('Hugo Verdier\nDéveloppeur\nJava, Spring, Kafka').find(
        f => f.detection === 'identity',
      )
      expect(identity?.value).toBe('Hugo Verdier')
      expect(readEmailFromIdentity(identity?.value ?? null)).toBeNull()
      expect(readPhoneFromIdentity(identity?.value ?? null)).toBeNull()
    })
  })
})
