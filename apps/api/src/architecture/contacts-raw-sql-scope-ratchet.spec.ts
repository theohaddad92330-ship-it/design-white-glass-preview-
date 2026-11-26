import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * GA-405 — LA PORTÉE D'UN CONTACT SE LIT À UN SEUL ENDROIT : LE CLIQUET DES
 * LECTURES EN SQL BRUT (#2159.54 / #2159.55 / #2159.70, tranche (a) du plan de
 * l'épopée #2927).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une portée « BU » ou « Personnel » sur un contact ne tient QUE si chaque
 * chemin de lecture la respecte. Or `contacts` se lit aujourd'hui par ~100
 * fichiers qui importent `ContactEntity` ET par des SQL bruts `FROM|JOIN
 * contacts` — chacun est un site où un filtre de portée devra être posé. Un
 * « Personnel » filtré sur une partie des chemins seulement serait une promesse
 * de confidentialité non tenue (même calcul que le correctif `phone` révoqué le
 * 26/09).
 *
 * Cette garde ne pose AUCUN filtre : elle compte les sites. Elle fige les
 * sites actuels, par fichier, et refuse tout NOUVEAU site : une lecture brute
 * de plus sur `contacts` est un site de plus à corriger le jour où la colonne
 * de portée arrive. Elle ne se relève jamais — un site retiré se déclare en
 * BAISSANT le nombre ci-dessous (la garde échoue sinon, pour que le gel ne
 * garde pas une marge fantôme).
 *
 * Pour lire des contacts, on passe par `ContactEntity` / le service du module
 * Contacts, pas par un SQL brut de plus.
 */
const SRC = join(__dirname, '..')

const CONTACTS_RAW_SQL_SITES: Readonly<Record<string, number>> = {
  'modules/account-access/account-access.service.ts': 3, // #4292.2 — décideurs d'une voie d'accès, borné par workspace_id ET account_id (intégration PR10)
  'modules/accounts/account-hygiene.sql.ts': 1,
  'modules/accounts/account-crm-linked.ts': 1, // #4526.2 — « Mon CRM » : EXISTS sur les contacts venus du CRM, borné par account_id (le compte est déjà de l'espace) ; intégration 24/10 I
  'modules/accounts/account-crm-fusion.ts': 1, // #4603 — fusion compte CRM / compte analyse : doublon de contact (même nom normalisé) testé avant déplacement, borné par workspace_id ET account_id
  'modules/accounts/account-failed-shells.ts': 1, // #4621.3 — la règle « coquille vide » (FAILED_SHELL_SQL) a quitté accounts.service.ts : NOT EXISTS sur les contacts du compte, borné par account.id ; déplacement net zéro (10 → 9 + 1)
  'modules/accounts/accounts.service.ts': 9, // #4294.11 — audit des doublons : EXISTS sur les contacts du compte, borné par account.id (le compte est déjà de l'espace) ; déclaré à l'intégration XVIII
  'modules/accounts/first-euro.service.ts': 2,
  'modules/activities/activities.service.ts': 1,
  'modules/activities/activity-capture.service.ts': 1,
  'modules/analysis/channel-performance-reader.service.ts': 1,
  'modules/analytics/crm-kpis.service.ts': 2,
  'modules/briefing/briefing.service.ts': 1,
  'modules/chains/chain-projectors.ts': 5,
  'modules/consultants/matching/matching.service.ts': 1,
  'modules/consultants/submissions.service.ts': 2,
  'modules/contacts/contacts.service.ts': 7, // #4456 — rejectionReasonsTally retiré (8 → 7) ; #4287.11 — recentlyActedContacts (vague 5) : dans le service Contacts, borné par workspace_id ET périmètre BU (accountIsInScope)
  'modules/crm-core/duplicates.sweeper.ts': 2,
  'modules/crm-core/governance.service.ts': 5, // V12-RETENU-A — fusion SIREN : contacts déplacés / existence côté gardé, bornés par workspace_id (intégration 17/10)
  'modules/crm/account-crm-provenance.ts': 1, // #4459.2 — provenance CRM contact par contact (lot CC), bornée par account_id ET workspace_id
  'modules/crm/crm-import.service.ts': 1,
  'modules/dashboard/cockpit-perspective.service.ts': 1,
  'modules/delivery/account-missions.service.ts': 1,
  'modules/delivery/delivery.service.ts': 3,
  'modules/delivery/invoice-readiness.service.ts': 2,
  'modules/delivery/mission-delivery-milestones.service.ts': 1,
  'modules/delivery/propagation.service.ts': 1,
  'modules/delivery/staffing.service.ts': 5,
  'modules/delivery/timesheets.service.ts': 2,
  'modules/demo/demo-seed.service.ts': 7, // lot CC — marques d'import des contacts « déjà dans le CRM », bornées par workspace_id ; #4069 — contactsOf (semis des affaires de brief) ; #4291.3 — interlocuteurs de l'affaire de renouvellement, par nom ; #4291 J — décideur des besoins du démo forfait (sous-requête du INSERT) ; les trois bornés par workspace_id ET account_id (intégration PR n°2+3) ; SEMIS-PREUVES 4291.7 — le sponsor du besoin forfait, par nom, sous-requête bornée par workspace_id ET account_id (intégration PR n°8) ; #4291.7 — contact du besoin forfait lié au projet, JOIN borné par workspace_id (intégration PR10)
  'modules/demo/demo-team-guardrails-seed.ts': 1, // R24-FIX-B — contact « ne pas contacter » semé, borné par workspace_id
  'modules/mailer/suppression.service.ts': 2,
  'modules/manager/manager.service.ts': 4,
  'modules/message-style/message-style.service.ts': 2,
  'modules/notifications/discover-alerts/discover-alert-event.sweeper.ts': 1,
  'modules/org-graph/org-graph-correction.service.ts': 1,
  'modules/outreach/outreach.service.ts': 1,
  'modules/pilotage/data-hygiene.service.ts': 2,
  'modules/pilotage/pilotage.service.ts': 2,
  'modules/playbooks/playbook-targets.service.ts': 2,
  'modules/privacy/privacy-retention.service.ts': 1,
  'modules/projects/open-needs.service.ts': 2,
  'modules/projects/project-pipeline.service.ts': 4,
  'modules/routines/crm-routines.service.ts': 5, // #4016.L2 — championsDueForEmploymentCheck, borné par workspace_id
  'modules/target-lists/target-lists.service.ts': 3,
  'modules/tasks/tasks.service.ts': 2,
  'modules/workspace-merge/workspace-merge.sql-store.ts': 3, // V13-FUSION-ESPACE — fusion d'espaces : lecture de TOUS les contacts de l'espace fusionné, bornée par workspace_id (intégration 17/10)
}

const RAW_CONTACTS_READ = /\b(?:from|join)\s+contacts\b/gi

function countRawContactsReads(source: string): number {
  return (source.match(RAW_CONTACTS_READ) ?? []).length
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'migrations' || name === 'node_modules') continue
      walk(full, out)
    } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.endsWith('.test.ts')) {
      out.push(full)
    }
  }
  return out
}

function actualSites(): Record<string, number> {
  const sites: Record<string, number> = {}
  for (const file of walk(SRC)) {
    const count = countRawContactsReads(readFileSync(file, 'utf8'))
    if (count > 0) sites[relative(SRC, file)] = count
  }
  return sites
}

describe('GA-405 — la garde LIT vraiment quelque chose', () => {
  it('reconnaît une lecture brute, FROM comme JOIN, sans attraper une table voisine', () => {
    expect(countRawContactsReads('SELECT 1 FROM contacts c WHERE c.id = $1')).toBe(1)
    expect(countRawContactsReads('FROM accounts a\n JOIN contacts ct ON ct.account_id = a.id')).toBe(1)
    expect(countRawContactsReads('SELECT 1 FROM contacts_stops s')).toBe(0)
    expect(countRawContactsReads('SELECT 1 FROM contact_stops s')).toBe(0)
  })

  it('voit les sites du dépôt (un balayage vide ne prouverait rien)', () => {
    const total = Object.values(actualSites()).reduce((sum, n) => sum + n, 0)
    expect(total).toBeGreaterThan(80)
  })
})

describe('GA-405 — aucune lecture brute de contacts de plus, et le gel ne garde pas de marge', () => {
  it('refuse un site neuf ou une lecture de plus dans un fichier gelé', () => {
    const grew = Object.entries(actualSites())
      .filter(([file, n]) => n > (CONTACTS_RAW_SQL_SITES[file] ?? 0))
      .map(([file, n]) => `${file} : ${n} lecture(s), ${CONTACTS_RAW_SQL_SITES[file] ?? 0} gelée(s)`)
    expect(grew).toEqual([])
  })

  it('exige de BAISSER le gel quand un site disparaît', () => {
    const actual = actualSites()
    const stale = Object.entries(CONTACTS_RAW_SQL_SITES)
      .filter(([file, n]) => (actual[file] ?? 0) < n)
      .map(([file, n]) => `${file} : ${actual[file] ?? 0} lecture(s) pour ${n} gelée(s)`)
    expect(stale).toEqual([])
  })
})
