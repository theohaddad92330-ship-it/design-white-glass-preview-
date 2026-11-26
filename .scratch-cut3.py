B='apps/api/src/modules/demo/'
def edit(f, pairs):
    p=f if f.startswith('apps/') else B+f
    s=open(p).read()
    for a,b in pairs:
        assert a in s,(f,a[:80])
        s=s.replace(a,b)
    open(p,'w').write(s)

edit('demo-activity-outcome-coverage.spec.ts',[("(Thales, « Point programme »)","(SNCF, « Point sur le besoin publié »)")])
edit('demo-audit-plan-coverage.spec.ts',[
("(Decathlon\n * +10j, leboncoin +17j, SNCF +24j)","(Société Générale\n * +10j, Groupe BPCE +17j, SNCF +24j)"),
("la tâche en retard (BlaBlaCar)","la tâche en retard (Groupe BPCE)"),
])
edit('demo-briefing-card-coverage.spec.ts',[("'Thales'","'Groupe BPCE'")])
edit('demo-briefing.spec.ts',[("'Thales'","'Groupe BPCE'")])
edit('demo-briefing.ts',[("(SNCF, Thales…)","(SNCF, Société Générale…)")])
edit('demo-contact-profile.spec.ts',[("'Thales'","'Groupe BPCE'")])
edit('demo-enrichment.spec.ts',[("'Thales'","'Société Générale'")])
edit('demo-entities-stale-collection-coverage.spec.ts',[("Thales)","Société Générale)")])
edit('demo-laura-gestures-coverage.spec.ts',[("Thales ?","SNCF ?")])
edit('demo-legal-entity-write-order.spec.ts',[("(BlaBlaCar,","(Société Générale,"),("contrat BlaBlaCar","contrat Société Générale")])
edit('demo-profile-context-coverage.spec.ts',[("['Société Générale', 'Thales', 'leboncoin', 'BlaBlaCar', 'SNCF', 'Decathlon']","['Société Générale', 'Groupe BPCE', 'SNCF']")])
edit('demo-reset.service.spec.ts',[("plan Thales >","plan SNCF >")])
edit('demo-seed-fingerprint.spec.ts',[("'Thales'","'SNCF'")])
edit('demo-seed-fingerprint.ts',[("plan Thales >","plan SNCF >")])
edit('demo-sprint-board-coverage.spec.ts',[("(BlaBlaCar/SNCF, Thales, Decathlon)","(les quatre comptes non cibles)")])
edit('demo.module.ts',[("(Thales)","(Société Générale)")])
edit('demo-dataset.ts',[
("après le retrait de Thales)","après le retrait des quatre comptes non cibles)"),
("(retrait de Thales qui la portait)","(retrait des quatre comptes non cibles)"),
("(retrait de Thales et leboncoin qui les portaient)","(retrait des quatre comptes non cibles)"),
("de Thales qui portait les siennes)","des comptes retirés qui portaient les leurs)"),
("(retrait de leboncoin)","(retrait des quatre comptes non cibles)"),
("retrait de Thales), pour que","retrait des quatre comptes non cibles), pour que"),
])
print('ok')
