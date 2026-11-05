import sys, glob, os
from PIL import Image, ImageDraw
from collections import deque
def navy(p): r,g,b,a=p; return a>128 and b>70 and b>r+35 and r<90 and g<110
def skin(p): r,g,b,a=p; return a>128 and g>190 and g>r+15 and g>b+15
def find_eyes(im):
    W,H=im.size; px=im.load(); seen=set(); comps=[]
    bx=im.getbbox()
    for y in range(bx[1],bx[1]+int((bx[3]-bx[1])*.6)):
        for x in range(W):
            if (x,y) in seen or not navy(px[x,y]): continue
            q=deque([(x,y)]); seen.add((x,y)); pts=[]
            while q:
                a,b=q.popleft(); pts.append((a,b))
                for d in ((1,0),(-1,0),(0,1),(0,-1)):
                    n=(a+d[0],b+d[1])
                    if 0<=n[0]<W and 0<=n[1]<H and n not in seen and navy(px[n]): seen.add(n); q.append(n)
            xs=[p[0] for p in pts]; ys=[p[1] for p in pts]; bb=(min(xs),min(ys),max(xs),max(ys)); w=bb[2]-bb[0]+1; h=bb[3]-bb[1]+1
            if len(pts)<6 or not (0.5<w/h<2.0): continue
            # mostly skin around
            ring=[px[c] for c in [(bb[0]-2,(bb[1]+bb[3])//2),(bb[2]+2,(bb[1]+bb[3])//2),((bb[0]+bb[2])//2,bb[3]+2)] if 0<=c[0]<W and 0<=c[1]<H]
            if sum(skin(r) for r in ring)>=2: comps.append((len(pts),bb))
    comps.sort(reverse=True); c=[b for _,b in comps[:4]]
    best=None
    for i in range(len(c)):
        for j in range(i+1,len(c)):
            a,b=c[i],c[j]; ha=a[3]-a[1]; hb=b[3]-b[1]
            if abs((a[1]+a[3])-(b[1]+b[3]))/2<=max(3,ha*.5) and abs(ha-hb)<=max(3,ha*.5): best=sorted([a,b]); break
        if best: break
    return best
def fix(src,dst,kind):
    im=Image.open(src).convert('RGBA'); px=im.load(); E=find_eyes(im)
    if not E: return False
    for bb in E:
        x0,y0,x1,y1=bb; cx=(x0+x1)/2; cy=(y0+y1)/2; w=x1-x0+1; h=y1-y0+1
        # skin colour sampled beside the eye
        s=px[x0-w//2-2,int(cy)] if skin(px[x0-w//2-2,int(cy)]) else px[x1+w//2+2,int(cy)]
        m=max(3,round(w*0.3))
        for y in range(y0-m,y1+m+1):
            for x in range(x0-m,x1+m+1):
                p=px[x,y]
                if p[3]>128 and not (p[0]>200 and p[1]<200 and p[0]>p[2]+20) and not (p[0]>p[2]+25 and p[1]<150) and y>=y0-m//2: px[x,y]=s  # keep blush pinks
        d=ImageDraw.Draw(im); ink=(0x1d,0x25,0x57,255); t=max(1,round(h/7))
        if kind=='x2':  # smiling ^ ^ eyes
            d.arc([x0,cy-h*0.25,x1,cy+h*0.55],200,340,fill=ink,width=t+1)
        else:          # small dot eyes
            r=max(1.5,w*0.24); d.ellipse([cx-r,cy-r,cx+r,cy+r],fill=ink)
            if r>=3: d.point((int(cx-r/3),int(cy-r/3)),fill=(255,255,255,255))
    os.makedirs(os.path.dirname(dst),exist_ok=True); im.save(dst); return True
if __name__=='__main__':
    root='/workspace/tamagotchi/public/assets'; bad=[]
    files=[f for f in glob.glob(root+'/outfits/x1/*/*.png')]+[root+f'/pets/x1/{s}.png' for s in ('baby','child','adult')]
    for f in files:
        for k in ('x2','x3'):
            if not fix(f,f.replace('/x1/','/%s/'%k),k): bad.append(f); break
    print(len(files),'bad',len(bad),bad[:10])
