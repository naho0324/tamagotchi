import sys,os,numpy as np
from PIL import Image
from scipy import ndimage
H={'adult':240,'child':150}; CW,CH=200,260
OUT=['base','hoodie','stripe','dress','hanbok','space']
def crop(path,char,stage,hair,root='/workspace/outfit_sprites'):
    im=np.asarray(Image.open(path).convert('RGB')).astype(int)
    bg=np.median(np.concatenate([im[:8].reshape(-1,3),im[-8:].reshape(-1,3)]),0)
    d=np.abs(im-bg).sum(2); fg=d>40
    fg=ndimage.binary_fill_holes(ndimage.binary_closing(fg,iterations=2))
    lab,n=ndimage.label(fg); sizes=ndimage.sum(fg,lab,range(1,n+1))
    big=[i+1 for i,s in enumerate(sizes) if s>3000]
    if len(big)!=6:
        rows=np.where(fg.any(1))[0]; y0=rows[0]+int((rows[-1]-rows[0])*0.6)
        l2,n2=ndimage.label(fg[y0:]); sz=ndimage.sum(fg[y0:],l2,range(1,n2+1))
        cs=sorted(ndimage.center_of_mass(fg[y0:],l2,[i+1 for i,v in enumerate(sz) if v>800]),key=lambda c:c[1])
        if len(cs)!=6: return f'FAIL {len(big)} comps/{len(cs)} bodies'
        col=fg.sum(0); xs=[int(c[1]) for c in cs]
        cuts=[a+int(np.argmin(col[a:b])) for a,b in zip(xs,xs[1:])]
        for x in cuts: fg[:,x]=False
        lab,n=ndimage.label(fg); sizes=ndimage.sum(fg,lab,range(1,n+1))
        big=[i+1 for i,s in enumerate(sizes) if s>3000]
        if len(big)!=6: return f'FAIL split {len(big)}'
    objs=ndimage.find_objects(lab)
    big.sort(key=lambda i:objs[i-1][1].start)
    os.makedirs(f'{root}/{char}/{stage}',exist_ok=True)
    for k,i in enumerate(big):
        sl=objs[i-1]; m=(lab[sl]==i)
        rgba=np.dstack([im[sl],m*255]).astype(np.uint8)
        s=Image.fromarray(rgba,'RGBA'); h=H[stage]; w=max(1,round(s.width*h/s.height))
        if w>CW-4: w=CW-4; h=round(s.height*w/s.width)
        s=s.resize((w,h),Image.NEAREST); c=Image.new('RGBA',(CW,CH))
        c.paste(s,((CW-w)//2,CH-4-h)); c.save(f'{root}/{char}/{stage}/{hair}_{OUT[k]}.png')
    return 'ok'
if __name__=='__main__': print(crop(*sys.argv[1:5]))
