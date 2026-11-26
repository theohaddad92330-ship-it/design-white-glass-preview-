import { describe, expect, it } from 'vitest'
import { isMaskedField, maskEmail, maskGeneric, maskPhone, maskRecordForLog } from './pii-masking.js'

describe('masquer, pas supprimer', () => {
  it('garde le DOMAINE d’une adresse — c’est la seule chose utile au débogage', () => {
    // « toutes les lignes rejetées sont en @acme.fr » est un diagnostic ; un
    // domaine d'entreprise n'identifie personne à lui seul.
    expect(maskEmail('marie.dubois@acme.fr')).toBe('m***@acme.fr')
  })

  it('garde les deux bouts d’un numéro', () => {
    expect(maskPhone('+33 6 12 34 56 78')).toBe('+3***78')
    expect(maskPhone('123')).toBe('***')
  })

  it('garde la LONGUEUR — un champ vide ne doit pas ressembler à un champ masqué', () => {
    // C'est la question qu'on se pose en relisant un journal d'import : la
    // colonne était-elle là ?
    expect(maskGeneric('Marie Dubois')).toBe('M***(12)')
    expect(maskGeneric('   ')).toBe('')
  })

  it('trie sur le NOM du champ, jamais sur la forme de la valeur', () => {
    // Une heuristique sur la valeur masquerait « Paris » dans une colonne ville
    // et laisserait passer une adresse dans une colonne « commentaire ».
    expect(isMaskedField('Email 1')).toBe(true)
    expect(isMaskedField('telephone_2')).toBe(true)
    // « Téléphone » accentué est bien reconnu — par « phone », pas par « tel ».
    expect(isMaskedField('Téléphone 2')).toBe(true)
    expect(isMaskedField('Société - Secteur')).toBe(false)
    // ⚠️ Un champ de SOCIÉTÉ contient « nom » ou « name » dans presque tous les
    // exports français. Le masquer rendrait un journal d'import illisible sans
    // protéger personne — défaut trouvé par ce test même.
    expect(isMaskedField('societe_nom')).toBe(false)
    expect(isMaskedField('company_name')).toBe(false)
    expect(isMaskedField('societe_adresse')).toBe(false)
  })
})

describe('maskRecordForLog', () => {
  const row = {
    email_1: 'marie.dubois@acme.fr',
    telephone_1: '+33612345678',
    nom: 'Dubois',
    adresse: '12 rue des Lilas',
    societe_nom: 'ACME Industries',
    code_postal: '75011',
    ligne: 42,
  }

  it('masque les quatre familles nommées, et LAISSE le reste', () => {
    const masked = maskRecordForLog(row)
    expect(masked['email_1']).toBe('m***@acme.fr')
    expect(masked['telephone_1']).toBe('+3***78')
    expect(masked['nom']).toBe('D***(6)')
    expect(masked['adresse']).toBe('1***(16)')
    // Masquer un code postal ou une société rendrait le journal inutilisable
    // sans protéger personne.
    expect(masked['societe_nom']).toBe('ACME Industries')
    expect(masked['code_postal']).toBe('75011')
    expect(masked['ligne']).toBe(42)
  })

  it("l'original n'est JAMAIS modifié", () => {
    maskRecordForLog(row)
    expect(row['email_1']).toBe('marie.dubois@acme.fr')
  })

  it('une valeur vide reste vide — on ne fabrique pas un masque sur du rien', () => {
    expect(maskRecordForLog({ email: '', nom: '' })).toEqual({ email: '', nom: '' })
  })
})
