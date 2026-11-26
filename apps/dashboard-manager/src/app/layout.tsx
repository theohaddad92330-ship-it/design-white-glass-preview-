import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import './globals.css'
import { operateurDepuisJeton } from '@/lib/guard'
import { COOKIE_SESSION } from '@/lib/session'
import { getLang, makeT } from '@/lib/i18n'
import { fetchAdminUsers, fetchAdminWorkspaces, fetchManualClients } from '@/lib/admin'
import { fetchAnalyses, fetchAnalysisAudit } from '@/lib/monitoring'
import { ReportIssue } from './_components/report-issue'
import { HorsConnexion } from './_components/hors-connexion'
import { SideRail } from './_components/side-rail'
import { ThemeToggle } from './_components/theme-toggle'
import { COCKPIT, NAV_SECTIONS, resolveEnvironment } from './_components/nav-sections'
import { GlobalSearch, type GlobalSearchLabels } from './_components/global-search'
import {
  looksLikeIdentifier,
  runGlobalSearch,
  searchInvoicesLocal,
  searchPagesLocal,
  type GlobalSearchResult,
  type SearchHit,
} from './_components/global-search.logic'
import { GuidedTour, type GuidedTourLabels } from './_components/guided-tour'

export const dynamic = 'force-dynamic'

// Les deux variables que Vercel pose lui-même — aucune configuration à ajouter.
const ENVIRONMENT_VALUE = process.env.NEXT_PUBLIC_VERCEL_ENV
const COMMIT_SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA

/**
 * L'environnement PRÉFIXE le titre de l'onglet (#1675).
 *
 * Deux onglets du manager ouverts côte à côte sont indiscernables ; l'un peut
 * être la production. Le préfixe est ce qui les distingue dans la barre
 * d'onglets, là où le badge du rail n'est pas visible. Environnement inconnu =
 * aucun préfixe : on ne devine pas « PROD ».
 */
const ENVIRONMENT = resolveEnvironment(ENVIRONMENT_VALUE)
const TITLE = ENVIRONMENT ? `${ENVIRONMENT.label} · BellumAI — Dashboard Manager` : 'BellumAI — Dashboard Manager'

export const metadata: Metadata = {
  title: TITLE,
  description: 'Monitoring IA : coût, tokens, durée et contrat par analyse.',
}

/**
 * #1673.6 — LA SERVER ACTION de la recherche globale (⌘K).
 *
 * ⚠️ POURQUOI UNE SERVER ACTION, ET PAS UNE ROUTE SOUS `app/api/**`
 * Le périmètre de ce lot interdit explicitement de créer un nouvel endpoint
 * sous `app/api/**` (d'autres agents y travaillent en même temps). Une Server
 * Action compile son propre point d'entrée sans ajouter de fichier route — elle
 * COMPOSE sur les fonctions que le manager appelle déjà (`lib/admin.ts`,
 * `lib/monitoring.ts`), jamais un accès direct à une table.
 *
 * Chaque source est enveloppée dans son propre `try/catch` : une panne sur UNE
 * catégorie (ex. l'API d'analyses indisponible) dégrade cette seule section à
 * « aucun résultat », elle ne fait pas échouer toute la recherche.
 */
async function globalSearchAction(query: string): Promise<GlobalSearchResult> {
  'use server'

  async function searchUsers(q: string): Promise<SearchHit[]> {
    try {
      const { users } = await fetchAdminUsers({ search: q, limit: 5 })
      return users.map(u => ({
        id: u.userId,
        title: u.fullName || u.email || u.userId,
        subtitle: u.email || undefined,
        href: `/users/${encodeURIComponent(u.userId)}`,
        category: 'users' as const,
      }))
    } catch {
      return []
    }
  }

  async function searchWorkspaces(q: string): Promise<SearchHit[]> {
    try {
      const { workspaces } = await fetchAdminWorkspaces({ search: q, limit: 5 })
      return workspaces.map(w => ({
        id: w.id,
        title: w.name,
        subtitle: w.ownerEmail || undefined,
        href: `/esn/${encodeURIComponent(w.id)}`,
        category: 'workspaces' as const,
      }))
    } catch {
      return []
    }
  }

  async function searchAnalyses(q: string): Promise<SearchHit[]> {
    const hits = new Map<string, SearchHit>()
    // #1673.6 — « Analyses (identifiant, entreprise) » : `fetchAnalyses`
    // matche entreprise/email/SIREN par ILIKE côté API, jamais l'identifiant.
    // Un identifiant tapé en entier (UUID) est donc résolu à part.
    if (looksLikeIdentifier(q)) {
      try {
        const audit = await fetchAnalysisAudit(q)
        hits.set(audit.accountId, {
          id: audit.accountId,
          title: audit.companyName || audit.accountId,
          subtitle: audit.siren ? `SIREN ${audit.siren}` : audit.status,
          href: `/monitoring/${encodeURIComponent(audit.accountId)}`,
          category: 'analyses',
        })
      } catch {
        // Aucun run à cet identifiant — pas un refus, la recherche continue.
      }
    }
    try {
      const { rows } = await fetchAnalyses({ search: q, limit: 5 })
      for (const row of rows) {
        if (hits.has(row.accountId)) continue
        hits.set(row.accountId, {
          id: row.accountId,
          title: row.companyName || row.accountId,
          subtitle: row.siren ? `SIREN ${row.siren}` : row.status,
          href: `/monitoring/${encodeURIComponent(row.accountId)}`,
          category: 'analyses',
        })
      }
    } catch {
      /* dégrade à ce qui a déjà été trouvé (éventuellement rien) */
    }
    return [...hits.values()]
  }

  async function searchInvoices(q: string): Promise<SearchHit[]> {
    try {
      const clients = await fetchManualClients()
      return searchInvoicesLocal(
        q,
        clients.map(c => ({ workspaceId: c.workspaceId, workspaceName: c.workspaceName, invoices: c.invoices })),
      )
    } catch {
      return []
    }
  }

  async function searchPages(q: string): Promise<SearchHit[]> {
    return searchPagesLocal(q, NAV_SECTIONS, [COCKPIT])
  }

  async function resolveEmailUser(email: string): Promise<string | null> {
    try {
      const { users } = await fetchAdminUsers({ search: email, limit: 5 })
      const exact = users.find(u => u.email.toLowerCase() === email.toLowerCase())
      return exact?.userId ?? null
    } catch {
      return null
    }
  }

  // `resolveEmailUser` n'est invoqué par `runGlobalSearch` (`global-search.logic.ts`)
  // que si `isCompleteEmail(query)` est vraie — le fournir toujours ici ne coûte
  // rien tant que le déclencheur reste dans la logique pure, pas ici.
  return runGlobalSearch(query, {
    searchUsers,
    searchWorkspaces,
    searchAnalyses,
    searchInvoices,
    searchPages,
    resolveEmailUser,
  })
}

// Applied before first paint (in <head>) so the chosen theme is set on <html>
// with no flash: explicit choice (localStorage) wins, else the OS preference,
// else dark (the historical default).
const THEME_INIT = `(function(){try{var t=localStorage.getItem('bellum-mgr-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`

/**
 * La coque du back-office : un rail latéral à 6 sections (#1644) au lieu des
 * onze liens à plat de la barre horizontale, et l'identité de l'environnement
 * servi (#1675).
 *
 * ⚠️ AUCUNE URL NE CHANGE. Le rail regroupe des liens existants ; les
 * redirections posées par la consolidation précédente (/, /run, /users, /esn,
 * /teams, /usage, /offres, /couts) restent en place et continuent de répondre.
 * Le seul chemin NOUVEAU est /changelog (#1704).
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  // QUI est connecté, lu une fois côté serveur et passé en props (#1668).
  // `null` quand la couche d'identité est éteinte : le rail est alors celui
  // d'avant, sans identité ni bouton de déconnexion.
  const operateur = await operateurDepuisJeton((await cookies()).get(COOKIE_SESSION)?.value)

  // #1673.6 / #1678.2 — un Composant Client ne peut pas appeler `t()`
  // (`cookies()` n'existe pas dans le navigateur) : le texte traduit se
  // calcule ICI et voyage en PROPS, comme `Filters` le fait déjà pour
  // `/monitoring` (`labels: FilterLabels`) — jamais la fonction `t` elle-même,
  // qu'une Server Action peut porter mais pas un objet React ordinaire.
  const lang = await getLang()
  const t = makeT(lang)

  const searchLabels: GlobalSearchLabels = {
    triggerLabel: t('gsTrigger'),
    placeholder: t('gsPlaceholder'),
    loading: t('gsLoading'),
    noResults: t('gsNoResults'),
    close: t('gsClose'),
    groups: {
      users: t('gsGroupUsers'),
      workspaces: t('gsGroupWorkspaces'),
      analyses: t('gsGroupAnalyses'),
      invoices: t('gsGroupInvoices'),
      pages: t('gsGroupPages'),
    },
  }

  const tourLabels: GuidedTourLabels = {
    stepLabel: t('gtStepLabel'),
    next: t('gtNext'),
    prev: t('gtPrev'),
    skip: t('gtSkip'),
    finish: t('gtFinish'),
    close: t('gtClose'),
    gtWelcomeTitle: t('gtWelcomeTitle'),
    gtWelcomeBody: t('gtWelcomeBody'),
    gtCockpitTitle: t('gtCockpitTitle'),
    gtCockpitBody: t('gtCockpitBody'),
    gtSectionRevenusTitle: t('gtSectionRevenusTitle'),
    gtSectionRevenusBody: t('gtSectionRevenusBody'),
    gtSectionProduitTitle: t('gtSectionProduitTitle'),
    gtSectionProduitBody: t('gtSectionProduitBody'),
    gtSectionTechniqueTitle: t('gtSectionTechniqueTitle'),
    gtSectionTechniqueBody: t('gtSectionTechniqueBody'),
    gtSectionAdministrationTitle: t('gtSectionAdministrationTitle'),
    gtSectionAdministrationBody: t('gtSectionAdministrationBody'),
    gtSectionConfigurationTitle: t('gtSectionConfigurationTitle'),
    gtSectionConfigurationBody: t('gtSectionConfigurationBody'),
    gtClosingTitle: t('gtClosingTitle'),
    gtClosingBody: t('gtClosingBody'),
  }

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <div className="shell">
          <HorsConnexion>
            <SideRail environmentValue={ENVIRONMENT_VALUE} commitSha={COMMIT_SHA} operateur={operateur} />
          </HorsConnexion>
          <div className="shell__main">
            <div className="shell__bar">
              <ThemeToggle />
            </div>
            {children}
          </div>
        </div>
        {/*
          SIGNALER UN DÉFAUT — le même geste que dans l'application cliente.

          Dans le layout RACINE et non écran par écran : un défaut se voit
          n'importe où, et un bouton posé sur douze pages est un bouton oublié
          sur la treizième.
        */}
        <HorsConnexion>
          <ReportIssue />
        </HorsConnexion>
        {/*
          #1673.6 / #1678.2 — la recherche globale et la visite guidée, montées
          UNE FOIS ici (comme `ReportIssue`) pour être accessibles depuis TOUTE
          page. Toutes deux restent invisibles tant qu'on ne les ouvre pas
          (raccourci ⌘K, bouton du rail, ou `TourTrigger` sur `/runbook`).
        */}
        <HorsConnexion>
          <GlobalSearch labels={searchLabels} search={globalSearchAction} />
          <GuidedTour sections={NAV_SECTIONS} labels={tourLabels} />
        </HorsConnexion>
        {/*
          Aucune mesure d'audience ici, et c'est délibéré — décision de Louis du
          28/08/2026.

          Cette console est le back-office de l'OPÉRATEUR, pas un produit dont on
          mesure l'audience : on sait déjà qui l'utilise. Le lot du consentement
          avait mis son traceur derrière la porte partagée ; comme la console n'a
          pas de bannière et que son adresse n'est déclarée nulle part dans le
          dépôt, la porte restait fermée pour toujours et le paquet ne servait
          plus à rien. Plutôt que de laisser dormir une dépendance que quelqu'un
          rebrancherait sans l'avoir mesurée, on l'a retirée.

          Y remettre un traceur demande d'abord de poser une bannière : la garde
          GA-46 (`apps/web/src/architecture/analytics-behind-consent.test.ts`)
          balaie cette app et signalera tout traceur qui n'y est pas nommé.
        */}
      </body>
    </html>
  )
}
