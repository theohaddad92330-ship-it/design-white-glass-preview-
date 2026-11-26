import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import type { TFunction } from 'i18next'
import { clearVolatileUserState } from '@/features/auth/clear-client-user-state'
import { forgetTabDemoFlag, isTabDemo, markTabAsDemo } from '@/features/auth/demo-tab'
import { rememberPreDemoIdentity } from '@/features/auth/pre-demo-identity'
import { forgetTabIdentity, readTabIdentity, rememberTabIdentity } from '@/features/auth/tab-identity'
import { demoApi, type DemoLeadJobTitle } from '@/features/demo/api'
import { demoProfileFromSearch } from '@/features/demo/demo-profile'
import { DemoTimeoutError } from '@/features/demo/demo-timeout'
import { ApiError } from '@/lib/api-error'
import { clearPersistedQueryCache } from '@/lib/cache/idb/tanstack-persister'

/** Mot pour mot la liste fermée de l'issue #2705 — les VALEURS voyagent vers
 *  l'API (`demo-lead.ts:DEMO_LEAD_JOB_TITLES` côté serveur, GA-26 : une seule
 *  définition écrite, ici recopiée car le web ne peut pas importer l'API). */
export const DEMO_LEAD_JOB_TITLES: readonly DemoLeadJobTitle[] = [
  'business_developer',
  'manager',
  'agency_director',
  'sales_director',
  'esn_founder',
  'freelance',
  'other',
]

function buildDemoAccessSchema(t: TFunction<'common'>) {
  return z.object({
    firstName: z.string().trim().min(1, t('demo.entry.form.requiredFirstName')),
    lastName: z.string().trim().min(1, t('demo.entry.form.requiredLastName')),
    email: z.string().trim().min(1, t('demo.entry.form.emailInvalid')).email(t('demo.entry.form.emailInvalid')),
    // #2705 — validation FORMAT seulement côté client : la liste des domaines
    // personnels vit UNE fois, côté serveur (GA-26, `activity-linking.ts`).
    // Le refus s'affiche ici via l'erreur serveur (voir `onSubmit`).
    jobTitle: z.enum(DEMO_LEAD_JOB_TITLES as [DemoLeadJobTitle, ...DemoLeadJobTitle[]], {
      error: t('demo.entry.form.requiredJobTitle'),
    }),
    company: z.string().trim().min(1, t('demo.entry.form.requiredCompany')),
    phone: z.string().trim().optional(),
  })
}

type DemoAccessFormValues = z.infer<ReturnType<typeof buildDemoAccessSchema>>

/**
 * #2705.9 — le message de remerciement doit se LIRE avant la redirection :
 * `window.location.replace` décharge la page, donc le message n'a de sens que
 * s'il reste affiché un instant. La valeur est courte (une brève lecture, pas
 * une pause), et EXPORTÉE pour que le test borne son `waitFor` sans deviner un
 * délai qu'il ne connaît pas.
 */
export const DEMO_ACCESS_SUCCESS_DELAY_MS = 900

/**
 * #3578.3 — au-delà de ce délai d'attente, l'écran dit honnêtement « la démo se
 * prépare » avec une progression, MÊME sans 503 `demo_preparing` : recette prod du
 * 03/10, 18 à ~40 s d'attente sans un mot. Exporté pour que le test ne devine pas.
 */
export const DEMO_ACCESS_SLOW_WAIT_MS = 3000

/** Les issues zod de `error.details.errors` (`ZodValidationException`, nestjs-zod) —
 *  `error.details` n'est jamais garanti, on le revalide donc ici. */
function serverFieldError(error: unknown): { field: 'email' | 'root'; message: string } | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null
  const details = error.details as { errors?: { message?: unknown; path?: unknown[] }[] } | undefined
  const issue = details?.errors?.find(e => Array.isArray(e.path) && e.path[0] === 'email')
  if (typeof issue?.message === 'string' && issue.message.length > 0) {
    return { field: 'email', message: issue.message }
  }
  return null
}

/**
 * #2705 — le formulaire obligatoire avant l'accès à la démo. Soumission :
 * enregistre le lead (`POST /demo/lead`, dédupliqué par e-mail serveur), PUIS
 * redeem le token EXACTEMENT comme `DemoEntryPage` le faisait avant ce lot —
 * même session, même marquage d'onglet, même rechargement complet.
 */
export function useDemoAccessForm(token: string | undefined) {
  const { t } = useTranslation('common')
  const schema = useMemo(() => buildDemoAccessSchema(t), [t])
  // #2705.9 — non-null uniquement entre la réussite et la redirection ;
  // porte le PRÉNOM saisi, jamais un texte générique (le message le cite).
  const [successFirstName, setSuccessFirstName] = useState<string | null>(null)
  // #3578 — vrai tant que le serveur re-sème une salle en arrière-plan : l'écran le DIT
  // (« la démo se prépare ») et l'attente reprend seule ; ce n'est jamais une erreur.
  const [preparing, setPreparing] = useState(false)
  // #3578.3 — secondes écoulées depuis le clic (0 hors soumission) : l'écran en tire
  // l'attente longue et la progression, sans dépendre d'un 503 nommé.
  const [waitedMs, setWaitedMs] = useState(0)

  const form = useForm<DemoAccessFormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      jobTitle: undefined,
      company: '',
      phone: '',
    },
  })

  const onSubmit = form.handleSubmit(async values => {
    let wasDemoTab = true
    // #3563.2 — recette prod 02/10 : avec une session RÉELLE active dans l'onglet,
    // « Accéder à la démo » restait en chargement. L'onglet déclare son identité
    // (`X-Bellum-User`) à CHAQUE appel ; la porte d'entrée de la démo recevait
    // celle du vrai compte et lisait son cookie, pas un visiteur anonyme. Entrer
    // en démo, c'est changer d'identité : on cesse de porter l'ancienne le temps
    // de l'appel, et on la rend si l'entrée échoue (la vraie session survit).
    const previousIdentity = readTabIdentity()
    forgetTabIdentity()
    try {
      const params = new URLSearchParams(window.location.search)
      await demoApi.registerLead({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        jobTitle: values.jobTitle,
        company: values.company,
        phone: values.phone || undefined,
        utmSource: params.get('utm_source') ?? undefined,
        utmMedium: params.get('utm_medium') ?? undefined,
        utmCampaign: params.get('utm_campaign') ?? undefined,
        utmTerm: params.get('utm_term') ?? undefined,
        utmContent: params.get('utm_content') ?? undefined,
      })

      // 29/09/2026 — le semis de la salle peut durer une minute : pendant ce
      // temps, toute 401 (session précédente périmée, salle purgée) faisait
      // partir l'onglet vers `/login` AVANT que la réponse n'arrive. L'onglet
      // est donc marqué démo DÈS l'attente : une session perdue revient ici.
      wasDemoTab = isTabDemo()
      // #4608 — la session réelle de cet onglet est gardée pour la sortie de la démo.
      if (!wasDemoTab) rememberPreDemoIdentity(previousIdentity)
      markTabAsDemo()
      // #4291 J — la démo choisie sur `/demo` (forfait / conseil), portée par la query ; absente = staffing.
      const profile = demoProfileFromSearch(window.location.search)
      const session = await demoApi.redeem(token, {
        onPreparing: () => setPreparing(true),
        ...(profile ? { profile } : {}),
      })
      setPreparing(false)
      rememberTabIdentity(session?.user?.id)
      // Constat 27/09/2026 — CET onglet est désormais en démonstration : une
      // session perdue plus tard (401, appareil révoqué, jeton expiré) doit
      // renvoyer ici, jamais vers `/login` (voir `demo-tab.ts`).
      markTabAsDemo()
      // #3788.6 — recette prod 08/10 : voir `DemoEntryPage.enterDemo()`. Le
      // scroll infini des comptes et des contacts (localStorage, hors de
      // portée de l'identité d'onglet) doit être vidé AVANT le rechargement,
      // sans quoi un navigateur qui portait une vraie session affiche ses
      // dossiers réels sous le bandeau MODE DÉMO.
      clearVolatileUserState()
      // #3068 / SG — même raison que `DemoEntryPage.enterDemo()` : `redeem()`
      // peut avoir purgé/re-semé une salle REPRISE (même identité qu'une
      // visite précédente de ce navigateur) ; sans ce vidage, le rechargement
      // complet restaurerait l'instantané IndexedDB de l'ANCIEN dossier.
      if (session?.user?.id) await clearPersistedQueryCache(session.user.id)
      // #2705.9 — message de remerciement PUIS redirection : jamais dans le
      // même tick, sinon le message n'est jamais lu.
      setSuccessFirstName(values.firstName)
      setTimeout(() => window.location.replace('/'), DEMO_ACCESS_SUCCESS_DELAY_MS)
    } catch (error) {
      setPreparing(false)
      if (!wasDemoTab) forgetTabDemoFlag()
      rememberTabIdentity(previousIdentity)
      const fieldError = serverFieldError(error)
      if (fieldError) {
        form.setError(fieldError.field, { message: fieldError.message })
      } else if (error instanceof DemoTimeoutError) {
        // #3747 — le garde-fou d'attente a sauté, pas la démo : le serveur a réservé la salle à ce navigateur,
        // elle s'ouvre dès qu'elle est prête. On le DIT, au lieu d'« une erreur est survenue ».
        form.setError('root', { message: t('demo.entry.form.preparingTimeout') })
      } else {
        form.setError('root', { message: t('demo.entry.form.genericError') })
      }
    }
  })

  const isSubmitting = form.formState.isSubmitting
  useEffect(() => {
    if (!isSubmitting) {
      setWaitedMs(0)
      return
    }
    const startedAt = Date.now()
    const timer = setInterval(() => setWaitedMs(Date.now() - startedAt), 500)
    return () => clearInterval(timer)
  }, [isSubmitting])

  return {
    form,
    onSubmit,
    isSubmitting,
    slowWait: isSubmitting && waitedMs >= DEMO_ACCESS_SLOW_WAIT_MS,
    waitedSeconds: Math.floor(waitedMs / 1000),
    rootError: form.formState.errors.root?.message ?? null,
    successFirstName,
    preparing,
  }
}
