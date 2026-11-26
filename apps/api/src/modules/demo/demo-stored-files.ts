import { createHash } from 'node:crypto'

/**
 * LES FICHIERS DE LA SALLE DE DÉMONSTRATION (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DE VRAIS OCTETS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lien de démonstration est ce qu'un prospect voit du produit. Un bouton
 * « Ouvrir » qui rendrait une erreur se découvre en réunion, pas en CI —
 * c'est exactement le défaut que ce lot corrige côté production. La salle
 * dépose donc de VRAIS fichiers, ouvrables, et qui disent ce qu'ils sont.
 *
 * ⚠️ Ce sont des documents FICTIFS, et ils l'ÉCRIVENT en toutes lettres. La
 * doctrine « jamais de donnée fictive » porte sur ce qu'on présente comme un
 * fait mesuré ; la salle de démonstration est, elle, entièrement déclarée comme
 * une salle — un justificatif qui imiterait une vraie facture d'hôtel, sans le
 * dire, serait un faux document.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN PDF ÉCRIT À LA MAIN
 * ─────────────────────────────────────────────────────────────────────────────
 * Le format des pièces de la salle est `.pdf` — c'est ce que porte le nom des
 * justificatifs et des devis semés, et le renommer en `.txt` ferait mentir
 * l'écran sur ce qu'un ESN manipule vraiment. Le dépôt n'a aucune bibliothèque
 * de génération PDF côté API, et en ajouter une pour quatre fichiers de
 * démonstration serait cher. Un PDF minimal VALIDE tient en quarante lignes,
 * à une condition : la table `xref` doit porter les VRAIS décalages d'octets.
 * Les inventer produirait un fichier que la moitié des lecteurs refusent —
 * l'autre moitié le répare en silence, ce qui est pire, parce que ça marche
 * sur la machine de celui qui l'a écrit.
 */

/** La largeur du gabarit, en points PostScript — une demi-page A4 paysage. */
const PAGE_WIDTH = 420
const PAGE_HEIGHT = 200

/**
 * Un PDF d'une page, valide, portant un titre et quelques lignes.
 *
 * ⚠️ Les caractères non-ASCII sont TRANSLITTÉRÉS : sans police embarquée, un
 * « é » dans un flux de contenu Helvetica sort en caractère de remplacement.
 * Mieux vaut « demonstration » lisible qu'un accent qui casse l'affichage.
 */
export function demoPdf(title: string, lines: readonly string[]): Buffer {
  const text = [title, '', ...lines]
  const content = [
    'BT',
    '/F1 14 Tf',
    `20 ${PAGE_HEIGHT - 40} Td`,
    '18 TL',
    ...text.map(line => `(${escapePdfText(asciiOnly(line))}) Tj T*`),
    'ET',
  ].join('\n')

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents 4 0 R ` +
      '/Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]

  let body = '%PDF-1.4\n'
  // ⚠️ Les décalages se mesurent en OCTETS, pas en caractères : `latin1` est le
  // seul encodage où les deux coïncident ici, et c'est aussi celui du flux.
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefOffset = Buffer.byteLength(body, 'latin1')
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(body + xref, 'latin1')
}

/** `(`, `)` et `\` sont les trois caractères qu'un littéral de texte PDF doit
 *  échapper — sans quoi une parenthèse dans un libellé casse le flux entier. */
function escapePdfText(value: string): string {
  return value.replace(/[\\()]/g, match => `\\${match}`)
}

/** Translittération grossière : l'accent tombe, la lettre reste. */
function asciiOnly(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
}

/**
 * L'identifiant STABLE d'un objet de la salle — dérivé de l'espace et de la clé
 * du fichier, jamais tiré au hasard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI STABLE, ALORS QUE LA PRODUCTION TIRE AU HASARD
 * ─────────────────────────────────────────────────────────────────────────────
 * En production, l'identifiant est aléatoire pour que le chemin d'un objet ne
 * se devine pas depuis celui d'un autre. La salle de démonstration a le
 * problème INVERSE : elle est re-semée à chaque visiteur, et un identifiant
 * neuf à chaque fois laisserait derrière lui les octets du semis précédent —
 * un tas qui grossit sans que rien ne le compte. Avec un identifiant dérivé, le
 * semis suivant réécrit exactement le même objet.
 *
 * ⚠️ Ce n'est PAS une faiblesse de cloisonnement : l'espace fait partie de la
 * dérivation, le magasin reste privé, et un chemin ne s'ouvre que par une URL
 * signée — que seule une ligne existante permet de demander. La purge de la
 * salle efface les lignes.
 */
export function demoStorageObjectId(workspaceId: string, fileKey: string): string {
  const digest = createHash('sha1').update(`bellum-demo:${workspaceId}:${fileKey}`).digest('hex')
  // La forme d'un UUID, avec la version 5 et la variante RFC 4122 — la colonne
  // est de type `uuid`, elle refuse tout ce qui n'en a pas la forme.
  const version = `5${digest.slice(13, 16)}`
  const variant = ((parseInt(digest.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + digest.slice(17, 20)
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${version}-${variant}-${digest.slice(20, 32)}`
}
