import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Le budget d'un tour de copilote doit rester PLUS GRAND que celui du service IA.
 *
 * L'orchestrateur du service IA (`chat_orchestrator.py`) borne un tour à 90 s et
 * l'écrit dans son en-tête : il se cale « sous le budget de l'appelant, 120 s
 * côté NestJS », et prévient de ce qui arrive sinon — « un budget intérieur plus
 * large que le budget extérieur ne produit pas une réponse tardive, il produit
 * un 500 ».
 *
 * Ce budget de 120 s n'existait nulle part côté NestJS. `IaClient.chat()` ne
 * passait aucun `timeoutMs`, donc l'appel héritait du défaut du client HTTP —
 * 30 s — et de ses 3 tentatives. Un tour court passait ; un tour qui appelle un
 * outil (« enrichis ce contact », « lis mes mails ») dépassait 30 s, était
 * coupé, puis rejoué deux fois. L'utilisateur voyait « Failed to fetch » après
 * ~35 s, et chaque tentative facturait un appel Claude de plus.
 *
 * Les deux moitiés du contrat vivent dans deux langages, deux dépôts d'exécution
 * et deux processus : aucun type ne les relie. Ce test lit donc les deux
 * sources et compare les nombres.
 */

const IA_ORCHESTRATOR = join(__dirname, '../../../../ia/app/services/chat_orchestrator.py')
const IA_CHAT_ROUTER = join(__dirname, '../../../../ia/app/routers/chat.py')
const IA_CLIENT = join(__dirname, 'ia.client.ts')

/** Une constante numérique déclarée dans un module Python du service IA. */
function pythonSecondsFrom(file: string, name: string): number {
  const source = readFileSync(file, 'utf8')
  const match = source.match(new RegExp(`^${name}\\s*=\\s*([0-9.]+)`, 'm'))
  if (!match) throw new Error(`constante ${name} introuvable dans ${file}`)
  return Number(match[1])
}

/** Une constante numérique déclarée dans le module Python de l'orchestrateur. */
function pythonSeconds(name: string): number {
  return pythonSecondsFrom(IA_ORCHESTRATOR, name)
}

describe('le budget du copilote est cohérent entre NestJS et le service IA', () => {
  const clientSource = readFileSync(IA_CLIENT, 'utf8')
  const callerBudgetMs = Number(clientSource.match(/const CHAT_CALLER_BUDGET_MS = ([0-9_]+)/)?.[1]?.replace(/_/g, ''))

  it('les deux budgets sont lisibles', () => {
    // Une lecture ratée rendrait NaN, et NaN passe silencieusement toute
    // comparaison `>` — le test aurait l'air vert en ne vérifiant rien.
    expect(Number.isFinite(callerBudgetMs)).toBe(true)
    expect(pythonSeconds('_DEFAULT_TURN_BUDGET_S')).toBeGreaterThan(0)
  })

  it('le budget de l’appelant dépasse le plafond dur du service IA', () => {
    // Le plafond réellement observable côté IA, tel que son en-tête le
    // documente : le budget du tour PLUS le plancher du dernier appel.
    const iaCeilingMs = (pythonSeconds('_DEFAULT_TURN_BUDGET_S') + pythonSeconds('_MIN_CALL_TIMEOUT_S')) * 1000
    expect(callerBudgetMs).toBeGreaterThan(iaCeilingMs)
  })

  it('l’appel de chat déclare son budget et refuse de rejouer', () => {
    // `chat()` passe par `chatStream()` : le budget est porté par l'AbortSignal,
    // et un flux à moitié consommé ne se rejoue pas (aucune nouvelle tentative).
    const chatCall = clientSource.slice(clientSource.indexOf("template: '/chat/message'") - 400)
    expect(chatCall).toContain('AbortSignal.timeout(CHAT_CALLER_BUDGET_MS)')
    // Un tour de copilote n'est pas rejouable : il facture un appel Claude et
    // peut exécuter un outil. Trois tentatives, c'est trois fois les deux.
    expect(clientSource).toContain('this.collectChatEnvelope(this.chatStream(')
  })

  /**
   * Retour bêta #1191 : 502 après 120 076 ms — le budget de l'APPELANT, pas
   * celui du tour. Le test ci-dessus lisait « budget + plancher du dernier
   * appel » comme le plafond du service IA parce que l'en-tête de
   * `chat_orchestrator.py` le dit. Cette phrase était fausse : elle ne couvre ni
   * l'exécution d'un outil (`execute_chat_tool` est attendu sans délai ;
   * `_TOOL_ROUND_RESERVE_S` réserve, il ne borne pas) ni tout ce qui précède
   * `run_chat_with_tools` (l'échéance naît DANS cette fonction, alors que la
   * récupération RAG, les documents joints et l'historique la précèdent).
   *
   * Un plafond dur existe maintenant à l'entrée du handler
   * (`chat.py:_DEFAULT_TURN_CEILING_S`). Ce test tient la CHAÎNE des trois
   * nombres — c'est elle, et non chaque nombre isolément, qui décide si
   * l'utilisateur voit une phrase ou une panne.
   */
  describe('le plafond dur du handler ferme l’écart que le budget du tour ne couvre pas', () => {
    const handlerCeilingS = pythonSecondsFrom(IA_CHAT_ROUTER, '_DEFAULT_TURN_CEILING_S')
    const orchestratorCeilingS = pythonSeconds('_DEFAULT_TURN_BUDGET_S') + pythonSeconds('_MIN_CALL_TIMEOUT_S')

    it('les trois nombres sont lisibles', () => {
      // Sans cette lecture explicite, un renommage rendrait NaN et NaN passe
      // silencieusement toute comparaison — le garde serait vert sur du vide.
      expect(Number.isFinite(handlerCeilingS)).toBe(true)
      expect(Number.isFinite(orchestratorCeilingS)).toBe(true)
      expect(Number.isFinite(callerBudgetMs)).toBe(true)
    })

    it('le plafond du handler laisse finir un tour que l’orchestrateur aurait terminé', () => {
      expect(handlerCeilingS).toBeGreaterThanOrEqual(orchestratorCeilingS)
    })

    it('…et il reste SOUS le budget de l’appelant, avec de quoi rendre la réponse', () => {
      expect(handlerCeilingS * 1000).toBeLessThan(callerBudgetMs)
    })

    /**
     * #3706.1 — recette prod 08/10 : le PREMIER envoi de chaque message
     * (recherche de comptes neuve, aucun cache chaud) finissait en « erreur
     * côté assistant » après ~2 min, 2 fois sur 2 — puis passait au renvoi,
     * où les caches (retry typé par outil, idempotency key) rendaient tout
     * instantané. La marge d'alors (120 s − 105 s = 15 s) suppose que le
     * réseau Node↔IA ET le déroulement de l'annulation (tous les appels
     * d'outils en vol, `asyncio.wait_for`) tiennent en 15 s — faux en
     * production : le budget de l'appelant coupait le flux AVANT que le
     * service IA n'ait eu le temps de transmettre sa réponse partielle
     * honnête, et Node la remplaçait par la phrase générique de panne.
     * Une marge qui retombe à 15 s doit faire échouer CE test, pas attendre
     * la prochaine recette pour le redécouvrir.
     */
    it('la marge laisse vraiment le temps au réseau et à l’annulation de finir (#3706.1)', () => {
      const marginMs = callerBudgetMs - handlerCeilingS * 1000
      expect(marginMs).toBeGreaterThanOrEqual(30_000)
    })

    it('le handler borne RÉELLEMENT l’orchestrateur, il ne se contente pas de déclarer un nombre', () => {
      // Une constante sans `wait_for` serait un plafond décoratif : c'est
      // exactement la forme du défaut qu'on corrige (un budget annoncé dans un
      // commentaire, pas appliqué dans le code).
      const router = readFileSync(IA_CHAT_ROUTER, 'utf8')
      expect(router).toContain('asyncio.wait_for(')
      expect(router).toMatch(/timeout=remaining/)
      expect(router).toContain('_turn_ceiling_s()')
    })
  })

  it('sait reconnaître le défaut qui coupait un tour à 30 s', () => {
    // Le garde doit échouer sur ce qu'il est censé attraper.
    const httpDefaults = readFileSync(join(__dirname, '../../../../../packages/http/src/client.ts'), 'utf8')
    expect(httpDefaults).toContain('defaultTimeoutMs ?? 30_000')
    expect(callerBudgetMs).toBeGreaterThan(30_000)
  })
})
