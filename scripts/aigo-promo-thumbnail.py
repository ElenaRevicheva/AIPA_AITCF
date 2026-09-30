from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
W,H=1280,720
im=Image.open('k_thumb2.jpg').convert('RGB').resize((W,H),Image.LANCZOS)
im=ImageEnhance.Contrast(im).enhance(1.08)
# darken the right half so text pops
grad=Image.new('L',(W,H),0); g=ImageDraw.Draw(grad)
for x in range(W):
    a=int(max(0,min(1,(x-520)/360))*150); g.line([(x,0),(x,H)],fill=a)
im=Image.composite(Image.new('RGB',(W,H),(4,6,10)),im,grad)
d=ImageDraw.Draw(im)
def bold(sz,w=b'ExtraBold'):
    f=ImageFont.truetype('Manrope-var.ttf',sz); f.set_variation_by_name(w); return f
serif=lambda sz: ImageFont.truetype('InstrumentSerif-Regular.ttf',sz)
GOLD=(230,200,138); X=668
def shadow_text(xy,t,f,fill):
    x,y=xy
    sh=Image.new('RGBA',(W,H),(0,0,0,0)); ds=ImageDraw.Draw(sh); ds.text((x+4,y+5),t,font=f,fill=(0,0,0,200))
    sh=sh.filter(ImageFilter.GaussianBlur(6)); im.paste(sh,(0,0),sh); ImageDraw.Draw(im).text((x,y),t,font=f,fill=fill)
shadow_text((X,170),'SHE ASKED',bold(100),(255,255,255))
shadow_text((X,290),'AI FIRST',bold(128),GOLD)
d=ImageDraw.Draw(im)
d.line([(X+6,452),(X+170,452)],fill=GOLD,width=4)
shadow_text((X,478),'Was your yacht on the list?',serif(50),(235,235,235))
shadow_text((X,600),'AI GROWTH OPERATOR  ·  AIdeazz AI Lab',bold(26,b'SemiBold'),(200,200,200))
im.save('thumb_v1.jpg',quality=92)
print(im.size)
