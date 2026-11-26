/**
 * L'IMPORT EN MASSE DE FICHES DE POSTE (#2173.56).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION DE LOUIS (18/09/2026 au soir, QCM)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Importer mes besoins » (l'état vide de `/projects/needs`) menait vers RIEN
 * (voir le commentaire laissé dans `OpenNeedsPage.tsx` par le lot précédent) :
 * seul le dépôt d'UNE fiche existait, via l'assistant de création
 * (`NeedWizard.tsx`, étape « Informations clés »). L'import en masse tranché
 * ici est le dépôt de PLUSIEURS fiches de poste D'UN COUP (PDF, Word, e-mails)
 * — jamais un tableur, jamais un mapping de colonnes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MÊME MOTEUR D'EXTRACTION, PAS UN SECOND (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * `ImportNeedsDialog.tsx` rejoue, une fois par fichier, exactement l'appel que
 * `NeedWizard.tsx` (`StepKeyInfo.handleFile`) fait déjà pour un dépôt unitaire :
 * `rfpApi.create({ title, fileBase64, fileName })`, puis le filtre sur les
 * exigences TECHNIQUES pour en faire des suggestions de compétences. Cherché et
 * ÉCARTÉ : l'extracteur de mission (#2560, `mission-extraction.service.ts`) —
 * il vise un autre domaine (compte, rôle, dates, TJM et jours d'une MISSION déjà
 * gagnée) et n'a ni compétences ni citation de section ; le réutiliser aurait
 * fabriqué un besoin avec des champs qu'il ne sait pas produire.
 *
 * `needWizardDraftToAccountNeedInput` (la conversion du brouillon complet de
 * l'assistant) N'EST PAS appelée ici — `one-need-wizard.test.ts` refuse tout
 * second appelant, et ce lot n'ouvre pas un second assistant. La création
 * directe (`POST /projects/needs`, `CreateAccountNeed`) compose un corps
 * minimal (compte, titre, compétences) — le MÊME endpoint que
 * `useAddAccountNeed`, appelé N fois plutôt qu'une seconde route écrite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TITRE VIENT DU FICHIER, JAMAIS DU DOCUMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `rfpApi.create` n'extrait pas de titre exploitable côté client : le corps
 * `CreateRfpRequest.title` est REQUIS (`z.string().trim().min(1)`), donc le
 * client fournit toujours une valeur non vide et le titre analysé côté serveur
 * (`analysed.title`, `rfp.service.ts`) ne sert jamais de repli en pratique. Pour
 * un lot de N fichiers, redemander N titres à la main annulerait le geste
 * « d'un coup ». Le nom du fichier (sans extension) est un FAIT, pas une
 * supposition sur le contenu — c'est lui qui sert de titre, éditable avant
 * validation dans la prévisualisation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA BORNE — 10 FICHIERS PAR DÉPÔT
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrairement au dépôt de CV en masse (`cvBatch.ts`, #1116, jusqu'à 2-3000
 * fichiers) qui n'extrait que du TEXTE sans appel de modèle, chaque fichier ici
 * crée un dossier RFP réel via le MÊME pipeline d'analyse que le dépôt unitaire
 * (effet de bord assumé, documenté dans `NeedWizard.tsx`). La règle 2 impose en
 * plus une prévisualisation RELUE avant création — au-delà d'une dizaine de
 * lignes, une liste cesse d'être relue et devient une case à cocher qu'on ne
 * regarde plus. Dix fichiers gardent le lot entier visible sans défiler sur un
 * écran de téléphone (768 px, GA-28) et bornent le nombre d'appels d'extraction
 * envoyés d'un coup au service IA.
 */
export const MAX_NEED_IMPORT_FILES = 10

/** Même borne que `NeedWizard.tsx` (`MAX_JOB_POSTING_FILE_MB`, lui-même une
 *  reprise de `RfpPage.tsx`) — non exportée là-bas, donc répétée ici avec sa
 *  source nommée plutôt que devinée, exactement comme `NeedWizard.tsx` le fait
 *  déjà pour `RfpPage.tsx`. */
export const MAX_NEED_IMPORT_FILE_MB = 8
export const MAX_NEED_IMPORT_FILE_BYTES = MAX_NEED_IMPORT_FILE_MB * 1_000_000

/** Une suggestion de compétence, avec sa citation — même forme que ce que
 *  `StepKeyInfo` construit dans `NeedWizard.tsx`. */
/** Non exporté : consommé uniquement dans ce fichier (`pnpm lint:exports:types`). */
type NeedImportSkillSuggestion = { term: string; section: string | null }

/**
 * Ce qu'un fichier déposé est devenu, une fois l'extraction tentée.
 *
 * Trois issues, jamais un succès global : la règle 1 veut qu'un échec au
 * milieu du lot n'empêche pas de créer les autres, et que l'écran NOMME
 * lequel a échoué et pourquoi.
 */
export type NeedImportRow =
  | {
      status: 'extracted'
      file: string
      /** Le nom du fichier, sans extension — jamais deviné dans le document. */
      title: string
      skills: NeedImportSkillSuggestion[]
      /** Le dossier RFP créé par l'extraction (`rfpApi.create`) — traçabilité,
       *  même effet de bord que le dépôt unitaire. */
      rfpId: string
      /** Le TITRE de la fiche déjà présente chez ce compte — `null` = aucun
       *  doublon détecté. Règle 4 : SIGNALÉ, jamais fusionné ni écrasé. */
      duplicateOf: string | null
    }
  | { status: 'too_large'; file: string }
  | { status: 'failed'; file: string; reason: string }

/**
 * Le titre par défaut d'une ligne — le nom du fichier, sans son extension.
 *
 * ⚠️ Ce n'est PAS une extraction : c'est un fait sur le dépôt, pas une lecture
 * du contenu. Un champ réellement absent du document (télétravail, TJM…) reste
 * `null` — voir le docblock du fichier.
 */
export function needTitleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^./\\]+$/, '').trim()
  return withoutExtension.length > 0 ? withoutExtension : fileName.trim()
}

/**
 * Signale les doublons — même titre, compte comparé insensible à la casse et
 * aux espaces de bord. Deux sources : les fiches DÉJÀ chez ce compte
 * (`existingTitles`), et une collision DANS LE MÊME LOT — la première
 * occurrence d'un titre reste propre, les suivantes sont signalées contre
 * elle. Jamais fusionné : une ligne signalée reste une ligne à part entière,
 * que la prévisualisation laisse décocher.
 */
export function markNeedImportDuplicates(
  rows: readonly NeedImportRow[],
  existingTitles: readonly string[],
): NeedImportRow[] {
  const seen = new Set(existingTitles.map(title => title.trim().toLowerCase()))
  return rows.map(row => {
    if (row.status !== 'extracted') return row
    const key = row.title.trim().toLowerCase()
    if (seen.has(key)) return { ...row, duplicateOf: row.title }
    seen.add(key)
    return row
  })
}

/**
 * Ce qui part réellement vers `POST /projects/needs` : extrait, et COCHÉ.
 *
 * `selection` porte des INDEX (position dans `rows`), pas des noms de fichier
 * — deux fichiers déposés sous le même nom ne doivent pas partager une case.
 */
export function needImportRowsToCreate(
  rows: readonly NeedImportRow[],
  selection: ReadonlySet<number>,
): Extract<NeedImportRow, { status: 'extracted' }>[] {
  const result: Extract<NeedImportRow, { status: 'extracted' }>[] = []
  rows.forEach((row, index) => {
    if (row.status === 'extracted' && selection.has(index)) result.push(row)
  })
  return result
}
