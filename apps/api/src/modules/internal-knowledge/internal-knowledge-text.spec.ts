import { chunkText } from './text-chunker'
import { maskPersonalData } from './personal-data-mask'
import { readInternalKnowledgeConfig } from './internal-knowledge.config'

/** #3586.6 — e-mails et téléphones masqués avant indexation (corpus lu par tous les espaces). */
describe('maskPersonalData (#3586.6)', () => {
  it('masque les e-mails', () => {
    expect(maskPersonalData('Écrire à jean.dupont+x@exemple.fr dès que possible.')).toBe(
      'Écrire à [email] dès que possible.',
    )
  })

  it('masque les numéros français, internationaux et séparés', () => {
    const out = maskPersonalData('Tel 06 12 34 56 78, ou +33 6 12 34 56 78, ou 01.23.45.67.89, ou 0612345678.')
    expect(out).toBe('Tel [téléphone], ou [téléphone], ou [téléphone], ou [téléphone].')
  })

  it("ne mange pas un montant, une année ni un SIREN (9 chiffres collés n'est pas un téléphone)", () => {
    const text = 'CA 2026 : 12 500 000 euros, SIREN 552032534, 35 000 jours-hommes.'
    expect(maskPersonalData(text)).toBe(text)
  })

  it('keepContacts=true laisse le texte intact', () => {
    const text = 'a@b.fr 06 12 34 56 78'
    expect(maskPersonalData(text, { keepContacts: true })).toBe(text)
  })
})

describe('chunkText', () => {
  it('rend [] pour un texte vide', () => {
    expect(chunkText('  \n ')).toEqual([])
  })

  it('garde un texte court en un seul chunk', () => {
    expect(chunkText('Un paragraphe.\n\nUn autre.')).toEqual(['Un paragraphe.\n\nUn autre.'])
  })

  it('coupe sur les paragraphes sans dépasser la taille et sans rien perdre', () => {
    const paras = Array.from({ length: 30 }, (_, i) => `Paragraphe ${i} ` + 'x'.repeat(200))
    const chunks = chunkText(paras.join('\n\n'), 1000)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000)
    expect(chunks.join('\n\n')).toBe(paras.join('\n\n'))
  })

  it('découpe un paragraphe unique plus long que la taille', () => {
    const chunks = chunkText('y'.repeat(2500), 1000)
    expect(chunks.map(c => c.length)).toEqual([1000, 1000, 500])
  })
})

describe('readInternalKnowledgeConfig (#3586.1)', () => {
  const SA = JSON.stringify({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: 'PEM' })

  it('sans clé de compte de service → null (no-op)', () => {
    expect(readInternalKnowledgeConfig({ INTERNAL_KNOWLEDGE_DRIVE_FOLDER_IDS: 'a' })).toBeNull()
  })

  it('sans dossier → null (no-op)', () => {
    expect(readInternalKnowledgeConfig({ INTERNAL_KNOWLEDGE_DRIVE_SA_JSON: SA })).toBeNull()
    expect(
      readInternalKnowledgeConfig({ INTERNAL_KNOWLEDGE_DRIVE_SA_JSON: SA, INTERNAL_KNOWLEDGE_DRIVE_FOLDER_IDS: ' , ' }),
    ).toBeNull()
  })

  it('JSON illisible ou sans client_email/private_key → null', () => {
    const env = { INTERNAL_KNOWLEDGE_DRIVE_FOLDER_IDS: 'a' }
    expect(readInternalKnowledgeConfig({ ...env, INTERNAL_KNOWLEDGE_DRIVE_SA_JSON: '{pas du json' })).toBeNull()
    expect(readInternalKnowledgeConfig({ ...env, INTERNAL_KNOWLEDGE_DRIVE_SA_JSON: '{"client_email":"x"}' })).toBeNull()
  })

  it('lit les ids (virgules, espaces, doublons) et masque par défaut', () => {
    const cfg = readInternalKnowledgeConfig({
      INTERNAL_KNOWLEDGE_DRIVE_SA_JSON: SA,
      INTERNAL_KNOWLEDGE_DRIVE_FOLDER_IDS: ' a , b,a ',
    })
    expect(cfg?.folderIds).toEqual(['a', 'b'])
    expect(cfg?.keepContacts).toBe(false)
    expect(cfg?.serviceAccount.client_email).toBe('sa@p.iam.gserviceaccount.com')
  })

  it('INTERNAL_KNOWLEDGE_KEEP_CONTACTS=true désactive le masquage', () => {
    const cfg = readInternalKnowledgeConfig({
      INTERNAL_KNOWLEDGE_DRIVE_SA_JSON: SA,
      INTERNAL_KNOWLEDGE_DRIVE_FOLDER_IDS: 'a',
      INTERNAL_KNOWLEDGE_KEEP_CONTACTS: 'true',
    })
    expect(cfg?.keepContacts).toBe(true)
  })
})
