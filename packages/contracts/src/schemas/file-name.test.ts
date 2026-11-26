import { describe, expect, it } from 'vitest'
import { looksLikeAFileName } from './file-name.js'

/**
 * Les cas des DEUX faces, réunis (D372).
 *
 * Cette liste est l'union exacte de ce que les deux implémentations d'origine
 * vérifiaient chacune de son côté :
 *
 *  - face LECTURE — `apps/web/src/features/consultants/lib/talentName.test.ts`,
 *    qui exerçait `isFileDerivedName` ;
 *  - face ÉCRITURE — `packages/contracts/src/schemas/cv-parsing.test.ts`, qui
 *    exerçait `looksLikeAFileName` à travers `readPersonNameFromIdentity`.
 *
 * Les réunir ici est ce qui rend la fusion VÉRIFIABLE : si la définition
 * canonique perdait un cas de l'une des deux faces, ce fichier tomberait.
 */

describe('looksLikeAFileName — les deux marques retenues', () => {
  it('reconnaît un TIRET BAS : un humain ne le tape pas dans un nom', () => {
    // Le nom vu en production le 30/08 sur l'écran Vivier.
    expect(looksLikeAFileName('cv_anonyme_louis_ai-engineer-node_gw')).toBe(true)
    expect(looksLikeAFileName('CV_Yanis_Berthier_2026')).toBe(true)
    expect(looksLikeAFileName('profil_2024')).toBe(true)
  })

  it('reconnaît une EXTENSION de document encore collée, quelle que soit la casse', () => {
    // L'ingestion n'en retire qu'une : « profil.v2.pdf » arrive en « profil.v2 »
    // et « cv.pdf.pdf » en « cv.pdf ».
    expect(looksLikeAFileName('yanis-berthier.pdf')).toBe(true)
    expect(looksLikeAFileName('CV Yanis Berthier.DOCX')).toBe(true)
    expect(looksLikeAFileName('dossier.rtf')).toBe(true)
    expect(looksLikeAFileName('cv.pdf.pdf')).toBe(true)
    expect(looksLikeAFileName('note.md')).toBe(true)
    expect(looksLikeAFileName('export.txt')).toBe(true)
    expect(looksLikeAFileName('vieux.doc')).toBe(true)
  })

  it('ne voit rien dans une valeur vide — « rien » n’est pas « un fichier »', () => {
    expect(looksLikeAFileName('')).toBe(false)
    expect(looksLikeAFileName('   ')).toBe(false)
  })
})

describe('looksLikeAFileName — ce qu’elle refuse de prendre pour un fichier', () => {
  /**
   * Le curseur, et il est ASYMÉTRIQUE.
   *
   * Le coût d'un faux positif est une vraie identité effacée à l'écran ; celui
   * d'un faux négatif est un libellé disgracieux. On ne tranche pas ces deux-là
   * au même prix — d'où une détection qui n'accepte que deux marques.
   */
  const realNames = [
    'Yanis Berthier',
    'Mohamed Amdouni',
    'Anne-Marie Le Guen-Kaczmarek',
    'Ahmed Doc', //        « Doc » est un mot, pas une extension collée
    'C V Raman', //        le jeton « CV » a été essayé puis REFUSÉ pour ce nom-là
    'Jean-Pierre Dupont',
    'Ana María López-García',
    "Sinéad O'Brien",
    'Prince', //           un seul mot est un nom
    'Nguyễn Thị Minh Khai',
    'Иван Петров', //      l'alphabet latin n'est pas une condition
    'CV Louis 2024', //    un nom de fichier SANS marque : assumé, il passe
  ]

  it.each(realNames)('« %s » n’est pas un nom de fichier', name => {
    expect(looksLikeAFileName(name)).toBe(false)
  })

  it('un point qui n’est pas une extension de document ne compte pas', () => {
    expect(looksLikeAFileName('Jean-Pierre S.')).toBe(false)
    expect(looksLikeAFileName('bellum.fr')).toBe(false)
    // Une extension qui n'en est pas une : `Jr.` termine un nom, pas un fichier.
    expect(looksLikeAFileName('Martin Luther King Jr.')).toBe(false)
    // …et l'extension doit FINIR la valeur, pas se trouver au milieu.
    expect(looksLikeAFileName('Pdf Martin')).toBe(false)
  })
})

describe('looksLikeAFileName — la fonction est SANS ÉTAT', () => {
  it('rend le même verdict au deuxième appel qu’au premier', () => {
    // ⚠️ `RegExp.test` avec le drapeau `g` est STATEFUL : son `lastIndex` survit
    // d'un appel à l'autre et rend une garde borgne un appel sur deux. Ce test
    // est le seul moyen de le prouver, et il tomberait si quelqu'un ajoutait un
    // `g` au motif d'extension.
    for (let i = 0; i < 3; i += 1) {
      expect(looksLikeAFileName('dossier.rtf')).toBe(true)
      expect(looksLikeAFileName('Yanis Berthier')).toBe(false)
    }
  })
})
