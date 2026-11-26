/**
 * #3586 — un texte extrait d'un PDF porte parfois des octets nuls ou des contrôles : Postgres les refuse
 * (`invalid byte sequence for encoding "UTF8"`). Tout texte est normalisé AVANT découpage ET après.
 * Retire \u0000 et les contrôles (sauf \n et \t), ramène \r\n/\r à \n, remplace un surrogate isolé par U+FFFD.
 */
export function normalizeText(text: string): string {
  return (
    text
      .replace(/\r\n?/g, '\n')
      // Viser les contrôles EST le but ici : Postgres refuse \u0000 dans un texte UTF8.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�')
  )
}
