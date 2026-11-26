import re,sys
p='apps/api/src/modules/demo/demo-dataset.ts'
L=open(p).read().split('\n')
for name,a,b in [('thales',2122,3030),('lbc',3221,3945),('bbc',4124,4750),('dec',5929,6270),('sncf',5036,5800),('sg',877,1900),('bpce',7075,7226)]:
    print('==',name)
    out=[]
    for i in range(a-1,b):
        m=re.match(r'^(  |    )([a-z_A-Z]+):',L[i])
        if m: out.append(f"{i+1}:{m.group(2)}")
    print(' '.join(out))
