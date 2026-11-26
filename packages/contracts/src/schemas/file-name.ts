/**
 * « Ceci ressemble-t-il au nom d'un FICHIER ? » — une seule fois, pour tout le
 * dépôt (D372).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 30/08, deux lots ont eu besoin de la même question le même jour et y ont
 * répondu chacun de son côté :
 *
 *  - face LECTURE — `isFileDerivedName`, dans
 *    `apps/web/src/features/consultants/lib/talentName.ts` (GA-120), pour ne pas
 *    AFFICHER `cv_anonyme_louis_ai-engineer-node_gw` comme le nom d'une
 *    personne ;
 *  - face ÉCRITURE — `looksLikeAFileName`, dans `cv-parsing.ts` (GA-128), pour
 *    ne pas ÉCRIRE ce nom-là dans `consultants.full_name`.
 *
 * Mesuré avant la fusion : les deux reconnaissaient **exactement** les mêmes
 * chaînes — mêmes deux marques, même liste de six extensions, même ordre. La
 * seule différence tenait à un groupe capturant (`(…)` d'un côté, `(?:…)` de
 * l'autre), sans effet sur `.test()`. Il n'y avait donc rien à arbitrer entre
 * deux comportements : il y avait un doublon à supprimer avant qu'il n'en
 * devienne un. « Une dérivation vit à un seul endroit — deux chemins qui la
 * refont divergent » (GA-26), et la divergence était garantie : le jour où
 * quelqu'un ajoute un motif à l'un des deux, l'écran et l'écriture cessent
 * d'être d'accord sur ce qu'est un nom de fichier, et une fiche peut être écrite
 * sous un nom que l'écran refuse d'afficher.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE QUESTION OU DEUX ? — L'ARBITRAGE (D373)
 * ─────────────────────────────────────────────────────────────────────────────
 * La question mérite d'être posée, parce que les deux faces ne paient PAS le
 * même prix : refuser d'ÉCRIRE un nom douteux coûte peu (la colonne reste
 * `null`, le fichier reste nommé en dessous), refuser de l'AFFICHER efface une
 * fiche que quelqu'un a peut-être nommée à la main.
 *
 * La réponse est : **une seule question, et une seule fonction.** Ce qui diffère
 * entre les deux faces n'est pas la question, c'est la COMPOSITION.
 *
 * La face écriture est déjà plus sévère que la face lecture — et sa sévérité
 * supplémentaire est déjà écrite ailleurs, sous ses propres noms :
 * `readPersonNameFromIdentity` compose cette fonction avec six autres refus
 * (`too_long`, `carries_contact`, `is_a_labelled_field`, `joins_several_items`,
 * `not_text`, `absent`), chacun AFFICHABLE. Durcir la face écriture ne demande
 * donc pas de durcir « est-ce un nom de fichier ? » : ça demande d'ajouter un
 * refus à côté. Et la face lecture, si elle voulait un jour se durcir, ajouterait
 * de la même façon — pas en changeant ce que « nom de fichier » veut dire.
 *
 * Paramétrer cette fonction par un niveau de sévérité aurait fait exactement
 * l'inverse : deux comportements sous un seul nom, donc deux vérités sur la même
 * chaîne, donc le doublon qu'on vient de supprimer, avec un `if` en plus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CURSEUR — À NE PAS DÉPLACER SANS LE DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette fonction n'essaie PAS de reconnaître « un nom de personne » : ce test-là
 * n'existe pas, les noms du monde ne rentrent dans aucune forme. Elle reconnaît
 * deux marques qu'un nom **écrit par un humain** ne porte jamais, et qu'un nom
 * de fichier porte presque toujours :
 *
 *   1. un TIRET BAS — on ne le tape pas dans un nom, un système l'y met ;
 *   2. une EXTENSION de document encore collée (`.pdf`, `.docx`, …) —
 *      l'ingestion n'en retire qu'une, si bien que « profil.v2.pdf » arrive en
 *      « profil.v2 » et « cv.pdf.pdf » en « cv.pdf ».
 *
 * Un nom de fichier qui n'en porte aucune (« CV Louis 2024 ») passe donc encore
 * pour un nom. C'est ASSUMÉ : **le coût d'un faux positif est une vraie identité
 * effacée à l'écran, celui d'un faux négatif est un libellé disgracieux. On ne
 * tranche pas ces deux-là au même prix.** En particulier, un jeton « CV » isolé
 * a été essayé puis REFUSÉ — « C V Raman » est un nom de personne.
 *
 * ⚠️ Élargir la détection DÉPLACE ce curseur. Qui l'élargit doit le dire et le
 * justifier, ici, dans ce commentaire — pas dans le lot qui en avait besoin.
 */

/**
 * Les extensions que le dépôt de CV accepte (`CvDropZone`, attribut `accept`).
 *
 * Non exportée : la liste n'a de sens que pour la question ci-dessous, et
 * l'exporter inviterait à la recopier ailleurs — ce que ce fichier existe
 * précisément pour empêcher.
 */
const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'doc', 'rtf', 'txt', 'md'] as const

/**
 * ⚠️ Sans drapeau `g`, et il ne doit jamais en porter : `RegExp.test` avec `g`
 * est STATEFUL — un `lastIndex` qui survit d'un appel à l'autre rendrait le
 * verdict faux un appel sur deux. Défaut déjà payé sur une garde du dépôt.
 */
const TRAILING_EXTENSION = new RegExp(`\\.(?:${DOCUMENT_EXTENSIONS.join('|')})$`, 'i')

/**
 * Cette valeur est-elle le nom d'un FICHIER plutôt que celui d'une personne ?
 *
 * ⚠️ La question n'est pas « est-ce un nom de personne ? » (indécidable), mais
 * « porte-t-elle une marque qu'un nom tapé par un humain ne porte jamais ? ».
 *
 * Une valeur vide rend `false` : « rien » n'est pas « un fichier », et le dire
 * ferait remonter le mauvais motif à qui lit l'échec.
 */
export function looksLikeAFileName(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed.includes('_')) return true
  return TRAILING_EXTENSION.test(trimmed)
}
