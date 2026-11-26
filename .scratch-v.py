import sys
# usage: v.py file a-b [a-b ...]
p=sys.argv[1]
L=open(p).read().split('\n')
for r in sys.argv[2:]:
    a,b=map(int,r.split('-'))
    print('---',r)
    for i in range(a-1,min(b,len(L))):
        print(f"{i+1}: {L[i][:260]}")
