import { Card, Text } from '@bellum/ui'
import { useTranslations } from 'next-intl'

/**
 * Une section de la page « Garde-fous » : un titre, un paragraphe, des refus
 * numérotés.
 *
 * UN seul composant pour les quatre sections, parce que les quatre disent la
 * même chose sous quatre angles — « voilà ce qui ne se produira pas, et
 * pourquoi ». Écrire quatre composants presque identiques les ferait diverger
 * au premier ajustement de style, ce que la loi 4 du tome 7 appelle « la même
 * chose deux fois sous deux formes ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CHAQUE PROMESSE PORTE, EN CODE
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune phrase de cette page n'est un argument commercial libre : chacune est
 * rattachée à un `fichier:ligne` dans `holders.ts`, et `safeguards.test.ts`
 * ouvre chacun de ces fichiers à chaque exécution de la CI. Les chemins ne sont
 * jamais rendus dans le HTML — le site est public, l'arborescence du dépôt ne
 * l'est pas — mais ils sont, eux, vérifiés.
 *
 * Les six garde-fous et leurs porteurs, dans l'ordre où ils protègent :
 *
 *  1. Une réponse ferme la séquence
 *     → `packages/contracts/src/schemas/playbook.ts:139`
 *     → `packages/contracts/src/schemas/playbook.test.ts:82`
 *  2. Une relance, jamais une cadence
 *     → `packages/contracts/src/schemas/playbook.ts:52` (`= 1`), `:140`
 *     → `packages/contracts/src/schemas/playbook.test.ts:91`
 *  3. Le désabonnement relu à chaque envoi
 *     → `packages/contracts/src/schemas/playbook.ts:141`
 *     → `packages/contracts/src/schemas/playbook.test.ts:98`
 *     → `apps/api/src/modules/playbooks/playbook-send.sweeper.spec.ts:170`
 *  4. Heures calmes
 *     → `packages/contracts/src/schemas/playbook.ts:45` (8 h) et `:161`
 *     → `packages/contracts/src/schemas/playbook.test.ts:105`
 *  5. Plafond quotidien par espace
 *     → `packages/contracts/src/schemas/playbook.ts:50` (`= 25`)
 *     → `packages/contracts/src/schemas/playbook.test.ts:110`
 *  6. Rien n'est armé par défaut
 *     → `packages/contracts/src/schemas/playbook.ts:137`
 *     → `packages/contracts/src/schemas/playbook.test.ts:119`
 *     → `apps/api/src/modules/playbooks/playbooks.service.spec.ts:80`
 *
 * « Aucun réglage ne les désactive » se prouve par une SIGNATURE :
 * `packages/contracts/src/schemas/playbook.ts:136` — le verdict ne reçoit que
 * la situation de la cible et l'heure, jamais un drapeau d'espace.
 *
 * Laura prépare et n'envoie pas :
 *     → `apps/ia/tests/test_chat_mailbox_tools.py:150` (la proposition)
 *     → `apps/ia/tests/test_chat_mailbox_tools.py:56` (le corps ne sort pas)
 *
 * La relance soumise à un humain :
 *     → `apps/api/src/modules/playbooks/playbook-send.sweeper.spec.ts:118`
 *     → `packages/contracts/src/schemas/playbook.ts:547` (refus définitif)
 *     → `packages/contracts/src/schemas/playbook.ts:564` (péremption, 3 jours)
 *     → `packages/contracts/src/schemas/playbook.approval.test.ts:35`
 */

type ClaimItem = { label: string; desc: string }

/** Les sections de la page, dans l'ordre de lecture. */
type SectionKey = 'copilot' | 'guardrails' | 'review' | 'refusals'

/**
 * Le numéro de section reste dans le composant, jamais dans le catalogue.
 *
 * Deux raisons, et la seconde est une garde : c'est déjà la convention du site
 * (`Story.tsx`, `Principles.tsx`), et `safeguards.test.ts` refuse tout nombre
 * écrit dans les libellés qui ne soit pas une constante du produit — « 02 » n'en
 * est pas une.
 */
const SECTION_NUMBER: Record<SectionKey, string> = {
  copilot: '01',
  guardrails: '02',
  review: '03',
  refusals: '04',
}

export function ClaimSection({ section }: { section: SectionKey }) {
  const t = useTranslations('safeguards')
  const items = t.raw(`${section}.items`) as ClaimItem[]

  return (
    <section className="py-14">
      <div className="mx-auto max-w-4xl px-6">
        <div className="mb-8 grid grid-cols-[auto_1fr] items-center gap-5 sm:gap-7">
          <span
            aria-hidden
            className="text-4xl font-bold leading-none text-transparent [-webkit-text-stroke:1.5px_rgba(139,92,246,0.5)] sm:text-5xl"
          >
            {SECTION_NUMBER[section]}
          </span>
          <Text element="h2" weight="medium" color="text-white" leading="tight" className="text-xl sm:text-3xl">
            {t(`${section}.title`)}
          </Text>
        </div>

        <Text element="p" size="lg" color="text-zinc-400" className="mb-8 leading-relaxed">
          {t(`${section}.paragraph`)}
        </Text>

        {/* Une liste de refus EST une liste : le lecteur d'écran doit l'annoncer
            comme telle, et le compte annoncé (« les six garde-fous ») doit être
            celui qu'il entend. */}
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((item, index) => (
            <li key={item.label}>
              <Card className="h-full rounded-2xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-6 backdrop-blur-[16px]">
                <span
                  aria-hidden
                  className="mb-4 inline-flex size-8 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/[0.14] text-sm font-medium text-violet-200"
                >
                  {index + 1}
                </span>
                <Text element="h3" size="base" weight="medium" color="text-white" leading="snug">
                  {item.label}
                </Text>
                <Text element="p" size="sm" color="text-zinc-400" className="mt-2 leading-relaxed">
                  {item.desc}
                </Text>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
