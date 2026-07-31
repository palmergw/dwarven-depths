#!/usr/bin/env python3
"""Build an artifact-first layered-map candidate from independently authored chroma assets."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parent
FRAME=(1280,720)
OUT=ROOT/'candidate'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def extract_chroma(path:Path)->Image.Image:
    src=Image.open(path).convert('RGB')
    out=Image.new('RGBA',src.size,(0,0,0,0));out_pixels=[]
    corners=(src.getpixel((0,0)),src.getpixel((src.width-1,0)),src.getpixel((0,src.height-1)),src.getpixel((src.width-1,src.height-1)))
    bg=tuple(round(sum(pixel[channel] for pixel in corners)/len(corners)) for channel in range(3))
    for r,g,b in src.get_flattened_data():  # type: ignore[misc]
        dominance=g-max(r,b)
        # Generated chroma fields vary slightly between assets. Derive alpha
        # from green dominance rather than assuming one exact background RGB.
        a=max(0,min(255,round((190-dominance)*255/110)))
        if a<8:
            out_pixels.append((0,0,0,0));continue
        af=a/255
        rr=max(0,min(255,round((r-(1-af)*bg[0])/af)))
        gg=max(0,min(255,round((g-(1-af)*bg[1])/af)))
        bb=max(0,min(255,round((b-(1-af)*bg[2])/af)))
        # The approved material palette contains no green emission. Remove
        # residual chroma spill from antialiased metal, timber, and chain edges.
        gg=min(gg,max(rr,bb))
        out_pixels.append((rr,gg,bb,a))
    out.putdata(out_pixels)
    bbox=out.getchannel('A').getbbox()
    if bbox is None:raise ValueError(f'empty artifact {path}')
    return out.crop(bbox)

def fit_width(im:Image.Image,width:int)->Image.Image:
    height=round(im.height*width/im.width)
    return sanitize(im.resize((width,height),Image.Resampling.LANCZOS))

def sanitize(im:Image.Image)->Image.Image:
    pixels=[]
    for r,g,b,a in im.convert('RGBA').get_flattened_data():  # type: ignore[misc]
        pixels.append((0,0,0,0) if a==0 else (r,g,b,a))
    out=Image.new('RGBA',im.size,(0,0,0,0));out.putdata(pixels);return out

def registered(asset:Image.Image,xy:tuple[int,int])->Image.Image:
    layer=Image.new('RGBA',FRAME,(0,0,0,0));layer.alpha_composite(asset,xy);return layer

def checker(size):
    im=Image.new('RGBA',size,(60,66,76,255));d=ImageDraw.Draw(im)
    for y in range(0,size[1],20):
        for x in range(0,size[0],20):
            if (x//20+y//20)%2==0:d.rectangle((x,y,x+19,y+19),fill=(95,102,114,255))
    return im

def build(out:Path):
    out.mkdir(parents=True,exist_ok=True)
    base=Image.open(ROOT/'environment-base-master.png').convert('RGBA').resize(FRAME,Image.Resampling.LANCZOS)
    entrance=fit_width(extract_chroma(ROOT/'entrance-shell-chroma-master.png'),190)
    gantry=fit_width(extract_chroma(ROOT/'gantry-shell-chroma-master.png'),520)
    entrance_layer=registered(entrance,(1015,5))
    gantry_layer=registered(gantry,(490,20))
    reference=base.copy();reference.alpha_composite(entrance_layer);reference.alpha_composite(gantry_layer)
    base.save(out/'environment-base.png')
    entrance_layer.save(out/'entrance-shell.png')
    gantry_layer.save(out/'gantry-shell.png')
    reference.save(out/'reference-plate.png')
    board=Image.new('RGBA',(1920,1080),(9,13,18,255));d=ImageDraw.Draw(board);f=ImageFont.truetype(FONT,28);small=ImageFont.truetype(FONT,18)
    d.text((24,18),'ARTIFACT-FIRST LAYERED MAP — WORKING CANDIDATE',font=f,fill=(245,226,180,255))
    d.text((24,55),'reference plate is derived from a structure-free base plus canonical RGBA assets; no traced masks',font=small,fill=(170,194,210,255))
    board.alpha_composite(reference.resize((1280,720),Image.Resampling.LANCZOS),(20,90))
    c=checker((560,330));e=entrance.copy();e.thumbnail((240,280));g=gantry.copy();g.thumbnail((520,250));c.alpha_composite(e,(20,25));c.alpha_composite(g,(20,95));board.alpha_composite(c,(1340,90))
    d.text((1350,430),'CANONICAL RGBA ARTIFACTS',font=small,fill=(245,226,180,255))
    d.text((24,835),f'base 1280×720 | entrance native alpha → {entrance.size[0]}×{entrance.size[1]} | gantry native alpha → {gantry.size[0]}×{gantry.size[1]}',font=small,fill=(190,205,216,255))
    board.save(out/'artifact-first-progress-board.png')
    return {'ok':True,'entranceSize':entrance.size,'gantrySize':gantry.size,'out':str(out)}

def main():
    print(build(OUT))
if __name__=='__main__':main()
