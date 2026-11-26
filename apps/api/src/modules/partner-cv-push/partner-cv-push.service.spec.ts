import { PartnerCvPushService } from './partner-cv-push.service'

describe('la revue d’un CV poussé à un partenaire (#2887, #2371.8)', () => {
  const consultant = {
    id: 'c1',
    workspace_id: 'w1',
    full_name: 'Ada Lovelace',
    title: 'Architecte data',
    seniority: 'senior',
    years_experience: 9,
    tjm: 650,
  }
  const partner = { id: 'p1', workspaceId: 'w1', name: 'Astréa' }

  const service = (
    rows: Record<string, unknown>[] = [],
    consultants: Record<string, unknown>[] = [consultant],
    partners: Record<string, unknown>[] = [partner],
  ) => {
    const repo = {
      find: jest.fn().mockResolvedValue(rows),
      findOne: jest.fn(async ({ where }: { where: { id: string } }) => rows.find(r => r['id'] === where.id) ?? null),
      create: jest.fn((row: Record<string, unknown>) => row),
      save: jest.fn(async (row: Record<string, unknown>) => ({
        id: row['id'] ?? 'new',
        created_at: new Date(),
        ...row,
      })),
    }
    const consultantRepo = {
      findOne: jest.fn(
        async ({ where }: { where: { id: string; workspace_id: string } }) =>
          consultants.find(c => c['id'] === where.id && c['workspace_id'] === where.workspace_id) ?? null,
      ),
    }
    const partnerRepo = {
      findOne: jest.fn(
        async ({ where }: { where: { id: string; workspaceId: string } }) =>
          partners.find(p => p['id'] === where.id && p['workspaceId'] === where.workspaceId) ?? null,
      ),
    }
    return {
      svc: new PartnerCvPushService(repo as never, consultantRepo as never, partnerRepo as never),
      repo,
      consultantRepo,
      partnerRepo,
    }
  }

  describe('brief et économie — dérivés du consultant, jamais dupliqués', () => {
    it('lit le brief et le TJM réels sur la fiche consultant', async () => {
      const { svc } = service()
      const preview = await svc.previewCvPush('w1', 'c1')
      expect(preview).toEqual({
        brief: { consultantName: 'Ada Lovelace', title: 'Architecte data', seniority: 'senior', yearsExperience: 9 },
        economics: { tjm: 650, marginSharePct: null },
      })
    })

    it('ne devine rien pour un consultant sans TJM déclaré', async () => {
      const { svc } = service([], [{ ...consultant, tjm: null }])
      const preview = await svc.previewCvPush('w1', 'c1')
      expect(preview.economics.tjm).toBeNull()
    })

    it('refuse un consultant hors de cet espace — jamais de brief inventé', async () => {
      const { svc } = service([], [{ ...consultant, workspace_id: 'autre-espace' }])
      await expect(svc.previewCvPush('w1', 'c1')).rejects.toThrow()
    })
  })

  describe('préparer un push — jamais un envoi', () => {
    it('crée la revue au statut préparé, retour en attente', async () => {
      const { svc, repo } = service()
      const push = await svc.prepareCvPush('w1', 'p1', 'c1', 'user-1')
      expect(push.status).toBe('preparee')
      expect(push.outcome).toBe('en_attente')
      expect(push.brief.consultantName).toBe('Ada Lovelace')
      expect(push.economics.tjm).toBe(650)
      expect(repo.save).toHaveBeenCalled()
    })

    it('refuse un partenaire hors de cet espace', async () => {
      const { svc } = service([], [consultant], [{ ...partner, workspaceId: 'autre-espace' }])
      await expect(svc.prepareCvPush('w1', 'p1', 'c1', 'user-1')).rejects.toThrow()
    })
  })

  describe('lister les revues d’un partenaire', () => {
    it('rend chaque ligne avec son brief et son économie recalculés', async () => {
      const row = {
        id: 'push-1',
        workspace_id: 'w1',
        partner_relation_id: 'p1',
        consultant_id: 'c1',
        margin_share_pct: 15,
        status: 'preparee',
        outcome: 'en_attente',
        prepared_by: 'user-1',
        sent_declared_at: null,
        created_at: new Date('2026-09-28T10:00:00Z'),
      }
      const { svc } = service([row])
      const list = await svc.listCvPushes('w1', 'p1')
      expect(list).toHaveLength(1)
      expect(list[0]?.economics).toEqual({ tjm: 650, marginSharePct: 15 })
      expect(list[0]?.brief.consultantName).toBe('Ada Lovelace')
    })
  })

  describe('déclarer un envoi — jamais une preuve', () => {
    it('marque le statut déclaré envoyé, date le geste', async () => {
      const row = {
        id: 'push-1',
        workspace_id: 'w1',
        partner_relation_id: 'p1',
        consultant_id: 'c1',
        margin_share_pct: null,
        status: 'preparee',
        outcome: 'en_attente',
        prepared_by: 'user-1',
        sent_declared_at: null,
        created_at: new Date(),
      }
      const { svc, repo } = service([row])
      const updated = await svc.declareSent('w1', 'push-1')
      expect(updated?.status).toBe('envoyee_declaree')
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'envoyee_declaree' }))
    })

    it('rend null pour un push qui n’existe pas dans cet espace', async () => {
      const { svc } = service([])
      const updated = await svc.declareSent('w1', 'introuvable')
      expect(updated).toBeNull()
    })
  })

  describe('enregistrer le retour du partenaire', () => {
    it('accepte le verdict déclaré par un humain', async () => {
      const row = {
        id: 'push-1',
        workspace_id: 'w1',
        partner_relation_id: 'p1',
        consultant_id: 'c1',
        margin_share_pct: null,
        status: 'envoyee_declaree',
        outcome: 'en_attente',
        prepared_by: 'user-1',
        sent_declared_at: new Date(),
        created_at: new Date(),
      }
      const { svc } = service([row])
      const updated = await svc.recordOutcome('w1', 'push-1', 'retenu')
      expect(updated?.outcome).toBe('retenu')
    })
  })
})
