import { z } from 'zod'
import { RECEIPT_RETENTION_YEARS_FR, receiptRetentionUntil } from './expense-report.js'
import { shiftLocalDays } from './local-day.js'
import { needDocumentKindSchema, needDocumentStatusSchema } from './need-document.js'
import { RAG_UPLOAD_DOCUMENT_EXTENSIONS } from './rag-upload-formats.js'

/**
 * LE STOCKAGE DE FICHIERS — le vocabulaire commun (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE, MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois écrans livrés dans les vingt-quatre heures précédentes montraient une
 * pièce jointe qu'on ne pouvait pas ouvrir : les notes de frais annonçaient
 * « Facture_hotel.pdf · 124 KB » sans aucun bouton, la fiche besoin listait
 * Devis / NDA / Contrat cadre avec leur statut et rien derrière, et
 * `expense_report_attachments.download_url` valait `NULL` PARTOUT, démo
 * comprise. Chacun de ces écrans avait raison de ne rien offrir : « un bouton
 * inerte est une donnée fictive sous forme d'affordance ». Ce qui manquait
 * n'était pas le bouton, c'était le stockage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI VIT ICI, ET POURQUOI ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Les BORNES (taille, types, durée de conservation, quota) et les DÉRIVATIONS
 * qui en découlent (« ce fichier est-il acceptable ? », « jusqu'à quand le
 * garde-t-on ? », « où vit-il ? »). Elles vivent dans les contrats parce que
 * les DEUX côtés les appliquent, et pour la raison de GA-26 : un écran qui
 * refuserait à 8 Mo pendant que le serveur refuse à 10 laisserait partir un
 * envoi de deux minutes pour rien — ou pire, l'inverse.
 *
 * ⚠️ **Le nom du fournisseur de stockage n'apparaît NULLE PART ici, ni ailleurs
 * côté application.** On nomme la CAPACITÉ (« le stockage »), jamais l'éditeur —
 * c'est la doctrine du dépôt, et elle vaut pour un service d'infrastructure
 * autant que pour un CRM. Ce fichier ne connaît que des CHEMINS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun antivirus, aucun OCR, aucune extraction de contenu. Un fichier est un
 * fichier : on le reçoit, on le range, on le rend, on l'oublie à la date dite.
 * Le contenu n'est jamais lu — ni par nous, ni par un modèle.
 */

/* ------------------------------------------------------------------ */
/*  Les domaines — QUI possède un fichier                              */
/* ------------------------------------------------------------------ */

/**
 * Le domaine métier auquel un fichier appartient.
 *
 * Il n'est PAS décoratif : il fixe la durée de conservation
 * ({@link STORAGE_RETENTION_YEARS_BY_DOMAIN}) et il segmente le chemin, donc il
 * rend un objet d'un domaine inatteignable depuis la porte d'un autre.
 *
 * ⚠️ Liste FERMÉE, et elle ne s'étend qu'en FIN (GA-08) : une valeur ajoutée au
 * milieu décalerait la lecture de tout ce qui est déjà rangé.
 *
 * #1939.3 — `chat_voice_message` (12/09/2026) : l'enregistrement d'un message
 * vocal envoyé à Laura. Contrairement aux deux premiers, ce n'est PAS une pièce
 * de l'entreprise : aucune obligation de conservation ne s'y attache. Il se garde
 * 30 JOURS (décision Louis), part IMMÉDIATEMENT à l'effacement d'un compte, et sa
 * contrainte SQL a été élargie AVANT tout code qui l'écrit
 * (`1792800080000-ChatVoiceMessages`, GA-11/GA-12).
 *
 * #2814 — `invoice_attachment` (25/09/2026) : une pièce jointe à une facture
 * PRÉPARÉE (bon de commande signé, relevé validé, PV de recette), rangée par
 * mission et par mois. Une pièce justificative de facture : dix ans, comme un
 * justificatif de note de frais. Contrainte SQL élargie AVANT le code qui
 * l'écrit (`1796001565137-InvoiceAttachments`, GA-11/GA-12). La facture reste
 * PRÉPARÉE : ranger une pièce n'émet rien et n'envoie rien.
 *
 * #2876 (#2433.4, 28/09/2026) : `chat_image_attachment` — une image jointe à
 * une conversation, lue par la vision du modèle puis RANGÉE pour que la
 * preuve visuelle survive à l'onglet qui l'a envoyée (avant ce domaine, seule
 * une URL `blob:` locale existait — perdue au rechargement, invisible à qui
 * relit le fil ensuite). Même famille de risque que `chat_voice_message` (une
 * capture peut porter la donnée personnelle d'un tiers, jamais une pièce de
 * l'entreprise) : MÊME politique, 30 jours, jamais une seconde durée inventée
 * pour un risque identique (GA-26) — tranché sans Louis, par analogie directe
 * avec la décision du 12/09/2026 sur la voix. Contrainte SQL élargie AVANT le
 * code qui l'écrit (`1796346500000-ChatImageAttachments`, GA-11/GA-12).
 *
 * #2957 (#2180.54, 30/09/2026) — `rfp_source_document` : le fichier BRUT d'un
 * appel d'offres importé (PDF/Word/Excel), tel que déposé — distinct du texte
 * EXTRAIT que `rfps.source_text` porte déjà. Sans ce domaine, le fichier
 * original n'avait jamais survécu à l'extraction du texte : le dossier
 * restait consultable, mais le document source lui-même était perdu dès
 * l'analyse. Même famille que `need_document` (une pièce commerciale, jamais
 * comptable) : CINQ ANS, la même constante, jamais une durée inventée pour un
 * document de la même nature (GA-26). Contrainte SQL élargie AVANT le code
 * qui l'écrit (`1796412754293-RfpSourceDocumentStorageDomain`, GA-11/GA-12).
 *
 * #3803 (3803.1, 07/10/2026) — `rag_document_source` : l'ORIGINAL d'un
 * document déposé dans la base de connaissance (chat ou Connaissances), lié
 * à `rag_documents.source_object_id`. Avant ce domaine, seul le TEXTE extrait
 * survivait : l'aperçu montrait des lignes tabulées là où il y avait un
 * classeur. Il n'a AUCUNE durée propre : il vit autant que son document
 * ({@link DOCUMENT_BOUND_RETENTION_UNTIL}) et part avec lui. Contrainte SQL
 * élargie AVANT le code qui l'écrit (`1796437500002-RagDocumentSourceStorage`).
 *
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — `legal_contract_external_upload` :
 * la pièce qu'un contact EXTERNE (client, partenaire — sans compte BellumAI)
 * dépose via un LIEN SIGNÉ à portée limitée (`legal-contract-upload-link.ts`).
 * Même famille que `need_document` (une pièce commerciale, jamais comptable) :
 * CINQ ANS, la même constante — jamais une durée inventée pour un document de
 * la même nature (GA-26). Types bornés à PDF/image/docx
 * ({@link STORED_EXTERNAL_CONTRACT_UPLOAD_TYPES}) : ni xlsx, ni csv, ni txt —
 * un contact externe dépose UNE pièce de contrat, jamais un tableur. Contrainte
 * SQL élargie AVANT le code qui l'écrit (`1796437800002-LegalContractUploadLinks`).
 */
export const STORAGE_DOMAINS = [
  'expense_receipt',
  'need_document',
  'chat_voice_message',
  'invoice_attachment',
  'chat_image_attachment',
  'rfp_source_document',
  'rag_document_source',
  'legal_contract_external_upload',
  // #3699.6 — le fichier RÉEL d'un asset outreach (#2838), joignable à un
  // envoi individuel. Contrainte SQL élargie AVANT le code qui l'écrit
  // (`1796437901201-OutreachAssetFile`).
  'outreach_asset_file',
] as const
export const storageDomainSchema = z.enum(STORAGE_DOMAINS)
export type StorageDomain = (typeof STORAGE_DOMAINS)[number]

/* ------------------------------------------------------------------ */
/*  Les bornes                                                         */
/* ------------------------------------------------------------------ */

/**
 * La taille maximale d'un fichier déposé, en octets.
 *
 * Dix mégaoctets : un justificatif scanné, un devis, une NDA signée tiennent
 * tous dessous ; au-delà, ce n'est plus une pièce jointe, c'est un transfert de
 * fichiers, et ce produit n'en est pas un.
 */
export const STORED_FILE_MAX_BYTES = 10 * 1024 * 1024

/**
 * La même borne, exprimée en caractères base64.
 *
 * Le fichier voyage encodé dans le corps JSON — le chemin déjà emprunté par
 * l'ingestion documentaire et le dépôt de CV. Le base64 pèse un tiers de plus
 * que l'octet : borner le corps à la taille du FICHIER ferait refuser un
 * fichier parfaitement acceptable, avec un message qui ne s'expliquerait pas.
 */
export const STORED_FILE_MAX_BASE64_CHARS = Math.ceil(STORED_FILE_MAX_BYTES / 3) * 4

/**
 * Le quota par ESPACE, en octets. Deux gigaoctets.
 *
 * Il existe pour que le refus soit NOMMÉ le jour où il arrive. Sans quota, un
 * espace qui dépose sans fin ne rencontre pas un refus : il rencontre une
 * facture, ou une panne, et personne ne sait laquelle des deux.
 */
export const STORAGE_WORKSPACE_QUOTA_BYTES = 2 * 1024 * 1024 * 1024

/**
 * La durée de vie d'une URL de lecture, en secondes. Cinq minutes.
 *
 * Courte À DESSEIN : une URL signée est un droit d'accès qui voyage seul —
 * copiée dans un message, elle contourne toute vérification ultérieure. Cinq
 * minutes suffisent largement à un téléchargement et ne survivent pas à un
 * copier-coller de la veille. L'URL n'est JAMAIS fabriquée d'avance : elle
 * l'est à la demande, APRÈS vérification du droit de lire l'objet PARENT.
 */
export const STORED_FILE_SIGNED_URL_TTL_SECONDS = 300

/**
 * Les types acceptés, par extension.
 *
 * ⚠️ C'est l'EXTENSION qui décide, jamais le type déclaré par le navigateur : ce
 * dernier vient du client, il est absent une fois sur trois (`""`), souvent
 * `application/octet-stream`, et il se forge trivialement. Le type CANONIQUE
 * retenu ici est celui qu'on RESERVIRA — un fichier ne peut donc pas être
 * rangé sous un type qu'il n'a pas.
 *
 * La liste est volontairement courte : les pièces qu'une note de frais ou une
 * affaire porte réellement. Aucune archive (`.zip`), aucun exécutable — non pas
 * parce qu'on les analyserait (on n'analyse rien), mais parce qu'on n'a aucune
 * raison de les accepter.
 */
export const STORED_FILE_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
}

/** L'attribut `accept` d'un sélecteur de fichier — dérivé de la liste ci-dessus,
 *  jamais recopié à la main : deux listes divergent (GA-26). */
export const STORED_FILE_ACCEPT = Object.keys(STORED_FILE_TYPES)
  .map(extension => `.${extension}`)
  .join(',')

/**
 * #1939 — les types d'un MESSAGE VOCAL, et eux seuls.
 *
 * ⚠️ SÉPARÉS de {@link STORED_FILE_TYPES}, à dessein : cette liste-là est lue
 * par trois écrans (notes de frais, pièces d'affaire) et par leur `accept`.
 * L'élargir aurait fait accepter un `.webm` comme justificatif comptable, sans
 * que personne l'ait décidé. Inversement, un message vocal ne devient pas un
 * moyen de ranger un PDF.
 *
 * Les conteneurs que produit réellement l'enregistreur d'un navigateur : WebM ou
 * Ogg (Opus) côté Chrome et Firefox, MP4 (AAC) côté Safari. L'extension est posée
 * par le SERVEUR après lecture des premiers octets
 * (`sniffChatVoiceContainer`, `chat-voice.ts`) — le client ne nomme rien.
 */
export const STORED_VOICE_FILE_TYPES: Readonly<Record<string, string>> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
}

/**
 * #2876 (#2433.4) — les types d'une IMAGE DE CHAT, et eux seuls.
 *
 * ⚠️ SÉPARÉS de {@link STORED_FILE_TYPES} pour la même raison que
 * {@link STORED_VOICE_FILE_TYPES} : un chat n'accepte pas un PDF sous ce
 * domaine. Exactement les trois extensions que le chemin ÉPHÉMÈRE du chat
 * reconnaît déjà (`isChatImage`, `apps/web/src/features/chat/lib/
 * image-preprocess.ts`) — une quatrième ajoutée d'un côté sans l'autre serait
 * refusée après upload, jamais avant.
 */
export const STORED_CHAT_IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/**
 * #2422.6 — les types d'une PIÈCE EXTERNE DE CONTRAT, et eux seuls : PDF,
 * image, docx — exactement ce que l'issue #2422.6 nomme, jamais la liste
 * entière des pièces ({@link STORED_FILE_TYPES}, qui porte aussi xlsx/csv/txt).
 * Un contact externe dépose une pièce de contrat, jamais un tableur.
 */
export const STORED_EXTERNAL_CONTRACT_UPLOAD_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

/**
 * #3699.6 — LE RÉGLAGE des pièces jointes d'un envoi individuel. Un seul
 * endroit (GA-26) : le stockage d'un asset (`outreach_asset_file`), la
 * validation de l'API au moment de l'envoi et le sélecteur de l'écran lisent
 * TOUS ces trois constantes — jamais une copie.
 *
 * Les TYPES : ce qu'un commercial ESN joint réellement (CV, plaquette, cas
 * client, grille tarifaire) — PDF, Office, image. Ni archive, ni exécutable,
 * ni texte brut (un `.csv` joint à un premier e-mail se lit comme une liste).
 *
 * La TAILLE TOTALE : 2,5 Mio. La plus petite borne des trois transports —
 * l'envoi en un appel d'une boîte Microsoft refuse une requête au-delà de
 * ~4 Mo, et les octets y voyagent en base64 (+33 %) : 3 Mio deviendraient
 * 4 Mio encodés, AVANT le corps du message. 2,5 Mio laissent ~0,6 Mo de marge.
 * Une borne plus large ferait partir le même document par un canal et pas par
 * l'autre ; une borne unique dit la même chose quel que soit le canal choisi.
 *
 * Le NOMBRE : trois. Au-delà, ce n'est plus un e-mail de prospection, c'est un
 * envoi de dossier.
 */
export const EMAIL_ATTACHMENT_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
export const EMAIL_ATTACHMENT_MAX_COUNT = 3
export const EMAIL_ATTACHMENT_MAX_TOTAL_BYTES = 2.5 * 1024 * 1024

/** L'attribut `accept` du dépôt d'un fichier d'asset — dérivé, jamais recopié. */
export const EMAIL_ATTACHMENT_ACCEPT = Object.keys(EMAIL_ATTACHMENT_TYPES)
  .map(extension => `.${extension}`)
  .join(',')

/** Pourquoi une sélection de pièces jointes est refusée — chaque raison a sa phrase. */
export type EmailAttachmentRefusal = 'too_many' | 'too_large' | 'type_refused' | 'empty'

/**
 * #3699.6 — cette sélection peut-elle partir ? `null` = oui. Pure : l'écran
 * l'appelle avant d'activer « Envoyer », l'API la rappelle sur ce qu'elle a
 * RELU du stockage (type rangé, octets mesurés) — jamais sur ce que le client
 * affirme.
 */
export function refuseEmailAttachments(
  files: readonly { contentType: string; byteSize: number }[],
): EmailAttachmentRefusal | null {
  if (files.length > EMAIL_ATTACHMENT_MAX_COUNT) return 'too_many'
  const allowed = new Set(Object.values(EMAIL_ATTACHMENT_TYPES))
  if (files.some(file => !allowed.has(file.contentType))) return 'type_refused'
  if (files.some(file => !Number.isFinite(file.byteSize) || file.byteSize <= 0)) return 'empty'
  const total = files.reduce((sum, file) => sum + file.byteSize, 0)
  if (total > EMAIL_ATTACHMENT_MAX_TOTAL_BYTES) return 'too_large'
  return null
}

/** Même dérivation que {@link STORED_FILE_ACCEPT}, pour le domaine externe. */
export const STORED_EXTERNAL_CONTRACT_UPLOAD_ACCEPT = Object.keys(STORED_EXTERNAL_CONTRACT_UPLOAD_TYPES)
  .map(extension => `.${extension}`)
  .join(',')

/**
 * #3803 (3803.1) — les types de l'ORIGINAL d'un document déposé : exactement
 * les formats que le dépôt accepte ({@link RAG_UPLOAD_DOCUMENT_EXTENSIONS}),
 * dérivés de cette liste, jamais recopiés (GA-26). pptx/md/json n'entrent PAS
 * dans {@link STORED_FILE_TYPES} : un `.pptx` ne devient pas un justificatif.
 */
const RAG_DOCUMENT_SOURCE_CONTENT_TYPES: Readonly<Record<(typeof RAG_UPLOAD_DOCUMENT_EXTENSIONS)[number], string>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
}
const STORED_RAG_SOURCE_TYPES: Readonly<Record<string, string>> = Object.fromEntries(
  RAG_UPLOAD_DOCUMENT_EXTENSIONS.map(extension => [extension, RAG_DOCUMENT_SOURCE_CONTENT_TYPES[extension]]),
)

/**
 * Quels types CHAQUE domaine accepte. Un `Record` sur tous les domaines : un
 * cinquième domaine ne compile pas tant qu'il n'a pas dit lesquels.
 */
const STORED_FILE_TYPES_BY_DOMAIN: Readonly<Record<StorageDomain, Readonly<Record<string, string>>>> = {
  expense_receipt: STORED_FILE_TYPES,
  need_document: STORED_FILE_TYPES,
  chat_voice_message: STORED_VOICE_FILE_TYPES,
  // #2814 — les pièces d'une facture sont des PIÈCES : la liste partagée.
  invoice_attachment: STORED_FILE_TYPES,
  chat_image_attachment: STORED_CHAT_IMAGE_TYPES,
  // #2957 (#2180.54) — même liste qu'un document de besoin : PDF/Word/Excel,
  // exactement ce que `rfpSourceFormatSchema` sait nommer.
  rfp_source_document: STORED_FILE_TYPES,
  rag_document_source: STORED_RAG_SOURCE_TYPES,
  // #2422.6 — PDF/image/docx seulement, jamais la liste entière des pièces.
  legal_contract_external_upload: STORED_EXTERNAL_CONTRACT_UPLOAD_TYPES,
  // #3699.6 — exactement les types joignables à un e-mail : un fichier d'asset
  // qu'on ne pourrait pas joindre n'a rien à faire dans ce domaine.
  outreach_asset_file: EMAIL_ATTACHMENT_TYPES,
}

/**
 * Les durées de conservation, par domaine, en ANNÉES.
 *
 * Dix ans pour un justificatif comptable : Code de commerce français L123-22,
 * la constante est celle des notes de frais — pas une copie
 * ({@link RECEIPT_RETENTION_YEARS_FR}).
 *
 * Cinq ans pour une pièce commerciale (devis, NDA, contrat cadre) : L110-4, la
 * prescription des obligations entre commerçants. Garder un devis dix ans ne
 * répond à aucune obligation et conserve des données personnelles sans
 * finalité — ce que l'art. 5-1-e du RGPD ne laisse pas faire.
 *
 * ⚠️ Les deux durées sont FRANÇAISES. Le jour où un pack pays porte les
 * siennes, il les passe ici — elles ne sont codées en dur dans aucun calcul.
 *
 * #1939 — les domaines gardés en JOURS n'y figurent pas : leur durée vit dans
 * {@link STORAGE_RETENTION_DAYS_BY_DOMAIN}, et le type l'impose (un domaine a
 * UNE durée, jamais une en années et une autre en jours).
 */
export const STORAGE_RETENTION_YEARS_BY_DOMAIN: Readonly<
  Record<Exclude<StorageDomain, DayRetainedDomain | DocumentBoundDomain>, number>
> = {
  expense_receipt: RECEIPT_RETENTION_YEARS_FR,
  need_document: 5,
  // #2814 — une pièce qui JUSTIFIE une facture est une pièce comptable : la
  // durée des justificatifs (L123-22), la même constante, jamais une copie.
  invoice_attachment: RECEIPT_RETENTION_YEARS_FR,
  // #2957 (#2180.54) — un appel d'offres est une pièce commerciale, comme un
  // devis ou une NDA : MÊME durée que `need_document`, jamais une seconde
  // valeur inventée pour un risque identique (GA-26).
  rfp_source_document: 5,
  // #2422.6 — une pièce de contrat déposée par un contact externe est une
  // pièce commerciale, comme un devis ou une NDA : MÊME durée que
  // `need_document`, jamais une seconde valeur inventée (GA-26).
  legal_contract_external_upload: 5,
}

/**
 * #1939.3 — combien de JOURS un message vocal est gardé : trente.
 *
 * Décision Louis du 12/09/2026 (contre la recommandation « jamais conservé ») :
 * la réécoute d'un message récent a une valeur, un enregistrement de six mois
 * n'en a plus aucune et reste une donnée vocale. Ce qu'on peut en DIRE à l'écran
 * (« conservé 30 jours, puis supprimé ») se lit ICI — l'écran et le serveur
 * lisent la même constante (GA-26).
 *
 * ⚠️ La durée est tenue par le balayage EXISTANT de 03:41
 * (`storage-retention.scheduler.ts`, interrupteur `storage.retention_purge`),
 * pas par un planificateur de plus. Si l'interrupteur est coupé, la phrase
 * « supprimé après 30 jours » cesse d'être vraie — c'est le motif que le
 * registre des interrupteurs rend visible à l'opérateur.
 */
export const CHAT_VOICE_MESSAGE_RETENTION_DAYS = 30

/**
 * Les durées de conservation comptées en JOURS, par domaine.
 *
 * Additive : les années entières ne savent pas dire « trente jours », et les
 * domaines existants n'ont aucune raison de changer d'unité.
 *
 * #2876 (#2433.4) — `chat_image_attachment` reprend LA MÊME constante que
 * `chat_voice_message`, jamais une valeur écrite une seconde fois (GA-26) :
 * les deux durées divergeraient sinon en silence le jour où l'une des deux
 * change.
 */
export const STORAGE_RETENTION_DAYS_BY_DOMAIN: Readonly<{
  chat_voice_message: number
  chat_image_attachment: number
}> = {
  chat_voice_message: CHAT_VOICE_MESSAGE_RETENTION_DAYS,
  chat_image_attachment: CHAT_VOICE_MESSAGE_RETENTION_DAYS,
}

type DayRetainedDomain = keyof typeof STORAGE_RETENTION_DAYS_BY_DOMAIN

/**
 * #3803 (3803.1) — les domaines qui n'ont AUCUNE échéance propre : leur objet
 * vit autant que la ligne métier qui le porte (`rag_documents.source_object_id`)
 * et part AVEC elle (`RagService.deleteForUser`, plus le balayage des
 * originaux orphelins, `StorageService.purgeOrphanRagDocumentSources`).
 */
const DOCUMENT_BOUND_DOMAINS = [
  'rag_document_source',
  // #3699.6 — le fichier d'un asset vit autant que l'asset : il part quand
  // l'asset est supprimé ou son fichier remplacé (`OutreachAssetService`).
  'outreach_asset_file',
] as const
type DocumentBoundDomain = (typeof DOCUMENT_BOUND_DOMAINS)[number]

/**
 * #3803 — l'échéance STOCKÉE d'un objet lié à son document. La colonne
 * `retention_until` est `NOT NULL` et la purge des échus la lit sans connaître
 * aucun domaine : la plus grande date civile à quatre chiffres garantit
 * qu'elle ne l'atteint jamais. Ce n'est pas une durée — c'est « tant que le
 * document existe », et c'est le document qui l'emporte en partant.
 */
export const DOCUMENT_BOUND_RETENTION_UNTIL = '9999-12-31'

function isDocumentBound(domain: StorageDomain): domain is DocumentBoundDomain {
  return (DOCUMENT_BOUND_DOMAINS as readonly string[]).includes(domain)
}

function isDayRetained(domain: StorageDomain): domain is DayRetainedDomain {
  return Object.prototype.hasOwnProperty.call(STORAGE_RETENTION_DAYS_BY_DOMAIN, domain)
}

/**
 * Une date civile `AAAA-MM-JJ` décalée de `days` jours. `null` sur une date qui
 * n'existe pas — le 31/02 n'est pas « le 3 mars », c'est une date illisible.
 *
 * Le décalage passe par `shiftLocalDays`, la dérivation partagée (GA-126) : un
 * calcul maison sur `toISOString()` reculerait d'un jour la nuit.
 */
function civilDayPlusDays(day: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const date = Number(match[3])
  const civil = new Date(year, month - 1, date)
  if (civil.getFullYear() !== year || civil.getMonth() !== month - 1 || civil.getDate() !== date) return null
  if (!Number.isInteger(days) || days < 0) return null
  return shiftLocalDays(civil, days)
}

/* ------------------------------------------------------------------ */
/*  Les refus — chacun porte un nom                                    */
/* ------------------------------------------------------------------ */

/**
 * Pourquoi un dépôt est refusé.
 *
 * Chaque valeur a sa phrase à l'écran, et c'est tout l'objet de cette liste :
 * « le dépôt a échoué » fait redéposer le même fichier, « ce fichier dépasse
 * 10 Mo » fait le compresser. Un échec MUET est le seul vrai échec.
 */
export const STORED_FILE_REFUSALS = [
  'empty',
  'too_large',
  'type_refused',
  'name_missing',
  'quota_exceeded',
  // #2438.7 — les octets ne portent pas la signature attendue de l'extension
  // déclarée (un exécutable renommé `.pdf`, par exemple).
  'content_mismatch',
] as const
export const storedFileRefusalSchema = z.enum(STORED_FILE_REFUSALS)
export type StoredFileRefusal = (typeof STORED_FILE_REFUSALS)[number]

/** Les faits dont dépend la décision d'accepter un dépôt. */
export type StoredFileCandidate = {
  fileName: string
  /** La taille RÉELLE, en octets — mesurée après décodage côté serveur. */
  byteSize: number
  /** Ce que l'espace occupe DÉJÀ. Un espace sans fichier occupe réellement 0. */
  workspaceUsedBytes: number
  quotaBytes: number
  /**
   * #1939 — le domaine visé, quand il change les types acceptés. ABSENT = la
   * liste partagée des pièces ({@link STORED_FILE_TYPES}), c'est-à-dire
   * exactement le refus d'avant : les trois écrans qui appellent cette fonction
   * n'ont pas eu à changer.
   */
  domain?: StorageDomain
  /**
   * #2438.7 — les octets RÉELS, quand l'appelant les a déjà en main (le
   * serveur, après décodage). ABSENT = les trois pré-validations côté web
   * (avant upload, sans octets lus) : ce critère ne s'applique alors pas, il
   * ne se devine jamais.
   */
  bytes?: Uint8Array
}

/**
 * Ce fichier est-il acceptable ? `null` = oui.
 *
 * L'ORDRE des refus est une décision : la taille et le type se corrigent seuls
 * (compresser, convertir), le quota se négocie avec quelqu'un. Annoncer
 * « quota dépassé » à qui dépose un fichier de 300 Mo l'enverrait parler à son
 * administrateur pour un problème qu'il pouvait régler lui-même.
 */
export function refuseStoredFile(input: StoredFileCandidate): StoredFileRefusal | null {
  if (!input.fileName.trim()) return 'name_missing'
  // ⚠️ Un fichier de zéro octet n'est pas « petit », il est VIDE : le dire
  // autrement ferait chercher une limite qui n'existe pas.
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) return 'empty'
  if (input.byteSize > STORED_FILE_MAX_BYTES) return 'too_large'
  const contentType = input.domain
    ? storedFileContentTypeFor(input.domain, input.fileName)
    : storedFileContentType(input.fileName)
  if (contentType === null) return 'type_refused'
  // #2438.7 — quand les octets sont en main, leur SIGNATURE doit correspondre
  // à l'extension déclarée. Avant la vérification du quota : comme `too_large`,
  // c'est une propriété du fichier lui-même, jamais de l'espace qui le reçoit.
  if (input.bytes && !extensionMatchesFileSignature(lastExtensionOf(input.fileName), input.bytes)) {
    return 'content_mismatch'
  }
  if (input.workspaceUsedBytes + input.byteSize > input.quotaBytes) return 'quota_exceeded'
  return null
}

/**
 * #2438.7 — LA SIGNATURE d'un fichier CONTRE SON EXTENSION DÉCLARÉE.
 *
 * Même geste que {@link sniffChatVoiceContainer} (une extension posée sur les
 * PREMIERS OCTETS, jamais sur ce que le client affirme) — ici c'est l'inverse :
 * l'extension est CONNUE (le nom de fichier), on vérifie qu'elle est
 * VRAISEMBLABLE. Ni OCR, ni extraction, ni antivirus (`storage.service.ts`
 * garde cette doctrine, 31/08/2026) : une lecture des tout premiers octets,
 * jamais du contenu métier.
 *
 * `docx`/`xlsx` partagent la signature ZIP générique (OOXML) — les distinguer
 * exigerait de lire la table centrale du zip, une lecture de contenu hors
 * périmètre (#2438.7) : `looksLikeZip` vérifie donc SEULEMENT que le
 * conteneur est un ZIP valide, jamais lequel des deux formats OOXML il porte.
 * `csv`/`txt` sont du texte brut sans en-tête fiable, mais un fichier BINAIRE
 * (un exécutable, une image) porte quasi toujours un octet NUL dans ses tout
 * premiers octets, ce qu'un texte réel ne porte jamais : `looksLikeText`
 * vérifie l'ABSENCE d'octet nul sur un préfixe borné — une lecture de forme,
 * jamais un parsing du contenu. `heic` reste sans signature fiable connue de
 * ce dépôt : `true` pour lui seul (tranché par Louis 22/09 soir,
 * decisions-louis-22-09-soir.md §1 — recommandation appliquée : contrôle de
 * FORME uniquement, jamais d'extraction ; la détection de MACROS reste hors
 * périmètre pour la même raison — elle exigerait un vrai parsing ZIP/OLE).
 */
const ZIP_LOCAL_FILE_HEADER = [0x50, 0x4b, 0x03, 0x04] // « PK\x03\x04 »
const ZIP_EMPTY_ARCHIVE = [0x50, 0x4b, 0x05, 0x06] // « PK\x05\x06 » — une archive vide reste un ZIP valide.
const ZIP_SPANNED_ARCHIVE = [0x50, 0x4b, 0x07, 0x08] // « PK\x07\x08 » — première entrée d'une archive fractionnée.

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte)
}

/** #2438.7 — un docx/xlsx RÉEL est TOUJOURS un conteneur ZIP valide. Ne
 *  distingue jamais lequel des deux : lire la table centrale du zip serait
 *  une lecture de contenu, hors périmètre. */
function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, ZIP_LOCAL_FILE_HEADER) ||
    startsWith(bytes, ZIP_EMPTY_ARCHIVE) ||
    startsWith(bytes, ZIP_SPANNED_ARCHIVE)
  )
}

/** Combien d'octets du début du fichier ce contrôle de FORME lit — jamais le
 *  fichier entier : un texte de plusieurs mégaoctets n'a besoin que de ses
 *  premiers octets pour trahir un octet nul. */
const TEXT_SNIFF_BYTES = 8_000

/** #2438.7 — un fichier BINAIRE porte presque toujours un octet nul dans ses
 *  premiers octets ; un texte réel (csv/txt) n'en porte jamais. */
function looksLikeText(bytes: Uint8Array): boolean {
  const sampleLength = Math.min(bytes.length, TEXT_SNIFF_BYTES)
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] === 0x00) return false
  }
  return true
}

const MAGIC_BYTE_SIGNATURES: Readonly<Record<string, (bytes: Uint8Array) => boolean>> = {
  pdf: bytes => bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46,
  png: bytes => bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
  jpeg: bytes => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  webp: bytes =>
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50,
  docx: looksLikeZip,
  xlsx: looksLikeZip,
  csv: looksLikeText,
  txt: looksLikeText,
  // #3803 — l'original d'un document déposé : pptx est un OOXML (ZIP), md et
  // json du texte — même contrôle de FORME que leurs voisins.
  pptx: looksLikeZip,
  md: looksLikeText,
  json: looksLikeText,
}

export function extensionMatchesFileSignature(extension: string, bytes: Uint8Array): boolean {
  const check = MAGIC_BYTE_SIGNATURES[extension.toLowerCase()]
  // Pas de signature fiable pour ce type (heic) : on ne peut RIEN affirmer,
  // donc on n'invente pas un refus.
  return check ? check(bytes) : true
}

function lastExtensionOf(fileName: string): string {
  const trimmed = fileName.trim()
  const dot = trimmed.lastIndexOf('.')
  if (dot <= 0 || dot === trimmed.length - 1) return ''
  return trimmed.slice(dot + 1)
}

/**
 * Le type canonique d'un fichier, décidé sur son extension. `null` = refusé.
 *
 * ⚠️ C'est la DERNIÈRE extension qui compte, et c'est ce qui fait que
 * `recu.pdf.exe` est refusé pendant que `recu.exe.pdf` passe : le système de
 * fichiers, le navigateur et l'utilisateur lisent tous la dernière.
 */
export function storedFileContentType(fileName: string): string | null {
  return typeByLastExtension(STORED_FILE_TYPES, fileName)
}

/**
 * #1939 — le type canonique d'un fichier POUR UN DOMAINE. `null` = refusé.
 *
 * Même règle que {@link storedFileContentType} (la dernière extension décide),
 * sur la liste du domaine : un `.webm` passe pour un message vocal et nulle part
 * ailleurs, un `.pdf` passe pour une pièce et jamais pour un message vocal.
 */
export function storedFileContentTypeFor(domain: StorageDomain, fileName: string): string | null {
  return typeByLastExtension(STORED_FILE_TYPES_BY_DOMAIN[domain], fileName)
}

function typeByLastExtension(types: Readonly<Record<string, string>>, fileName: string): string | null {
  const trimmed = fileName.trim()
  const dot = trimmed.lastIndexOf('.')
  if (dot <= 0 || dot === trimmed.length - 1) return null
  return types[trimmed.slice(dot + 1).toLowerCase()] ?? null
}

/* ------------------------------------------------------------------ */
/*  Le chemin — le cloisonnement, écrit                                */
/* ------------------------------------------------------------------ */

/** Le nombre maximal de caractères du dernier segment d'un chemin. */
const MAX_SEGMENT_CHARS = 120

/** Ce qui reste d'un nom de fichier quand on lui retire tout ce qui pourrait
 *  sortir du dossier. Jamais vide — un objet sans nom ne se retrouve pas. */
function safeSegment(fileName: string): string {
  // ⚠️ D'abord le NOM SEUL : `../../etc/passwd` porte deux remontées et deux
  // séparateurs, et aucun `replace` de caractères ne les retire de façon sûre.
  // Prendre le dernier segment les fait disparaître en bloc.
  const base = fileName.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  if (!cleaned) return 'fichier'
  if (cleaned.length <= MAX_SEGMENT_CHARS) return cleaned

  const dot = cleaned.lastIndexOf('.')
  const extension = dot > 0 && cleaned.length - dot <= 11 ? cleaned.slice(dot) : ''
  return `${cleaned.slice(0, MAX_SEGMENT_CHARS - extension.length)}${extension}`
}

/**
 * OÙ vit un objet. **Le cloisonnement par espace est écrit dans le chemin.**
 *
 * `<espace>/<domaine>/<identifiant de l'objet>/<nom lisible>`
 *
 * Trois propriétés, et chacune répond à une attaque :
 *  · le premier segment est l'ESPACE — deux espaces ne partagent jamais un
 *    préfixe, et une fuite de chemin ne donne accès qu'à ce qu'on avait déjà ;
 *  · le troisième est un identifiant TIRÉ AU HASARD (UUID v4) — le chemin d'un
 *    objet ne se DEVINE pas depuis celui d'un autre, même en connaissant
 *    l'espace, le domaine et le nom du fichier ;
 *  · le dernier est le nom lisible, réduit à ce qui ne peut pas sortir du
 *    dossier. Il sert au téléchargement, jamais à retrouver l'objet.
 *
 * ⚠️ Ce chemin ne suffit à RIEN par lui-même : le magasin est privé, et seule
 * une URL signée à la demande ouvre l'objet. Le chemin n'est jamais rendu au
 * client — il vit en base et dans l'API.
 */
export function storageObjectPath(input: {
  workspaceId: string
  domain: StorageDomain
  objectId: string
  fileName: string
}): string {
  return `${input.workspaceId}/${input.domain}/${input.objectId}/${safeSegment(input.fileName)}`
}

/* ------------------------------------------------------------------ */
/*  La conservation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Jusqu'à quand ce fichier doit être gardé. `null` sur une date illisible —
 * jamais une échéance inventée, qui serait la pire des données fictives : elle
 * ferait effacer trop tôt, ou garder pour toujours.
 *
 * L'échéance est calculée UNE fois, au dépôt, et STOCKÉE : ce qu'on oppose à un
 * contrôle est la règle en vigueur au moment du dépôt, pas celle d'aujourd'hui.
 * C'est la raison déjà écrite sur `expense_report_attachments.retention_until`.
 */
export function storedFileRetentionUntil(domain: StorageDomain, uploadedOn: string): string | null {
  // #1939.3 — un message vocal se compte en JOURS ; les pièces, en années.
  if (isDayRetained(domain)) return civilDayPlusDays(uploadedOn, STORAGE_RETENTION_DAYS_BY_DOMAIN[domain])
  // #3803 — lié au document : aucune échéance datée, mais une date de dépôt
  // illisible reste refusée (jamais une échéance posée sur une date inventée).
  if (isDocumentBound(domain)) return civilDayPlusDays(uploadedOn, 0) ? DOCUMENT_BOUND_RETENTION_UNTIL : null
  return receiptRetentionUntil(uploadedOn, STORAGE_RETENTION_YEARS_BY_DOMAIN[domain])
}

/**
 * Ce fichier est-il échu ? Les deux dates sont des `YYYY-MM-DD`.
 *
 * ⚠️ Strictement APRÈS : une pièce à conserver « jusqu'au 31/08 » se conserve
 * LE 31/08. Un `>=` effacerait un jour trop tôt, tous les jours.
 */
export function storedFileIsExpired(retentionUntil: string, today: string): boolean {
  return today > retentionUntil
}

/* ------------------------------------------------------------------ */
/*  Ce qui voyage sur le réseau                                        */
/* ------------------------------------------------------------------ */

/**
 * Le corps d'un dépôt. `.strict()` : rien d'autre n'entre — surtout pas un
 * `workspaceId`, que le serveur résout lui-même depuis la session. Un espace
 * qui se choisit dans un corps de requête est une porte ouverte.
 */
export const storageUploadSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    /**
     * Le type DÉCLARÉ par le navigateur. Il est accepté, journalisé nulle part,
     * et il ne décide de rien : c'est {@link storedFileContentType} qui tranche.
     * On le reçoit pour ne pas casser un client qui l'envoie, pas pour le croire.
     */
    contentType: z.string().trim().max(255).default(''),
    /** Le fichier encodé en base64 — même chemin que l'ingestion documentaire. */
    fileB64: z.string().min(1).max(STORED_FILE_MAX_BASE64_CHARS),
  })
  .strict()
export type StorageUploadInput = z.infer<typeof storageUploadSchema>

/**
 * Un fichier rangé, tel que l'écran le reçoit.
 *
 * ⚠️ Aucun chemin, aucune URL de magasin : `downloadPath` est la PORTE de
 * l'API, pas l'objet. Elle ne s'ouvre qu'après vérification du droit de lire
 * l'objet PARENT, et rend une URL signée qui vit cinq minutes.
 */
export const storedFileSchema = z.object({
  id: z.string().guid(),
  fileName: z.string(),
  contentType: z.string(),
  /** La taille RÉELLE des octets rangés. Elle est toujours mesurée — on les a
   *  comptés en les écrivant — donc jamais `null` ici, contrairement au poids
   *  d'une pièce simplement RÉFÉRENCÉE. */
  byteSize: z.number().int().positive(),
  retentionUntil: z.string(),
  uploadedAt: z.string(),
  downloadPath: z.string(),
})
export type StoredFile = z.infer<typeof storedFileSchema>

/** Le fichier d'un document de besoin — le lien se fait par `documentId`. */
export const needDocumentFileSchema = storedFileSchema.extend({ documentId: z.string().guid() })
export type NeedDocumentFile = z.infer<typeof needDocumentFileSchema>

/**
 * L'état de ce que le stockage porte pour un besoin.
 *
 * Un tableau NU ne dirait pas la différence entre « ce besoin n'a aucun
 * fichier » et « le stockage n'a pas répondu ». `quotaBytes` / `usedBytes`
 * voyagent avec pour que l'écran puisse annoncer un refus de quota AVANT de
 * faire attendre deux minutes.
 */
export const needDocumentFilesResponseSchema = z.object({
  files: z.array(needDocumentFileSchema),
  usedBytes: z.number().int().nonnegative(),
  quotaBytes: z.number().int().positive(),
})
export type NeedDocumentFilesResponse = z.infer<typeof needDocumentFilesResponseSchema>

/**
 * #2957 (#2180.54) — le FICHIER SOURCE d'un dossier d'appel d'offres, tel que
 * déposé à l'import. `null` = aucun fichier conservé : un import par texte
 * collé n'a jamais eu de fichier à garder — même distinction que
 * `NeedDocumentFile`, jamais une absence fabriquée en ligne vide.
 */
export const rfpSourceDocumentFilesResponseSchema = z.object({
  files: z.array(storedFileSchema),
  usedBytes: z.number().int().nonnegative(),
  quotaBytes: z.number().int().positive(),
})
export type RfpSourceDocumentFilesResponse = z.infer<typeof rfpSourceDocumentFilesResponseSchema>

/**
 * #2814 — le MOIS d'une facture préparée, tel qu'il segmente ses pièces :
 * `AAAA-MM-01`, la forme de `sendInvoiceConnectorWriteSchema.periodMonth`.
 * Un autre jour du mois n'est pas « le même mois » : il est refusé, jamais
 * arrondi — deux formes d'un même mois feraient deux listes de pièces.
 */
export const invoiceAttachmentPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/)

/**
 * #2814 — les pièces jointes d'une facture PRÉPARÉE (une mission, un mois).
 * Un objet plutôt qu'un tableau nu, pour la raison écrite au-dessus : « aucune
 * pièce » et « le stockage n'a pas répondu » ne se confondent pas.
 */
export const invoiceAttachmentsResponseSchema = z.object({ files: z.array(storedFileSchema) })
export type InvoiceAttachmentsResponse = z.infer<typeof invoiceAttachmentsResponseSchema>

/**
 * Une URL de lecture, et sa fin de validité.
 *
 * `expiresAt` n'est pas décoratif : l'écran s'en sert pour ne jamais réutiliser
 * une URL périmée, et pour dire « ce lien a expiré, redemande-le » plutôt que
 * de laisser tomber sur une page d'erreur du magasin.
 */
export const signedDownloadSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string(),
  fileName: z.string(),
})
export type SignedDownload = z.infer<typeof signedDownloadSchema>

/**
 * Le changement de statut d'un document de besoin — le geste que la fiche
 * n'avait pas.
 *
 * ⚠️ La liste des statuts n'est PAS recopiée : elle appartient à
 * `need-document.ts` et se lit là-bas. Deux listes divergent le jour où l'une
 * gagne une valeur (GA-26), et l'écran refuserait alors un statut que la base
 * accepte.
 */
export const updateNeedDocumentStatusSchema = z.object({ status: needDocumentStatusSchema }).strict()
export type UpdateNeedDocumentStatusInput = z.infer<typeof updateNeedDocumentStatusSchema>

/** Le dépôt d'un document sur un besoin : le fichier, plus ce qu'il EST. */
export const createNeedDocumentSchema = storageUploadSchema
  .extend({
    kind: needDocumentKindSchema,
    /** Le nom AFFICHÉ. Vide, l'écran retombe sur le nom du fichier — jamais sur
     *  une chaîne inventée. */
    name: z.string().trim().max(255).default(''),
  })
  .strict()
export type CreateNeedDocumentInput = z.infer<typeof createNeedDocumentSchema>
