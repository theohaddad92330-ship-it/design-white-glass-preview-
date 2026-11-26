import sys, json
sys.path.insert(0,'apps/ia')
from app.services.access_scoring import barrier_for_company
b=barrier_for_company({'sizeClass':'GE','nafCode':'64.19Z','headcountTranche':'53','establishmentCount':2332,'creationDate':None})
d=dict(b); d.pop('statut',None)
print(json.dumps(d,ensure_ascii=False,indent=1))
