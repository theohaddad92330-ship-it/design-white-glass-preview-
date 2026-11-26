import re,sys
p=sys.argv[1]
lo=int(sys.argv[2]); hi=int(sys.argv[3])
pat=re.compile(r'Thales|leboncoin|BlaBlaCar|Decathlon|Patrice Caine|Mazzella|Younes|Julien Leclercq|Guillet|Delannoy')
L=open(p).read().split('\n')
for i,l in enumerate(L,1):
    if lo<=i<=hi:
        for m in pat.finditer(l):
            a=max(0,m.start()-110); b=min(len(l),m.end()+130)
            print(f"{i}: …{l[a:b]}…")
