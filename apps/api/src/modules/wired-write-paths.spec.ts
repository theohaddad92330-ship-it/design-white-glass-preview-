import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CV_DETECTIONS } from '@bellum/contracts'

/**
 * Un chemin d'écriture livré et jamais appelé.
 *
 * C'est le défaut le plus coûteux que ce dépôt produise, parce qu'il est
 * invisible : la table existe, le service est écrit, l'écran s'affiche, les
 * tests unitaires passent — et rien ne se produit jamais en production. Il s'est
 * déjà présenté trois fois. La file d'intervention du responsable restait vide
 * (`open()` sans appelant). La liste des doublons restait vide
 * (`proposeDuplicates()` sans appelant). Et les trois playbooks de niveau 5,
 * livrés avec leurs six garde-fous et leur interrupteur d'armement, ne pouvaient
 * envoyer aucun message (la réservation était sans appelant) : armer persistait
 * une préférence et ne déclenchait rien.
 *
 * Ces trois écrans avaient en commun de se lire comme une bonne nouvelle —
 * « aucune intervention », « aucun doublon », « automatisation active » — alors
 * qu'ils disaient « personne ne regarde ».
 *
 * Ce test lit les SOURCES et vérifie qu'un appelant existe. Il ne remplace pas
 * un test de comportement ; il attrape la seule chose qu'aucun test de
 * comportement ne peut voir, parce qu'un test appelle toujours la méthode qu'il
 * teste.
 */

const SRC = join(__dirname, '..')

/** Les méthodes dont l'absence d'appelant signifie « la fonctionnalité n'existe
 *  pas », et le fichier où elles sont définies. */
const MUST_BE_CALLED: { method: string; definedIn: string; why: string }[] = [
  {
    method: 'accountsDueForReexamination',
    definedIn: 'crm-routines.service.ts',
    why: 'sans appelant, un « non » n’a pas de durée de vie : un compte écarté pour « pas de budget » en janvier reste fermé pour toujours tant que rien ne bouge, et c’est exactement le cas que raconte le bêta testeur',
  },
  {
    method: 'openDoorFromMove',
    definedIn: 'crm-routines.service.ts',
    why: 'sans appelant, un contact qui change d’entreprise ne produit qu’un badge RISQUE — la moitié « dégradation » du cas, jamais la moitié « porte neuve » que le tome 1 appelle la plus rentable des six',
  },
  {
    method: 'dismiss',
    definedIn: 'partners.service.ts',
    why: 'sans appelant, « Ce n’est pas exact » n’écarte rien et la correction de l’utilisateur est défaite par l’analyse suivante',
  },
  {
    method: 'excludeContact',
    definedIn: 'contacts.service.ts',
    why: 'sans appelant, l’état « rejeté » du cycle de vie reste un état déclaré que rien ne produit — le défaut exact que ce chantier corrige',
  },
  {
    method: 'requestApproval',
    definedIn: 'playbooks.service.ts',
    why: 'sans appelant, armer un playbook ne prépare jamais rien — et le balayeur, qui n’a plus accès à la messagerie, n’aurait alors AUCUN effet',
  },
  {
    method: 'markDispatched',
    definedIn: 'playbooks.service.ts',
    why: 'sans appelant, une relance validée resterait « envoi en cours » pour toujours : l’approbation aurait l’air de marcher et rien ne partirait',
  },
  {
    method: 'request',
    definedIn: 'outbound-write.service.ts',
    why: 'sans appelant, la porte d’écriture CRM ne garde rien : les écritures repartent en direct comme avant BEL-INT-603',
  },
  {
    method: 'proposeDuplicates',
    definedIn: 'governance.service.ts',
    why: 'sans appelant, la liste des doublons reste vide pour toujours',
  },
  {
    method: 'open',
    definedIn: 'playbooks.service.ts',
    why: 'sans appelant, la file du responsable reste vide',
  },
  {
    method: 'intake',
    definedIn: 'cv-intake.service.ts',
    why: 'sans appelant, déposer un CV n’écrit jamais rien — le vivier n’accepte alors que du texte collé',
  },
  {
    method: 'commit',
    definedIn: 'cv-parse.service.ts',
    why: 'sans appelant, une fiche relue ne serait jamais qualifiée — et le vivier resterait plein de fiches « à relire »',
  },
  {
    method: 'record',
    definedIn: 'decision-gates.service.ts',
    why: 'sans appelant, le journal des portes de décision reste vide — c’est précisément le défaut qu’il documente',
  },
  {
    method: 'matchNeed',
    definedIn: 'matching.service.ts',
    why: 'sans appelant, le moteur à treize axes ne classe rien — et son journal, qui est une obligation de conformité, reste vide',
  },
  {
    method: 'matchTalent',
    definedIn: 'inverse-matching.service.ts',
    why: 'sans appelant, l’intercontrat reste ce qu’il était : quelqu’un qui relit les besoins à la main',
  },
  {
    // Chantier « briefs comptes » (01/10/2026) — appelé par `AnalysisWorker`.
    method: 'produceCommercialBrief',
    definedIn: 'commercial-brief.step.ts',
    why: 'sans appelant, aucun compte payant n’a jamais de brief commercial : l’écran « Ce que je sais » resterait réservé aux comptes semés à la main en démo',
  },
  {
    // #2916 / #2399.2 (c93) — appelé par `NeedArrivalSubscriber` après le commit d'un besoin.
    method: 'onNeedCreated',
    definedIn: 'auto-need-matching.service.ts',
    why: 'sans appelant, la routine « Matcher un besoin entrant » s’active et ne matche jamais rien — une case cochée qui ne fait rien',
  },
  {
    // #2916 / #2399.2 (c93) — appelé par `BulkMatchingWorker` pour le job `auto-need-match`.
    method: 'process',
    definedIn: 'auto-need-matching.service.ts',
    why: 'sans appelant, les besoins entrants restent « en file » pour toujours et la fiche ne montre jamais de résultat',
  },
  {
    method: 'saveWeights',
    definedIn: 'matching.service.ts',
    why: 'sans appelant, la pondération d’un espace n’est jamais modifiable — l’écran de réglage afficherait des poids figés',
  },
]

/**
 * Le même défaut, sous sa forme la plus discrète : une PRÉFÉRENCE que personne
 * ne lit.
 *
 * Une méthode sans appelant se voit en lisant le code. Une case à cocher sans
 * lecteur ne se voit nulle part : l'écran l'affiche, le PATCH l'enregistre, la
 * colonne existe, et il ne se passe rien. `watchlist_daily_digest` a vécu ainsi
 * — l'écran portait un badge « Bientôt », les commentaires de l'entité, du
 * contrat et de la migration l'annonçaient, et rien n'aurait signalé le jour où
 * quelqu'un aurait supprimé le cron par la suite.
 *
 * On ne peut pas exiger un lecteur côté API pour TOUTES : certaines préférences
 * ne pilotent que l'interface. Celles-là sont déclarées ici, avec leur lecteur
 * réel — ce qui est la moitié du travail, puisque le trou d'hier ressemblait
 * exactement à une préférence purement visuelle.
 */
const PREFERENCES_READ_ELSEWHERE: { column: string; readBy: string }[] = [
  {
    column: 'sidebar_changelog',
    readBy:
      'le web seul (`features/changelog/useChangelog.ts`) — le panneau « Nouveautés » de la barre latérale ne passe par aucun envoi serveur',
  },
  // #4158.19 — colonne RÉSERVÉE au digest hebdo du manager (lot L5, #4158.28). Posée ici avec
  // les trois autres interrupteurs d'e-mail entre collègues ; l'émetteur arrive avec L5, et
  // aucun interrupteur ne s'affiche à l'écran d'ici là (un réglage sans émetteur promet un envoi qui ne vient pas).
  {
    column: 'email_on_manager_digest',
    readBy:
      "le digest hebdo du manager (lot L5, #4158.28) — pas encore émis : la colonne est réservée, aucun interrupteur n'est affiché tant que son émetteur n'existe pas",
  },
]

/**
 * Le même défaut à l'envers : une colonne LUE que rien n'ÉCRIT.
 *
 * Une méthode sans appelant se voit en lisant le code ; une préférence sans
 * lecteur se voit en lisant ce test. Une colonne sans écrivain ne se voit NULLE
 * PART, parce que son repli est honnête : le calcul lit `false`, ou `null`, et
 * répond exactement ce qu'il doit répondre pour une donnée absente. L'écran dit
 * « rien à signaler » ou « non mesuré », ce qui se lit comme une bonne nouvelle,
 * et non comme « personne ne peut renseigner ce champ ».
 *
 * Deux colonnes de `mission_commercial_terms` ont vécu ainsi :
 *
 *  · `requires_po` — `NOT NULL DEFAULT false`, lue par `assessInvoiceReadiness`
 *    pour pousser le bloqueur `missing_po`. Elle valait `false` sur TOUTES les
 *    lignes de TOUS les espaces : le bloqueur « bon de commande exigé et
 *    absent » ne pouvait se déclencher nulle part, et l'écran mensuel disait
 *    « prêt à facturer » sur des missions qui ne l'étaient pas.
 *  · `partner_commission_daily_cents` — lue par `trueDailyCostCents`, dont
 *    dépend la marge par canal. Toujours `null`, donc la marge des canaux
 *    `partner` et `subcontracting` était structurellement `null` : l'indicateur
 *    « le plus stratégique » du PDF 8 était muet sur les deux seuls canaux
 *    qu'il existe pour comparer.
 *
 * ⚠️ Le SEMIS de démonstration et les MIGRATIONS sont exclus du corpus des
 * écrivains, et c'est le cœur de la garde. Une colonne que seul le semis écrit
 * est remplie dans la salle de démonstration et vide chez tous les clients :
 * c'est exactement le défaut, avec une capture d'écran qui prouve le contraire.
 */
const COLUMNS_MUST_BE_WRITTEN: { table: string; entity: string; exempt: string[]; why: string }[] = [
  {
    table: 'mission_commercial_terms',
    entity: join('database', 'entities', 'mission-commercial-terms.entity.ts'),
    // `id` est posé par la base (`gen_random_uuid()`) — personne ne l'écrit, et
    // c'est juste.
    exempt: ['id'],
    why: 'deux de ses colonnes étaient lues et jamais écrites : le bloqueur « bon de commande » ne se déclenchait sur aucun espace, et la marge par canal était muette sur `partner` et `subcontracting`',
  },
]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    // Les specs sont exclues : un test appelle toujours ce qu'il teste, donc
    // les compter ferait passer au vert exactement le défaut qu'on cherche.
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/** Les colonnes booléennes de l'entité, lues DANS l'entité — jamais recopiées à
 *  la main : une liste recopiée oublie la colonne ajoutée demain, qui est
 *  précisément celle qui risque de rester morte. */
function booleanColumnsOf(entityFile: string): string[] {
  const source = readFileSync(entityFile, 'utf8')
  return [...source.matchAll(/@Column\('boolean'[^)]*\)\s*\n\s*([a-z_]+)\s*:/g)].map(match => match[1] as string)
}

/** TOUTES les colonnes de l'entité, lues DANS l'entité — même raison que
 *  ci-dessus : la colonne ajoutée demain est précisément celle qui risque de
 *  n'avoir jamais d'écrivain. */
function columnsOf(entityFile: string): string[] {
  const source = readFileSync(entityFile, 'utf8')
  return [
    ...source.matchAll(
      /@(?:Column|PrimaryGeneratedColumn|UpdateDateColumn|CreateDateColumn)\([^)]*\)\s*\n\s*([a-z_]+)\s*[!?]?\s*:/g,
    ),
  ].map(match => match[1] as string)
}

/** Retire les commentaires AVANT de chercher un lecteur — leçon GA-08. Une
 *  colonne citée dans un docblock (« lu par le cron … ») se lisait comme un
 *  lecteur, et la garde passait au vert sur sa propre prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Les instructions SQL qui ÉCRIVENT dans une table, prises entières.
 *
 * On extrait le littéral de gabarit COMPLET plutôt qu'une fenêtre de N
 * caractères après le `INSERT` : une fenêtre coupe la clause `ON CONFLICT`, où
 * vit la moitié des colonnes, et une garde qui ne voit qu'une moitié se croit
 * verte sur l'autre. Les commentaires sont retirés d'abord — un backtick dans
 * une phrase française découperait les littéraux n'importe où.
 */
function writeStatementsFor(table: string, files: string[]): string[] {
  const targets = new RegExp(`(INSERT INTO|UPDATE)\\s+${table}\\b`, 'i')
  const out: string[] = []
  for (const file of files) {
    for (const [, literal] of stripComments(readFileSync(file, 'utf8')).matchAll(/`([^`]*)`/g)) {
      if (targets.test(literal as string)) out.push(literal as string)
    }
  }
  return out
}

describe('les chemins d’écriture ont un appelant', () => {
  const files = sourceFiles(SRC)

  it.each(MUST_BE_CALLED)('$method — $why', ({ method, definedIn }) => {
    const callers = files.filter(file => {
      if (file.endsWith(definedIn)) return false
      return new RegExp(`\\.${method}\\s*\\(`).test(readFileSync(file, 'utf8'))
    })
    expect(callers.length).toBeGreaterThan(0)
  })
})

describe('les préférences de notification ont un lecteur', () => {
  const ENTITY = join(SRC, 'database', 'entities', 'notification-preference.entity.ts')
  const columns = booleanColumnsOf(ENTITY)
  const files = sourceFiles(SRC)

  it('lit un corpus non vide — dix bascules booléennes au moins', () => {
    // Sans cette assertion, une expression régulière cassée par un changement de
    // formatage ferait passer la garde au vert sur zéro colonne.
    expect(columns.length).toBeGreaterThanOrEqual(10)
    expect(columns).toContain('watchlist_daily_digest')
  })

  it('chaque bascule est lue par un service ou un cron — ou déclarée lue ailleurs', () => {
    const exempted = new Set(PREFERENCES_READ_ELSEWHERE.map(entry => entry.column))
    const dead = columns.filter(column => {
      if (exempted.has(column)) return false
      const readers = files.filter(file => {
        // L'entité, la migration, le DTO et le normaliseur DÉCLARENT la colonne ;
        // ils ne la LISENT pas. Les compter ferait passer au vert une préférence
        // dont le seul « lecteur » est celui qui la crée ou la recopie du SQL
        // vers le wire — mesuré : la migration `1788015818642` suffisait à elle
        // seule à masquer l'absence totale de cron.
        if (file === ENTITY) return false
        if (file.includes(`${'src'}/migrations/`)) return false
        if (file.includes(`${'notifications'}.service.ts`)) return false
        if (file.includes('/dto/')) return false
        return new RegExp(`\\b${column}\\b`).test(stripComments(readFileSync(file, 'utf8')))
      })
      return readers.length === 0
    })
    expect(dead).toEqual([])
  })

  it('une exemption nomme SON lecteur — « c’est côté web » ne suffit pas', () => {
    for (const entry of PREFERENCES_READ_ELSEWHERE) {
      expect(columns).toContain(entry.column)
      expect(entry.readBy.length).toBeGreaterThan(30)
    }
  })
})

describe('les colonnes LUES ont un écrivain dans le produit', () => {
  /** Le produit, et lui seul : ni le semis de démonstration — qui remplirait la
   *  salle et laisserait tous les clients à vide — ni les migrations, qui
   *  CRÉENT la colonne sans donner le moyen de la renseigner. */
  const productFiles = sourceFiles(SRC).filter(
    file => !file.includes(`${'src'}/migrations/`) && !file.includes(`${'modules'}/demo/`),
  )

  it.each(COLUMNS_MUST_BE_WRITTEN)('$table — lit un corpus NON VIDE', ({ table, entity }) => {
    // Sans ces trois assertions, une expression régulière cassée par un
    // changement de formatage ferait passer la garde au vert sur zéro colonne
    // et zéro instruction — le motif exact des six gardes borgnes.
    expect(productFiles.length).toBeGreaterThan(100)
    expect(columnsOf(join(SRC, entity)).length).toBeGreaterThanOrEqual(10)
    expect(writeStatementsFor(table, productFiles).length).toBeGreaterThan(0)
  })

  it.each(COLUMNS_MUST_BE_WRITTEN)(
    '$table — chaque colonne est écrite quelque part ($why)',
    ({ table, entity, exempt }) => {
      const columns = columnsOf(join(SRC, entity))
      const statements = writeStatementsFor(table, productFiles)
      const exempted = new Set(exempt)
      const neverWritten = columns.filter(
        column => !exempted.has(column) && !statements.some(sql => new RegExp(`\\b${column}\\b`).test(sql)),
      )
      expect(neverWritten).toEqual([])
    },
  )

  it('les deux colonnes du défaut sont bien DANS le corpus surveillé', () => {
    // Une garde qui surveille une liste dont les deux cas d'origine ont disparu
    // ne garde plus rien : on le dit à la lettre plutôt que de le supposer.
    const columns = columnsOf(join(SRC, 'database', 'entities', 'mission-commercial-terms.entity.ts'))
    expect(columns).toContain('requires_po')
    expect(columns).toContain('partner_commission_daily_cents')
  })

  it('SAIT DIRE NON — une colonne retirée de l’écriture est signalée', () => {
    // La preuve que la garde mord, faite sur une écriture FABRIQUÉE : casser le
    // vrai service pour vérifier, puis le remettre, laisse le dépôt à la merci
    // d'une interruption. Le mécanisme testé est le même.
    const statements = ['INSERT INTO mission_commercial_terms (mission_id, workspace_id, channel) VALUES ($1,$2,$3)']
    const columns = ['mission_id', 'workspace_id', 'channel', 'requires_po', 'partner_commission_daily_cents']
    const neverWritten = columns.filter(column => !statements.some(sql => new RegExp(`\\b${column}\\b`).test(sql)))
    expect(neverWritten).toEqual(['requires_po', 'partner_commission_daily_cents'])
  })

  it('une exemption est NOMMÉE et courte — « générée par la base » se justifie, pas « à voir »', () => {
    for (const entry of COLUMNS_MUST_BE_WRITTEN) {
      expect(entry.why.length).toBeGreaterThan(30)
      const columns = columnsOf(join(SRC, entry.entity))
      // Une exemption sur une colonne qui n'existe plus ment sur ce qui est
      // gardé — c'est la justification périmée, en plus discret.
      for (const column of entry.exempt) expect(columns).toContain(column)
    }
  })
})

/**
 * Le même défaut, sous la forme mesurée en production le 10/09 (lot 19,
 * #1789) : un CHAMP présenté dans la revue de CV sans chemin d'écriture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS `COLUMNS_MUST_BE_WRITTEN` TEL QUEL
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette famille cherche des littéraux SQL (`INSERT INTO`/`UPDATE`) dans des
 * gabarits de gabarit. `CvParseService.commit` écrit via `this.consultants.
 * save(talent)` — un OBJET TypeORM, jamais une instruction SQL écrite à la
 * main — donc `writeStatementsFor` n'y verrait jamais rien, pas même après le
 * correctif. Le patron reste le même (une colonne LUE doit avoir un
 * ÉCRIVAIN), la détection change : ici, un écrivain se reconnaît à ce que le
 * nom de la DÉTECTION et le nom de la COLONNE apparaissent tous les deux dans
 * les sources de `cv-parse.service.ts` — c'est la trace qu'un CAS est TRAITÉ,
 * pas une preuve de comportement (ça, c'est `cv-parse.service.spec.ts`, qui
 * fait tourner le vrai service).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA AURAIT ATTRAPÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `identity` → `email`/`phone` et `availability` → `availability` : les DOUZE
 * détections étaient déjà dans `CV_DETECTIONS`, les colonnes déjà dans
 * `ConsultantEntity`, l'écran les affichait déjà avec leur citation et leur
 * confiance — et `cv-parse.service.ts` ne contenait ni le mot `email`, ni le
 * mot `phone`, ni un branchement pour `availability`. Cette garde aurait été
 * rouge AVANT ce lot.
 */
describe('chaque détection de CV affichée en revue a un chemin d’écriture (#1789)', () => {
  const CV_PARSE_SERVICE = join(SRC, 'modules', 'consultants', 'cv-parse.service.ts')
  const rawSource = readFileSync(CV_PARSE_SERVICE, 'utf8')
  const source = stripComments(rawSource)

  /** Les blocs qui alimentent une colonne de fiche, et laquelle. `identity`
   *  y figure trois fois : un seul bloc, trois colonnes (D367 + lot 19). */
  const CV_DETECTIONS_WITH_A_COLUMN: { detection: string; column: string; why: string }[] = [
    { detection: 'identity', column: 'full_name', why: 'le nom de la personne (D367, D368)' },
    {
      detection: 'identity',
      column: 'email',
      why: 'lu et affiché dans le MÊME bloc que le nom, sans chemin d’écriture avant le lot 19 (#1789)',
    },
    {
      detection: 'identity',
      column: 'phone',
      why: 'même défaut que l’e-mail, même correctif (#1789)',
    },
    {
      detection: 'identity',
      column: 'location',
      why: 'la ville, accolée à un code — aucune colonne avant #2183.21',
    },
    { detection: 'job_title', column: 'title', why: 'l’intitulé de poste (D378)' },
    { detection: 'skills', column: 'stack', why: 'la liste libre de compétences (D378)' },
    { detection: 'sectors', column: 'sectors', why: 'les secteurs déduits des clients cités (D378)' },
    // #3935 (15/10) — le TJM ÉCRIT dans le CV est recopié dans `tjm`, jamais estimé.
    { detection: 'daily_rate', column: 'tjm', why: 'le TJM écrit dans le CV (#3935, décision Louis 15/10)' },
    { detection: 'mobility', column: 'zones', why: 'la mobilité géographique (D378)' },
    {
      detection: 'availability',
      column: 'availability',
      why: 'colonne SQL existante (`1788013450112-Consultants`), sans chemin d’écriture avant le lot 19 (#1789)',
    },
  ]

  /** Les blocs SANS colonne cible — chacun avec sa raison, jamais un oubli. */
  const CV_DETECTIONS_WITHOUT_A_COLUMN: { detection: string; why: string }[] = [
    { detection: 'seniority', why: 'années d’expérience SAISIES, jamais déduites (décision de Louis du 31/08/2026)' },
    { detection: 'environments', why: 'pas de table aujourd’hui' },
    { detection: 'tools', why: 'pas de table aujourd’hui' },
    { detection: 'certifications', why: 'pas de table aujourd’hui' },
    { detection: 'experiences', why: 'pas de table aujourd’hui' },
    {
      detection: 'education',
      why: 'pas de table aujourd’hui (#2183.26, treizième bloc, ajouté après le lot d’origine)',
    },
    {
      detection: 'languages',
      why: 'une colonne existe (`consultants.languages`, jsonb) mais n’est pas branchée — signalé au lot 19 (#1789), volontairement hors périmètre',
    },
  ]

  it('lit un corpus non vide — les quatorze détections du contrat partagé', () => {
    // Sans cette assertion, une régression d'import ferait passer les deux
    // listes ci-dessous pour exhaustives sur un corpus vide.
    expect(CV_DETECTIONS.length).toBe(14)
    const covered = new Set([
      ...CV_DETECTIONS_WITH_A_COLUMN.map(entry => entry.detection),
      ...CV_DETECTIONS_WITHOUT_A_COLUMN.map(entry => entry.detection),
    ])
    expect([...covered].sort()).toEqual([...CV_DETECTIONS].sort())
  })

  it.each(CV_DETECTIONS_WITH_A_COLUMN)('$detection → $column a un chemin d’écriture', ({ detection, column }) => {
    expect(source).toMatch(new RegExp(`\\b${detection}\\b`))
    expect(source).toMatch(new RegExp(`\\b${column}\\b`))
  })

  it('une détection SANS colonne est une exemption NOMMÉE, pas un oubli', () => {
    for (const entry of CV_DETECTIONS_WITHOUT_A_COLUMN) {
      expect(entry.why.length).toBeGreaterThan(15)
    }
  })

  it('SAIT DIRE NON — retirer un mot du texte source rend la détection manquante', () => {
    // La preuve que la garde mord : simulée sur le texte lu en mémoire, jamais
    // sur le vrai fichier — casser le vrai service laisse le dépôt à la merci
    // d'une interruption, et le mécanisme testé est le même.
    const withoutEmailOrPhone = source.replace(/\bemail\b/g, 'ZZZ').replace(/\bphone\b/g, 'ZZZ')
    const missing = CV_DETECTIONS_WITH_A_COLUMN.filter(
      ({ column }) => !new RegExp(`\\b${column}\\b`).test(withoutEmailOrPhone),
    ).map(entry => entry.column)
    expect(missing.sort()).toEqual(['email', 'phone'])
  })

  it('ne s’alarme PAS d’une détection légitimement non écrite (témoin : séniorité)', () => {
    // `seniority` figure dans `CV_DETECTIONS` (le prompt la demande, l'écran
    // l'affiche) mais n'a AUCUNE colonne cible dans la liste ci-dessus : la
    // garde ne la réclame pas, et c'est le comportement voulu depuis
    // `1791000000002-ConsultantYearsExperience` — la déduire d'un CV la
    // rendrait fausse sur tous les CV sans dates. Le fichier la NOMME (dans sa
    // documentation, volontairement — `rawSource`, pas `source`, et en
    // français : le code n'a justement AUCUNE branche pour la détection
    // `seniority`, seule sa prose l'explique).
    expect(CV_DETECTIONS_WITH_A_COLUMN.some(entry => entry.detection === 'seniority')).toBe(false)
    expect(rawSource).toMatch(/séniorité/)
  })
})
