import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * UN ÉMETTEUR DU TRACEUR PRODUIT A UN APPELANT — ET UN APPELANT DE PRODUCTION.
 *
 * Le défaut n°1 du dépôt, dans sa forme la plus discrète : `product-tracker.ts`
 * exporte dix-sept émetteurs, chacun testé, chacun juste. Mesuré le 14/09/2026
 * à l'intégration du lot K : NEUF d'entre eux n'avaient AUCUN appelant hors de
 * leur définition et de `product-tracker.test.ts`. Un traceur sans appelant ne
 * casse rien et ne dit rien — il rend un tableau de bord vide qui ressemble
 * exactement à « personne n'utilise cet écran ».
 *
 * ⚠️ POURQUOI UN TEST NE COMPTE PAS COMME APPELANT. `wired-mutations.test.ts`,
 * la garde voisine, n'exclut que le fichier de définition : un émetteur dont
 * seul son propre test l'appelle y passerait au VERT. C'est précisément le cas
 * des neuf. Ici, tout fichier `.test.*` / `.spec.*` est retiré du corpus.
 *
 * LES DEUX LISTES. Comme la parité démo (`demo-coverage.ts`), chaque émetteur
 * est soit CÂBLÉ — et la garde exige son appelant de production —, soit EN
 * ATTENTE avec la raison écrite de ce qui manque. Déplacer une entrée vers
 * « en attente » pour faire passer la garde est exactement ce que la règle
 * interdit : la liste d'attente est là pour être VIDÉE, pas remplie.
 */

const SRC = join(__dirname, '..')
const TRACKER = join(SRC, 'lib/product-tracker.ts')

/** Câblés : un geste d'utilisateur, dans un écran, les appelle. */
const WIRED = [
  'trackTabOpened',
  'trackActionStarted',
  'trackActionCompleted',
  'trackActionAbandoned',
  'trackFilterApplied',
  'trackSearchPerformed',
  'trackErrorShown',
  'trackAssistantQuestionSent',
  // D10 — décision Louis 14/09/2026 : `ReplyFeedback.tsx` émet au clic sur un
  // verdict, le seul endroit où le verdict d'une réponse de Laura est DONNÉ.
  'trackAssistantAnswerJudged',
  // #1946.2 — 15/09/2026 : `Chat.tsx` émet au clic sur une amorce de Laura,
  // aux DEUX endroits où elle en propose (les cartes de l'accueil, les
  // pastilles du composeur). Ce qui manquait était une décision, et la voici :
  // le rang est la position RENDUE, 1-based, celle que l'œil parcourt — pas la
  // position au catalogue. La démonstration garde ses propres amorces (un
  // SCRIPT fixe, #1320) : leur rang mesurerait l'ordre du script, pas un choix
  // devant un vrai portefeuille, donc elle n'émet pas.
  'trackSuggestionClicked',
  // #1946.11 — 15/09/2026 : les TROIS gestes qui posent une mémoire
  // (`MemoryBar`, `MemoireCard`, `SaveReply`) émettent au SUCCÈS, jamais au
  // clic. Ce qui manquait — « hors du fil de conversation » — a sa réponse :
  // il n'y en a pas, Réglages › Mémoire lit et dépingle sans jamais épingler.
  'trackMemoryAdded',
  // #2085 (15/09/2026) — `SubStepQuestions.tsx` émet aux trois boutons de
  // `PrefillBadge` (Confirmer/Corriger/Ignorer), `useOnboardingNavigation.ts`
  // au clic « Retour ».
  'trackPrefillReviewed',
  'trackOnboardingStepBack',
  // #2085 (16/09/2026, lot « mesure-de-l'onboarding ») — `useGenerateAuditPhases.ts`
  // au succès de la génération, `useValidateProfileContext.ts` au succès de la
  // validation, `WelcomeScreen.tsx` au premier rendu chargé, `IntegrationCenterPage.tsx`
  // au retour OAuth confirmé, `ImportWizard.tsx` à une écriture réussie,
  // `useTeam.ts` au succès d'une invitation.
  'trackOnboardingAuditGenerated',
  'trackOnboardingAuditValidated',
  'trackOnboardingFirstValueViewed',
  'trackConnectorActivated',
  'trackDataImported',
  'trackInvitationSent',
  // #1946.4 — décision Louis 19/09/2026 : `InternalLink` (`markdown.tsx`),
  // le SEUL rendu d'un lien à l'intérieur d'une réponse de Laura, émet au
  // clic — clic simple (navigation par le routeur) et cmd/ctrl-clic (nouvel
  // onglet) mesurent la même chose, suivre le lien.
  'trackAssistantRedirectFollowed',
  // #1946.5/.6/.7/.8 — tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md
  // §1) : le NOM de geste manquant est `action.action`, le discriminant déjà
  // porté par chaque proposition Action OS (« export_contact_to_crm »…),
  // jamais sa cible. `CopilotCards.tsx` émet aux QUATRE endroits où une étape
  // se constate RÉELLEMENT : « préparée »/« exécutée » quand le SERVEUR rend
  // l'état `prepared`/`executed` (`useEffect` sur `current.state`), « validée »
  // au clic de confirmation, « corrigée » après l'acceptation serveur d'un
  // patch (`save()`). « Abandonnée » reste HORS de ce lot (`reject`/`snooze`
  // ne sont pas dans le périmètre décidé — cinquième étape, pas demandée ici).
  'trackPreparedActionStage',
  // #1946.16 — tranché sans toi (decisions-louis-22-09-soir.md §12) : ce qui
  // manquait était « comment mesurer sans lire le texte ». `CopilotCards.tsx`
  // (`draftExtentOf`, appelée dans `save()`) ne compare que des LONGUEURS de
  // champ, jamais un contenu — et n'émet qu'APRÈS l'acceptation serveur du
  // patch, comme `trackPreparedActionStage(..., 'corrigee')` juste au-dessus.
  'trackDraftReused',
  // #1946.10 — tranché sans toi (decisions-louis-22-09-soir.md §12) : la NATURE
  // manquante est `intervention.key` (la clé de catalogue déjà lue par
  // `LauraCard.tsx`), et l'endroit où l'issue se conclut est `useLaura.ts::react`
  // — la SEULE porte vers `/laura/*` (Tome 7 §48). Les trois gestes RENDUS
  // (`act`/`refuse`/`dismiss`) couvrent exactement les trois valeurs de
  // l'émetteur ; `ignored` (un silence serveur, jamais un clic) n'atteint pas
  // cette fonction et ne s'émet donc jamais d'ici.
  'trackInterventionOutcome',
  // #2085.6 — 23/09/2026 : `OnboardingContradictionCard.tsx` émet aux deux
  // gestes qui RÉSOLVENT une contradiction (« Corriger », « Maintenir les
  // deux »), jamais sur « Expliquer » (qui ne fait que révéler l'hypothèse).
  'trackContradictionResolved',
  // #2985 (#2319.129) — `ActionCenter.tsx` émet à la confirmation d'un compte
  // rendu, une fois l'écriture CRM confirmée par le serveur.
  'trackCrmWritebackConfirmed',
  // #2985 (26/09/2026) — le Meeting OS (#2319) : `MeetingPrepDialog.tsx` émet à
  // l'ouverture (`trackBriefOpened`) et dès que le brief assemblé porte au
  // moins un bloc (`trackBriefGenerated`), et au sélecteur « Corriger le
  // compte » quand une association DÉJÀ faite change
  // (`trackFalseAssociationCorrected`). `MeetingLiveView.tsx` émet à la case
  // cochée d'une question suggérée (`trackQuestionUsed`). `MeetingNotesCard.tsx`
  // émet à la soumission des notes (`trackNotesAdded`), au succès de la
  // structuration quand le résumé rendu n'est pas vide (`trackSummaryGenerated`),
  // au succès de la validation du compte rendu (`trackSummaryApproved`), au
  // succès sans échec du dépôt des actions choisies (`trackActionsCreated`), et
  // au succès du dépôt du brouillon de suivi (`trackFollowupCreated`).
  'trackBriefGenerated',
  'trackBriefOpened',
  'trackQuestionUsed',
  'trackNotesAdded',
  'trackSummaryGenerated',
  'trackSummaryApproved',
  'trackActionsCreated',
  'trackFollowupCreated',
  'trackFalseAssociationCorrected',
  // #2319.123 — tranché sans Louis (29/09/2026) : `MeetingNotesCard.onApprove`
  // émet au même succès que `trackSummaryApproved` (issue `'done'` du kind
  // `recap`) — voir la décision dans `product-tracker.ts`.
  'trackMeetingCompleted',
  // #2767 (#2108.49-.53) — la carte de priorité émet `priority_viewed` à
  // l'affichage (`PriorityCard`), et ses quatre gestes (accepter, reporter,
  // écarter, corriger) émettent depuis `CardDispositionControls`.
  'trackPriorityViewed',
  'trackPriorityAccepted',
  'trackPrioritySnoozed',
  'trackPriorityRejected',
  'trackPriorityCorrected',
  // #2767 (#2108.54, 30/09/2026) — une tâche cochée émet depuis
  // `TaskList.completeWithConfirmation` (`/briefing/`, `/accounts/$id`).
  'trackTaskCompleted',
  // #2154.30 (lot V10-D, 17/10/2026) — les `action_*` des mutations passent par `trackedMutation`, passé en
  // options de `mutate` dans les six destinations (`CreateProjectDialog`, `ConsultantsPage`, `Knowledge`,
  // `AccountAssignSubmenu`, `ImportTargetListDialog`…).
  'trackedMutation',
] as const

/**
 * EN ATTENTE — livrés, testés, sans appelant de production au 14/09/2026.
 * Chaque raison dit ce qui MANQUE, et c'est toujours une décision, jamais une
 * ligne à écrire mécaniquement.
 */
const PENDING: { emitter: string; missing: string }[] = []

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    // Un test n'est PAS un appelant : un test appelle toujours la fonction
    // qu'il teste. C'est la seule différence avec la garde voisine, et c'est
    // celle qui fait la différence entre vert et utile.
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue
    if (full === TRACKER) continue
    out.push(full)
  }
  return out
}

describe('les émetteurs du traceur produit ont un appelant de production', () => {
  const files = sourceFiles(SRC)
  const tracker = readFileSync(TRACKER, 'utf8')

  function productionCallers(emitter: string): string[] {
    return files.filter(file => new RegExp(`\\b${emitter}\\s*\\(`).test(readFileSync(file, 'utf8')))
  }

  it('le corpus lu n’est pas vide — une garde qui ne lit rien passe au vert pour toujours', () => {
    expect(files.length).toBeGreaterThan(500)
    expect(tracker).toContain('export function trackTabOpened')
  })

  it.each(WIRED)('%s est appelé par au moins un fichier de production', emitter => {
    // L'émetteur existe VRAIMENT : une liste qui nomme une fonction disparue
    // resterait verte en ne surveillant plus rien.
    expect(tracker).toContain(`export function ${emitter}(`)
    expect(productionCallers(emitter).length).toBeGreaterThan(0)
  })

  it.each(PENDING)('$emitter reste sans appelant — il manque : $missing', ({ emitter }) => {
    // Le TÉMOIN de la règle voisine : ceux qui restent ici ont tous un appelant
    // de TEST. S'ils ressortaient avec un appelant, c'est que le filtre des
    // fichiers de test aurait cessé de filtrer — et la garde entière serait
    // borgne sans qu'une seule ligne ne rougisse.
    expect(tracker).toContain(`export function ${emitter}(`)
    expect(productionCallers(emitter)).toHaveLength(0)
  })

  it('un nom qui n’existe pas n’a évidemment aucun appelant — la garde sait dire NON', () => {
    expect(productionCallers('trackRienDuTout')).toHaveLength(0)
    // …et elle sait dire OUI sur un émetteur câblé, sinon les deux listes
    // passeraient au vert pour la même mauvaise raison (un corpus muet).
    expect(productionCallers('trackErrorShown').length).toBeGreaterThan(0)
  })

  it('aucun émetteur exporté n’échappe aux deux listes', () => {
    const exported = [...tracker.matchAll(/^export function (track\w+)\(/gm)].map(match => match[1])
    const classified = new Set<string>([...WIRED, ...PENDING.map(entry => entry.emitter)])
    expect(exported.length).toBeGreaterThan(0)
    expect(exported.filter(name => !classified.has(name))).toEqual([])
  })
})
