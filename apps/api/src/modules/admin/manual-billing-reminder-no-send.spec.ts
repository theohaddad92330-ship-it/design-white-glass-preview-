import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ⚠️ RÈGLE 1 DE #1655 — « LE MESSAGE EST PRÉPARÉ, JAMAIS ENVOYÉ ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE ET PAS UN COMMENTAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * La doctrine du dépôt ne dit pas « on s'interdit d'envoyer », elle dit :
 * « Ses outils de proposition n'ont AUCUN chemin d'écriture — ce n'est pas une
 * convention, c'est l'absence de code. » Une absence ne se prouve pas en la
 * déclarant : elle se MESURE. Une consigne écrite dans un docblock est verte
 * pour toujours, y compris le jour où quelqu'un branche un transport « juste
 * pour tester » — c'est exactement le motif « décision d'affichage sans retrait
 * du mécanisme » que ce dépôt a déjà payé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE MESURE, ET SUR QUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux familles de jetons, sur deux périmètres différents — parce que les deux
 * questions ne sont pas la même :
 *
 *  · **Messagerie** (`sendMail`, `createTransport`, `nodemailer`, `mailbox`, …)
 *    sur TOUT le lot, back-office compris. Aucun de ces fichiers ne doit pouvoir
 *    atteindre un fournisseur d'e-mail.
 *  · **Réseau sortant et file d'envoi** (`fetch(`, `axios`, `@InjectQueue`,
 *    `.add(`) sur la seule partie API. Le back-office, lui, appelle
 *    légitimement NOTRE API : c'est ce qui garde le secret interne côté serveur.
 *    Confondre les deux rendrait la garde impossible à satisfaire, donc
 *    inévitablement contournée.
 *
 * Trois preuves, comme toute garde de ce dépôt : elle LIT quelque chose, elle
 * sait dire NON, et elle n'attrape pas ce qu'elle ne vise pas.
 */

const ADMIN = __dirname
const DM = join(__dirname, '..', '..', '..', '..', 'dashboard-manager', 'src')

/**
 * Les jetons d'une messagerie. Volontairement larges : `mail`, `smtp`, `mailbox`
 * suffisent à faire échouer, parce qu'un fournisseur de messagerie ne s'atteint
 * pas sans en écrire au moins un.
 *
 * ⚠️ `mailto` en fait partie. Un lien `mailto:` n'envoie rien tout seul, mais il
 * porterait l'adresse EN CLAIR dans son `href` — le masquage des adresses
 * (#1670.4) tomberait avec lui, et le geste « ouvrir un brouillon » est
 * précisément celui dont on ne veut pas ici.
 */
const JETONS_DE_MESSAGERIE = [
  'sendMail',
  'createTransport',
  'nodemailer',
  'sendgrid',
  'postmark',
  'mailgun',
  'smtp',
  'mailbox',
  'mailto',
  'MailService',
  'EmailService',
  'createInvitationWithDelivery',
]

/**
 * Les jetons d'un appel sortant ou d'une mise en file. Un message qui part dans
 * une file part quand même — « asynchrone » n'est pas « préparé ».
 */
const JETONS_DE_SORTIE = ['fetch(', 'axios', 'undici', 'got(', 'http.request', '@InjectQueue', '.add(', 'httpService']

/** Le texte d'un fichier du lot, avec son nom pour le message d'échec. */
function lire(chemin: string): string {
  return readFileSync(chemin, 'utf8')
}

/**
 * La RÉGION d'un fichier partagé qui appartient à ce lot.
 *
 * `manual-provisioning.service.ts` porte déjà, avant #1655, l'invitation d'une
 * équipe — qui DÉLIVRE bien un e-mail. Mesurer le fichier entier ferait donc
 * échouer la garde sur du code légitime et antérieur, et la seule issue serait
 * de l'affaiblir. On mesure la région du lot, délimitée par des marqueurs.
 *
 * ⚠️ Un marqueur introuvable JETTE, il ne rend pas une région vide : une garde
 * qui mesure zéro caractère est verte sans avoir rien lu, et ce dépôt a déjà
 * payé cette forme-là (apostrophe recopiée de travers, extracteur coupé trop
 * tôt). L'échec est bruyant, dans la bonne direction.
 */
function region(source: string, debut: string, fin: string, nom: string): string {
  const from = source.indexOf(debut)
  if (from === -1) throw new Error(`Marqueur de début introuvable dans ${nom} : « ${debut} »`)
  const to = fin === '' ? source.length : source.indexOf(fin, from)
  if (to === -1) throw new Error(`Marqueur de fin introuvable dans ${nom} : « ${fin} »`)
  return source.slice(from, to)
}

const SERVICE = lire(join(ADMIN, 'manual-provisioning.service.ts'))
const CONTROLEUR = lire(join(ADMIN, 'manual-provisioning.controller.ts'))

/** Les sources du lot, chacune réduite à ce qui lui appartient. */
const LOT_API: ReadonlyArray<{ nom: string; source: string }> = [
  { nom: 'manual-billing-reminder.ts', source: lire(join(ADMIN, 'manual-billing-reminder.ts')) },
  { nom: 'dto/manual-billing-reminder.dto.ts', source: lire(join(ADMIN, 'dto', 'manual-billing-reminder.dto.ts')) },
  {
    nom: 'manual-provisioning.service.ts (région #1655)',
    source: region(
      SERVICE,
      "LA RELANCE D'UNE FACTURE EN RETARD (#1655)",
      "Find or create the owner's auth account.",
      'manual-provisioning.service.ts',
    ),
  },
  {
    nom: 'manual-provisioning.controller.ts (région #1655)',
    source: region(CONTROLEUR, "LA RELANCE D'UNE PÉRIODE EN RETARD (#1655)", '', 'manual-provisioning.controller.ts'),
  },
]

const LOT_BACKOFFICE: ReadonlyArray<{ nom: string; source: string }> = [
  {
    nom: 'billing-reminder-panel.tsx',
    source: lire(join(DM, 'app', 'facturation', '_components', 'billing-reminder-panel.tsx')),
  },
  {
    nom: 'api/admin/clients/manual-reminder/route.ts',
    source: lire(join(DM, 'app', 'api', 'admin', 'clients', 'manual-reminder', 'route.ts')),
  },
  {
    nom: 'api/admin/clients/manual-invoices/[invoiceId]/reminder/route.ts',
    source: lire(join(DM, 'app', 'api', 'admin', 'clients', 'manual-invoices', '[invoiceId]', 'reminder', 'route.ts')),
  },
]

/**
 * Les COMMENTAIRES sortent avant la mesure.
 *
 * ⚠️ La garde s'attrape sinon sur SA PROPRE JUSTIFICATION : les docblocks de ce
 * lot expliquent longuement qu'aucun `mailto:` ni `sendMail` n'existe, et
 * contiennent donc les jetons qu'elle cherche. C'est le défaut GA-255, déjà payé
 * ici même.
 */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function jetonsTrouves(source: string, jetons: readonly string[]): string[] {
  const code = sansCommentaires(source)
  return jetons.filter(jeton => code.includes(jeton))
}

describe('⚠️ #1655 règle 1 — la relance est PRÉPARÉE, et rien ici ne sait l’envoyer', () => {
  it('LIT quelque chose — les sept sources du lot existent et ne sont pas vides', () => {
    // Contrôle positif : un chemin faux, un marqueur déplacé ou un découpage
    // cassé rendraient zéro caractère, donc zéro jeton, donc une garde verte
    // qui n'a rien ouvert.
    expect(LOT_API.length + LOT_BACKOFFICE.length).toBe(7)
    const trop_courts = [...LOT_API, ...LOT_BACKOFFICE].filter(f => f.source.length <= 400).map(f => f.nom)
    expect(trop_courts).toEqual([])
    // Et les régions découpées contiennent bien LE code du lot, pas un entête.
    expect(LOT_API[2]?.source).toContain('logInvoiceReminder')
    expect(LOT_API[3]?.source).toContain('manual-invoices/:invoiceId/reminder')
  })

  it('AUCUN chemin vers une messagerie, nulle part dans le lot', () => {
    const fautifs = [...LOT_API, ...LOT_BACKOFFICE].flatMap(fichier =>
      jetonsTrouves(fichier.source, JETONS_DE_MESSAGERIE).map(jeton => `${fichier.nom} — ${jeton}`),
    )
    if (fautifs.length > 0) {
      // Le message enseigne ; l'assertion qui suit tient la garde. `expect` de
      // jest ne prend PAS de second argument (celui de vitest), et l'y passer
      // fait échouer le test pour une raison qui n'est pas la sienne.
      throw new Error(
        [
          'Un chemin vers un fournisseur de messagerie est apparu dans le lot #1655.',
          'La relance se PRÉPARE : l’opérateur copie le texte et l’envoie depuis SA messagerie.',
          '« On prépare, l’humain envoie » n’est pas une convention, c’est l’absence de code.',
          '',
          ...fautifs,
        ].join('\n'),
      )
    }
    expect(fautifs).toEqual([])
  })

  it('AUCUN appel sortant ni mise en file côté API', () => {
    const fautifs = LOT_API.flatMap(fichier =>
      jetonsTrouves(fichier.source, JETONS_DE_SORTIE).map(jeton => `${fichier.nom} — ${jeton}`),
    )
    if (fautifs.length > 0) {
      throw new Error(
        [
          'Le lot #1655 côté API a gagné un appel sortant ou une file.',
          '« Asynchrone » n’est pas « préparé » : un message mis en file part quand même.',
          '',
          ...fautifs,
        ].join('\n'),
      )
    }
    expect(fautifs).toEqual([])
  })

  it('le module qui COMPOSE le message n’importe que deux choses, dont aucune ne sait envoyer', () => {
    // La preuve structurelle, et c'est la plus forte : le texte se compose dans
    // un module dont la fermeture transitive d'imports ne contient aucun
    // transport. Il n'a pas besoin qu'on lui interdise d'envoyer — il n'a
    // aucun moyen de le faire.
    const source = lire(join(ADMIN, 'manual-billing-reminder.ts'))
    const imports = [...source.matchAll(/from '([^']+)'/g)].map(m => m[1])
    expect(imports.sort()).toEqual(['./manual-billing-schedule', '@bellum/contracts'])
  })

  it('sait dire NON — un transport, un mailto ou une mise en file sont repérés', () => {
    expect(jetonsTrouves('await this.transporter.sendMail({ to, subject })', JETONS_DE_MESSAGERIE)).toEqual([
      'sendMail',
    ])
    expect(jetonsTrouves('<a href={`mailto:${email}`}>Envoyer</a>', JETONS_DE_MESSAGERIE)).toEqual(['mailto'])
    expect(jetonsTrouves('await this.queue.add("relance", payload)', JETONS_DE_SORTIE)).toEqual(['.add('])
    expect(jetonsTrouves('await fetch(url)', JETONS_DE_SORTIE)).toEqual(['fetch('])
  })

  it('n’attrape pas ce qu’elle ne vise pas — un texte préparé et une copie restent verts', () => {
    // Le témoin des cas légitimes voisins : composer un objet, parler d'envoi
    // dans une phrase, copier dans le presse-papiers. Aucun n'envoie.
    const legitime = [
      'const subject = `Facture ${reference} — rappel`',
      "lignes.push('Bien cordialement,')",
      'void navigator.clipboard.writeText(texte)',
      "// l'opérateur envoie le message depuis sa messagerie, jamais d'ici",
    ].join('\n')
    expect(jetonsTrouves(legitime, JETONS_DE_MESSAGERIE)).toEqual([])
    expect(jetonsTrouves(legitime, JETONS_DE_SORTIE)).toEqual([])
  })

  it('le retrait des commentaires ne mange pas le code qu’il doit mesurer', () => {
    // Le piège inverse : un nettoyeur trop gourmand rendrait la garde aveugle.
    expect(sansCommentaires('/* sendMail */ const a = 1').includes('sendMail')).toBe(false)
    expect(sansCommentaires('const a = 1 // sendMail').includes('sendMail')).toBe(false)
    expect(sansCommentaires('transporter.sendMail(x) // ok').includes('sendMail')).toBe(true)
    // Une URL ne se fait pas couper à son `//` — sinon la moitié d'une ligne
    // de code disparaîtrait avec elle.
    expect(sansCommentaires("const u = 'https://api.test/x' + sendMail").includes('sendMail')).toBe(true)
  })
})
