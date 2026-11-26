import { PORTABLE_OBJECTS, type DataClassificationLevel } from '@bellum/contracts'

/**
 * À QUI APPARTIENT UNE DONNÉE EXPORTABLE (#1520, #1521).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LE DÉFAUT QUE CE FICHIER A D'ABORD EU
 * ─────────────────────────────────────────────────────────────────────────────
 * La première version DÉRIVAIT le périmètre de `TABLE_SCOPES`. C'était faux, et
 * silencieusement : ce registre ne contient que les trente tables dont
 * l'appartenance ne se lit sur AUCUNE colonne — aucune des dix tables
 * exportables n'y figure. La dérivation retombait donc dix fois sur dix sur son
 * défaut prudent, et l'écran affichait un seul groupe en prétendant l'avoir
 * calculé.
 *
 * Mesuré en recette : `personnels = 0`, `espace = 10`. La valeur affichée était
 * plausible, donc personne ne l'aurait vue — c'est ce qui rend ce défaut-là
 * coûteux.
 *
 * Le périmètre est maintenant **déclaré** sur `PORTABLE_OBJECTS`, dans le même
 * fichier de contrat que le serveur utilise pour construire l'export. Une seule
 * source, et elle porte la règle par écrit.
 */
type ExportPerimeter = 'personal' | 'workspace'

/**
 * Le périmètre d'un objet, retrouvé par sa `payloadKey`.
 *
 * Une clé absente du catalogue compte pour l'ESPACE : sur un écran qui promet
 * « tes données t'appartiennent », annoncer « personnel » à tort est la seule
 * erreur qui trompe vraiment quelqu'un.
 */
export function perimeterOfPayloadKey(payloadKey: string): ExportPerimeter {
  return PORTABLE_OBJECTS.find(object => object.payloadKey === payloadKey)?.perimeter ?? 'workspace'
}

/**
 * #2439.2 — le niveau de classification d'un objet, retrouvé par sa
 * `payloadKey` sur le même catalogue déclaré que le périmètre.
 *
 * Une clé absente du catalogue tombe côté prudent : `confidentiel`, jamais
 * `public` — sous-estimer la sensibilité d'une donnée qu'on ne reconnaît pas
 * est la seule erreur qui expose vraiment quelqu'un.
 */
export function classificationOfPayloadKey(payloadKey: string): DataClassificationLevel {
  return PORTABLE_OBJECTS.find(object => object.payloadKey === payloadKey)?.classification ?? 'confidentiel'
}

/**
 * #2439.1 / #2439.3 — POURQUOI, COMBIEN DE TEMPS et D'OÙ, retrouvés sur le même
 * catalogue déclaré. Contrairement au périmètre et à la classification, une clé
 * absente rend `null` : il n'y a pas de valeur « prudente » pour une finalité,
 * une rétention ou une provenance qu'on ne reconnaît pas — mieux vaut ne rien
 * afficher que deviner.
 */
export function purposeKeyOfPayloadKey(payloadKey: string): string | null {
  return PORTABLE_OBJECTS.find(object => object.payloadKey === payloadKey)?.purposeKey ?? null
}

export function retentionKeyOfPayloadKey(payloadKey: string): string | null {
  return PORTABLE_OBJECTS.find(object => object.payloadKey === payloadKey)?.retentionKey ?? null
}

export function provenanceKeyOfPayloadKey(payloadKey: string): string | null {
  return PORTABLE_OBJECTS.find(object => object.payloadKey === payloadKey)?.provenanceKey ?? null
}

/** #2439.3 (8e attribut) — ce que la suppression DE TON COMPTE fait à cet objet. */
export function deletionKeyOfPayloadKey(payloadKey: string): string | null {
  return PORTABLE_OBJECTS.find(object => object.payloadKey === payloadKey)?.deletionKey ?? null
}

/**
 * Range les objets exportables par périmètre, en gardant leur ordre d'origine.
 *
 * Un groupe vide n'est pas rendu : un intertitre sans ligne dessous se lit comme
 * un chargement en panne.
 */
export function groupByPerimeter<T extends { payloadKey: string }>(
  objects: readonly T[],
): { perimeter: ExportPerimeter; objects: T[] }[] {
  const order: ExportPerimeter[] = ['personal', 'workspace']
  return order
    .map(perimeter => ({
      perimeter,
      objects: objects.filter(object => perimeterOfPayloadKey(object.payloadKey) === perimeter),
    }))
    .filter(group => group.objects.length > 0)
}

/**
 * #2439.7/.8/.17 — LA PREMIÈRE DES CINQ CATÉGORIES MANQUANTES, PAS LES CINQ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE TRANCHE FAIT, ET CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le NO-GO (#2439.17) demande sept catégories (personnel, entreprise, mémoire,
 * fichiers, exports, marché, technique). Réunir les cinq manquantes suppose de
 * rapatrier l'état de cinq écrans distincts — une refonte de plusieurs jours,
 * confirmée cinq fois par des lots précédents. Cette tranche n'invente aucune
 * de ces cinq catégories : elle sépare la SEULE qui existe déjà, EN DONNÉES,
 * dans ce catalogue — `classification: 'technique'` — de son périmètre de
 * propriété. Avant cette tranche, l'unique objet technique (`sessions`,
 * appareils et connexions) était rangé sous « Mes données personnelles »
 * simplement parce qu'il APPARTIENT à la personne ; rien à l'écran ne disait
 * qu'il n'est pas de la même nature que son identité ou son abonnement.
 *
 * ⚠️ `perimeter` (À QUI) ne change pas : `sessions` reste `personal`, c'est
 * la vérité RGPD que `PrivacyExportService` applique. `category` (COMMENT
 * L'ÉCRAN LES GROUPE) est une dimension d'AFFICHAGE distincte, dérivée de deux
 * champs déjà déclarés sur le catalogue — jamais un troisième champ deviné.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2439.7/.8/.17 — LA DEUXIÈME CATÉGORIE : « FICHIERS »
 * ─────────────────────────────────────────────────────────────────────────────
 * Même patron que `technical` : `ragDocuments` (documents déposés) est le seul
 * objet du catalogue dont le NOM dit déjà qu'il n'est ni une identité ni une
 * activité — un dépôt de fichiers. Il reste `workspace` en périmètre (c'est
 * l'espace qui le possède), et sort de son groupe seulement à l'affichage,
 * repéré par sa `payloadKey` — la seule clé du catalogue qui EST un fichier —
 * jamais une classification qui engloberait aussi des comptes ou des contacts.
 */
type ExportCategory = ExportPerimeter | 'technical' | 'files'

/**
 * #2893 (#2439.7/.8/.17) — LA DEUXIÈME CATÉGORIE MANQUANTE DU NO-GO : « fichiers ».
 *
 * ⚠️ Même patron que la carve-out `technical` juste au-dessus, et même raison :
 * `ragDocuments` est déjà DÉCLARÉ sur le catalogue (`objects.documents`,
 * périmètre `workspace`) — rien n'est inventé, l'écran range seulement ce qui
 * existe déjà sous un intitulé qui dit ce que c'est plutôt que « données de
 * l'espace » au milieu des comptes et des contacts. Les DEUX autres catégories
 * que le NO-GO nomme (mémoire, marché) n'ont PAS d'équivalent dans ce
 * catalogue-ci : `memory_pinned_facts`/`user_preferences`/`conversation_summaries`
 * vivent déjà, comptées, sur `/settings/memory` (`MemoryLedgerView`) — la
 * mémoire est SERVIE ailleurs et ce fichier ne la refait pas — et « marché » est
 * le bucket `shared_market` déjà calculé par `withheldFromExport`. `MyDataView`
 * les affiche chacune en LISANT ce qui existe, jamais en le recalculant ici.
 *
 * DÉCLARÉ par `payloadKey`, jamais par un champ supplémentaire sur le
 * catalogue : un seul objet en relève aujourd'hui, comme `technical` n'en
 * comptait qu'un à sa création.
 */
const FILES_PAYLOAD_KEYS = new Set(['ragDocuments'])

/**
 * La catégorie d'affichage d'un objet — son périmètre, sauf pour l'unique
 * classification `technique` du catalogue et l'objet `ragDocuments`, qui
 * sortent chacun dans leur propre catégorie.
 */
export function categoryOfPayloadKey(payloadKey: string): ExportCategory {
  if (FILES_PAYLOAD_KEYS.has(payloadKey)) return 'files'
  if (classificationOfPayloadKey(payloadKey) === 'technique') return 'technical'
  return perimeterOfPayloadKey(payloadKey)
}

/** Même règle que {@link groupByPerimeter}, sur les quatre catégories d'affichage. */
export function groupByCategory<T extends { payloadKey: string }>(
  objects: readonly T[],
): { category: ExportCategory; objects: T[] }[] {
  const order: ExportCategory[] = ['personal', 'workspace', 'files', 'technical']
  return order
    .map(category => ({
      category,
      objects: objects.filter(object => categoryOfPayloadKey(object.payloadKey) === category),
    }))
    .filter(group => group.objects.length > 0)
}
