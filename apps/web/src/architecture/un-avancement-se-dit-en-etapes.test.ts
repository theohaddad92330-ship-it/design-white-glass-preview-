import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #3666 (décision Louis 13/10, « étapes, pas de % ») — L'AVANCEMENT D'UNE
 * OPÉRATION SE DIT EN ÉTAPES, JAMAIS EN POURCENTAGE INVENTÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA GARDE TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Les surfaces d'une OPÉRATION EN COURS (analyse, lanceur, tâches de fond,
 *    jobs de Laura, préparation de la salle de démo) ne lisent AUCUN
 *    pourcentage : le `percent` d'une analyse est un jalon de heartbeat (15,
 *    45, 72, 87), celui de l'accès démo une minuterie. Elles disent l'étape
 *    mesurée (`analysisStepLabel`, « Étape 4 sur 9 : décideurs ») ou « En cours ».
 * 2. Toute BARRE de progression du web (`role="progressbar"`, `<Progress`,
 *    `aria-valuenow`) est inscrite ci-dessous avec ce qu'elle mesure. Une barre
 *    nouvelle et non inscrite fait échouer la CI EN NOMMANT son fichier : la
 *    question « est-ce une mesure ou une invention ? » doit avoir une réponse
 *    écrite. Une barre `indeterminate` ne porte aucune valeur.
 *
 * Elle ne vise PAS les pourcentages qui ne sont pas un avancement (marge, quota
 * consommé, part d'un total) : ceux-là ne vivent pas sur une surface d'opération.
 */

const WEB_SRC = join(__dirname, '..')

/** Les surfaces d'une opération en cours — aucune ne lit un pourcentage. */
const OPERATION_SURFACES = [
  'components/analysis/AnalysisProgressCard.tsx',
  'features/search/components/SearchAnalyzingState.tsx',
  'features/search/hooks/useAnalysis.ts',
  'hooks/useAnalysisProgress.ts',
  'features/accounts/view/AccountDetail.tsx',
  'features/accounts/view/account-detail/components/AccountDetailStatusBanners.tsx',
  'features/search/view/Search.tsx',
  'features/launcher/AccountLaunchSurface.tsx',
  'components/sidebar/background-tasks/TaskCard.tsx',
  'components/sidebar/background-tasks/useBackgroundEntries.ts',
  'components/sidebar/background-tasks/types.ts',
  'features/briefing/view/RunningJobsBlock.tsx',
  'features/demo/hooks/useDemoAccessForm.ts',
  'features/demo/view/DemoAccessPage.tsx',
] as const

type BarKind = 'steps' | 'measured' | 'indeterminate' | 'not_an_operation'

/** Chaque barre de progression du web, et ce qu'elle mesure. */
const PROGRESS_BARS: Readonly<Record<string, { kind: BarKind; why: string }>> = {
  'features/projects/open-needs/view/NeedDocumentsUpload.tsx': {
    kind: 'measured',
    why: 'octets envoyés / octets du fichier (`upload.onprogress`), mesurés par le navigateur',
  },
  'features/expenses/view/AttachmentDeposit.tsx': {
    kind: 'measured',
    why: 'octets envoyés / octets du justificatif (`upload.onprogress`)',
  },
  'features/universal-import/view/UniversalImportHistory.tsx': {
    kind: 'measured',
    why: 'lignes écrites / lignes du fichier (`processedRows` / `totalRows` du job) ; sans total connu, aucune barre',
  },
  'features/chat/voice/VoiceLevelMeter.tsx': { kind: 'measured', why: 'niveau du micro, pas un avancement' },
  'features/demo/view/DemoAccessPage.tsx': {
    kind: 'indeterminate',
    why: 'une seule requête sans étapes : barre sans valeur + secondes attendues (mesurées)',
  },
  'features/accounts/view/account-detail/components/BattleCardModal.tsx': {
    kind: 'indeterminate',
    why: 'génération sans étapes, barre sans `aria-valuenow`',
  },
  'features/onboarding/view/OnboardingWizard.tsx': {
    kind: 'steps',
    why: 'sous-étape courante / sous-étapes du Temps 1 — issue des étapes du questionnaire',
  },
  'features/billing/components/CurrentPlanCard.tsx': { kind: 'not_an_operation', why: 'crédits consommés du plan' },
  'features/today/BurstPanel.tsx': {
    kind: 'steps',
    why: 'cartes traitées / cartes de la rafale (#4164) — comptées dans la file, jamais estimées',
  },
  'features/brief-blocks/BriefCharts.tsx': { kind: 'not_an_operation', why: 'part d’un total dans un graphique' },
  'features/market-brief/components/PriceTrend.tsx': { kind: 'not_an_operation', why: 'médiane relative au max' },
  'features/adv/view/AdvPage.tsx': { kind: 'not_an_operation', why: 'effectif relatif au plus grand' },
  'features/accounts/view/account-detail/tabs/plan/ActionPlanBoard.tsx': {
    kind: 'not_an_operation',
    why: 'actions du plan faites / actions du plan — un compte, pas un job',
  },
  'features/accounts/view/account-detail/tabs/coverage/ConfidenceBreakdown.tsx': {
    kind: 'not_an_operation',
    why: 'part de confiance d’un axe',
  },
  'features/accounts/view/account-detail/tabs/TabCoverage.tsx': {
    kind: 'not_an_operation',
    why: 'taux de couverture mesuré (GA-259)',
  },
}

/** Le code sans ses commentaires — un commentaire qui EXPLIQUE `percent` n'est pas une lecture. */
function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const PERCENT_READ = /percent/i

/** Les surfaces d'opération qui lisent un pourcentage, par nom. */
function percentReaders(files: readonly { path: string; text: string }[]): string[] {
  return files.filter(file => PERCENT_READ.test(stripComments(file.text))).map(file => file.path)
}

const PROGRESS_BAR = /role="progressbar"|<Progress\b|aria-valuenow/

/** Les fichiers qui dessinent une barre sans être inscrits, par nom. */
function unregisteredBars(files: readonly { path: string; text: string }[]): string[] {
  return files
    .filter(file => PROGRESS_BAR.test(stripComments(file.text)) && !(file.path in PROGRESS_BARS))
    .map(file => file.path)
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'architecture' ? [] : sourceFiles(path)
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : []
  })
}

function read(path: string): { path: string; text: string } {
  return { path, text: readFileSync(join(WEB_SRC, path), 'utf8') }
}

describe('#3666 — un avancement se dit en étapes, jamais en pourcentage inventé', () => {
  it('aucune surface d’opération en cours ne lit un pourcentage', () => {
    expect(percentReaders(OPERATION_SURFACES.map(read))).toEqual([])
  })

  it('les surfaces d’une ANALYSE disent l’étape mesurée (`analysisStepLabel`)', () => {
    for (const path of [
      'components/analysis/AnalysisProgressCard.tsx',
      'features/launcher/AccountLaunchSurface.tsx',
      'components/sidebar/background-tasks/useBackgroundEntries.ts',
    ]) {
      expect({ path, readsSteps: /analysisStepLabel\(/.test(read(path).text) }).toEqual({ path, readsSteps: true })
    }
  })

  it('toute barre de progression du web est inscrite avec ce qu’elle mesure', () => {
    const files = sourceFiles(WEB_SRC).map(path => ({
      path: relative(WEB_SRC, path),
      text: readFileSync(path, 'utf8'),
    }))
    // La garde LIT quelque chose : le web compte des centaines d'écrans.
    expect(files.length).toBeGreaterThan(500)
    expect(unregisteredBars(files)).toEqual([])
    // Et le registre ne ment pas : chaque entrée dessine encore une barre.
    const stale = Object.keys(PROGRESS_BARS).filter(path => !PROGRESS_BAR.test(stripComments(read(path).text)))
    expect(stale).toEqual([])
  })

  it('une barre `indeterminate` ne porte aucune valeur', () => {
    const valued = Object.entries(PROGRESS_BARS)
      .filter(([, entry]) => entry.kind === 'indeterminate')
      .map(([path]) => read(path))
      .filter(file => /aria-valuenow|<Progress[^>]*\bvalue=/.test(stripComments(file.text)))
      .map(file => file.path)
    expect(valued).toEqual([])
  })

  it('sait dire NON — un coupable planté est NOMMÉ', () => {
    const planted = [
      { path: 'features/x/Coupable.tsx', text: 'return <Text>{`${run.percent} %`}</Text>' },
      { path: 'features/x/Innocent.tsx', text: '// le percent du serveur est ignoré\nreturn <Text>{label}</Text>' },
    ]
    expect(percentReaders(planted)).toEqual(['features/x/Coupable.tsx'])
    expect(
      unregisteredBars([
        { path: 'features/x/BarreInventee.tsx', text: '<Progress value={waited / 240} />' },
        { path: 'features/x/SansBarre.tsx', text: '<Text>Étape 2 sur 9</Text>' },
      ]),
    ).toEqual(['features/x/BarreInventee.tsx'])
  })
})
