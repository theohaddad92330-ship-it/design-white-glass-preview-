import { describe, expect, it } from 'vitest'
import { RAG_UPLOAD_DOCUMENT_EXTENSIONS } from './rag-upload-formats.js'
import {
  CHAT_VOICE_MESSAGE_RETENTION_DAYS,
  EMAIL_ATTACHMENT_MAX_COUNT,
  EMAIL_ATTACHMENT_MAX_TOTAL_BYTES,
  EMAIL_ATTACHMENT_TYPES,
  refuseEmailAttachments,
  DOCUMENT_BOUND_RETENTION_UNTIL,
  STORAGE_DOMAINS,
  STORAGE_RETENTION_DAYS_BY_DOMAIN,
  STORAGE_RETENTION_YEARS_BY_DOMAIN,
  STORAGE_WORKSPACE_QUOTA_BYTES,
  STORED_FILE_MAX_BYTES,
  STORED_FILE_TYPES,
  STORED_VOICE_FILE_TYPES,
  extensionMatchesFileSignature,
  refuseStoredFile,
  storageObjectPath,
  storedFileContentType,
  storedFileContentTypeFor,
  storedFileIsExpired,
  storedFileRetentionUntil,
  storageUploadSchema,
  invoiceAttachmentPeriodSchema,
  invoiceAttachmentsResponseSchema,
} from './storage.js'

const REAL_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
const REAL_PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const NOT_A_PDF_BYTES = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]) // en-tête d'un exécutable Windows (MZ)
// #2438.7 — un conteneur ZIP réel (en-tête de fichier local) : ce qu'un docx
// ou un xlsx RÉEL porte toujours, sans distinguer l'un de l'autre.
const REAL_ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00])
// #2438.7 — du texte plausible : aucun octet nul dans les premiers octets.
const REAL_TEXT_BYTES = new TextEncoder().encode('nom;montant\nJean;120,50\n')

describe('le type d’un fichier se décide sur son EXTENSION', () => {
  it('rend le type canonique, quel que soit celui déclaré par le navigateur', () => {
    expect(storedFileContentType('Facture_hotel.pdf')).toBe('application/pdf')
    expect(storedFileContentType('RECU.JPG')).toBe('image/jpeg')
  })

  it('rend `null` pour une extension inconnue — et pour un nom sans extension', () => {
    expect(storedFileContentType('script.sh')).toBeNull()
    expect(storedFileContentType('archive.zip')).toBeNull()
    expect(storedFileContentType('recu')).toBeNull()
  })

  it('ne se laisse pas tromper par une double extension : c’est la DERNIÈRE qui compte', () => {
    expect(storedFileContentType('recu.pdf.exe')).toBeNull()
    expect(storedFileContentType('recu.exe.pdf')).toBe('application/pdf')
  })
})

describe('refuseStoredFile — chaque refus porte un NOM', () => {
  const ok = {
    fileName: 'Facture_hotel.pdf',
    byteSize: 124 * 1024,
    workspaceUsedBytes: 0,
    quotaBytes: STORAGE_WORKSPACE_QUOTA_BYTES,
  }

  it('accepte un fichier ordinaire', () => {
    expect(refuseStoredFile(ok)).toBeNull()
  })

  it('refuse un fichier VIDE — et le dit autrement que « trop gros »', () => {
    expect(refuseStoredFile({ ...ok, byteSize: 0 })).toBe('empty')
  })

  it('refuse au-delà de la taille maximale', () => {
    expect(refuseStoredFile({ ...ok, byteSize: STORED_FILE_MAX_BYTES + 1 })).toBe('too_large')
    expect(refuseStoredFile({ ...ok, byteSize: STORED_FILE_MAX_BYTES })).toBeNull()
  })

  it('refuse un type non autorisé', () => {
    expect(refuseStoredFile({ ...ok, fileName: 'payload.sh' })).toBe('type_refused')
  })

  it('refuse un nom vide — un fichier sans nom ne se retrouve pas', () => {
    expect(refuseStoredFile({ ...ok, fileName: '   ' })).toBe('name_missing')
  })

  it('refuse quand le quota de l’espace serait DÉPASSÉ, pas quand il est atteint pile', () => {
    const quotaBytes = 1_000_000
    expect(refuseStoredFile({ ...ok, byteSize: 400_000, workspaceUsedBytes: 600_000, quotaBytes })).toBeNull()
    expect(refuseStoredFile({ ...ok, byteSize: 400_001, workspaceUsedBytes: 600_000, quotaBytes })).toBe(
      'quota_exceeded',
    )
  })

  it('dit la TAILLE avant le QUOTA — le premier se corrige, le second se négocie', () => {
    expect(
      refuseStoredFile({
        ...ok,
        byteSize: STORED_FILE_MAX_BYTES + 1,
        workspaceUsedBytes: STORAGE_WORKSPACE_QUOTA_BYTES,
        quotaBytes: STORAGE_WORKSPACE_QUOTA_BYTES,
      }),
    ).toBe('too_large')
  })
})

/**
 * #2438.7 — un exécutable renommé `.pdf` ne passe pas parce que le NOM le dit.
 *
 * Ni OCR, ni extraction, ni antivirus (`storage.service.ts` garde cette
 * doctrine) : une lecture des tout premiers octets, jamais du contenu métier.
 * `bytes` est OPTIONNEL — les trois appelants côté web (pré-validation avant
 * upload, sans octets en main) continuent de passer inchangés.
 */
describe('refuseStoredFile — la SIGNATURE des octets contre l’extension déclarée (#2438.7)', () => {
  const ok = {
    fileName: 'Facture_hotel.pdf',
    byteSize: REAL_PDF_BYTES.byteLength,
    workspaceUsedBytes: 0,
    quotaBytes: STORAGE_WORKSPACE_QUOTA_BYTES,
  }

  it('accepte un PDF dont les octets sont réellement un PDF', () => {
    expect(refuseStoredFile({ ...ok, bytes: REAL_PDF_BYTES })).toBeNull()
  })

  it('refuse un exécutable renommé `.pdf`', () => {
    expect(refuseStoredFile({ ...ok, byteSize: NOT_A_PDF_BYTES.byteLength, bytes: NOT_A_PDF_BYTES })).toBe(
      'content_mismatch',
    )
  })

  it('sans octets (pré-validation côté web), ne refuse RIEN sur ce critère — on ne fabrique pas un refus qu’on ne peut pas prouver', () => {
    expect(refuseStoredFile(ok)).toBeNull()
  })
})

describe('extensionMatchesFileSignature — la signature connue, jamais devinée', () => {
  it('reconnaît un PDF et un PNG réels', () => {
    expect(extensionMatchesFileSignature('pdf', REAL_PDF_BYTES)).toBe(true)
    expect(extensionMatchesFileSignature('png', REAL_PNG_BYTES)).toBe(true)
  })

  it('rejette une signature qui ne correspond pas à l’extension déclarée', () => {
    expect(extensionMatchesFileSignature('pdf', NOT_A_PDF_BYTES)).toBe(false)
    expect(extensionMatchesFileSignature('png', REAL_PDF_BYTES)).toBe(false)
  })

  it('rend `true` pour un type sans signature fiable (heic) — jamais un refus inventé', () => {
    expect(extensionMatchesFileSignature('heic', NOT_A_PDF_BYTES)).toBe(true)
  })
})

/**
 * #2438.7 (réfuté sur sha e493d84f2, 23/09) — docx/xlsx et csv/txt tombaient
 * dans le repli `true` toujours, avec ces deux extensions NOMMÉES dans le
 * commentaire du repli comme n'ayant « pas de signature fiable ». C'est FAUX
 * pour les deux : un docx/xlsx réel est TOUJOURS un conteneur ZIP valide (on
 * ne distingue pas l'un de l'autre — lire la table centrale serait une
 * lecture de contenu, hors périmètre) ; un csv/txt réel ne porte JAMAIS
 * d'octet nul dans son texte. Les deux restent des contrôles de FORME,
 * jamais un parsing (macros toujours hors périmètre, decisions-louis-22-09-soir.md §1).
 */
describe('extensionMatchesFileSignature — conteneur ZIP (docx/xlsx) et texte plausible (csv/txt), #2438.7', () => {
  it('accepte un docx/xlsx dont les octets sont réellement un conteneur ZIP', () => {
    expect(extensionMatchesFileSignature('docx', REAL_ZIP_BYTES)).toBe(true)
    expect(extensionMatchesFileSignature('xlsx', REAL_ZIP_BYTES)).toBe(true)
  })

  it('refuse un exécutable renommé .docx/.xlsx — ce n’est même pas un conteneur ZIP', () => {
    expect(extensionMatchesFileSignature('docx', NOT_A_PDF_BYTES)).toBe(false)
    expect(extensionMatchesFileSignature('xlsx', NOT_A_PDF_BYTES)).toBe(false)
  })

  it('n’essaie PAS de distinguer docx de xlsx — les deux partagent la même signature ZIP générique', () => {
    expect(extensionMatchesFileSignature('docx', REAL_ZIP_BYTES)).toBe(
      extensionMatchesFileSignature('xlsx', REAL_ZIP_BYTES),
    )
  })

  it('accepte un csv/txt dont les octets sont du texte plausible', () => {
    expect(extensionMatchesFileSignature('csv', REAL_TEXT_BYTES)).toBe(true)
    expect(extensionMatchesFileSignature('txt', REAL_TEXT_BYTES)).toBe(true)
  })

  it('refuse un exécutable renommé .csv/.txt — un octet nul n’est pas du texte', () => {
    expect(extensionMatchesFileSignature('csv', NOT_A_PDF_BYTES)).toBe(false)
    expect(extensionMatchesFileSignature('txt', NOT_A_PDF_BYTES)).toBe(false)
  })
})

describe('storageObjectPath — le cloisonnement est DANS le chemin', () => {
  const base = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    domain: 'expense_receipt' as const,
    objectId: '22222222-2222-4222-8222-222222222222',
  }

  it('commence TOUJOURS par l’espace, puis le domaine, puis l’identifiant de l’objet', () => {
    expect(storageObjectPath({ ...base, fileName: 'Facture_hotel.pdf' })).toBe(
      '11111111-1111-4111-8111-111111111111/expense_receipt/22222222-2222-4222-8222-222222222222/Facture_hotel.pdf',
    )
  })

  it('rend un chemin DIFFÉRENT pour le même fichier dans deux espaces', () => {
    const a = storageObjectPath({ ...base, fileName: 'Facture.pdf' })
    const b = storageObjectPath({
      ...base,
      workspaceId: '33333333-3333-4333-8333-333333333333',
      fileName: 'Facture.pdf',
    })
    expect(a).not.toBe(b)
  })

  it('neutralise ce qui ferait sortir du dossier — séparateurs, remontées, espaces', () => {
    const path = storageObjectPath({ ...base, fileName: '../../etc/passwd' })
    expect(path).not.toContain('..')
    expect(path.split('/')).toHaveLength(4)
  })

  it('ne rend jamais un dernier segment vide, même sur un nom entièrement illisible', () => {
    const path = storageObjectPath({ ...base, fileName: '???' })
    expect(path.split('/')[3]).not.toBe('')
  })

  it('borne la longueur du dernier segment — un nom de 400 caractères casse le stockage', () => {
    const path = storageObjectPath({ ...base, fileName: `${'a'.repeat(400)}.pdf` })
    expect((path.split('/')[3] ?? '').length).toBeLessThanOrEqual(120)
  })
})

describe('la conservation est DATÉE, et sa durée dépend du domaine', () => {
  it('dix ans pour un justificatif comptable, cinq pour une pièce commerciale', () => {
    expect(STORAGE_RETENTION_YEARS_BY_DOMAIN.expense_receipt).toBe(10)
    expect(STORAGE_RETENTION_YEARS_BY_DOMAIN.need_document).toBe(5)
    expect(storedFileRetentionUntil('expense_receipt', '2026-08-31')).toBe('2036-08-31')
    expect(storedFileRetentionUntil('need_document', '2026-08-31')).toBe('2031-08-31')
  })

  it('rend `null` sur une date illisible — jamais une échéance inventée', () => {
    expect(storedFileRetentionUntil('need_document', 'pas-une-date')).toBeNull()
  })

  it('expire le LENDEMAIN de l’échéance, jamais le jour même', () => {
    expect(storedFileIsExpired('2026-08-31', '2026-08-31')).toBe(false)
    expect(storedFileIsExpired('2026-08-31', '2026-09-01')).toBe(true)
  })
})

describe('storageUploadSchema', () => {
  it('refuse un corps qui porte autre chose que les trois champs attendus', () => {
    const result = storageUploadSchema.safeParse({
      fileName: 'a.pdf',
      contentType: 'application/pdf',
      fileB64: 'AAAA',
      workspaceId: 'volé',
    })
    expect(result.success).toBe(false)
  })

  it('accepte un dépôt ordinaire', () => {
    expect(
      storageUploadSchema.safeParse({ fileName: 'a.pdf', contentType: 'application/pdf', fileB64: 'AAAA' }).success,
    ).toBe(true)
  })
})

/**
 * #1939 — le message vocal de Laura, troisième domaine du stockage.
 *
 * Trois décisions tenues ici, et chacune a son test :
 *  · le domaine arrive EN FIN de liste (GA-08 : rien de ce qui est rangé ne se
 *    relit de travers) ;
 *  · sa conservation se compte en JOURS (30, décision Louis du 12/09) — les deux
 *    domaines existants restent en années, inchangés ;
 *  · ses types sont AUDIO et SÉPARÉS : les notes de frais et les besoins ne
 *    gagnent pas un format sonore au passage, et un message vocal ne devient pas
 *    un moyen de ranger un PDF.
 */
describe('#1939 — le domaine « message vocal »', () => {
  it('est ajouté EN FIN de liste, sans déplacer les deux domaines existants', () => {
    expect(STORAGE_DOMAINS.slice(0, 3)).toEqual(['expense_receipt', 'need_document', 'chat_voice_message'])
  })

  it('se conserve 30 JOURS — pas une année entière', () => {
    expect(CHAT_VOICE_MESSAGE_RETENTION_DAYS).toBe(30)
    expect(STORAGE_RETENTION_DAYS_BY_DOMAIN.chat_voice_message).toBe(30)
    expect(storedFileRetentionUntil('chat_voice_message', '2026-09-12')).toBe('2026-10-12')
    // Changement de mois et d'année : la date civile, pas une addition de texte.
    expect(storedFileRetentionUntil('chat_voice_message', '2026-12-20')).toBe('2027-01-19')
    // Un message du 12/09 se garde LE 12/10, et part le 13.
    expect(storedFileIsExpired('2026-10-12', '2026-10-12')).toBe(false)
    expect(storedFileIsExpired('2026-10-12', '2026-10-13')).toBe(true)
  })

  it('ne touche PAS les durées en années des domaines existants', () => {
    expect(STORAGE_RETENTION_YEARS_BY_DOMAIN).toMatchObject({ expense_receipt: 10, need_document: 5 })
    expect(storedFileRetentionUntil('expense_receipt', '2026-08-31')).toBe('2036-08-31')
  })

  it('rend `null` sur une date illisible — jamais une échéance inventée, en jours non plus', () => {
    expect(storedFileRetentionUntil('chat_voice_message', 'pas-une-date')).toBeNull()
    expect(storedFileRetentionUntil('chat_voice_message', '2026-02-31')).toBeNull()
  })

  it('ses types AUDIO sont séparés : la liste partagée ne gagne aucun format sonore', () => {
    expect(Object.values(STORED_FILE_TYPES).some(type => type.startsWith('audio/'))).toBe(false)
    expect(Object.values(STORED_VOICE_FILE_TYPES).every(type => type.startsWith('audio/'))).toBe(true)
    expect(storedFileContentType('message.webm')).toBeNull()
  })

  it('le type se décide par DOMAINE : un .webm pour la voix, jamais pour une note de frais', () => {
    expect(storedFileContentTypeFor('chat_voice_message', 'message-vocal.webm')).toBe('audio/webm')
    expect(storedFileContentTypeFor('chat_voice_message', 'message-vocal.mp4')).toBe('audio/mp4')
    expect(storedFileContentTypeFor('chat_voice_message', 'Facture.pdf')).toBeNull()
    expect(storedFileContentTypeFor('expense_receipt', 'message-vocal.webm')).toBeNull()
    expect(storedFileContentTypeFor('expense_receipt', 'Facture.pdf')).toBe('application/pdf')
  })

  it('le refus suit le domaine quand il est donné, et reste INCHANGÉ quand il ne l’est pas', () => {
    const candidate = { fileName: 'message-vocal.webm', byteSize: 1000, workspaceUsedBytes: 0, quotaBytes: 10_000 }
    // Les trois écrans existants n'envoient pas de domaine : leur refus ne bouge pas.
    expect(refuseStoredFile(candidate)).toBe('type_refused')
    expect(refuseStoredFile({ ...candidate, domain: 'chat_voice_message' })).toBeNull()
    expect(refuseStoredFile({ ...candidate, fileName: 'recu.pdf', domain: 'chat_voice_message' })).toBe('type_refused')
    expect(refuseStoredFile({ ...candidate, fileName: 'recu.pdf', domain: 'expense_receipt' })).toBeNull()
  })
})

/**
 * #2814 — le domaine « pièce jointe de facture préparée ».
 *
 * Une facture PRÉPARÉE (jamais émise ici) peut porter les pièces qu'un client
 * exige avec elle : bon de commande signé, relevé d'activité validé, PV de
 * recette. Ce sont des pièces JUSTIFICATIVES d'une facture — dix ans, comme
 * un justificatif de note de frais (L123-22), pas cinq.
 */
describe('#2814 — le domaine « pièce jointe de facture »', () => {
  it('arrive après les trois domaines existants, avant tout domaine ajouté depuis (GA-08)', () => {
    expect(STORAGE_DOMAINS.slice(0, 4)).toEqual([
      'expense_receipt',
      'need_document',
      'chat_voice_message',
      'invoice_attachment',
    ])
  })

  it('se conserve DIX ans, la durée d’une pièce comptable', () => {
    expect(STORAGE_RETENTION_YEARS_BY_DOMAIN.invoice_attachment).toBe(10)
    expect(storedFileRetentionUntil('invoice_attachment', '2026-09-25')).toBe('2036-09-25')
  })

  it('accepte les pièces (PDF, image, tableur), refuse l’audio et l’exécutable', () => {
    expect(storedFileContentTypeFor('invoice_attachment', 'BC-signe.pdf')).toBe('application/pdf')
    expect(storedFileContentTypeFor('invoice_attachment', 'releve.xlsx')).not.toBeNull()
    expect(storedFileContentTypeFor('invoice_attachment', 'message.webm')).toBeNull()
    expect(storedFileContentTypeFor('invoice_attachment', 'outil.exe')).toBeNull()
    expect(
      refuseStoredFile({
        fileName: 'PV.pdf',
        byteSize: 8,
        workspaceUsedBytes: 0,
        quotaBytes: STORAGE_WORKSPACE_QUOTA_BYTES,
        domain: 'invoice_attachment',
        bytes: NOT_A_PDF_BYTES,
      }),
    ).toBe('content_mismatch')
  })

  it('le mois se dit `AAAA-MM-01`, jamais un autre jour ni un texte libre', () => {
    expect(invoiceAttachmentPeriodSchema.safeParse('2026-09-01').success).toBe(true)
    expect(invoiceAttachmentPeriodSchema.safeParse('2026-09-15').success).toBe(false)
    expect(invoiceAttachmentPeriodSchema.safeParse('2026-13-01').success).toBe(false)
    expect(invoiceAttachmentPeriodSchema.safeParse('../x').success).toBe(false)
  })

  it('la liste ne porte aucun chemin de magasin — seulement la porte de l’API', () => {
    const parsed = invoiceAttachmentsResponseSchema.parse({
      files: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          fileName: 'BC.pdf',
          contentType: 'application/pdf',
          byteSize: 10,
          retentionUntil: '2036-09-25',
          uploadedAt: '2026-09-25T10:00:00.000Z',
          downloadPath: '/delivery/invoice-attachments/m/2026-09-01/x/download',
          objectPath: 'ws/invoice_attachment/x/BC.pdf',
        },
      ],
    })
    expect(Object.keys(parsed.files[0] ?? {})).not.toContain('objectPath')
  })
})

/**
 * #2876 (#2433.4) — le domaine « image jointe au chat ».
 *
 * Même famille que `chat_voice_message` (#1939.3), pas une copie : une image
 * jointe à une conversation n'est pas une pièce de l'entreprise, elle peut
 * porter la donnée personnelle d'un tiers (capture d'écran CRM, photo d'un
 * badge) — même raisonnement qui a fixé 30 jours pour la voix, appliqué ici
 * à l'image (tranché sans Louis, 28/09/2026 : même politique, jamais une
 * seconde durée inventée pour une même famille de risque, GA-26).
 */
describe('#2876 (#2433.4) — le domaine « image jointe au chat »', () => {
  it('arrive EN FIN de liste (à l’époque), sans déplacer les quatre domaines existants', () => {
    expect(STORAGE_DOMAINS.slice(0, 5)).toEqual([
      'expense_receipt',
      'need_document',
      'chat_voice_message',
      'invoice_attachment',
      'chat_image_attachment',
    ])
  })

  it('se conserve 30 jours, la même durée et la même constante que le message vocal', () => {
    expect(STORAGE_RETENTION_DAYS_BY_DOMAIN.chat_image_attachment).toBe(CHAT_VOICE_MESSAGE_RETENTION_DAYS)
    expect(storedFileRetentionUntil('chat_image_attachment', '2026-09-28')).toBe('2026-10-28')
  })

  it('accepte les images du chat (png/jpg/webp), refuse un PDF ou l’audio', () => {
    expect(storedFileContentTypeFor('chat_image_attachment', 'capture.png')).toBe('image/png')
    expect(storedFileContentTypeFor('chat_image_attachment', 'photo.jpg')).toBe('image/jpeg')
    expect(storedFileContentTypeFor('chat_image_attachment', 'photo.webp')).toBe('image/webp')
    expect(storedFileContentTypeFor('chat_image_attachment', 'devis.pdf')).toBeNull()
    expect(storedFileContentTypeFor('chat_image_attachment', 'message.webm')).toBeNull()
    expect(
      refuseStoredFile({
        fileName: 'capture.png',
        byteSize: REAL_PNG_BYTES.byteLength,
        workspaceUsedBytes: 0,
        quotaBytes: STORAGE_WORKSPACE_QUOTA_BYTES,
        domain: 'chat_image_attachment',
        bytes: REAL_PNG_BYTES,
      }),
    ).toBeNull()
    expect(
      refuseStoredFile({
        fileName: 'devis.pdf',
        byteSize: 1000,
        workspaceUsedBytes: 0,
        quotaBytes: STORAGE_WORKSPACE_QUOTA_BYTES,
        domain: 'chat_image_attachment',
      }),
    ).toBe('type_refused')
  })
})

/**
 * #2957 (#2180.54) — le domaine « fichier source d'un appel d'offres ».
 */
describe('#2957 (#2180.54) — le domaine « fichier source d’un appel d’offres »', () => {
  it('arrive EN FIN de liste (à l’époque), sans déplacer les cinq domaines existants', () => {
    expect(STORAGE_DOMAINS.slice(0, 6)).toEqual([
      'expense_receipt',
      'need_document',
      'chat_voice_message',
      'invoice_attachment',
      'chat_image_attachment',
      'rfp_source_document',
    ])
  })

  it('se conserve cinq ans, la même durée et la même famille que `need_document`', () => {
    expect(STORAGE_RETENTION_YEARS_BY_DOMAIN.rfp_source_document).toBe(STORAGE_RETENTION_YEARS_BY_DOMAIN.need_document)
    expect(storedFileRetentionUntil('rfp_source_document', '2026-09-30')).toBe('2031-09-30')
  })

  it('accepte les mêmes types qu’un document de besoin (PDF/Word/Excel/texte)', () => {
    expect(storedFileContentTypeFor('rfp_source_document', 'cahier-des-charges.pdf')).toBe('application/pdf')
    expect(storedFileContentTypeFor('rfp_source_document', 'grille.xlsx')).not.toBeNull()
    expect(storedFileContentTypeFor('rfp_source_document', 'message.webm')).toBeNull()
  })
})

/**
 * #3803 (3803.1) — le domaine « original d'un document déposé » : il vit
 * AUTANT que le document, ni plus ni moins.
 */
describe('#3803 — le domaine « original d’un document déposé »', () => {
  it('arrive EN FIN de liste, sans déplacer les six domaines existants', () => {
    expect(STORAGE_DOMAINS).toEqual([
      'expense_receipt',
      'need_document',
      'chat_voice_message',
      'invoice_attachment',
      'chat_image_attachment',
      'rfp_source_document',
      'rag_document_source',
      'legal_contract_external_upload',
      'outreach_asset_file',
    ])
  })

  it('n’a AUCUNE échéance datée : il part avec son document, jamais par la purge des échus', () => {
    expect(storedFileRetentionUntil('rag_document_source', '2026-10-07')).toBe(DOCUMENT_BOUND_RETENTION_UNTIL)
    expect(storedFileIsExpired(DOCUMENT_BOUND_RETENTION_UNTIL, '2099-12-31')).toBe(false)
  })

  it('accepte exactement les formats du dépôt de document (pptx, md et json compris), refuse une image', () => {
    for (const extension of RAG_UPLOAD_DOCUMENT_EXTENSIONS) {
      expect(storedFileContentTypeFor('rag_document_source', `fichier.${extension}`)).not.toBeNull()
    }
    expect(storedFileContentTypeFor('rag_document_source', 'capture.png')).toBeNull()
  })

  it('vérifie la signature d’un pptx (ZIP) et d’un md (texte)', () => {
    expect(extensionMatchesFileSignature('pptx', REAL_ZIP_BYTES)).toBe(true)
    expect(extensionMatchesFileSignature('pptx', NOT_A_PDF_BYTES)).toBe(false)
    expect(extensionMatchesFileSignature('md', REAL_TEXT_BYTES)).toBe(true)
    expect(extensionMatchesFileSignature('json', NOT_A_PDF_BYTES)).toBe(false)
  })
})

/**
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — le domaine « pièce de contrat
 * déposée par un contact externe ». Types bornés à PDF/image/docx, jamais la
 * liste entière des pièces (xlsx/csv/txt restent hors de ce domaine).
 */
describe('#2422.6 — le domaine « pièce de contrat externe »', () => {
  it('se conserve cinq ans, la même durée et la même famille que `need_document`', () => {
    expect(STORAGE_RETENTION_YEARS_BY_DOMAIN.legal_contract_external_upload).toBe(
      STORAGE_RETENTION_YEARS_BY_DOMAIN.need_document,
    )
    expect(storedFileRetentionUntil('legal_contract_external_upload', '2026-10-07')).toBe('2031-10-07')
  })

  it('accepte PDF/image/docx, refuse xlsx/csv/txt et l’audio', () => {
    expect(storedFileContentTypeFor('legal_contract_external_upload', 'piece.pdf')).toBe('application/pdf')
    expect(storedFileContentTypeFor('legal_contract_external_upload', 'piece.docx')).not.toBeNull()
    expect(storedFileContentTypeFor('legal_contract_external_upload', 'photo.heic')).not.toBeNull()
    expect(storedFileContentTypeFor('legal_contract_external_upload', 'tableau.xlsx')).toBeNull()
    expect(storedFileContentTypeFor('legal_contract_external_upload', 'notes.csv')).toBeNull()
    expect(storedFileContentTypeFor('legal_contract_external_upload', 'notes.txt')).toBeNull()
    expect(storedFileContentTypeFor('legal_contract_external_upload', 'message.webm')).toBeNull()
  })
})

/**
 * #3699.6 — le domaine « fichier d'un asset outreach » et LE réglage des
 * pièces jointes d'un envoi individuel (GA-26 : un seul endroit).
 */
describe('#3699.6 — les pièces jointes d’un envoi individuel', () => {
  it('le fichier d’un asset vit autant que l’asset, jamais purgé par échéance', () => {
    expect(storedFileRetentionUntil('outreach_asset_file', '2026-10-09')).toBe(DOCUMENT_BOUND_RETENTION_UNTIL)
  })

  it('le domaine accepte EXACTEMENT les types joignables à un e-mail', () => {
    for (const extension of Object.keys(EMAIL_ATTACHMENT_TYPES)) {
      expect(storedFileContentTypeFor('outreach_asset_file', `plaquette.${extension}`)).toBe(
        EMAIL_ATTACHMENT_TYPES[extension],
      )
    }
    expect(storedFileContentTypeFor('outreach_asset_file', 'notes.csv')).toBeNull()
    expect(storedFileContentTypeFor('outreach_asset_file', 'outil.exe')).toBeNull()
    expect(storedFileContentTypeFor('outreach_asset_file', 'archive.zip')).toBeNull()
  })

  it('accepte une sélection dans les bornes', () => {
    expect(refuseEmailAttachments([{ contentType: 'application/pdf', byteSize: 200_000 }])).toBeNull()
    expect(refuseEmailAttachments([])).toBeNull()
  })

  it('SAIT DIRE NON — trop de pièces, trop lourd au total, type hors liste, pièce vide', () => {
    const pdf = { contentType: 'application/pdf', byteSize: 1000 }
    expect(refuseEmailAttachments(Array.from({ length: EMAIL_ATTACHMENT_MAX_COUNT + 1 }, () => pdf))).toBe('too_many')
    expect(
      refuseEmailAttachments([
        { contentType: 'application/pdf', byteSize: EMAIL_ATTACHMENT_MAX_TOTAL_BYTES },
        { contentType: 'application/pdf', byteSize: 1 },
      ]),
    ).toBe('too_large')
    expect(refuseEmailAttachments([{ contentType: 'application/x-msdownload', byteSize: 10 }])).toBe('type_refused')
    expect(refuseEmailAttachments([{ contentType: 'application/pdf', byteSize: 0 }])).toBe('empty')
  })
})
