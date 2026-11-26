import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { consultantUpsertSchema } from '@bellum/contracts'
import { ACCOUNT_FIELD_COLUMNS, CONTACT_FIELD_COLUMNS } from '../modules/crm-core/record-fields'

/**
 * GA-131 — aucune écriture aveugle sur une colonne de fiche.
 *
 * Les colonnes qu'un HUMAIN peut corriger — secteur, effectif, chiffre
 * d'affaires, siège, site, nom, poste, adresse — passent par l'arbitre de
 * provenance (`applyFieldUpdates`, pur et testé dans `@bellum/contracts`). Un
 * `UPDATE` direct le contourne, et le contournement ne se voit pas : la
 * correction disparaît à la réanalyse suivante, sans erreur, sans log, sans
 * que personne comprenne pourquoi la saisie n'a pas tenu.
 *
 * ⚠️ Cette garde était **citée par le contrat et n'avait jamais été écrite**.
 * Le docblock de `applyFieldUpdates` affirmait mot pour mot : « un `UPDATE`
 * direct sur une colonne de fiche contourne la règle, et c'est exactement ce
 * que le test de garde `no-blind-record-writes.spec.ts` interdit. » Le fichier
 * n'existait pas — et pendant ce temps `AccountsService.applyResearch` faisait
 * précisément ce qu'il prétendait interdire, sur tous les champs de compte.
 * Une garde affirmée mais absente est pire qu'une garde absente : elle fait
 * croire que le sujet est tenu.
 *
 * C'est un INTERDIT, pas un cliquet : la liste des exceptions est courte, et
 * chacune porte sa raison. Un nouveau writer qui touche une colonne de fiche
 * doit soit arbitrer, soit venir s'expliquer ici.
 *
 * ⚠️ Deuxième leçon, payée au même endroit : cette garde a été BORGNE deux fois.
 *
 *  1. elle ne lisait que les littéraux passés à `.update(…)` / `.set(…)`. Or on
 *     écrit tout aussi bien en mutant la LIGNE chargée — `row.title = …` puis
 *     `repo.save(row)`. C'est exactement ce que faisait la phase 2 de
 *     l'enrichissement de contacts, sur `full_name`, `title` et `linkedin_url` ;
 *  2. elle sortait du FICHIER ENTIER dès qu'il contenait la chaîne
 *     `applyFieldUpdates`. Un fichier qui arbitre à un endroit obtenait donc un
 *     laissez-passer partout ailleurs — et `contacts.service.ts`, qui arbitre en
 *     phase 3, était invisible en phase 2. L'échappatoire ne protégeait
 *     d'ailleurs RIEN : un patch arbitré est construit par `toColumnPatch`, donc
 *     il n'est jamais un littéral, donc le premier détecteur ne le voit pas de
 *     toute façon. Elle est supprimée.
 *
 * ⚠️ TROISIÈME cécité, mesurée le 30/08 et corrigée ici (D374) : **elle ne
 * voyait qu'un tiers du dépôt**. Pour regarder un fichier, elle exigeait un
 * import de `contact.entity` ou `account.entity` — deux entités, choisies parce
 * que c'étaient celles qu'on avait sous les yeux le jour où elle a été écrite.
 * Résultat mesuré : **115 fichiers surveillés sur 805**, et **62 modules sur 104
 * entièrement invisibles**, dont `consultants/` — tout le vivier, c'est-à-dire
 * des fiches de PERSONNES, celles-là mêmes dont on venait de découvrir qu'elles
 * portaient le nom de leur fichier. C'est le motif « la garde protège la FORME
 * qu'elle a vue, pas la règle » : ce qui n'importe aucune des deux entités
 * passait à travers, en silence, avec une pastille verte.
 *
 * Le vivier entre donc dans le corpus, et ses colonnes protégées sont les clés
 * de `consultantUpsertSchema` — c'est-à-dire, littéralement, ce qu'un humain
 * peut corriger sur une fiche de talent. On LIT ce schéma plutôt que de recopier
 * une liste : un registre écrit pour une garde et pour elle seule se déclare
 * implémenté sans l'être.
 *
 * Ce que la garde NE regarde PAS, et le dit : une affectation sur un objet
 * construit sur place (`const patch: … = {}` puis `patch.siren = …`) n'est pas
 * une écriture, c'est une PROPOSITION — ce qui compte pour elle est l'appel qui
 * la consomme. Le détecteur de patchs couvre cet appel quand il porte un
 * littéral ; au-delà, c'est un TROU, et il est NOMMÉ plus bas (`KNOWN_GAPS`)
 * plutôt que passé sous silence. Un trou dont on connaît le nom et le nombre
 * vaut mieux qu'une garde verte qui n'en voit aucun.
 */

const MODULES = join(__dirname, '..', 'modules')

/**
 * Ce que la garde surveille : les colonnes des TROIS objets de fiche.
 *
 * Comptes et contacts viennent des cartes de `record-fields` ; les talents
 * viennent de `consultantUpsertSchema`, le contrat que le formulaire du vivier
 * envoie. On lit ces sources plutôt que de recopier les noms — une colonne
 * ajoutée là-bas est surveillée ici sans que personne ait à y penser.
 */
const TALENT_FIELD_COLUMNS = Object.keys(consultantUpsertSchema.shape)

const PROTECTED_COLUMNS = new Set<string>([
  ...Object.values(ACCOUNT_FIELD_COLUMNS),
  ...Object.values(CONTACT_FIELD_COLUMNS),
  ...TALENT_FIELD_COLUMNS,
])

/**
 * Les écritures directes tolérées, chacune avec sa raison.
 *
 * Le point commun des quatre : ce sont des écritures d'AUTORITÉ HUMAINE ou
 * supérieure. L'arbitre les laisserait passer de toute façon — l'y faire
 * transiter n'ajouterait aucune protection, seulement une lecture.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  // #5016.1 — `consultant_skills` fait foi : `syncStack` recopie sur l'entité EN MÉMOIRE la liste que
  // `syncStackFromSkills` vient d'écrire (additive, filtrée par espace, et qui ne réajoute rien à une stack
  // corrigée à la main, #5016.3). Ce n'est pas une écriture d'une source de données sur une colonne de fiche.
  'consultants/consultants.service.ts':
    "#5016 — `saved.stack = next` rend à l'appelant la liste que `syncStackFromSkills` a déjà écrite (additive, jamais un retrait, et une stack corrigée à la main n'est pas réajoutée : #5016.3). Le formulaire du vivier est un geste d'utilisateur (voir KNOWN_GAPS).",
  // #4016 L4.1 — l'e-mail ESTIMÉ : l'écriture N'EST PAS aveugle, elle passe par
  // `decideFieldWrite` (source `inferred`, la plus faible) juste avant, puis par
  // un `UPDATE … WHERE email IS NULL OR btrim(email) = ''` — une adresse posée
  // entre-temps gagne — et sa provenance est journalisée dans la foulée.
  'contacts/email-estimate.service.ts':
    "l'e-mail estimé remplit un TROU : arbitré par `decideFieldWrite` en source `inferred` (la plus faible, elle n'écrase rien), écrit sous condition « email vide » et journalisé en provenance — jamais par-dessus une valeur, humaine ou non",
  // #4189.9 (lot V8-DÉCISIONS) — « Garder la valeur du CRM » sur un écart de lecture.
  'crm/crm-import.service.ts':
    "#4189.9 — « Garder la valeur du CRM » est un GESTE d'utilisateur sur un écart nommé (auto-approuvé, doctrine des écritures CRM) : il pose la valeur du CRM sur `company_name`/`email`/`full_name`, refuse si une correction humaine a suivi le passage (`isStaleSinceHumanCorrection`, même prédicat que #4016.L13), et journalise l'ancienne valeur en provenance `human` — jamais une source de données qui écrase une saisie",
  'assignment/account-assignment.service.ts':
    "attribuer un portefeuille est un geste d'utilisateur : `assigned_to` n'a pas d'auteur pipeline à qui céder le pas",
  'assignment/contact-assignment.service.ts':
    "même geste côté contact : c'est un utilisateur qui désigne le porteur, pas une source de données qui propose une valeur",
  'workspace/workspace-portfolio-handover.service.ts':
    "#4158.29 — répartir le portefeuille d'un partant est un geste de responsable (`team:manage`), validé après récapitulatif : `assigned_to` des étapes de plan déléguées passe d'un porteur à un autre, bornée par le compte de l'espace. Aucune source de données ne propose cette valeur, et les mêmes natures (comptes, contacts) sont déjà réattribuées par ce service par le helper partagé `release-member-work.ts` (#4158.54)",
  'privacy/privacy-deletion.service.ts':
    "effacement RGPD : il DOIT écraser, y compris une valeur saisie par un humain — c'est tout son objet",
  'contacts/person-erasure.service.ts':
    "effacement RGPD d'une personne à sa demande (c67, #2297) : ligne 430, `manager.update(EmailSuppressionEntity, …, { email: print })` remplace l'adresse en clair par son EMPREINTE dans `email_suppressions` — c'est tout l'objet de l'effacement, même raison que `privacy/privacy-deletion.service.ts`; l'empreinte empêche aussi la recollecte",
  'workspace/release-member-work.ts':
    "#4996 — lignes 29-30, `assigned_to: null` en transaction libère le portefeuille d'un partant (comptes, contacts) : geste de responsable (`team:manage`), jamais une source de données qui propose une valeur; même patron que `workspace/workspace-portfolio-handover.service.ts`, qui appelle ce helper partagé (#4158.54)",
  'outreach/outreach.service.ts':
    "#4165 (lot L-B) — `outreach_sequence_steps.kind` est la NATURE d'une étape de séquence (email, rappel, LinkedIn, appel…), homonyme de `consultants.kind` : objets différents, aucune correction humaine de fiche en jeu. Changer le canal d'une étape À FAIRE est un geste d'utilisateur (l'éditeur d'étapes), jamais une source de données qui propose une valeur ; il est refusé sur une étape e-mail dont le brouillon est préparé.",
  'account-entities/account-entities.service.ts':
    "les colonnes `entity`, `siren` et `kind` d'`account_entities` décrivent une DIVISION du client, homonymes de `contacts.entity`, `accounts.siren` et `consultants.kind` — objets différents, aucune correction humaine de fiche en jeu, et l'écriture est de toute façon un geste d'utilisateur (il renomme son périmètre)",
  'accounts/accounts.service.ts':
    "portefeuille : `assigned_to` est posé (« je prends ce compte ») puis retiré (« je le rends ») sur la ligne chargée — le même geste d'utilisateur que les deux services d'attribution ci-dessus, aucune source de données ne le propose",
  'capitalisation/capitalisation.service.ts':
    "`proofs.source` — d'où vient ce qu'une PREUVE affirme (la mission, le besoin d'origine, le retour de mission) — est un homonyme de `contacts.source`, comme `account_entities.entity` l'est de `contacts.entity` : objets différents, aucune correction humaine de FICHE en jeu. Et l'écriture EST le geste d'utilisateur qui valide la proposition (#2124.49 à .55) : aucune source de données ne propose cette valeur, c'est le clic qui la pose",
  'consultants/talent.service.ts':
    "`cv_text` n'est écrit que dans un TROU (`if (!talent.cv_text)`) : le dépôt d'un CV donne sa matière à une fiche qui n'en avait pas, et n'écrase donc aucune saisie. L'arbitre rendrait le même verdict sur une valeur courante nulle — l'y faire transiter n'ajouterait qu'une lecture. ⚠️ La nuance connue : quelqu'un qui VIDE volontairement `cv_text` le verra reparaître au prochain dépôt ; c'est une intention qu'aucune colonne ne porte aujourd'hui, et la nommer demanderait une pierre tombale, pas un arbitre",
  'consultants/cv-intake.service.ts':
    "#2327.17 — même règle que `talent.service.ts` juste au-dessus : quand un CV rejoint une fiche EXISTANTE (« mettre à jour une fiche »), `cv_text` n'est écrit que dans un TROU (`if (!target.cv_text)`). Un CV déjà là n'est jamais remplacé — le nouveau devient une VERSION dans `consultant_documents`, et aucune saisie n'est écrasée",
  'demo/demo-seed.service.ts':
    "le semis de DÉMONSTRATION écrit un espace fictif de bout en bout : il n'y a, par construction, aucune saisie humaine à écraser — la ligne vient d'être créée trois lignes plus haut par ce même semis. `manager_id` (#2195.12) est posé en SECONDE PASSE parce qu'il pointe vers un autre `consultants.id` qui n'existe pas avant le `save` : le faire transiter par l'arbitre lui demanderait d'arbitrer contre lui-même. ⚠️ Cette exception ne vaut que pour le semis — un service de démo qui toucherait une fiche RÉELLE ne serait pas ce fichier",
  'external-sourcing/external-sourcing.service.ts':
    "#2818 — même patron que `talent.service.ts`/`cv-intake.service.ts` ci-dessus : `consent_given_at` n'est écrit que dans un TROU (`consultant.consent_given_at ?? new Date()`), jamais sur une valeur déjà posée — importer un profil externe ne peut donc jamais écraser un consentement déjà recueilli. L'arbitre rendrait le même verdict sur une valeur courante nulle",
  'contacts/invalid-phone-archive.service.ts':
    "#3850 (lot V04) — rattrapage ciblé d'un téléphone INVALIDE déjà enregistré : l'écriture est CONDITIONNELLE (`WHERE phone = <valeur lue>`), donc une correction humaine posée entre la lecture et l'écriture n'est jamais écrasée ; la valeur retirée est archivée dans `enrichment_archive` (rien ne disparaît), et l'interrupteur `contacts.invalid_phone_archive` coupe l'appel. Le faire transiter par l'arbitre n'ajouterait qu'une lecture : la garde d'égalité sur la valeur lue est déjà l'arbitrage",
  'contacts/placeholder-email-catchup.service.ts':
    "#4599 (vague X, 26/10) — MÊME patron que `contacts/invalid-phone-archive.service.ts` juste au-dessus, pour une adresse GABARIT (« prenom.nom@… ») déjà enregistrée : l'écriture est CONDITIONNELLE (`WHERE email = <valeur lue>` ET `workspace_id`), donc une main passée entre la lecture et le geste tient ; une adresse dont la provenance est `human` n'est même pas candidate (`provenance.currentSources`) ; l'ancienne valeur est archivée dans `enrichment_archive` avec sa date (`email_placeholder_cleared_at`) — on archive, on ne supprime pas — et le champ redevient NULL (« e-mail absent », jamais une adresse inventée). UN espace obligatoire, simulation par défaut, aucun boot ni `@Cron`. Le faire transiter par l'arbitre n'ajouterait qu'une lecture : l'égalité sur la valeur lue EST l'arbitrage",
  'contacts/contact-email-name-backfill.service.ts':
    "#4586 — rattrapage ciblé d'un NOM mal formé déjà enregistré (société collée égale au nom du compte, prénoms répétés par virgules) : l'écriture est CONDITIONNELLE (`WHERE full_name = <valeur lue>` ET `workspace_id`), donc une main passée entre la lecture et le geste tient ; une fiche `source = 'manual'` n'est jamais candidate ; l'ancien nom est gardé dans `raw_data.nameBeforeRepair` — on archive, on ne supprime pas. UN espace obligatoire, simulation par défaut, aucun boot ni `@Cron` (seule porte : `internal/admin`). Le faire transiter par l'arbitre n'ajouterait qu'une lecture : l'égalité sur la valeur lue EST l'arbitrage",
  'actions/action-plan-items.service.ts':
    "#2123.46 a fait entrer ce fichier dans le corpus surveillé : `createFromPlan` importe `AccountEntity` pour une vérification d'appartenance en LECTURE SEULE (`this.accounts.findOne`, jamais un write). La colonne détectée, `assigned_to`, est un homonyme de `contacts.assigned_to` — ici c'est le délégataire d'une ACTION DE PLAN (`action_plan_items`, objet différent), et son écriture (`applyExecutableChange`) EST déjà le geste d'utilisateur validé par `workspaceContext.getMembership` avant d'être posée, exactement comme `assignment/account-assignment.service.ts` et `assignment/contact-assignment.service.ts` ci-dessus — aucune source de données ne propose cette valeur, c'est le clic « assigner » qui la pose",
}

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full))
      continue
    }
    if (!name.endsWith('.ts')) continue
    if (name.endsWith('.spec.ts') || name.endsWith('.test.ts')) continue
    out.push(full)
  }
  return out
}

/**
 * Rend le contenu de chaque littéral d'objet passé à `.update(…)` / `.set(…)`.
 *
 * Le découpage se fait en comptant les accolades et non par une expression
 * régulière : un patch contient couramment un objet imbriqué (`metadata: {…}`),
 * et un `[^{}]*` s'arrêterait à la première accolade interne — la garde ne
 * verrait alors que les patchs les plus simples, et serait verte sur les
 * autres. C'est exactement la façon dont une garde devient borgne.
 */
function updatePatches(source: string): string[] {
  const patches: string[] = []
  const call = /\.(?:update|set)\s*\(/g
  let match: RegExpExecArray | null
  while ((match = call.exec(source)) !== null) {
    let i = match.index + match[0].length
    // `manager.update(AccountEntity, where, patch)` (EntityManager, en transaction) :
    // sauter la classe d'entité nommée en tête, sinon la garde devient borgne
    // dès qu'une écriture passe dans une transaction (#4996).
    const entityArg = /^\s*[A-Z][A-Za-z0-9_]*\s*,/.exec(source.slice(i))
    if (entityArg) i += entityArg[0].length
    // Sauter un premier argument (le `where`) s'il y en a un.
    for (let guard = 0; guard < 2; guard += 1) {
      while (i < source.length && /\s/.test(source[i] as string)) i += 1
      if (source[i] !== '{') break
      let depth = 0
      const start = i
      while (i < source.length) {
        const ch = source[i]
        if (ch === '{') depth += 1
        else if (ch === '}') {
          depth -= 1
          if (depth === 0) {
            i += 1
            break
          }
        }
        i += 1
      }
      patches.push(source.slice(start, i))
      while (i < source.length && /\s/.test(source[i] as string)) i += 1
      if (source[i] !== ',') break
      i += 1
    }
  }
  return patches
}

/**
 * Neutralise commentaires et chaînes AVANT toute analyse.
 *
 * Sans cette passe, la garde lit du SQL : `qb.andWhere('account.siren = :siren')`
 * ressemble trait pour trait à une affectation `account.siren = …`. Sur ce
 * dépôt, ça donnait dix faux positifs pour deux vraies écritures — et une garde
 * qu'on doit désamorcer dix fois finit par n'être qu'une liste d'exceptions.
 *
 * Les délimiteurs et les sauts de ligne sont conservés : les positions ne
 * bougent pas, et le comptage d'accolades des détecteurs reste juste.
 */
function stripLiteralsAndComments(source: string): string {
  let out = ''
  let i = 0
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ')
  while (i < source.length) {
    const two = source.slice(i, i + 2)
    if (two === '//') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      out += blank(source.slice(i, stop))
      i = stop
      continue
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      out += blank(source.slice(i, stop))
      i = stop
      continue
    }
    const quote = source[i] as string
    if (quote === "'" || quote === '"' || quote === '`') {
      let j = i + 1
      let closed = false
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === quote) {
          closed = true
          break
        }
        // Une apostrophe de littéral RÉGULIER (`/['"]/`) ouvrirait sinon une
        // chaîne qui court jusqu'à la fin du fichier et effacerait du vrai code
        // — la façon exacte dont un analyseur naïf devient borgne. JavaScript
        // interdit le saut de ligne dans `'…'` et `"…"` : on s'arrête là, et le
        // dégât est borné à une ligne.
        if (quote !== '`' && source[j] === '\n') break
        j += 1
      }
      const end = Math.min(j, source.length)
      out += quote + blank(source.slice(i + 1, end)) + (closed ? quote : '')
      i = closed ? end + 1 : end
      continue
    }
    out += quote
    i += 1
  }
  return out
}

/**
 * Rend les colonnes affectées DIRECTEMENT sur une ligne chargée —
 * `row.title = …`, que la ligne parte ensuite en `repo.save(row)`.
 *
 * C'est le premier angle mort de cette garde : elle ne lisait que les patchs
 * littéraux, si bien qu'un writer qui mute l'entité lui était invisible. Les
 * receveurs déclarés sur place comme objet (`const patch: … = {}`) sont écartés
 * — voir l'en-tête : ce sont des propositions, pas des lignes.
 */
function assignedColumns(code: string): string[] {
  const columns: string[] = []
  const assignment = /(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\.\s*([a-z_][a-z0-9_]*)\s*=(?!=)/g
  let match: RegExpExecArray | null
  while ((match = assignment.exec(code)) !== null) {
    const [, receiver, column] = match as unknown as [string, string, string]
    // `$` est un caractère d'identifiant valide ET une ancre d'expression
    // régulière : l'échapper, sinon `$patch` produirait un motif qui ne peut
    // jamais correspondre — et la garde se remettrait à voir ce qu'elle doit
    // ignorer, ou l'inverse.
    const escaped = receiver.replace(/[$\\]/g, '\\$&')
    const builtHere = new RegExp(`(?:const|let|var)\\s+${escaped}\\s*(?::[^=\\n]*)?=\\s*\\{`).test(code)
    if (!builtHere) columns.push(column)
  }
  return columns
}

/** Les clés de premier niveau d'un littéral d'objet. */
function topLevelKeys(literal: string): string[] {
  const keys: string[] = []
  let depth = 0
  let i = 0
  while (i < literal.length) {
    const ch = literal[i]
    if (ch === '{' || ch === '[' || ch === '(') depth += 1
    else if (ch === '}' || ch === ']' || ch === ')') depth -= 1
    else if (depth === 1) {
      const rest = literal.slice(i)
      const key = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(rest)
      if (key) {
        keys.push(key[1] as string)
        i += key[0].length
        continue
      }
    }
    i += 1
  }
  return keys
}

/**
 * Le corpus surveillé : les fichiers qui persistent une FICHE.
 *
 * `PROTECTED_COLUMNS` est une liste de NOMS de colonnes, et plusieurs sont des
 * homonymes ailleurs — `title` d'une tâche, d'un item de bibliothèque, d'un
 * besoin ; `assigned_to` d'une action de plan. Les compter ici transformerait la
 * garde en catalogue d'homonymes, et une garde qu'on désamorce à chaque fichier
 * cesse d'être lue. Un fichier qui n'importe aucune entité de fiche ne peut, par
 * construction, pas écrire leurs colonnes par un dépôt TypeORM.
 *
 * ⚠️ La liste s'est arrêtée dix-huit mois à `contact` et `account`. Elle est ce
 * qui rendait `consultants/` — le vivier, donc des fiches de PERSONNES —
 * invisible (D374). Y ajouter une entité de fiche est le geste normal quand on
 * en crée une ; l'oublier ne se voit nulle part, d'où cette phrase.
 */
const RECORD_ENTITIES = /database\/entities\/(contact|account|consultant)\.entity/

function persistsRecords(source: string): boolean {
  return RECORD_ENTITIES.test(source)
}

function watchedFiles(): string[] {
  return tsFiles(MODULES).filter(file => persistsRecords(readFileSync(file, 'utf8')))
}

/**
 * Les colonnes de fiche qu'un fichier écrit SANS arbitre — les deux formes.
 *
 * ⚠️ AUCUNE sortie de fichier ici. Elle existait — « ce fichier contient
 * `applyFieldUpdates`, passons » — et c'est ce qui rendait la phase 2 de
 * `contacts.service.ts` invisible : le fichier arbitre en phase 3.
 */
function columnsWrittenBlind(source: string): string[] {
  const code = stripLiteralsAndComments(source)
  const columns = new Set<string>()
  for (const patch of updatePatches(code)) {
    for (const key of topLevelKeys(patch)) {
      if (PROTECTED_COLUMNS.has(key)) columns.add(key)
    }
  }
  // Deuxième forme d'écriture, longtemps invisible : muter la ligne chargée.
  for (const column of assignedColumns(code)) {
    if (PROTECTED_COLUMNS.has(column)) columns.add(column)
  }
  return [...columns].sort()
}

function offenders(): { file: string; columns: string[] }[] {
  const found: { file: string; columns: string[] }[] = []
  for (const file of watchedFiles()) {
    const columns = columnsWrittenBlind(readFileSync(file, 'utf8'))
    if (columns.length === 0) continue
    found.push({ file: file.slice(MODULES.length + 1), columns })
  }
  return found
}

/* ------------------------------------------------------------------------- */
/*  LE TROU, NOMMÉ — un patch construit sur place qui atteint une fiche        */
/* ------------------------------------------------------------------------- */

/**
 * Les colonnes posées sur un objet CONSTRUIT SUR PLACE, quand cet objet part
 * ensuite vers la base (`Object.assign(row, patch)`, `.save(patch)`,
 * `.update(where, patch)`).
 *
 * L'en-tête l'explique : ces affectations ne sont pas des écritures, ce sont des
 * propositions, et le détecteur principal les ignore à dessein. Mais le patch
 * finit par être écrit, et quand l'appel qui le consomme ne porte pas de
 * littéral, PERSONNE ne regarde plus. C'est là que vivent les écritures les plus
 * dangereuses du dépôt, celles du parsing de CV.
 *
 * Ce détecteur ne fait donc pas échouer la garde sur une écriture : il tient un
 * INVENTAIRE. Ce qui échoue, c'est qu'un fichier entre ou sorte de l'inventaire
 * sans que quelqu'un l'ait écrit — un cliquet, pas un interdit.
 */
function localPatchColumns(code: string): string[] {
  const locals = new Set<string>()
  const declaration = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*\{/g
  let declared: RegExpExecArray | null
  while ((declared = declaration.exec(code)) !== null) locals.add(declared[1] as string)

  const reaching = new Set<string>()
  for (const name of locals) {
    const escaped = name.replace(/[$\\]/g, '\\$&')
    // `[^;]*?` et non `[^)]*` : un patch passé en SECOND argument suit un
    // premier qui contient déjà des parenthèses (`{ id }`, un appel), et
    // s'arrêter à la première fermante rendrait le détecteur borgne sur
    // exactement la forme la plus courante.
    const consumed = new RegExp(`(?:Object\\.assign|\\.(?:update|save|insert|upsert))\\s*\\([^;]*?\\b${escaped}\\b`)
    if (consumed.test(code)) reaching.add(name)
  }

  const columns = new Set<string>()
  const assignment = /(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\.\s*([a-z_][a-z0-9_]*)\s*=(?!=)/g
  let match: RegExpExecArray | null
  while ((match = assignment.exec(code)) !== null) {
    const [, receiver, column] = match as unknown as [string, string, string]
    if (!reaching.has(receiver)) continue
    if (PROTECTED_COLUMNS.has(column)) columns.add(column)
  }
  return [...columns].sort()
}

function gaps(): { file: string; columns: string[] }[] {
  const found: { file: string; columns: string[] }[] = []
  for (const file of watchedFiles()) {
    const columns = localPatchColumns(stripLiteralsAndComments(readFileSync(file, 'utf8')))
    if (columns.length === 0) continue
    found.push({ file: file.slice(MODULES.length + 1), columns })
  }
  return found
}

/**
 * L'inventaire des trous, chacun avec son VERDICT et ce qu'il reste à faire.
 *
 * Un inventaire qui ne distingue pas « lu et jugé sain » de « pas encore
 * regardé » ne vaut pas mieux que pas d'inventaire du tout — d'où le verdict.
 *
 * ⚠️ Un fichier RÉPARÉ ne sort PAS de cet inventaire, et c'est voulu. Ce que le
 * détecteur mesure est une FORME — un patch construit sur place qui atteint la
 * base sans porter de littéral —, pas une conduite. Arbitrer `updates` ne fait
 * pas disparaître `updates.email = …` ; le fichier reste donc un endroit que le
 * détecteur principal ne voit pas, et le retirer de la liste ferait mentir
 * l'inventaire sur ce qu'il a mesuré. Ce qui change quand on répare, c'est le
 * VERDICT — de « DÉFAUT » à « SAIN », avec la raison. Le cliquet ne remonte
 * jamais : aucune entrée ne s'ajoute sans que quelqu'un l'écrive.
 */
const KNOWN_GAPS: Readonly<Record<string, string>> = {
  'accounts/accounts.service.ts':
    "SAIN — le patch entier passe par `applyFieldUpdates` avant l'écriture (`arbitrateAccountPatch`) : `siren` et `naf_code` y sont soumis comme les autres colonnes de compte. Rien à faire.",
  'consultants/consultants.service.ts':
    "SAIN — c'est l'upsert du FORMULAIRE du vivier : un geste d'utilisateur, donc l'autorité elle-même. L'arbitre existe pour empêcher une source de données d'écraser un humain, pas pour empêcher un humain de se corriger. Rien à faire.",
  'consultants/availability-import.service.ts':
    "DÉFAUT — À FAIRE — l'import CSV/XLSX (#2326.7/.9, épopée #2794) pose `available_from`/`tjm` en direct (`patch.available_from = row.availableFrom`, `this.repo.update`) sur CHAQUE ligne rapprochée, sans passer par `applyFieldUpdates`/`decideFieldWrite`. Contrairement au formulaire du vivier juste au-dessus, ce n'est PAS l'utilisateur qui pose la valeur mais un fichier importé (source `pipeline`) : une disponibilité corrigée à la main dans l'application peut se faire écraser par une ligne de tableur périmée au prochain import. Router ce patch par l'arbitre, `incomingSource: 'pipeline'`, comme `contacts.service.ts` juste en dessous.",
  'import/import-writer.service.ts':
    "SAIN — l'import ne remplit que les TROUS (`if (!match.siren)`, `if (!match.website)`), et le commentaire du fichier le dit : « écraser une valeur existante avec celle d'un fichier hérité est ce qui fait perdre les corrections faites à la main ». Rien à faire.",
  'consultants/cv-parse.service.ts':
    "SAIN depuis D378 — les CINQ colonnes que la revue de CV écrit passent par `decideFieldWrite` : `full_name` depuis D368, puis `title`, `stack`, `sectors` et `zones` (`writeColumn`). Les trois LISTES sont gelées ENTIÈREMENT dès qu'un humain les a écrites, faute d'une mémoire des retraits qui permettrait de fusionner sans ressusciter — la raison est écrite en toutes lettres dans le service. Ce que le détecteur voit encore ici est la FORME (`patch.title = …` puis `Object.assign(talent, patch)`), pas une écriture aveugle. Rien à faire.",
  'contacts/contacts.service.ts':
    "SAIN depuis D380 — `enrichContact` route désormais son lot `updates` par `applyFieldUpdates` (`arbitrateEnrichment`, `incomingSource: 'pipeline'`) AVANT le calcul de `matched`, si bien qu'un champ refusé n'atterrit pas sur la fiche et ne se facture pas. Le rafraîchissement est intact — `pipeline ≥ pipeline` écrit —, seule l'autorité supérieure (`human`, `connector`) arrête la valeur du fournisseur. Ce que le détecteur voit encore ici est la FORME (`updates.email = …` puis `.set(updates)`), pas une écriture aveugle. Rien à faire.",
}

describe('GA-131 — aucune écriture aveugle sur une colonne de fiche', () => {
  it('lit vraiment le dépôt', () => {
    // Une garde qui ne lit rien est verte pour toujours.
    expect(tsFiles(MODULES).length).toBeGreaterThan(300)
    expect(PROTECTED_COLUMNS.size).toBeGreaterThanOrEqual(17)
    // Les colonnes du vivier viennent d'un contrat RÉEL, pas d'une liste écrite
    // pour cette garde : si `consultantUpsertSchema` cessait d'être lu, ce
    // chiffre tomberait à zéro et le vivier redeviendrait invisible en silence.
    expect(TALENT_FIELD_COLUMNS.length).toBeGreaterThan(20)
    expect(TALENT_FIELD_COLUMNS).toContain('full_name')
    // Et le corpus RÉELLEMENT surveillé n'est pas vide non plus : c'est la
    // seconde moitié, celle qu'un filtre trop serré ferait disparaître en
    // silence. Les trois writers du pipeline en font partie.
    const watched = watchedFiles().map(f => f.slice(MODULES.length + 1))
    expect(watched.length).toBeGreaterThan(20)
    expect(watched).toContain('accounts/accounts.service.ts')
    expect(watched).toContain('contacts/contacts.service.ts')
    // ⚠️ Le trou de D374 : tout `consultants/` était hors champ. Ces deux lignes
    // sont ce qui empêche de l'en ressortir sans le dire.
    expect(watched).toContain('consultants/cv-parse.service.ts')
    expect(watched).toContain('consultants/cv-intake.service.ts')
  })

  it('surveille les TROIS objets de fiche, pas les deux qu’on avait sous les yeux', () => {
    // La garde a été écrite en regardant deux entités ; tout ce qui n'en
    // importait aucune passait à travers. Le motif se répétera à la prochaine
    // entité de fiche : ce test est là pour qu'il coûte un rouge, pas un an.
    expect(persistsRecords("import { AccountEntity } from '../../database/entities/account.entity'")).toBe(true)
    expect(persistsRecords("import { ContactEntity } from '../../database/entities/contact.entity'")).toBe(true)
    expect(persistsRecords("import { ConsultantEntity } from '../../database/entities/consultant.entity'")).toBe(true)
    // …et elle ne regarde pas tout le dépôt pour autant : une tâche a un
    // `title`, un besoin aussi, et les compter ferait de la garde un catalogue
    // d'homonymes que plus personne ne lit.
    expect(persistsRecords("import { TaskEntity } from '../../database/entities/task.entity'")).toBe(false)
  })

  it('sait voir un patch dont un objet est imbriqué', () => {
    // Le piège que la première version de bien des gardes n'a pas vu : couper
    // au premier `}` interne rend la garde aveugle aux patchs réels.
    const source = `repo.update({ id }, { metadata: { a: 1 }, sector: 'Banque' })`
    const keys = updatePatches(source).flatMap(topLevelKeys)
    expect(keys).toContain('sector')
  })

  it("sait voir un patch passé par l'EntityManager d'une transaction", () => {
    // #4996 : `manager.update(AccountEntity, where, patch)` — la classe d'entité en
    // tête faisait sauter tout l'appel, et l'écriture d'attribution disparaissait.
    const source = `await manager.update(AccountEntity, { id: accountId }, { assigned_to: assignedTo })`
    const keys = updatePatches(source).flatMap(topLevelKeys)
    expect(keys).toContain('assigned_to')
  })

  it('sait voir une écriture qui MUTE la ligne au lieu de passer un patch', () => {
    // L'angle mort n°1, celui par lequel la phase 2 de l'enrichissement de
    // contacts échappait à la garde pendant qu'elle écrasait des corrections.
    const source = stripLiteralsAndComments(`
      private merge(row: ContactEntity, seed: Seed): boolean {
        row.title = pickRicher(row.title, seed.title)
        return this.contacts.save(row)
      }
    `)
    expect(assignedColumns(source)).toContain('title')
  })

  it('ne confond pas une clause SQL avec une écriture', () => {
    // Sans neutralisation des chaînes, `account.siren = :siren` — du SQL —
    // ressemble trait pour trait à une affectation. Dix faux positifs pour
    // deux vraies écritures : une garde qu'on désamorce dix fois n'en est plus
    // une.
    const source = stripLiteralsAndComments(`
      qb.andWhere('account.siren = :siren', { siren })
      // row.title = 'jamais écrit, c'est un commentaire'
    `)
    expect(assignedColumns(source)).toEqual([])
    expect(updatePatches(source).flatMap(topLevelKeys)).not.toContain('siren')
  })

  it('neutralise sans DÉCALER : même longueur, mêmes lignes, sur tout le corpus', () => {
    // Un neutraliseur qui décale efface du vrai code sans le dire — et une garde
    // qui lit du code amputé est verte pour de mauvaises raisons. L'invariant se
    // vérifie sur les fichiers réels, pas sur un exemple choisi.
    for (const file of watchedFiles()) {
      const source = readFileSync(file, 'utf8')
      const stripped = stripLiteralsAndComments(source)
      expect(stripped).toHaveLength(source.length)
      expect(stripped.split('\n')).toHaveLength(source.split('\n').length)
    }
  })

  it('n’a plus d’échappatoire par FICHIER : arbitrer ici n’excuse pas d’écrire là', () => {
    // L'angle mort n°2. La garde sortait du fichier ENTIER dès qu'il contenait
    // `applyFieldUpdates` — et `contacts.service.ts` le contient, à cause de la
    // phase 3, pendant que la phase 2 écrivait en direct deux cents lignes plus
    // haut. Le cas n'est pas hypothétique : des fichiers surveillés arbitrent.
    const arbitrating = watchedFiles().filter(f => readFileSync(f, 'utf8').includes('applyFieldUpdates'))
    expect(arbitrating.length).toBeGreaterThan(0)

    const source = `
      import { applyFieldUpdates } from '@bellum/contracts'
      const { accepted } = applyFieldUpdates({ incoming, incomingSource: 'pipeline', current, currentSources })
      row.title = pickRicher(row.title, seed.title)
    `
    expect(columnsWrittenBlind(source)).toContain('title')
  })

  it('n’autorise que des écritures directes nommées, chacune avec sa raison', () => {
    const unexplained = offenders().filter(o => !(o.file in ALLOWED))
    expect(unexplained).toEqual([])
  })

  it('garde sa liste d’exceptions justifiée — et se prouve non borgne', () => {
    // Chaque exception doit TOUJOURS être détectée. Si le détecteur cesse de
    // voir un cas connu — regex cassée, refactor du fichier — l'entrée devient
    // orpheline et ce test tombe. C'est ce qui empêche la garde de passer au
    // vert en ayant cessé de regarder.
    const detected = new Set(offenders().map(o => o.file))
    const stale = Object.keys(ALLOWED).filter(file => !detected.has(file))
    expect(stale).toEqual([])
    for (const reason of Object.values(ALLOWED)) expect(reason.length).toBeGreaterThan(30)
  })
})

describe('GA-131 — le trou est NOMMÉ, pas passé sous silence', () => {
  it('sait suivre un patch construit sur place jusqu’à l’appel qui l’écrit', () => {
    // La forme exacte du parsing de CV : un patch local, rempli champ par
    // champ, puis reversé sur la ligne. Aucun littéral nulle part, donc invisible
    // au détecteur principal — et c'est là que vivent les écritures qui écrasent
    // une correction humaine.
    const source = stripLiteralsAndComments(`
      const patch: Partial<ConsultantEntity> = {}
      if (title) patch.title = title
      Object.assign(talent, patch)
      await this.consultants.save(talent)
    `)
    expect(localPatchColumns(source)).toContain('title')

    // Un patch local qui ne part JAMAIS vers la base reste une proposition.
    const proposal = stripLiteralsAndComments(`
      const draft: Partial<ConsultantEntity> = {}
      draft.title = title
      return draft
    `)
    expect(localPatchColumns(proposal)).toEqual([])
  })

  it('l’inventaire des trous est celui du dépôt, ni plus ni moins', () => {
    // Un cliquet, pas un interdit : ces écritures ne font pas échouer la garde,
    // mais elles ne peuvent ni apparaître ni disparaître sans que quelqu'un
    // l'écrive. Un trou nouveau tombe ici avec son nom ; un trou refermé aussi.
    const measured = gaps()
      .map(g => g.file)
      .sort()
    expect(measured).toEqual(Object.keys(KNOWN_GAPS).sort())
    // Et chaque entrée porte un VERDICT, pas une formule : « sain » ou « à
    // faire », avec de quoi agir. Ce qui tombe ici est NOMMÉ, pas compté.
    const mute = Object.entries(KNOWN_GAPS)
      .filter(([, verdict]) => verdict.length <= 80 || !/SAIN|DÉFAUT/.test(verdict))
      .map(([file]) => file)
    expect(mute).toEqual([])
  })

  it('les trous JUGÉS DÉFECTUEUX disent ce qu’il faut faire', () => {
    // Sans ce test, « DÉFAUT » deviendrait une étiquette qu'on colle pour faire
    // passer le précédent — et l'inventaire cesserait d'être actionnable, ce qui
    // est la seule chose qui le distingue d'une liste.
    //
    // ⚠️ La preuve que le détecteur LIT ne se prend PAS sur le nombre de défauts.
    // Elle a d'abord été écrite ainsi (« zéro défaut voudrait dire que le
    // détecteur a cessé de lire »), et c'était faux : les deux défauts inventoriés
    // ont été RÉPARÉS (D378, D380), le détecteur les voit toujours — leur forme
    // n'a pas changé — et l'inventaire est simplement passé tout au vert. Une
    // garde qui exige un défaut pour se croire vivante pousse à en garder un.
    // Ce qui prouve la lecture est l'INVENTAIRE lui-même, non vide et mesuré sur
    // le disque juste au-dessus.
    expect(Object.keys(KNOWN_GAPS).length).toBeGreaterThan(0)
    expect(gaps().length).toBe(Object.keys(KNOWN_GAPS).length)

    const defective = Object.entries(KNOWN_GAPS).filter(([, verdict]) => verdict.includes('DÉFAUT'))
    const silent = defective.filter(([, verdict]) => !verdict.includes('À FAIRE')).map(([file]) => file)
    expect(silent).toEqual([])
  })
})
