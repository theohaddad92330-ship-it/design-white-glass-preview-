import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-05 — tout contrôleur déclare ce qu'il garde.
 *
 * `WorkspacePermissionGuard` est **fail-open par défaut** : une route sans
 * `@RequirePermission` passe intacte. C'est le bon choix technique (poser un
 * guard global casserait l'authentification publique), mais il transforme un
 * oubli en trou silencieux — et 53 contrôleurs sur 98 n'ont aujourd'hui aucune
 * déclaration.
 *
 * Cette garde ne peut donc pas exiger la perfection : elle FIGE le niveau
 * actuel. Un contrôleur ajouté demain doit déclarer sa permission, ou nommer
 * explicitement la raison pour laquelle il n'en a pas. Les 53 existants sont
 * listés ci-dessous : la liste ne doit que RÉTRÉCIR.
 *
 * Un contrôleur est considéré comme déclaré s'il porte `@RequirePermission`,
 * ou s'il est gardé autrement de façon reconnaissable — secret interne, clé
 * d'API publique, jeton MCP, route volontairement anonyme. Ces quatre-là ne
 * sont pas des oublis : ce sont d'autres portes.
 */

const MODULES = join(__dirname, '..', 'modules')

/** Guards qui remplacent légitimement une permission d'espace. */
/**
 * Ce qui tient lieu de déclaration quand `@RequirePermission` n'a pas de sens.
 *
 * `@PersonalScope` a été ajouté le 22/08/2026, et il n'affaiblit pas la garde :
 * il DÉCLARE ce que la liste figée des 53 laissait dans le flou — un contrôleur
 * qui ne sert que la donnée de celui qui appelle. La question qui décide entre
 * les deux est écrite dans le décorateur : *un autre membre de l'espace
 * pourrait-il voir quelque chose grâce à cette route ?*
 */
const ALTERNATIVE_GUARDS = [
  'InternalSecretGuard',
  'ApiKeyGuard',
  'ApiAuthGuard',
  'OptionalJwtGuard',
  '@Public',
  '@PersonalScope',
  // Ajouté le 23/08/2026 avec le même raisonnement que `@PersonalScope`, pour
  // un troisième cas qui n'entre dans aucun des deux autres : une route qui ne
  // sert la donnée de PERSONNE — registre public, offres publiées, marchés
  // publics, référentiel ESN mutualisé. La permission qu'il faudrait inventer
  // serait accordée à tous les rôles, `viewer` compris, et un droit que tout le
  // monde a ne garde rien.
  '@MarketData',
  // Ajouté le 28/08/2026, et il RESSERRE la garde au lieu de l'affaiblir : une
  // route derrière `BackofficeRoleGuard` est réservée aux OPÉRATEURS Bellum,
  // c'est-à-dire à un étage AU-DESSUS de toute permission d'espace. Inventer une
  // permission d'espace pour elle l'accorderait au propriétaire de chaque espace
  // client — l'inverse de ce qu'on veut. Le garde relit le rôle sur le compte
  // Supabase à chaque appel ; sa preuve vit dans `backoffice-role.guard.spec.ts`.
  'BackofficeRoleGuard',
  // Ajouté le 07/10/2026 (E1, #3698) : la porte de l'endpoint PUBLIC qui reçoit
  // le mobile révélé par Apollo. L'appelant n'est ni un utilisateur ni un
  // service à nous : il ne peut porter ni JWT ni secret interne. Le garde
  // vérifie un jeton HMAC SIGNÉ PAR REQUÊTE (contact + nonce + échéance) et
  // ferme à 503 sans secret — une porte réelle, pas une exemption. Preuve :
  // `contact-phone-reveal-webhook.controller.spec.ts` et `phone-reveal-token.spec.ts`.
  'PhoneRevealWebhookGuard',
  // Ajouté le 08/10/2026 (#2422.6, épopée #2869, lot R24) : la porte de la
  // surface PUBLIQUE du lien signé à portée limitée (un contact externe,
  // client ou partenaire, sans compte BellumAI, dépose une pièce de contrat).
  // Même famille que `PhoneRevealWebhookGuard` : l'appelant n'est ni un
  // utilisateur ni un service à nous, l'authentification est le jeton du
  // chemin — ici résolu contre son HACHAGE en base, jamais en clair. Preuve :
  // `legal-contract-upload-token.guard.spec.ts`.
  'LegalContractUploadTokenGuard',
  // Ajouté le 16/10/2026 (#4189.7, intégration vague 2) : la porte du webhook CRM entrant
  // (HubSpot, Salesforce). Même famille que `PhoneRevealWebhookGuard` : l'appelant ne porte ni
  // JWT ni secret interne ; le garde vérifie la SIGNATURE du corps brut et ferme à 404 sans
  // secret. Preuve : `crm-webhook-signature.guard.spec.ts`.
  'CrmWebhookSignatureGuard',
]

/**
 * Ce qui vaut DÉCLARATION sur une route — et pourquoi `@WorkspaceRead` n'est
 * PAS dans la liste ci-dessus (D39 · 28/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA MESURE QUI FONDE LE TROISIÈME MARQUEUR
 * ─────────────────────────────────────────────────────────────────────────
 * `ROLE_PERMISSIONS` ne porte AUCUNE permission de lecture : c'est « une entrée
 * par famille d'actions MUTANTES » (`packages/contracts/src/schemas/workspace.ts`),
 * `viewer` n'en détient aucune et lit pourtant tout. Une route de LECTURE d'espace
 * n'a donc littéralement rien à déclarer dans cette matrice — et deux chantiers
 * de suite ont buté dessus : le studio de proposition a posé
 * `@RequirePermission('data:export')` faute de mieux, ce qui a fermé la porte à
 * `viewer` et `tech_admin` sans que personne l'ait décidé ; puis
 * `GET /accounts/hygiene` a fait rougir le cliquet une seconde fois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'EST PAS UNE « PORTE ALTERNATIVE »
 * ─────────────────────────────────────────────────────────────────────────
 * `@PersonalScope` et `@MarketData` qualifient un CONTRÔLEUR ENTIER : toutes ses
 * routes servent la donnée de l'appelant, ou celle de personne. Les inscrire
 * dans `ALTERNATIVE_GUARDS` — qui fait sauter le fichier en bloc — est donc
 * juste.
 *
 * `@WorkspaceRead` qualifie une ROUTE. `accounts.controller.ts` mélange six
 * lectures d'agrégats et douze écritures gardées par `records:write` : l'inscrire
 * dans `ALTERNATIVE_GUARDS` ferait sauter le contrôleur entier du compte des
 * routes nues, et masquerait d'un coup les onze routes qui y restent nues plus
 * toutes celles ajoutées demain. Ce serait EXACTEMENT le défaut que le cliquet
 * de routes ci-dessous a été écrit pour fermer : « une garde qui compte
 * "au moins un" ne dit rien de ce qui manque ».
 *
 * D'où deux listes distinctes, et pas une : `ALTERNATIVE_GUARDS` exempte un
 * fichier, `ROUTE_DECLARATIONS` déclare une route. Le test
 * « @WorkspaceRead n'exempte jamais un contrôleur entier » plus bas tient cette
 * distinction — sans lui, quelqu'un fusionnerait les deux listes en croyant
 * simplifier.
 */
const ROUTE_DECLARATIONS = ['@RequirePermission', '@WorkspaceRead']

/** #4682 — les marqueurs de contrôleur : ils n'exemptent un fichier que posés sur la CLASSE. */
const CLASS_LEVEL_MARKERS = ['@PersonalScope', '@MarketData']

/**
 * Les contrôleurs sans déclaration au 19/08/2026 — 53 sur 98 contrôleurs.
 *
 * Cette liste est un CONSTAT, pas une permission. Retirer une entrée en
 * déclarant sa permission est un progrès ; en ajouter une est refusé.
 */
const UNDECLARED_AT_FREEZE: readonly string[] = [
  // (`accounts/accounts.controller.ts` en est SORTI le 19/08 : ses douze
  //  écritures déclarent désormais leur permission — PDF 2 §14.)
  'accounts/share-public.controller.ts',
  // (`action-os/action-os.controller.ts` en est SORTI le 13/09/2026, #1931 L2 :
  //  les six gestes de carte de Laura déclarent `records:write` et ses deux
  //  lectures de cartes `@WorkspaceRead`. Ses routes de workflow d'avant restent
  //  comptées une par une par le cliquet de routes nues — non mesurées dans ce lot.)
  // (`action-router/action-router.controller.ts` en est SORTI le 21/09/2026,
  //  #2400.5 : `POST /actions/simulate` déclare `team:manage` — éprouver un
  //  niveau d'action est un geste de gouvernance. Ses deux routes de dispatch
  //  d'avant restent comptées une par une par le cliquet de routes nues : leur
  //  droit PROPRE se vérifie déjà dans le service, à la seule porte par laquelle
  //  tout passe — `INTENT_PERMISSION`, D1 du 13/09/2026 — et le déclarer aussi à
  //  la route donnerait DEUX endroits pour un même réglage, ce que GA-26 refuse.)
  'actions/actions.controller.ts',
  'attio/attio.controller.ts',
  'auth/auth.controller.ts',
  'auth/mfa.controller.ts',
  'banners/banners.public.controller.ts',
  // (`briefing/briefing.controller.ts` en est SORTI le 28/08/2026 : la route
  //  `GET /briefing/since-last-visit` déclare `@WorkspaceRead` — elle compte des
  //  faits de l'espace sur la fenêtre de la dernière visite, n'écrit rien et ne
  //  débite rien. `GET /briefing/today`, elle, reste comptée route par route.)
  'companies/companies.controller.ts',
  'coverage-gaps/coverage.controller.ts',
  // (`dashboard/dashboard.controller.ts` en est SORTI le 04/09/2026, #1457 : il
  //  portait deux routes d'ÉQUIPE nues — `GET kpis` et `GET roi` — qui servaient
  //  des agrégats d'espace derrière le seul `JwtGuard`, pour un second cockpit
  //  d'équipe caché sous un onglet de `/dashboard`. Les deux routes sont
  //  retirées avec l'onglet ; ce qui reste est le cockpit PERSONNEL, porté par
  //  `user.userId`, et il déclare `@PersonalScope`.)
  'demo/demo.controller.ts',
  'documents/documents.controller.ts',
  // (`esn-profile/esn-profile.controller.ts` en est SORTI le 24/08 : le
  //  portefeuille d'offre déclare `team:manage` en lecture ET en écriture —
  //  c'est le profil de la SOCIÉTÉ. Ses routes historiques restent comptées
  //  une par une par le cliquet de routes nues ci-dessous, qui est la vraie
  //  maille : « au moins une déclaration » ne dit rien de ce qui manque.)
  'feedback/feedback.controller.ts',
  'google/google.controller.ts',
  'health/health.controller.ts',
  'health/status.controller.ts',
  'impersonation/impersonation.controller.ts',
  'library/library.controller.ts',
  'logo/logo.controller.ts',
  // (`mailbox/mailbox.controller.ts` en est SORTI le 21/10/2026, intégration PR n°3 : `POST reply-draft`
  //  (#4405.1) porte `@WorkspaceRead` — il lit le fil de l'appelant et n'écrit ni n'envoie rien.)
  // (`memory/memory.controller.ts` en est SORTI le 29/08 : `GET ledger` porte
  //  `@WorkspaceRead` — les faits épinglés sont de la donnée d'ESPACE, et la
  //  matrice n'a aucune permission de lecture à leur donner.)
  'microsoft/microsoft.controller.ts',
  // (`notifications/notifications.controller.ts` en est SORTI le 13/09/2026,
  //  #1938.4 : ses onze routes portent `@PersonalScope` au niveau de la CLASSE.
  //  Réglages, centre de notifications et canal SMS servent tous la donnée de
  //  celui qui appelle, bornée à `user_id` — le cas que le marqueur cite
  //  lui-même en exemple. Une ABSENCE devenue DÉCLARATION, donc contredisable.)
  'notion/notion.controller.ts',
  // (`onboarding/onboarding.controller.ts` en est SORTI le 15/09/2026, #2004.10 :
  //  chaque route y est appelée avec `@CurrentUser()` et n'opère que sur cette
  //  identité — progression, réponses, complément de profil, et désormais la
  //  demande explicite d'actualisation (`POST /onboarding/refresh`, #2004.10).
  //  `@PersonalScope` déclare la classe entière ; la promotion d'un champ vers
  //  le profil CANONIQUE du workspace (`PUT /onboarding/answers`) reste gardée
  //  par `context.canManageCompany` à l'intérieur du service, inchangé.)
  // (`pilotage/pilotage.controller.ts` en est SORTI le 31/08/2026 : la série des
  //  photos mensuelles et la lecture de l'objectif de marge portent
  //  `@WorkspaceRead`, et la SAISIE de l'objectif porte `finance:write`. Ses
  //  quatre routes historiques restent comptées une par une par le cliquet de
  //  routes nues — « au moins une déclaration » ne dit rien de ce qui manque.)
  'pipedrive/pipedrive.controller.ts',
  // (`privacy/privacy.controller.ts` en est SORTI le 01/09/2026 : ses cinq
  //  routes portent `@PersonalScope` au niveau de la CLASSE. Elles servent
  //  toutes la donnée de celui qui appelle — export, manifeste de
  //  réversibilité, politique de conservation, effacement — et la matrice
  //  n'avait aucune permission d'espace à leur donner. Une ABSENCE devenue
  //  DÉCLARATION, donc contredisable.)
  // (`profile-context/profile-context.controller.ts` en est SORTI le 16/09/2026,
  //  intégration de la vague 21 : `POST /profile-context/entry-strategy`
  //  (#2073.8) arrivait nue. Ses six routes sont appelées avec `@CurrentUser()`
  //  et ne lisent ou n'écrivent que la ligne `profiles` /
  //  `profile_context_revisions` de CETTE identité (`user_id`), mesuré route par
  //  route : `@PersonalScope` déclare la classe entière, même cas que
  //  l'onboarding le 15/09.)
  'profiles/profiles.controller.ts',
  // (`rag/rag.controller.ts` en est SORTI le 21/09/2026 : `POST ingest/zip`
  //  (#2667.1, dépôt d'une archive zip dans la base de connaissance de
  //  l'espace) déclare `@RequirePermission('records:write')`, et
  //  `WorkspacePermissionGuard` a rejoint son `@UseGuards`. Ses quatre autres
  //  routes — `list`, `remove`, `ingest` (non-zip), `query` — restent comptées
  //  une par une par le cliquet de routes nues : non mesurées dans ce lot.)
  // (`rfp/rfp.controller.ts` en est SORTI le 18/09/2026 (#2571.2) :
  //  `GET :id/need-preview` déclare `@WorkspaceRead` — une lecture pure du
  //  dossier RFP déjà importé, rien n'est écrit, aucun crédit débité. Ses
  //  routes historiques restent comptées une par une par le cliquet de routes
  //  nues ci-dessous, qui est la vraie maille.)
  // (`routines/routines.controller.ts` en est SORTI le 23/09/2026,
  //  #2205.49-52/.62 : ses quatre routes portent `@PersonalScope` au niveau de
  //  la CLASSE — réglages, historique, activation, déclenchement manuel, toutes
  //  scopées à `user.userId`. Même nature que les réglages de notification
  //  (#1938.4) et l'onboarding (#2004.10).)
  // (`team-comments/team-comments.controller.ts` en est SORTI le 14/10/2026,
  //  #4158.31 : `PATCH :id/resolution` (marquer un fil résolu) déclare
  //  `@RequirePermission('records:write')`. Ses deux routes historiques (lire le
  //  fil, commenter) restent comptées une par une par le cliquet de routes nues
  //  ci-dessous, qui est la vraie maille.)
  'tool-registry/tool-registry.controller.ts',
  'watchlist-rules/watchlist-rules.controller.ts',
]

/**
 * LE CODE SEUL — les commentaires retirés avant tout comptage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI (01/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * `bareRoutes` cherchait `@Get(` dans le fichier ENTIER. Un docblock qui écrit
 * « ⚠️ `StaffingController` y déclare un `@Get()` nu » — c'est-à-dire un
 * commentaire qui EXPLIQUE précisément le piège que la garde protège — était
 * compté comme une route sans permission. La garde accusait sa propre
 * documentation, et le seul moyen de la faire taire était de moins bien
 * documenter.
 *
 * Trois entrées fantômes existaient déjà avant cette correction, toutes issues
 * de commentaires : deux dans `delivery.controller.ts`, une dans
 * `talent.controller.ts`. Le cliquet gelé à 361 les comptait donc comme des
 * routes réelles — il gardait trois lignes de prose.
 *
 * ⚠️ La même erreur a déjà coûté cher dans ce dépôt : « GA-33 accusait un
 * commentaire qui EXPLIQUAIT l'interdit ». Une garde doit prouver qu'elle sait
 * dire NON, qu'elle LIT quelque chose, **et qu'elle n'attrape pas ce qu'elle ne
 * vise pas.**
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function controllers(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...controllers(full))
      continue
    }
    if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

describe('GA-05 — chaque contrôleur déclare sa permission', () => {
  const found = controllers(MODULES).map(file => ({
    path: file.slice(MODULES.length + 1),
    source: readFileSync(file, 'utf8'),
  }))

  const undeclared = found
    .filter(c => !ROUTE_DECLARATIONS.some(declaration => c.source.includes(declaration)))
    .filter(c => !ALTERNATIVE_GUARDS.some(guard => c.source.includes(guard)))
    .map(c => c.path)
    .sort()

  it('aucun contrôleur NOUVEAU ne passe sans déclarer ce qu’il garde', () => {
    const added = undeclared.filter(path => !UNDECLARED_AT_FREEZE.includes(path))
    // Si ce test tombe : ajoute `@RequirePermission` au contrôleur listé, ou
    // nomme dans ALTERNATIVE_GUARDS le guard qui garde réellement sa route.
    expect(added).toEqual([])
  })

  it('la liste des contrôleurs non déclarés ne fait que rétrécir', () => {
    expect(undeclared.length).toBeLessThanOrEqual(UNDECLARED_AT_FREEZE.length)
  })

  it('la liste figée ne garde aucune entrée périmée — un contrôleur supprimé ou corrigé en sort', () => {
    const stale = UNDECLARED_AT_FREEZE.filter(path => !undeclared.includes(path))
    // Si ce test tombe : ces entrées sont réglées, retire-les de la liste figée.
    // Une liste qui garde des lignes mortes finit par ne plus rien dire.
    expect(stale).toEqual([])
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  La maille ROUTE — le trou de la maille FICHIER                            */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ Les trois tests ci-dessus comptent PAR FICHIER : ils cherchent la chaîne
 * `@RequirePermission` quelque part dans le contrôleur. **Une seule occurrence
 * suffit donc à déclarer un contrôleur entier.**
 *
 * `delivery.controller.ts` en portait une, sur sept routes, et passait au vert
 * avec six routes nues — dont `GET /delivery/missions`, qui servait le taux de
 * marge de chaque mission à tout membre de l'espace. C'est la même leçon que la
 * carte de diagnostic manquante du 21/08 : **une garde qui compte « au moins
 * un » ne dit rien de ce qui manque.**
 *
 * Ce cliquet compte à la maille juste. Comme GA-07 et GA-09, il gèle un nombre
 * plutôt qu'une liste : 376 lignes figées deviendraient un fichier que personne
 * ne relit, et ce qu'on veut empêcher est l'AJOUT, pas l'existant.
 */
const ROUTE = /@(?:Get|Post|Patch|Put|Delete)\(/g

/**
 * Routes sans permission déclarée, contrôleurs à porte alternative et gardes de
 * classe exclus. Ce nombre ne doit que DESCENDRE — et il descend :
 *
 * - 377 au gel du 22/08/2026 ;
 * - **367 le 23/08/2026**, en déclarant ce qui n'était que sous-entendu :
 *   `records:write` sur l'attribution d'un compte, sur une action de plan cochée
 *   et sur la correction d'une note de dossier (trois écritures qu'un `viewer`
 *   pouvait appeler), et `@PersonalScope` sur l'agenda, dont chaque route sert
 *   la donnée de celui qui appelle avec sa propre connexion.
 * - **361 le 28/08/2026** (D39), en posant `@WorkspaceRead` sur les six lectures
 *   d'agrégats d'espace de `accounts.controller.ts` — `hygiene` et les cinq
 *   voisines littérales (`sectors`, `companies`, `similar-to-explore`,
 *   `signals`, `needs`). Elles n'étaient pas nues par oubli : la matrice n'a
 *   aucune permission de lecture à leur donner. Ce n'est donc pas un
 *   assouplissement du cliquet, c'est la même route qui passe de « rien
 *   d'écrit » à « écrit, et contredisable ».
 *
 * ⚠️ Les onze autres routes nues de `accounts.controller.ts` et le
 * `@Get(':slug')` de `share-public.controller.ts` restent comptées : elles
 * n'ont pas été mesurées, et un cas non mesuré ne se traite pas en masse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 01/09/2026 — LE NOMBRE NE BOUGE PAS, MAIS IL COMPTE AUTRE CHOSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le découpage lit désormais le code SANS ses commentaires (`stripComments`).
 * Deux erreurs symétriques disparaissent, et elles se compensaient :
 *
 *  - **trois fantômes** — un docblock qui cite `@Get()` pour expliquer un piège
 *    était compté comme une route nue (deux dans `delivery.controller.ts`, un
 *    dans `talent.controller.ts`). La garde accusait sa propre documentation ;
 *  - **trois vraies routes nues, MASQUÉES** — un segment court d'un `@Get(` au
 *    suivant, donc il contient le docblock de la route SUIVANTE. Quand ce
 *    docblock cite `@WorkspaceRead`, la route précédente était exemptée par de
 *    la prose qui ne la concernait pas.
 *
 * Les trois masquées, MESURÉES et nommées ici :
 *  1. `delivery/delivery.controller.ts` `@Get('expansion')` — CORRIGÉE le même
 *     jour : lecture d'agrégat d'espace, `@WorkspaceRead` posé (cas D39) ;
 *  2. `briefing/briefing.controller.ts` `@Get('today')` ;
 *  3. `workspace/workspace.controller.ts` `@Get('members')`.
 *
 * Les deux dernières restent comptées : elles appartiennent à des modules que ce
 * lot ne touche pas, et poser un marqueur sur une route qu'on n'a pas lue est
 * exactement ce que ce cliquet existe pour empêcher. Elles sont NOMMÉES pour que
 * la prochaine main sache où regarder — un trou mesuré et écrit vaut mieux qu'un
 * trou masqué par un accident de découpage.
 *
 * - **353 le 13/09/2026** (#1938.4), MESURÉ en posant le gel sous le réel pour
 *   lire le compte : `@PersonalScope` sur `notifications.controller.ts`, dont
 *   les onze routes — réglages, centre de notifications et les cinq routes du
 *   canal SMS ajoutées ce jour-là — servent toutes la donnée de celui qui
 *   appelle, bornée à `user_id`. Le réel était à 359 avant ce lot (le gel à 361
 *   laissait deux routes de marge) : les cinq routes SMS l'auraient porté à
 *   364, la déclaration le ramène à 353. Même nature que le 23/08 pour
 *   l'agenda — une absence devenue déclaration, pas un cliquet assoupli.
 * - **343 le 15/09/2026** (#2004.10) : `@PersonalScope` sur
 *   `onboarding/onboarding.controller.ts`, dont chaque route est appelée avec
 *   `@CurrentUser()` et n'opère que sur cette identité. Le réel était à 354
 *   avant ce lot (10 routes historiques bare + `POST /onboarding/refresh`,
 *   neuve) ; la déclaration retire les onze d'un coup. Même nature que le
 *   13/09 pour les notifications.
 * - **339 le 16/09/2026** (intégration de la vague 21), MESURÉ : quatre routes
 *   neuves arrivaient nues depuis trois branches et portaient le compte à 347.
 *   `@WorkspaceRead` sur `GET /contacts/counts/ready-to-process` (#2155.24,
 *   un compte borné à l'espace résolu server-side, rien d'écrit) et sur
 *   `GET /workspaces/timezone` (#1958.2, le fuseau de l'espace, tout membre le
 *   lit) ; `@PersonalScope` sur `profile-context.controller.ts`, dont les six
 *   routes — la neuve `POST entry-strategy` (#2073.8) et cinq historiques — ne
 *   touchent que la ligne de l'appelant. 347 − 2 − 6 = 339.
 *   ⚠️ RESTE NUE ET COMPTÉE, à dessein de ce lot : `PATCH /workspaces/timezone`
 *   (#1958.2). C'est une ÉCRITURE d'espace ; sa porte vit dans le service
 *   (`assertRole(['owner', 'admin'])`), exactement comme sa voisine
 *   `PATCH /workspaces/market`, elle aussi comptée. Lui poser une permission
 *   de la matrice est un choix de vocabulaire (aucune famille « réglages
 *   d'espace » n'existe, et `team:manage` couvre aussi `sales_ops`) : il n'a pas
 *   été fait à l'intégration, il est NOMMÉ ici pour la prochaine main.
 * - **340 le 19/09/2026** (intégration de la vague X2+X3), MESURÉ : une seule
 *   route neuve, `GET /contacts/enrichment-duration-estimate` (#2120.57 /
 *   #2297.23). Nue À DESSEIN, écrit dans son propre docblock : elle ne rend
 *   qu'une médiane agrégée sur TOUS les espaces (`{ estimate: { medianMs,
 *   sampleSize } | null }`), sans `contact_id`/`workspace_id`/`user_id` nulle
 *   part dans la table qui l'alimente (`enrichment_duration_samples`, voir
 *   `table-scopes.ts`) — même nature que `@MarketData` (« aucune ligne
 *   n'appartient à un espace »), mais la table est une mesure PRODUIT, pas un
 *   registre de marché : le marqueur n'a pas été posé pour ne pas étirer son
 *   sens. 339 + 1 = 340.
 * - **342 le 22/09/2026** (intégration de la vague 15), MESURÉ : deux routes
 *   neuves, `POST /demo/lead` et `POST /demo/lead/touch` (#2705.4, #2705.6).
 *   Nues À DESSEIN, comme leurs voisines `GET /demo/status` et
 *   `POST /demo/session` du même contrôleur : elles servent un PROSPECT
 *   anonyme AVANT toute session, il n'a ni espace ni rôle — une permission de
 *   la matrice ne pourrait pas s'y lire. Leur borne est le throttle
 *   (`default-1m`, 5 et 10/min). 340 + 2 = 342.
 * - **344 le 22/09/2026** (intégration de la vague 18), MESURÉ : le réel était
 *   monté à 345 par trois routes neuves. Deux sont NUES À DESSEIN, comme leurs
 *   voisines `GET()`/`GET(':id/interviews')`/`GET(':id/feedback')` du même
 *   contrôleur : `GET :id/timeline` (#2335.3) et `GET :id/consultant-feedback`
 *   (#2335.5) sur `submissions.controller.ts`, où seule l'ÉCRITURE porte
 *   `records:write` — la lecture d'un positionnement déjà scopé à l'appelant
 *   (`SubmissionsService.list*(user.userId, id)`) suit le même patron que ses
 *   quatre voisines déjà comptées. La troisième n'était pas une route neuve
 *   mais un FAUX positif de cette garde : `GET :id/introduction-authorizations`
 *   (#2373.9, `introduction-authorization.controller.ts`) portait bien
 *   `@RequirePermission('records:write')`, mais AVANT `@Get(...)` dans la
 *   source — cette garde tranche les segments à partir du décorateur de
 *   ROUTE, donc un `@RequirePermission` placé au-dessus de lui rejoint le
 *   segment de la route PRÉCÉDENTE (ici `POST` au-dessus), pas de celle qu'il
 *   garde réellement. Corrigé en réordonnant (route d'abord, permission
 *   ensuite, seule convention lue ailleurs dans ce dépôt) plutôt qu'en
 *   comptant une route qui n'a jamais été nue. 342 + 2 = 344.
 * - **345 le 23/09/2026** (#2397.7), MESURÉ : une route neuve,
 *   `POST /briefing/role-fit`. Nue À DESSEIN, comme ses trois voisines du même
 *   contrôleur (`GET /briefing/today`, `GET /briefing/since-last-visit`,
 *   `POST /briefing/first-open-today`) : `BriefingController` ne porte que
 *   `@UseGuards(JwtGuard)`, jamais `WorkspacePermissionGuard` — une préférence
 *   PERSONNELLE (`user_preferences.briefingRoleFit`), au même titre que le
 *   fuseau ou la langue, scopée à `user.userId`, aucun effet d'espace à
 *   autoriser. 344 + 1 = 345.
 * - **348 le 23/09/2026** (intégration de la vague 23), MESURÉ : quatre routes
 *   neuves, dont une corrigée et trois nues À DESSEIN. `POST
 *   /ia-proxy/chat/actions/assign` (#1940.7, attribuer une carte à un
 *   collègue) manquait réellement `@RequirePermission('records:write')` — ses
 *   quatre voisines `chat/threads/*` du même contrôleur le portent toutes pour
 *   la même famille de mutation ; corrigé plutôt que compté. Les trois autres
 *   sont nues À DESSEIN, chacune le dit dans son propre commentaire avant ce
 *   gel : `GET /rag-documents/:id` et `PATCH /rag-documents/:id/scope`
 *   (#1954.19/.22) se comparent explicitement à leur voisine déjà nue `DELETE
 *   /rag-documents/:id` — auteur du jeton, espace résolu serveur, jamais lu du
 *   corps ; `GET /contacts/deliverability` (#2384.5) suit le même patron que
 *   sa voisine déjà nue `GET /contacts/stats`. 345 + 3 = 348.
 * - **345 le 23/09/2026** (#2205.49-52/.62), MESURÉ : une route neuve,
 *   `GET /routines/:key/runs` (l'historique d'exécution d'une routine), avait
 *   fait monter le réel à 349. `@PersonalScope` sur `routines.controller.ts`
 *   retire ses quatre routes d'un coup — `list`, la nouvelle `listRuns`,
 *   `update`, `runDue` — toutes scopées à `user.userId`, aucune donnée
 *   d'espace. Même nature que les notifications (#1938.4) et l'onboarding
 *   (#2004.10). 349 − 4 = 345.
 * - **346 le 25/09/2026** (intégration de la vague 51, #2864/#2856), MESURÉ :
 *   deux routes neuves sur `ats/ats.controller.ts`, `POST
 *   write-requests/:id/assign` et `POST write-requests/:id/snooze`. Nues À
 *   DESSEIN, même posture que leur voisine déjà nue `POST
 *   write-requests/:id/decision` (le docblock de chacune le dit) : aucune
 *   permission déclarée sur la route, la capacité réelle se vérifie dans le
 *   moteur (`AtsWriteService.assign` / `.snooze`), comme pour la décision.
 *   345 + 2 = 347, mais le réel mesuré sur `origin/main` avant fusion était
 *   344 (une résorption antérieure non répercutée sur ce gel) : 344 + 2 = 346.
 * - **349 le 26/09/2026** (intégration du matin C, vagues 18-30), MESURÉ :
 *   trois routes neuves, toutes des LECTURES. `GET :id/cv-versions/compare`
 *   et `GET :id/interview-brief/:opportunityId` sur `consultants.controller.ts`
 *   suivent leurs voisines déjà nues `GET :id/cv-versions`, `GET :id/missions`
 *   et `GET :id/brief/:opportunityId` du même contrôleur : `workspaceId`
 *   résolu depuis l'appelant (`resolveActiveWorkspace(user.userId)`), jamais
 *   lu du corps ou de la query. `GET :id/preview` sur `submissions.controller.ts`
 *   suit le même patron que ses quatre voisines déjà comptées (#2335.3 ci-
 *   dessus) : `SubmissionsService.preview(user.userId, id)`, lecture d'un
 *   positionnement déjà scopé à l'appelant — seule l'ÉCRITURE porte
 *   `records:write` sur ce contrôleur. 346 + 3 = 349.
 * - **351 le 26/09/2026** (intégration du chantier C, vagues 23-32), MESURÉ :
 *   deux routes neuves sur `consultants/talent.controller.ts`, `GET
 *   :id/experiences` (#2328.22) et `GET :id/messages` (#2185.51). Nues À
 *   DESSEIN, même patron que leurs voisines déjà nues `GET :id/skills` et
 *   `GET :id/documents` du même contrôleur : `workspaceId` résolu depuis
 *   l'appelant (`this.talents.workspaceOf(user.userId)`), jamais lu du corps
 *   ou de la query — seules les écritures qui les suivent (`POST
 *   :id/experiences`, `POST :id/messages`) portent `records:write`.
 *   349 + 2 = 351.
 * - **352 le 26/09/2026** (chantier G7), MESURÉ : une route neuve,
 *   `GET /delivery/timesheets/escalations` (#2972, les relevés escaladés vers
 *   le porteur de mission). Nue À DESSEIN, même patron que ses voisines déjà
 *   nues `GET()`, `GET('review')` et `GET('reminders')` du même contrôleur :
 *   `workspaceId` résolu depuis l'appelant (`this.scope(user.userId)`),
 *   jamais lu du corps ou de la query — une lecture d'espace, jamais un envoi.
 *   351 + 1 = 352.
 * - **353 le 26/09/2026** (intégration de clôture, lot c4), MESURÉ : une
 *   route neuve, `GET /capitalisation/workspace-summary` (#2045.8, épopée
 *   #2859 — combien de missions l'espace a déjà tracées, pour l'onboarding).
 *   Nue À DESSEIN, même patron que ses voisines déjà nues `GET accounts/:id`,
 *   `GET proofs/usable` et `GET rex` du même contrôleur :
 *   `workspaceOf(user.userId)` résolu depuis l'appelant, jamais lu du corps
 *   ou de la query — seule l'ÉCRITURE (`proofs`, `rex`, `testimonials`) porte
 *   `records:write` sur ce contrôleur. 352 + 1 = 353.
 * - **355 le 27/09/2026** (intégration matin, fusion soir 2 dans clôture),
 *   MESURÉ : deux routes neuves sur `rfp/rfp.controller.ts`, `POST
 *   /rfp/preview` (#2180.5) et `POST /rfp/confirm` (#2180.6), parties de la
 *   base 351 en parallèle des lots chantier G7/clôture ci-dessus (soir 2
 *   comptait 351 + 2 = 353 sur sa propre branche, avant de voir les deux lots
 *   ci-dessus). Nues À DESSEIN, même patron que leurs voisines déjà nues
 *   `POST /rfp` (`create`) et `POST :id/decision` (`decide`) du même
 *   contrôleur : `RfpController` ne porte que `@UseGuards(JwtGuard)`, jamais
 *   `WorkspacePermissionGuard`, et chaque route ne lit/écrit que ce que
 *   `user.userId` autorise déjà via `RfpService` — aucune famille de
 *   permission « RFP » n'existe dans la matrice. 353 + 2 = 355.
 * - **358 le 27/09/2026** (intégration O), MESURÉ : trois routes neuves sur
 *   `briefing/briefing.controller.ts`, `POST slot-proposals/preview`, `POST
 *   slot-proposals/confirm` et `POST slot-proposals/reject` (#2770,
 *   #2101.19/.21 — proposer puis confirmer/refuser un créneau d'agenda pour
 *   un compte). Nues À DESSEIN, même patron que leurs voisines déjà nues
 *   `GET today`, `GET actions`, `POST first-open-today` et `POST role-fit` du
 *   même contrôleur : `@Controller('briefing')` ne porte que `@UseGuards(JwtGuard)`,
 *   jamais `WorkspacePermissionGuard`, et chaque route ne lit/écrit que ce que
 *   `CurrentUser` autorise déjà (l'agenda et les préférences du seul appelant)
 *   — aucune famille de permission « briefing » n'existe dans la matrice.
 *   355 + 3 = 358.
 * - **359 le 28/09/2026** (épopée #2767, #2099.17-.32), MESURÉ : une route
 *   neuve, `POST /briefing/card-disposition` (Reporter / Pas pertinent / Déjà
 *   traité sur une carte du jour). Nue À DESSEIN, même patron que `POST
 *   role-fit` du même contrôleur : une préférence PERSONNELLE
 *   (`user_preferences.briefingCardDispositions`), scopée à `user.userId`,
 *   aucune écriture sur un objet de l'espace. 358 + 1 = 359.
 * - **359 le 28/09/2026** (#2876, #2433.4), MESURÉ : une route neuve,
 *   `GET rag-documents/image/:objectId` (réouvrir une image jointe au chat,
 *   rangée par `POST rag-documents/extract`). Nue À DESSEIN, même patron que
 *   ses voisines déjà nues `GET()` et `GET :id` du même contrôleur : l'espace
 *   vient de `resolveActiveWorkspace(user.userId)`, jamais du corps ou de la
 *   query, et `StorageService.signedUrlFor` borne déjà la lecture à CET
 *   espace — aucune famille de permission « base de connaissance » ne
 *   distingue lecture et écriture sur ce contrôleur (`extract`/`ingest`
 *   portent `records:write`, les GET n'en ont jamais porté). 358 + 1 = 359.
 * - **359 le 28/09/2026** (épopée #2957, #2181.47), MESURÉ : une route
 *   neuve, `POST /rfp/:id/submitted` (« Marquer soumis », un geste
 *   déclaratif — voir `RfpService.markSubmitted`). Nue À DESSEIN, même
 *   patron que ses voisines déjà nues `POST :id/decision` (`decide`) du
 *   même contrôleur : `RfpController` ne porte toujours que
 *   `@UseGuards(JwtGuard)`, et la route ne lit/écrit que ce que
 *   `user.userId` autorise déjà via `RfpService` — toujours aucune famille
 *   de permission « RFP » dans la matrice. 358 + 1 = 359.
 * - **360 le 28/09/2026 soir** (intégration W), MESURÉ : deux branches
 *   parties de 358 ajoutaient chacune une route nue (V24 et V32) ; 359 + 1.
 * - **361 le 19/10/2026** (SYNC-A), MESURÉ : `GET crm/mirror/accounts/:accountId` (fiche compte, affaires copiées du
 *   CRM). Nue À DESSEIN : lecture seule, même patron que ses voisines déjà nues `GET crm/import/status` et
 *   `GET crm/import/first-import` ; l'accès au compte est vérifié dans le service par l'espace actif.
 *   360 + 1 = 361.
 * - **363 le 22/10/2026** (Théo D team-business.N2), MESURÉ : deux routes neuves sur `objectives/objectives.controller.ts`,
 *   `GET objectives/proposals/mine` (mes propositions de cible en attente) et `PATCH objectives/proposals/:id` (le
 *   membre accepte ou refuse). Nues À DESSEIN, même patron que leurs voisines déjà nues `GET objectives/me` et `PUT
 *   objectives/me` : chacun ne lit et ne répond qu'à SES propositions (`user.userId` comparé à la proposition dans le
 *   service, 403 sinon) — aucune permission d'espace ne distingue « répondre à une cible qu'on me propose ». Les
 *   routes d'ÉQUIPE (`GET`/`POST objectives/proposals`) portent `team:manage`. 361 + 2 = 363.
 * - **365 le 25/10/2026** (#4546, plusieurs boîtes mail par commercial), MESURÉ : deux routes neuves,
 *   `GET google/connections` et `GET microsoft/connections`, qui listent les boîtes du commercial pour
 *   l'écran Intégrations. Nues À DESSEIN, même patron que TOUTES leurs voisines de ces deux contrôleurs
 *   (aucune n'a jamais porté de permission d'espace) : une boîte mail est une ressource PERSONNELLE, pas
 *   une ressource d'espace. Elles sont gardées par `@UseGuards(JwtGuard)` et ne lisent que
 *   `user.userId` — aucun paramètre d'appelant ne désigne quelqu'un d'autre, donc rien à cloisonner par
 *   permission. L'isolement entre collègues est tenu ailleurs, par `findPersonalConnection`
 *   (`common/util/personal-connection.ts`) et sa garde `personal-connection.spec.ts`.
 *   ⚠️ Le `DELETE` des deux contrôleurs n'est PAS neuf : il gagne un `:connectionId?` optionnel, il ne
 *   compte pas. 363 + 2 = 365.
 * - **388 le 28/10/2026** (#4682), MESURÉ — et AUCUNE de ces 23 routes n'est neuve : c'est la GARDE qui se trompait.
 *   `ALTERNATIVE_GUARDS` exemptait un fichier dès que `@PersonalScope` ou `@MarketData` y APPARAISSAIT — sur une seule
 *   méthode, ou dans un commentaire — alors que le décorateur interdit explicitement l'usage qui blanchit un contrôleur.
 *   `GET mailbox/senders` (#4546.5) a rendu l'erreur visible : la déclarer en `@PersonalScope` de méthode aurait fait
 *   taire les onze autres routes de la boîte mail. Les marqueurs de contrôleur n'exemptent plus que posés sur la CLASSE
 *   (commentaires retirés) ; sur une méthode ils déclarent SA route. Fichiers remis à la maille route :
 *   `copilot-bridge.controller.ts` (une simple mention en commentaire l'exemptait, 111 routes), `memory.controller.ts`,
 *   `market-watch.controller.ts`, `technology-radar.controller.ts`, `mailbox.controller.ts`. 365 (gel) + 1 route nue
 *   arrivées depuis (`GET ats/oauth/callback`, voir #4688 — retour OAuth d'un navigateur, hors de ce lot) + 22 routes
 *   que la garde ne voyait pas = 388. Le cliquet ne remonte pas de lui-même : il DIT enfin ce qu'il ne disait pas.
 */
const BARE_ROUTES_AT_FREEZE = 388

function bareRoutes(): string[] {
  const out: string[] = []
  for (const file of controllers(MODULES)) {
    const raw = readFileSync(file, 'utf8')
    // ⚠️ Les exemptions de FICHIER se lisent sur la source brute, volontairement :
    // elles sont un CONSTAT figé (`ALTERNATIVE_GUARDS`, la garde de classe), et
    // les recalculer sur une source nettoyée rouvrirait treize contrôleurs que
    // personne n'a mesurés — « un cas non mesuré ne se traite pas en masse ».
    // Seule la RECHERCHE DE ROUTES est corrigée ici, parce que c'est elle qui
    // se trompait. Voir `stripComments`.
    const split = raw.indexOf('export class')
    // #4682 — `@PersonalScope` / `@MarketData` qualifient un CONTRÔLEUR ENTIER : ils n'exemptent le fichier que posés
    // AU NIVEAU DE LA CLASSE (avant `export class`, commentaires retirés). Posé sur une méthode — ou cité dans un
    // commentaire — le marqueur ne déclare que SA route (`routeDeclarations`), il ne blanchit pas les autres.
    const classLevel = split < 0 ? '' : stripComments(raw.slice(0, split))
    const exemptsFile = (guard: string): boolean =>
      CLASS_LEVEL_MARKERS.includes(guard) ? classLevel.includes(guard) : raw.includes(guard)
    if (ALTERNATIVE_GUARDS.some(exemptsFile)) continue
    if (split < 0) continue
    // Une garde de CLASSE couvre toutes les routes du contrôleur : ce qui est
    // écrit avant `export class` s'applique à tout ce qui suit.
    if (ROUTE_DECLARATIONS.some(declaration => raw.slice(0, split).includes(declaration))) continue
    const body = stripComments(raw.slice(split))
    const starts = [...body.matchAll(ROUTE)].map(match => match.index as number)
    starts.forEach((start, index) => {
      const segment = body.slice(start, starts[index + 1] ?? body.length)
      if (![...ROUTE_DECLARATIONS, '@PersonalScope'].some(declaration => segment.includes(declaration))) {
        out.push(`${file.slice(MODULES.length + 1)} ${segment.slice(0, segment.indexOf('\n'))}`)
      }
    })
  }
  return out
}

describe('GA-05 — la maille ROUTE, et non la maille fichier', () => {
  const bare = bareRoutes()

  it('le nombre de routes sans permission ne remonte pas', () => {
    if (bare.length > BARE_ROUTES_AT_FREEZE) {
      throw new Error(
        [
          `${bare.length} routes sans permission déclarée, contre ${BARE_ROUTES_AT_FREEZE} au gel.`,
          '',
          'Une route ajoutée dans un contrôleur qui déclare DÉJÀ une permission ailleurs',
          'passe les trois tests ci-dessus : ils comptent par fichier. Ajoute',
          '`@RequirePermission` à la route neuve, ou corriges-en une autre.',
        ].join('\n'),
      )
    }
    expect(bare.length).toBeLessThanOrEqual(BARE_ROUTES_AT_FREEZE)
  })

  it('la garde lit bien des routes — un compte à zéro passerait au vert pour toujours', () => {
    expect(bare.length).toBeGreaterThan(50)
  })

  /* ── Les trois preuves du découpage corrigé (01/09/2026) ───────────────── */

  it('N’ATTRAPE PAS ce qu’elle ne vise pas : un `@Get(` cité dans un commentaire', () => {
    // Le défaut réel : un docblock qui EXPLIQUE le piège des routes littérales
    // écrit « `@Get()` nu », et la garde le comptait comme une route.
    const documented = [
      '/** ⚠️ `StaffingController` déclare un `@Get()` nu — voir la note. */',
      "@Get('mission-drift')",
      '@WorkspaceRead()',
      'missionDrift() {}',
    ].join('\n')
    expect(stripComments(documented)).not.toContain('@Get()')
    // Et la route RÉELLE, elle, survit au nettoyage.
    expect(stripComments(documented)).toContain("@Get('mission-drift')")
  })

  it('retire aussi un commentaire de LIGNE, sans casser une URL `https://`', () => {
    // Le `[^:]` du motif existe pour ça : `//` précédé d'un `:` est une URL.
    expect(stripComments("const a = 1 // @Get('x')\n")).not.toContain('@Get(')
    expect(stripComments("const url = 'https://exemple.fr/a'\n")).toContain('https://exemple.fr/a')
  })

  it('SAIT DIRE NON : une route sans déclaration est bien vue comme nue', () => {
    // Le témoin négatif — sans lui, un `stripComments` trop gourmand (qui
    // avalerait tout le fichier) rendrait la garde éternellement verte.
    const bareSample = ["@Get('sans-permission')", 'sansPermission() {}'].join('\n')
    const stripped = stripComments(bareSample)
    expect(stripped).toContain("@Get('sans-permission')")
    expect(ROUTE_DECLARATIONS.some(declaration => stripped.includes(declaration))).toBe(false)
  })

  it('#4682 — un marqueur de contrôleur posé sur UNE méthode ne blanchit pas le fichier', () => {
    // `GET mailbox/senders` porte `@PersonalScope` de méthode ; ses voisines restent comptées, elle non.
    const mailbox = bare.filter(route => route.includes('mailbox.controller.ts'))
    expect(mailbox.length).toBeGreaterThan(5)
    expect(mailbox.some(route => route.includes("@Get('senders')"))).toBe(false)
    expect(mailbox.some(route => route.includes("@Get('status')"))).toBe(true)
  })

  it('les deux routes nues MESURÉES et non corrigées sont toujours là où on les a laissées', () => {
    // Si l'une disparaît de la liste, c'est que quelqu'un l'a corrigée : le
    // cliquet doit alors descendre, et ce test le rappelle. Si elle change de
    // nom, la note du gel ci-dessus est périmée et doit être réécrite.
    const named = bare.filter(
      route =>
        (route.includes('briefing.controller.ts') && route.includes("@Get('today')")) ||
        (route.includes('workspace.controller.ts') && route.includes("@Get('members')")),
    )
    expect(named).toHaveLength(2)
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  D39 — le marqueur de lecture d'espace DÉCLARE, il n'exempte pas           */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Les routes marquées `@WorkspaceRead` au 28/08/2026, nommées une par une.
 *
 * Une LISTE et pas un compte, contrairement au cliquet ci-dessus : ces routes
 * sortent du compte des routes nues, donc le cliquet ne les protège plus. Sans
 * cette liste, retirer le marqueur d'une route la rendrait nue **et** ferait
 * baisser le compte — le cliquet resterait vert, et personne ne verrait rien.
 */
const WORKSPACE_READ_ROUTES: readonly string[] = [
  // Théo D team-recherches (22/10/2026) — les recherches conservées de l'espace, lisibles par TOUT membre
  // (Louis 22/10, Q3). Une lecture bornée à l'espace résolu server-side ; l'écriture voisine déclare `records:write`.
  'team-research/team-research.controller.ts @Get()',
  // #2877 (02/10/2026) — l'écran agrégat d'apprentissage des messages : des
  // décomptes sur l'espace résolu depuis le TOKEN, aucun corps de message,
  // aucune écriture (adopter une règle reste un geste d'opérateur).
  "analytics/message-learning.controller.ts @Get('summary')",
  // #2395 (23/09/2026) — l'objet Action canonique : mes actions ouvertes des
  // trois maisons (plan de Laura, tâches, appels) projetées dans un contrat.
  // Espace résolu server-side et passé à chaque lecture ; aucun appel modèle,
  // aucun crédit, aucune écriture — chaque action se modifie dans sa maison.
  "action-os/canonical-actions.controller.ts @Get('actions')",
  // #2293 (23/09/2026) — le lot d'analyses multi-comptes : la liste des lots de
  // l'espace et UN lot, bornés à l'espace résolu server-side. Aucun crédit,
  // aucun lancement : lire un lot relit l'état de ses analyses (comme
  // `GET /analysis/status/:id`) et ne persiste que cet état dérivé. Les cinq
  // gestes du contrôleur déclarent `analysis:run` à côté.
  'analysis-batches/analysis-batches.controller.ts @Get()',
  "analysis-batches/analysis-batches.controller.ts @Get(':id')",
  // #2284.67-.69 (24/09/2026) — l'historique des corrections d'identité d'UN
  // compte, borné à l'espace ET au périmètre résolus server-side ; rien n'est
  // écrit. Le geste (`POST`) déclare `records:write` à côté.
  "accounts/entity-resolution-corrections.controller.ts @Get(':id/entity-resolution/corrections')",
  // #2366 / #2382 (22/09/2026 soir) — le modèle canonique de l'outreach et son
  // centre d'approbation. Cinq lectures bornées à l'espace résolu server-side
  // (messages, un message, son historique, les appels, l'historique d'un
  // appel) : aucun appel modèle, aucun crédit, aucune écriture. Chaque écriture
  // du contrôleur déclare `messages:send` à côté.
  "outreach/outreach-message.controller.ts @Get('messages')",
  "outreach/outreach-message.controller.ts @Get('messages/:id')",
  "outreach/outreach-message.controller.ts @Get('messages/:id/transitions')",
  "outreach/outreach-message.controller.ts @Get('call-tasks')",
  "outreach/outreach-message.controller.ts @Get('call-tasks/:id/transitions')",
  // #2124.49-.55 (intégration R, 15/09/2026) — ce que Laura PROPOSE pour la preuve
  // d'une mission. Quatre `findOne` bornés à l'espace (mission, besoin, REX,
  // preuve), un producteur déterministe : aucun appel modèle, aucun crédit,
  // aucune écriture, pas même un brouillon. L'écriture est le `PATCH proofs/:id`
  // voisin, qui déclare `records:write`. La route arrivait NUE dans le lot et
  // portait le compte à 354 contre 353 au gel.
  "capitalisation/capitalisation.controller.ts @Get('missions/:id/proof-proposal')",
  // #3295 (lot EP1, 02/10/2026) — l'apprentissage contrôlé : trois lectures
  // d'espace (REX de perte, propositions, règles promues), bornées à l'espace
  // résolu server-side. Aucun appel modèle, aucun crédit, aucune écriture ; les
  // deux gestes (`decide`, `activation`) déclarent `team:manage` juste à côté.
  "capitalisation/workspace-method-rules.controller.ts @Get('lost-deal-rex')",
  "capitalisation/workspace-method-rules.controller.ts @Get('lost-deal-rule-proposals')",
  "capitalisation/workspace-method-rules.controller.ts @Get('workspace-method-rules')",
  // #2120.30-38 (intégration S, 15/09/2026) — le chemin recommandé d'un compte,
  // classé sur neuf axes nommés. `rankForAccount` borne à `workspace_id` : aucun
  // appel modèle, aucun crédit, aucune écriture. La route arrivait NUE dans le
  // lot et aurait fait remonter le compte des routes nues.
  "contacts/contacts.controller.ts @Get('account/:accountId/ranking')",
  // #2155.24/.25 (intégration de la vague 21, 16/09/2026) — le badge « Contacts »
  // de la navigation. Un `count` borné à l'espace résolu server-side et au
  // périmètre de business unit de l'appelant : aucun appel modèle, aucun
  // crédit, aucune écriture. La route arrivait NUE dans le lot.
  "contacts/contacts.controller.ts @Get('counts/ready-to-process')",
  // #1958.2 (intégration de la vague 21, 16/09/2026) — le fuseau RÉSOLU de
  // l'espace actif, que tout membre lit (Laura et les rendez-vous en dépendent).
  // Un `findOne` sur l'espace résolu server-side, rien d'écrit. Son écriture
  // voisine, `PATCH timezone`, reste nue et comptée — voir le gel à 339.
  "workspace/workspace.controller.ts @Get('timezone')",
  // #2172 (15/09/2026) — ce que l'espace a décidé des pistes d'un dossier. Un
  // `find` borné à (espace, compte) : aucun appel modèle, aucun crédit, aucune
  // écriture. La route arrivait NUE dans le lot et aurait fait remonter le
  // compte des routes nues.
  "qualification-leads/qualification-leads.controller.ts @Get(':id/qualification-leads/decisions')",
  // #1939 (12/09/2026) — le message vocal de Laura. `status` et la réécoute sont
  // des lectures d'espace (la réécoute a la portée du texte du fil). La
  // TRANSCRIPTION écrit l'enregistrement de CETTE personne : elle suit la règle
  // du texte (#1939.13) — `POST chat` et `POST chat/messages` sont ouverts à tout
  // membre, `viewer` compris ; `records:write` la lui aurait fermée.
  "ia-proxy/ia-proxy.controller.ts @Get('chat/voice/status')",
  "ia-proxy/ia-proxy.controller.ts @Post('chat/voice/transcribe')",
  "ia-proxy/ia-proxy.controller.ts @Get('chat/messages/:id/voice')",
  // #1636 (11/09/2026) — « ton entreprise dans la mémoire marché » : une lecture
  // du profil de SA PROPRE société croisée avec un corpus PARTAGÉ en lecture
  // seule. Rien n'est écrit, aucun crédit n'est débité, rien ne sort de
  // l'espace — et le dépôt n'a aucune permission qui décrive cette lecture-là.
  "esn-profile/esn-profile.controller.ts @Get('market-memory')",
  // #1931 L2 (13/09/2026) — les cartes de Laura : la liste et une carte. Les fils
  // de conversation sont partagés par l'équipe, un coéquipier LIT les cartes ;
  // il n'agit dessus que par les gestes, qui déclarent `records:write` et que le
  // service réserve à l'auteur. La seule écriture possible à la lecture est
  // l'enregistrement idempotent d'une issue DÉJÀ observée par la file
  // d'enrichissement — aucun effet neuf, aucun crédit.
  "action-os/action-os.controller.ts @Get('cards')",
  "action-os/action-os.controller.ts @Get('cards/:runId')",
  "accounts/accounts.controller.ts @Get('sectors')",
  "accounts/accounts.controller.ts @Get('companies')",
  "accounts/accounts.controller.ts @Get('hygiene')",
  "accounts/accounts.controller.ts @Get('similar-to-explore')",
  "accounts/accounts.controller.ts @Get('signals')",
  "accounts/accounts.controller.ts @Get('needs')",
  // Le studio de proposition : marqueur de CLASSE, ses deux routes sont des
  // lectures. Il portait `@RequirePermission('data:export')` faute de mieux, ce
  // qui fermait la porte à `viewer` et `tech_admin`.
  'proposals/proposals.controller.ts @Get()',
  "proposals/proposals.controller.ts @Get(':projectId')",
  // Les agrégats de propagation SANS montant gardé (PDF 2 §4) : le « sur N
  // missions », le tarif vendu moyen, « a signé 2 missions », « placé 4 fois ».
  // Une lecture d'espace au sens strict — les deux agrégats qui portent un
  // montant gardé, eux, vivent sur `FinanceController` sous `finance:read`.
  "delivery/delivery.controller.ts @Get('propagation')",
  // Le bandeau du portefeuille (31/08/2026) : missions actives, personnes en
  // poste, et le nombre de missions sans affectation enregistrée — qui dit à
  // l'écran si son « 0 freelance » est une mesure ou un trou. Trois
  // dénombrements d'espace, aucun montant, donc rien à garder derrière
  // `finance:read` ; et `records:write` fermerait la porte au `viewer`, qui
  // lit déjà `GET /delivery/missions`.
  "delivery/delivery.controller.ts @Get('staffing-headline')",
  // La fiche besoin (02-fiche-besoin.png, 31/08/2026) : ses documents, ses
  // étapes et son historique sont des LECTURES d'espace. Le dépôt n'a pas de
  // `records:read` — seulement `records:write` — donc les fermer derrière une
  // permission d'écriture aurait interdit la lecture à qui ne peut qu'écrire
  // nulle part, c'est-à-dire à `viewer`.
  "projects/projects.controller.ts @Get('needs/:needId/documents')",
  // 31/08/2026 — ce que le STOCKAGE porte pour ce besoin, et l'ouverture d'une
  // pièce. Deux lectures d'espace : le second signe une URL de cinq minutes,
  // mais seulement après avoir retrouvé le besoin DANS l'espace et le document
  // sur CE besoin. Pas de `finance:read` — un devis porte le montant de
  // l'affaire, que la fiche besoin affiche déjà à qui la lit.
  "projects/projects.controller.ts @Get('needs/:needId/document-files')",
  "projects/projects.controller.ts @Get('needs/:needId/documents/:documentId/download')",
  "projects/projects.controller.ts @Get('needs/:needId/steps')",
  "projects/projects.controller.ts @Get('needs/:needId/history')",
  // Les cinq blocs de l'onglet Missions d'un dossier de compte (PDF 4 §3.3,
  // BEL-BO-006). Même cas que `GET /delivery/missions`, dont le docblock le dit
  // en toutes lettres : « la LISTE est légitime pour tout le monde ; c'est le
  // champ financier qui se garde, pas la lecture ». La marge sort `null` sans
  // `finance:read` (D45) et le droit voyage avec la réponse — la porte, elle,
  // n'a rien à fermer à `viewer` ni à `tech_admin` sur un dossier de compte
  // qu'ils lisent déjà entièrement.
  "delivery/delivery.controller.ts @Get('accounts/:accountId/missions')",
  // Ce que le formulaire du vivier demande PENDANT la saisie (BEL-BO-003) :
  // « qui, dans cet espace, pourrait déjà être cette personne ? » et « comment
  // ce référentiel écrirait-il cette compétence ? ». Deux lectures pures — elles
  // n'écrivent rien, ne fusionnent rien, ne débitent rien — sur la donnée de
  // l'espace. `records:write` les fermerait à `viewer`, qui lit déjà le vivier
  // entier par `GET /talents`.
  "consultants/talent.controller.ts @Get('duplicates')",
  "consultants/talent.controller.ts @Get('skill-suggestion')",
  // Les dossiers de facturation des comptes (26/08/2026) : quelle entité du
  // CLIENT reçoit la facture, sous quelles conditions de règlement, jusqu'à
  // quand. Une lecture d'espace, sans aucun montant — ni TJM, ni marge, ni
  // préparatoire — donc rien à garder derrière `finance:read` : « ce client n'a
  // pas de contact de facturation » est un constat d'ops. Même lecture, et pour
  // la même raison, que `GET /delivery/invoice-readiness`, qui est nue.
  "account-entities/account-entities.controller.ts @Get('entities/billing-profiles')",
  // Le tableau de bord Finance (31/08/2026). La SÉRIE des photos mensuelles est
  // l'historique de dénombrements d'hygiène que `/pilotage` affiche déjà nus :
  // aucun montant, aucun coût, donc rien que `finance:read` ait à fermer — et
  // la fermer aurait interdit à `viewer` et `sales` la variation d'un chiffre
  // dont ils voient la valeur. L'OBJECTIF de marge est une cible que l'espace
  // s'est fixée, pas un montant : le lire dit contre quoi on est lu, et c'est
  // ce qu'un commercial qui voit son propre chiffre (D1) doit pouvoir savoir.
  // ⚠️ Sa SAISIE, elle, n'est PAS ici : `@Put('finance-target')` déclare
  // `finance:write` — « régler le seuil d'alerte de marge » est la permission
  // que sa docblock nomme, et se fixer une cible est le même geste.
  "pilotage/pilotage.controller.ts @Get('metric-series')",
  "pilotage/pilotage.controller.ts @Get('finance-target')",
  // La file de revérification de l'organigramme (31/08/2026) : ce qui est
  // périmé ou jamais vérifié, DÉRIVÉ du graphe déjà stocké. Aucun appel IA,
  // aucun crédit, aucune écriture — et le dépôt n'a pas d'`analysis:read` :
  // seulement `analysis:run`, qui fermerait une simple lecture à `viewer`, qui
  // ouvre déjà le dossier entier.
  "analysis/analysis.controller.ts @Get(':accountId/org-freshness')",
  // L'HISTORIQUE des photos mensuelles (31/08/2026). Une lecture d'espace au
  // sens le plus strict : elle rend des points datés déjà écrits, n'écrit rien,
  // ne débite rien, et ne porte AUCUN montant — la photo ne garde que des
  // dénombrements, précisément pour ne pas devenir un second endroit où
  // re-tenir `redactFinance`. La fermer derrière `finance:read` l'aurait
  // interdite à `viewer` et à `sales`, qui lisent déjà ces mêmes chiffres, nus,
  // sur `/pilotage`.
  "pilotage/pilotage.controller.ts @Get('metric-series')",
  // La file des paiements SORTANTS (31/08/2026, corrigé le 31/08/2026) : même
  // cas que `GET /delivery/accounts/:accountId/missions` juste au-dessus,
  // « la LISTE est légitime pour tout le monde, c'est le champ financier qui se
  // garde ». Cette route avait pourtant reçu `@RequirePermission('finance:read')`
  // par erreur (97ab491d9) — voir le docblock du contrôleur pour le récit.
  'payments/outgoing-payments.controller.ts @Get()',
  // La cession de créance (31/08/2026) : même revirement que ci-dessus, sur le
  // domaine affacturage — voir le docblock de `FactoringController`. Les
  // écritures (`finance:write`) et l'export ne bougent pas.
  'factoring/factoring.controller.ts @Get()',
  // #2151.59 (intégration de la vague M, 18/09/2026) — les notes de terrain
  // d'un candidat Découvrir. `workspaceId` résolu server-side
  // (`WorkspaceContextService.resolveActiveWorkspace`), aucun appel modèle,
  // aucun crédit, aucune écriture. La route arrivait NUE dans le lot et
  // portait le compte à 340 contre 339 au gel.
  "discover-notes/discover-candidate-notes.controller.ts @Get(':siren/notes')",
  // #2887 (#2371.8, 28/09/2026) — la revue d'un CV poussé à un partenaire.
  // Même raison que les lectures voisines de ce fichier : une LISTE lue par
  // qui a accès à l'espace, aucun `records:read` n'existe, et `records:write`
  // fermerait la porte à `viewer`. La route arrivait NUE dans le lot et
  // portait le compte à 359 contre 358 au gel.
  'partner-cv-push/partner-cv-push.controller.ts @Get()',
]

describe('GA-05 — @WorkspaceRead déclare une route, il n’exempte pas un contrôleur', () => {
  const sources = controllers(MODULES).map(file => ({
    path: file.slice(MODULES.length + 1),
    source: readFileSync(file, 'utf8'),
  }))
  const marked = sources.filter(c => c.source.includes('@WorkspaceRead('))

  it('la garde LIT quelque chose — le marqueur est réellement posé dans le dépôt', () => {
    // Sans ceci, tous les tests ci-dessous passeraient sur un corpus vide : le
    // jour où quelqu'un retire le dernier `@WorkspaceRead`, ils resteraient
    // verts en ne vérifiant plus rien.
    expect(marked.length).toBeGreaterThan(0)
    expect(marked.map(c => c.path).sort()).toEqual([
      'account-entities/account-entities.controller.ts',
      'account-facts/account-facts-export.controller.ts',
      'account-facts/account-facts.controller.ts',
      'accounts/accounts.controller.ts',
      // #2284.67-.69 — l'historique des corrections d'identité d'un compte ;
      // son geste déclare `records:write` (voir WORKSPACE_READ_ROUTES).
      'accounts/entity-resolution-corrections.controller.ts',
      'accounts/workspace-progress.controller.ts',
      // Les cartes de Laura (13/09/2026, #1931 L2) : deux lectures d'espace (les
      // fils sont partagés) ; ses six gestes déclarent `records:write` juste à côté.
      'action-os/action-os.controller.ts',
      // #4016 L6 (11/10/2026) — les réglages d'autonomie de l'Action OS : la
      // lecture est ouverte à tout membre ; l'écriture déclare `team:manage`.
      'action-os/approval-settings.controller.ts',
      // #2395 (23/09/2026) — l'objet Action canonique : UNE lecture de mes actions
      // ouvertes (plan, tâches, appels), espace résolu server-side, rien d'écrit.
      'action-os/canonical-actions.controller.ts',
      // #2123.46 — `GET /plan-items/mine` : MES actions ouvertes, tous comptes
      // confondus, dans l'espace résolu server-side. Une lecture, rien n'est
      // écrit ; `POST` (créer) et `PATCH` (cocher) du même contrôleur déclarent
      // `records:write` juste à côté.
      'actions/plan-items.controller.ts',
      'admin-docs/admin-docs.controller.ts',
      // L'administration des ventes (31/08/2026) : ses deux lectures rendent la
      // file de l'espace et n'écrivent rien ; son unique écriture déclare
      // `records:write` juste à côté.
      'adv/adv.controller.ts',
      // #2293 — le lot d'analyses : deux lectures d'espace, ses cinq gestes
      // déclarent `analysis:run` (voir WORKSPACE_READ_ROUTES).
      'analysis-batches/analysis-batches.controller.ts',
      // La file de revérification de l'organigramme (31/08/2026) : une lecture
      // dérivée du graphe stocké, sans écriture ni crédit — voir sa ligne dans
      // WORKSPACE_READ_ROUTES. Le contrôleur garde par ailleurs toutes ses
      // autres routes par `@RequirePermission` : le marqueur DÉCLARE une route,
      // il n'exempte pas le contrôleur.
      'analysis/analysis.controller.ts',
      // #2877 — l'agrégat d'apprentissage des messages de l'espace : une lecture, sans écriture
      // (voir sa ligne dans WORKSPACE_READ_ROUTES).
      'analytics/message-learning.controller.ts',
      'briefing/briefing.controller.ts',
      'business-unit/business-unit.controller.ts',
      // La proposition de preuve (15/09/2026, #2124.49-.55) : une lecture
      // déterministe, sans écriture ni crédit — voir sa ligne dans
      // WORKSPACE_READ_ROUTES. Ses écritures déclarent `records:write` à côté.
      'capitalisation/capitalisation.controller.ts',
      // #3295 — ses trois lectures sont listées dans WORKSPACE_READ_ROUTES ; ses
      // deux gestes déclarent `team:manage`.
      'capitalisation/workspace-method-rules.controller.ts',
      'chat-eval-sampling/chat-eval-sampling.controller.ts',
      // #2035.10 / #2035.11 — fusionné le 21/09 : `GET reverse-market/settings`
      // a quitté ce contrôleur pour `workspace/workspace-reverse-market-settings.controller.ts`
      // (listé plus bas), le seul endroit où CE réglage vit désormais (GA-26).
      // #2968 (25/09/2026) — un `@WorkspaceRead()` DIFFÉRENT y est reposé
      // depuis : `GET consultants/:id/reverse-market/dismissals`, les
      // entreprises que l'appelant a masquées sur ce consultant — un geste
      // personnel et gratuit, sans montant. Ses deux écritures (masquer,
      // démasquer) déclarent `records:write` juste à côté.
      // #1952.6 (épopée #2844, lot SRC5 28/09 soir) — l'état d'un job d'export en
      // lot : une lecture, l'écriture (lancer, télécharger) déclare `records:write`
      // + `@DataExit()` juste à côté (#2081.14).
      'consultants/bulk-export.controller.ts',
      // #2844 (intégration E) — `GET cv-rewrite/bulk/:jobId` : l'état d'un lot de
      // réécriture déjà lancé, espace résolu server-side ; le lancement déclare
      // `records:write` juste à côté.
      'consultants/consultants.controller.ts',
      // #1952.3 (épopée #2844, lot SRC5 28/09 soir) — même règle : l'état d'un job
      // de matching massif est une lecture, le lancement déclare `records:write`.
      'consultants/matching/bulk-matching.controller.ts',
      'consultants/matching/matching.controller.ts',
      'consultants/record-links.controller.ts',
      'consultants/talent-recruitment.controller.ts',
      'consultants/talent.controller.ts',
      // #2288.2 (décision Louis, 18/09/2026) — les ÉTATS de vérification, lus par
      // tout membre : aucun montant dans la réponse, aucun crédit, aucune
      // écriture. Le devis et le reçu, eux, déclarent `analysis:run` à côté.
      'consultants/verification/market-verification.controller.ts',
      // #2159.35 — l'historique des corrections de rapprochement d'un contact ;
      // son geste déclare `records:write` (voir WORKSPACE_READ_ROUTES), même
      // patron que `accounts/entity-resolution-corrections.controller.ts`.
      'contacts/contact-resolution-corrections.controller.ts',
      // Le chemin recommandé (15/09/2026, #2120.30-38) : une lecture classée,
      // sans écriture ni crédit — voir sa ligne dans WORKSPACE_READ_ROUTES. Les
      // écritures du contrôleur déclarent leur permission juste à côté.
      'contacts/contacts.controller.ts',
      // #2454 — le contrat de contexte de Découvrir / Analyser : une lecture
      // de l'état réel (profil, CRM branché), sans écriture ni crédit.
      'context-contract/context-contract.controller.ts',
      // Le noyau CRM (01/09/2026) : les deux lectures `:id/conflicts` rendent
      // les contradictions ouvertes d'une fiche (PDF 6 §5.3). Elles n'écrivent
      // rien — trancher une contradiction est une correction humaine ordinaire,
      // et elle passe par le `PATCH :id` voisin, qui déclare `records:write`.
      'crm-core/crm-core.controller.ts',
      // Le SLA d'étape du pipe (01/09/2026, PDF 3 §3.5) : sa LECTURE rend un
      // réglage d'espace que tout membre doit connaître pour lire le board — la
      // matrice n'a aucune permission de lecture à lui donner. Son écriture, à
      // deux lignes de là, déclare `team:manage` : changer un seuil change ce
      // que TOUT LE MONDE voit dans la file d'interventions.
      'crm-core/deal-stage-sla.controller.ts',
      // #4016 L6 (11/10/2026) — les fusions automatiques en vigueur : une lecture
      // d'espace ; « Annuler la fusion » déclare `records:write` juste à côté.
      'crm-core/governance.controller.ts',
      // SYNC-A (19/10/2026) — `GET /crm/mirror/accounts/:accountId` : les affaires et activités MIROIR
      // du compte, une lecture d'espace bornée par `crm:read` (vérifiée dans la méthode, comme Laura).
      'crm-mirror/crm-mirror.controller.ts',
      // #2031.5 / #2045.5 — `GET /crm/vocabulary` lit le vocabulaire BRUT du CRM
      // branché de CET espace. Lecture pure : aucune écriture, aucun crédit, rien
      // ne sort de l'espace — et aucune permission de la matrice ne la décrit
      // (`integrations:manage` la fermerait à `viewer` et `tech_admin`).
      'crm/crm.controller.ts',
      // #4193 — `GET /crm-counters` : les totaux Affaires / Talents / Missions, une
      // lecture d'espace ; le revenu sécurisé n'est calculé que sous `finance:read`.
      'delivery/crm-counters.controller.ts',
      'delivery/delivery.controller.ts',
      // SENTRY-WEB-2 (20/10/2026) — `GET collections` : la fenêtre d'encaissements
      // en un appel, mêmes lignes que `GET /` (nue, voir plus haut) mois par mois ;
      // le champ financier reste rédigé par `canReadFinance`. Ses écritures
      // déclarent `finance:write` / `records:write` juste à côté.
      'delivery/invoice-readiness.controller.ts',
      // #2422.6 (08/10/2026, épopée #2869, lot R24) — `GET
      // accounts/:accountId/contracts/:contractId/upload-links` : lister les
      // liens signés d'un contrat de l'espace résolu côté serveur. Lecture
      // pure (le jeton brut n'y figure jamais, seul le résumé) ; générer et
      // révoquer un lien déclarent `records:write` juste à côté.
      'delivery/legal-contract-upload-link.controller.ts',
      // #2422.4 (27/09/2026, épopée #2869) — `GET accounts/:id/contracts` :
      // lister les contrats juridiques d'un compte de l'espace résolu côté
      // serveur. Lecture pure, rien n'est écrit ; poser un contrat déclare
      // `records:write` juste à côté (même permission que les avenants).
      'delivery/legal-contract.controller.ts',
      // #2423 (23/09/2026) — `GET missions/:id/amendments` : lister les
      // avenants (changements TJM/société/site/pause) d'une mission de
      // l'espace résolu côté serveur. Lecture pure, rien n'est écrit ;
      // proposer un avenant et changer son statut déclarent `records:write`
      // juste à côté (même permission que le statut de mission).
      'delivery/mission-amendment.controller.ts',
      // #3269 (BEL-SC-240) — `GET missions/:id/delivery-milestones` et
      // `GET missions/:id/reverse-market-readiness` : lecture pure, projetée
      // depuis les maisons canoniques existantes, bornée à l'espace résolu
      // côté serveur. Déclarer un jalon déclare `records:write` juste à côté.
      'delivery/mission-delivery-milestones.controller.ts',
      // #2414 (LAU-FINAL-128) / épopée #2986 — `GET missions/:id/end-checklist` :
      // la checklist de sortie (client/consultant/interne), lecture pure,
      // bornée à l'espace résolu côté serveur. Ses gestes (cocher un item,
      // poser le motif, déclarer une interruption) déclarent `records:write`
      // juste à côté, comme `mission-status.controller.ts`.
      'delivery/mission-end.controller.ts',
      // #2407.3 (22/09/2026) — `GET missions/:id/field-sources` : la source et
      // la date de la dernière écriture des dates et du TJM. Lecture pure,
      // bornée à l'espace résolu côté serveur, aucun montant au-delà du TJM
      // vendu (lisible par tout l'espace, comme sur la fiche).
      'delivery/mission-status.controller.ts',
      // #2151.59 (18/09/2026) — `GET :siren/notes` : les notes de terrain d'un
      // candidat Découvrir. Le `workspaceId` est résolu server-side
      // (`WorkspaceContextService.resolveActiveWorkspace`, jamais pris dans
      // l'URL) et borne le SELECT ; aucune écriture, aucun crédit. Sa voisine
      // `POST :siren/notes` déclare `records:write` juste à côté.
      'discover-notes/discover-candidate-notes.controller.ts',
      // #1636 — le bloc « ton entreprise dans la mémoire marché » de Réglages › Profil.
      'esn-profile/esn-profile.controller.ts',
      // #3754 — `GET esn-profile/target-personas` : les postes cibles de SA société, lecture du profil comme
      // `GET /esn-profile` (tout rôle, `viewer` compris) ; son import déclare `team:manage` juste à côté.
      'esn-profile/esn-target-personas.controller.ts',
      // Métiers placés DÉDUITS (11/10/2026) — `GET esn-profile/placed-roles-inference` : les métiers
      // déduits du profil de SA société et leurs indices, lecture comme `GET /esn-profile` (tout
      // rôle) ; « Retirer » déclare `team:manage` juste à côté.
      'esn-profile/placed-roles-inference.controller.ts',
      // Épopée #2880 (lot V33) — le croisement expertise ↔ fondement/preuve.
      'expertise-groundings/expertise-grounding.controller.ts',
      // #2818 — « Chercher hors vivier » : le résultat est borné à l'espace
      // RÉSOLU server-side (`resolveActiveWorkspace`), lecture seule, aucun
      // crédit. Son unique écriture (`import`) déclare `records:write` juste
      // à côté.
      'external-sourcing/external-sourcing.controller.ts',
      // La cession de créance (31/08/2026) : `GET /factoring` — voir le
      // docblock de `FactoringController` pour le revirement daté.
      'factoring/factoring.controller.ts',
      // #1939 — le message vocal de Laura (12/09/2026) : la capacité, la
      // transcription et la réécoute. Mêmes règles que le texte (#1939.13) — la
      // matrice n'a aucune permission « parler à Laura », et `POST chat` est
      // ouvert à tout membre. Le raisonnement complet est au-dessus des routes.
      // #2429.9 (épopée #2852, lot P07 30/09/2026) — l'historique des versions d'un
      // artefact de chat (`GET chat/artifacts/versions`) : lecture bornée à l'espace
      // de l'appelant, qui lit déjà ce fil à l'écran — même raison que `GET chat/messages`.
      'ia-proxy/chat-artifact-versions.controller.ts',
      // #2430.11 — l'objet conversation (22/09/2026 soir) : sa LECTURE (`GET
      // chat/conversations/detail`) est bornée à l'espace de l'appelant, qui lit
      // déjà ce fil à l'écran — même raison que `GET chat/messages`.
      'ia-proxy/chat-conversations.controller.ts',
      // #3086 (26/09/2026) — la présence sur un fil : qui d'autre l'a ouvert
      // MAINTENANT (battement de coeur + lecture). Lecture bornée à l'espace de
      // l'appelant, même raison que `GET chat/conversations/detail`. Éphémère par
      // construction (fenêtre glissante de 25 s, `PRESENCE_TTL_MS`) : ni
      // l'écriture ni la lecture n'ont de conséquence durable (D39), même
      // famille que `chat-conversations` juste au-dessus.
      'ia-proxy/chat-presence.controller.ts',
      'ia-proxy/chat-turns.controller.ts',
      'ia-proxy/ia-proxy.controller.ts',
      // #3690 RÉFUTÉ (recette prod 07/10 soir, lot R7) — `GET
      // contacts/:id/introduction-authorizations` ne fait QUE lire les preuves
      // déjà consignées pour un contact de l'espace : elle portait
      // `records:write` par erreur (la SEULE lecture du périmètre contacts à
      // le faire — toutes ses voisines gardent une écriture), fermant la route
      // à `viewer`/`tech_admin` sans que personne l'ait décidé. `POST` garde
      // `records:write` juste à côté : consigner reste une écriture.
      'introductions/introduction-authorization.controller.ts',
      'lemlist/lemlist.controller.ts',
      'mailbox/mailbox.controller.ts',
      'manager/manager-members.controller.ts',
      // Marchés locaux (04/10/2026, lot L1) : `GET /market-zones` et `GET
      // /market-zones/:id` sont des LECTURES d'espace (zones et brief partagés
      // par l'équipe, scopés au workspace du token, aucune écriture, aucun
      // crédit) ; `POST` et `DELETE` déclarent `records:write` juste à côté.
      'market-brief/market-brief.controller.ts',
      // Le compte rendu de rendez-vous (01/09/2026) : `cascade` donne au modèle
      // le contexte du compte ouvert (`findOneForWorkspace`) et n'écrit rien ;
      // sa validation, elle, pose des tâches dans le CRM et déclare
      // `records:write` juste à côté.
      'meeting-notes/meeting-notes.controller.ts',
      'memory/memory.controller.ts',
      // #3427 — bibliothèque d'exemples commerciaux : list/get/select/render
      // sont des LECTURES (aucune n'écrit), `create` seul déclare
      // `records:write` juste à côté.
      'message-library/message-library.controller.ts',
      // #2369.9/.10/.13/.7/.8 (épopée #2768) — le socle de la mémoire de
      // style : quatre lectures d'espace (templates, un template, propositions
      // de règle), écritures sous `records:write`/`team:manage` juste à côté.
      'message-style/message-style.controller.ts',
      // Le connecteur Odoo (01/09/2026) : `GET /odoo/status` dit à l'écran des
      // intégrations si CET espace a branché une instance. Lire l'état de son
      // propre espace n'est pas un privilège — le fermer masquerait la carte à
      // qui a parfaitement le droit de s'en servir. Les trois autres routes du
      // contrôleur déclarent leur permission juste à côté : `integrations:manage`
      // pour brancher et débrancher, `records:write` pour pousser un contact.
      'odoo/odoo.controller.ts',
      // #2126.47-.60 (épopée #2787) — le ledger des outcomes commerciaux :
      // `GET` lit les outcomes déjà enregistrés sur le compte (donnée
      // d'espace, partagée) ; `POST` déclare `records:write` juste à côté.
      'outcomes/commercial-outcomes.controller.ts',
      // #2838 — le catalogue d'assets d'outreach de l'espace : `GET` lit ; les
      // trois écritures (créer, modifier, supprimer) déclarent `records:write`
      // juste à côté.
      'outreach-assets/outreach-asset.controller.ts',
      // #3417 (retour bêta 30/09) — la bibliothèque versionnée des scripts et
      // messages approuvés : lecture seule (aucune écriture dans cette
      // tranche, voir l'entête d'`ApprovedMessageTemplateService`).
      'outreach-templates/approved-message-template.controller.ts',
      // #2366 / #2382 — le modèle canonique de l'outreach : cinq lectures
      // déclarées dans WORKSPACE_READ_ROUTES, écritures sous `messages:send`.
      'outreach/campaign-audience.controller.ts',
      'outreach/outreach-delegation.controller.ts',
      'outreach/outreach-message.controller.ts',
      // Les paiements SORTANTS (31/08/2026) : `GET /payments/outgoing` — une
      // permission mal posée (97ab491d9) fermait cette lecture à qui n'a pas
      // `finance:read`, alors que la liste est légitime pour tout membre.
      'payments/outgoing-payments.controller.ts',
      // Le tableau de bord Finance (31/08/2026) : deux lectures d'espace, et
      // une saisie d'objectif qui déclare `finance:write` juste à côté.
      // L'historique des photos mensuelles (31/08/2026) : `GET metric-series`
      // rend des points DATÉS de l'espace. Le marqueur est posé sur cette route
      // seule — les cinq autres du contrôleur restent nues et comptées.
      'pilotage/pilotage.controller.ts',
      // #4016 L6 (11/10/2026) — le pipe « détecté, à revoir » : la lecture ;
      // confirmer et écarter déclarent `records:write` juste à côté.
      'pipeline-detections/pipeline-detections.controller.ts',
      'projects/projects.controller.ts',
      'proposals/proposals.controller.ts',
      // #3755 — la grille de qualification de l'espace et la qualification d'un
      // compte : deux LECTURES (aucune écriture, aucun crédit). Les gestes qui
      // écrivent déclarent `team:manage`, `records:write` ou `analysis:run`.
      'qualification-grid/qualification-grid.controller.ts',
      // Les décisions prises sur les pistes à qualifier (15/09/2026, #2172) :
      // la lecture rend ce que l'ÉQUIPE a écarté ou mis en veille sur un
      // dossier — la savoir est précisément ce qui empêche deux commerciaux de
      // requalifier la même piste. Aucune écriture, aucun crédit. Les deux
      // gestes qui écrivent déclarent `records:write` juste à côté.
      'qualification-leads/qualification-leads.controller.ts',
      // #3803 (07/10/2026) — l'ORIGINAL d'un document (`GET :id/source`,
      // `GET :id/source/link`) : une lecture du document d'équipe déjà listé
      // dans Connaissances, bornée à l'espace de la session ; aucune écriture.
      'rag/rag.controller.ts',
      // La prévisualisation d'un besoin depuis un appel d'offres (18/09/2026,
      // #2571.2) : `GET :id/need-preview` relit le dossier RFP déjà importé et
      // ne crée rien — la seule porte d'écriture (`POST :id/need`, #1097) reste
      // à côté, nue et comptée par le cliquet de routes ci-dessous, comme le
      // reste du contrôleur.
      'rfp/rfp.controller.ts',
      // Mes cibles (15/09/2026, #2155) : ses deux lectures (`list`, `candidates`)
      // rendent une liste de travail PARTAGÉE par toute l'équipe, sans crédit ni
      // écriture — la matrice n'a aucune permission de lecture à leur donner. Ses
      // six écritures déclarent `records:write` juste à côté.
      'target-lists/target-lists.controller.ts',
      'team-guardrails/team-guardrails.controller.ts',
      'team-research/team-research.controller.ts',
      // LA MÉMOIRE COLLECTIVE (01/09/2026) : ses deux lectures rendent des
      // croisements bornés à l'espace actif et n'écrivent rien ; son unique
      // écriture — la trace d'une mise en relation — déclare `records:write`
      // juste à côté, donc un `viewer` est refusé.
      // Les contextes de travail (#2455, 22/09/2026) : quatre lectures — la
      // liste, un contexte précis, la proposition de diff de profil — rendent
      // la donnée de l'appelant + BU + espace, sans crédit ni écriture ; ses
      // trois écritures (créer, activer, archiver) déclarent `records:write`
      // juste à côté.
      // Le diagnostic du maillon faible commercial (BEL-SC-224, #3253,
      // 28/09/2026) : son unique route rend un diagnostic d'espace — visible à
      // `sales`/`member` sur `/briefing`, que la matrice ne leur donnerait pas
      // via `team:manage` (seul `owner`/`admin`/`sales_ops` l'ont). Le service
      // persiste un historique de tendance en retour, mais ne fait que mettre
      // en cache un calcul dérivé de données déjà lisibles par l'appelant —
      // aucune visibilité nouvelle, aucun débit.
      'weakest-link-diagnosis/weakest-link-diagnosis.controller.ts',
      'work-contexts/work-contexts.controller.ts',
      // La MARQUE d'un espace (01/09/2026, marque blanche). Deux lectures :
      // `GET /brand` est PUBLIQUE — elle sert l'écran de connexion, avant tout
      // jeton, et ne rend qu'un nom, un logo et une couleur. `GET
      // /workspaces/brand` lit l'espace actif. L'écriture, elle, déclare
      // `integrations:manage` juste à côté.
      'workspace/brand.controller.ts',
      // #2035.11 (vague 3, 21/09/2026) — la CHARGE COMMERCIALE et la
      // priorisation des besoins : `@Get()` ouvert à tout membre, comme le SLA
      // du pipe ; `@Patch()` déclare `team:manage` juste à côté.
      'workspace/workspace-commercial-load-settings.controller.ts',
      'workspace/workspace-memory.controller.ts',
      // #2035.10 (vague 3, 21/09/2026) — le MARCHÉ INVERSÉ et la capacité de
      // réponse : `@Get()` ouvert à tout membre (savoir si le marché inversé
      // est ouvert n'est pas une donnée à fermer) ; `@Patch()` déclare
      // `team:manage` juste à côté (poser la capacité change ce que toute
      // l'équipe voit).
      'workspace/workspace-reverse-market-settings.controller.ts',
      // #2081.14 — les RÈGLES D'ESPACE (19/09/2026) : leur LECTURE est ouverte
      // à tout membre (qui se voit refuser un export doit pouvoir lire la règle
      // qui le refuse) ; leur écriture déclare `team:manage` juste à côté, puis
      // le service exige propriétaire ou administrateur.
      'workspace/workspace-rules.controller.ts',
      // #2770.37 (11/10/2026) — la POLITIQUE D'ÉQUIPE : `@Get()` ouvert à tout
      // membre (chacun doit savoir quelles règles son plan de journée applique) ;
      // `@Patch()` déclare `team:manage` juste à côté.
      'workspace/workspace-team-policy-settings.controller.ts',
      // Le fuseau de l'espace (16/09/2026, #1958.2) : sa LECTURE seule est
      // marquée — voir sa ligne dans WORKSPACE_READ_ROUTES. Les autres routes du
      // contrôleur restent déclarées ou comptées une par une.
      'workspace/workspace.controller.ts',
      // #4187 (14/10/2026) — `GET /zoho/status` : le statut du lien de l'espace, donnée d'espace lisible de tout membre.
      'zoho/zoho.controller.ts',
    ])
  })

  it('le marqueur n’est PAS une porte alternative — il ne blanchit jamais un contrôleur entier', () => {
    expect(ALTERNATIVE_GUARDS).not.toContain('@WorkspaceRead')
    // Preuve VIVANTE, pas seulement déclarative : `accounts.controller.ts` porte
    // le marqueur, et ses routes non marquées restent comptées une par une.
    const stillCounted = bareRoutes().filter(route => route.startsWith('accounts/accounts.controller.ts'))
    expect(stillCounted.length).toBeGreaterThan(0)
  })

  it('chaque route marquée est sortie du compte des routes nues, et elles seules', () => {
    const bare = new Set(bareRoutes())
    const stillBare = WORKSPACE_READ_ROUTES.filter(route => bare.has(route))
    // Si ce test tombe : le marqueur a été retiré d'une de ces routes, ou posé
    // au mauvais endroit (au-DESSUS du `@Get(...)`, il compte pour la route
    // précédente — la segmentation part du verbe HTTP).
    expect(stillBare).toEqual([])
  })

  it('le studio de proposition déclare au niveau CLASSE — ses deux routes sont des lectures', () => {
    // (voir plus bas : déclarer ne suffit pas, encore faut-il monter le guard.)
    const studio = sources.find(c => c.path === 'proposals/proposals.controller.ts')
    expect(studio).toBeDefined()
    const header = (studio?.source ?? '').slice(0, (studio?.source ?? '').indexOf('export class'))
    // Un décorateur POSÉ, pas un mot dans un commentaire : la ligne commence par
    // le `@`. (Le commentaire du contrôleur raconte encore `@RequirePermission`
    // — c'est son histoire, et une garde qui lirait la prose se tromperait.)
    const applied = header
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('@'))
    expect(applied).toContain('@WorkspaceRead()')
    // `data:export` n'est détenue ni par `viewer` (aucune permission) ni par
    // `tech_admin` (`integrations:manage` seule) : l'exiger sur une lecture
    // fermait la porte à deux sièges que personne n'avait décidé de fermer.
    expect(applied.filter(line => line.startsWith('@RequirePermission'))).toEqual([])
  })
})

/**
 * GA-05 bis — un `@RequirePermission` que rien ne LIT ne garde rien.
 *
 * Tout ce qui précède mesure la DÉCLARATION : le contrôleur dit-il ce qu'il
 * garde ? Aucun de ces tests ne demande si quelqu'un ÉCOUTE. Or le décorateur
 * pose une métadonnée (`REQUIRE_PERMISSION_KEY`) et un seul lecteur existe
 * dans le dépôt : `WorkspacePermissionGuard`. Sans lui au montage, le
 * décorateur est décoratif — la route s'annonce gardée et ne l'est pas.
 *
 * Ce trou a coûté quatre routes ouvertes, trouvées le 29/08/2026 en relisant
 * PDF-17 du dossier du 26 août : deux archivages/suppressions de fil de
 * conversation ouverts à un siège `viewer`, et la lecture-écriture du
 * portefeuille d'offre de l'ESN ouverte à tout membre. Escalade INTRA-espace,
 * pas de traversée — mais une permission qui ne s'applique pas est pire qu'une
 * permission absente : elle se lit comme une protection.
 *
 * ⚠️ C'est le motif « une garde protège une règle, elle ne l'invente pas »,
 * dans sa forme la plus coûteuse : GA-05 était VERTE pendant que la règle
 * qu'elle prétend tenir était fausse sur quatre routes, parce qu'elle
 * cherchait la chaîne `@RequirePermission` et jamais le montage du guard.
 */
describe('GA-05 bis — la permission déclarée est-elle seulement LUE ?', () => {
  const sources = controllers(MODULES).map(file => ({
    path: file.slice(MODULES.length + 1),
    source: readFileSync(file, 'utf8'),
  }))

  /**
   * Ceux qui POSENT le décorateur — pas ceux qui en parlent.
   *
   * ⚠️ La première version de cette garde faisait `source.includes(...)` et
   * accusait `favorites.controller.ts`, dont le seul `@RequirePermission` est
   * dans un commentaire expliquant pourquoi il utilise `@PersonalScope` à la
   * place. Une garde qui lit la prose se trompe — c'est déjà écrit vingt lignes
   * plus haut pour le studio de proposition, et ça vient de resservir.
   */
  const applies = (source: string) => source.split('\n').some(line => line.trim().startsWith('@RequirePermission'))

  const declaring = sources.filter(c => applies(c.source))

  it('la garde LIT quelque chose — un corpus vide passerait au vert pour toujours', () => {
    expect(sources.length).toBeGreaterThan(50)
    expect(declaring.length).toBeGreaterThan(20)
  })

  it('le décorateur n’a toujours qu’UN lecteur — sinon ce test cherche la mauvaise chose', () => {
    // Si ce test tombe : un second guard lit `REQUIRE_PERMISSION_KEY`. Ajoute-le
    // à `READERS` ci-dessous, sinon la garde déclarera des failles inexistantes.
    const guard = readFileSync(join(MODULES, 'workspace/workspace-permission.guard.ts'), 'utf8')
    expect(guard).toContain('REQUIRE_PERMISSION_KEY')
  })

  it('aucun contrôleur ne déclare une permission sans monter le guard qui la lit', () => {
    const READERS = ['WorkspacePermissionGuard']
    const deaf = declaring
      .filter(c => !READERS.some(reader => c.source.includes(reader)))
      .map(c => c.path)
      .sort()
    // Si ce test tombe : ajoute `WorkspacePermissionGuard` au `@UseGuards(...)`
    // du contrôleur listé. Retirer le `@RequirePermission` est l'autre issue —
    // mais alors la route devient nue, et le cliquet de routes ci-dessus le dira.
    expect(deaf).toEqual([])
  })
})
