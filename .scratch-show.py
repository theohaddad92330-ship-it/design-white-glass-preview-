import json,sys
d=json.load(open('/private/tmp/claude-501/-Users-louisschlegel-Desktop-belllum-monorepo/731bc06d-999b-4a76-81d3-e957e43c8585/scratchpad/dump-orig2.json'))
for field in ['sigTypes','sigKeys','chKeys','contactKeys','ctVals','angleKeys','accountKeys','rawOrgKeys','n']:
    print('#####',field)
    for a in d:
        print(' ',a['company'][:10].ljust(10), json.dumps(a[field],ensure_ascii=False)[:600])
