/**
 * Décoder un fichier déposé, et DIRE comment on l'a lu (§7.4, étape 2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `file.text()` décode en UTF-8, sans condition et sans le dire. Or Excel FR
 * écrit en Windows-1252 dès qu'on choisit « CSV » plutôt que « CSV UTF-8 » — et
 * c'est le choix par défaut. Résultat : « Société » devient « SociÃ©tÃ© », les
 * en-têtes accentués ne sont plus reconnus, et l'écran annonce « aucune colonne
 * reconnue » sur un fichier parfaitement valide. Le trou était déjà relevé dans
 * le croisement du PDF 7.
 *
 * Le décodage se fait ICI et pas côté serveur parce que c'est le navigateur qui
 * possède les tables de caractères : `TextDecoder('windows-1252')` est natif, et
 * refaire cette table côté Node coûterait une dépendance pour un problème déjà
 * résolu.
 *
 * Ce qu'on rend en plus du texte : l'encodage RETENU. Le PDF veut un message
 * nommé — « Ton fichier utilise le point-virgule et l'encodage Windows-1252. Je
 * m'adapte. » — et un message nommé suppose de savoir ce qu'on a fait.
 */

type DecodedFile = {
  text: string
  encoding: 'utf-8' | 'utf-8-bom' | 'windows-1252'
}

/** Le BOM UTF-8, invisible, qu'Excel place en tête de ses « CSV UTF-8 ». */
function hasBom(bytes: Uint8Array): boolean {
  return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
}

/**
 * Le texte est-il de l'UTF-8 valide ?
 *
 * On le demande au décodeur STRICT plutôt que de le deviner : un octet isolé
 * au-dessus de 0x7F est du Windows-1252 dans un export français, et un
 * décodeur tolérant le remplacerait par un losange sans jamais protester.
 */
function decodesAsUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

export function decodeBytes(bytes: Uint8Array): DecodedFile {
  const bom = hasBom(bytes)
  const body = bom ? bytes.subarray(3) : bytes
  const utf8 = decodesAsUtf8(body)
  if (utf8 !== null) return { text: utf8, encoding: bom ? 'utf-8-bom' : 'utf-8' }
  // Windows-1252 ne peut pas échouer : chaque octet y a une place. C'est
  // précisément pour ça qu'il est le repli et jamais le premier essai — il
  // accepterait de l'UTF-8 en le massacrant.
  return { text: new TextDecoder('windows-1252').decode(body), encoding: 'windows-1252' }
}

export async function decodeFile(file: File): Promise<DecodedFile> {
  return decodeBytes(new Uint8Array(await file.arrayBuffer()))
}
