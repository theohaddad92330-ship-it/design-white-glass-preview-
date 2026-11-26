import { composePhoneScript } from './contacts.service'

/**
 * Script téléphone — les QUATRE moments p11.
 *
 * Le produit ne générait que l'ouverture. « Le cold call doit qualifier un
 * signal, un besoin, un interlocuteur ou un processus » restait donc un slogan :
 * sans découverte l'appel ne qualifie rien, sans sortie il ne se termine sur
 * aucun next step daté.
 */
describe('composePhoneScript — les 4 moments p11', () => {
  it('assemble ouverture, 10 secondes, découverte et sortie', () => {
    const script = composePhoneScript({
      contactName: 'Marie Dupont',
      phoneOpener: 'Bonjour, je vous appelle au sujet de votre migration Azure annoncée en juin.',
      phoneTenSeconds: 'Louis, ESN data. Une question : qui pilote le chantier côté métier ?',
      phoneDiscovery: ['Quel est votre rôle sur ce chantier ?', 'Quels prestataires sont déjà en place ?'],
      phoneExit: 'Next step : je vous rappelle jeudi 14h avec deux profils, ou vous me dites non.',
    })

    expect(script).toContain('OUVERTURE')
    expect(script).toContain('LES 10 PREMIÈRES SECONDES')
    expect(script).toContain('DÉCOUVERTE')
    expect(script).toContain('SORTIE')
    // Les questions de découverte sont une LISTE lisible, pas un paragraphe.
    expect(script).toContain('- Quel est votre rôle sur ce chantier ?')
    expect(script).toContain('- Quels prestataires sont déjà en place ?')
  })

  it('rend un dossier antérieur exactement comme avant', () => {
    // RÉTRO-COMPAT : un dossier généré avant ce chantier ne porte que
    // `phoneOpener`. Il ne doit pas gagner de titres de section.
    const script = composePhoneScript({
      contactName: 'Marie Dupont',
      phoneOpener: 'Bonjour, je vous appelle au sujet de votre migration Azure.',
    })

    expect(script).toBe('Bonjour, je vous appelle au sujet de votre migration Azure.')
  })

  it('ne renvoie rien quand le modèle n’a rien produit', () => {
    expect(composePhoneScript({ contactName: 'Marie Dupont' })).toBeUndefined()
    expect(composePhoneScript({ contactName: 'Marie Dupont', phoneOpener: '   ' })).toBeUndefined()
  })

  it('ignore les questions de découverte vides sans casser la section', () => {
    const script = composePhoneScript({
      contactName: 'Marie Dupont',
      phoneOpener: 'Ouverture.',
      phoneDiscovery: ['  ', '', 'Quel est le timing ?'],
    })

    expect(script).toContain('- Quel est le timing ?')
    expect(script).not.toContain('- \n')
  })

  it('tient sans ouverture — la découverte seule reste un script utilisable', () => {
    const script = composePhoneScript({
      contactName: 'Marie Dupont',
      phoneDiscovery: ['Qui décide du budget ?'],
      phoneExit: 'NO-GO assumé si pas de budget avant septembre.',
    })

    expect(script).toContain('DÉCOUVERTE')
    expect(script).toContain('SORTIE')
    expect(script).not.toContain('OUVERTURE')
  })
})
