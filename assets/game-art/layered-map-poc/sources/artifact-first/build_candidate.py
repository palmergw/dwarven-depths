#!/usr/bin/env python3
"""Build an artifact-first layered-map candidate from independently authored chroma assets."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT=Path(__file__).resolve().parent
FRAME=(1280,720)
OUT=ROOT/'candidate'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def extract_chroma(path:Path)->Image.Image:
    src=Image.open(path).convert('RGB')
    out=Image.new('RGBA',src.size,(0,0,0,0));out_pixels=[]
    bg=(4,248,4)
    for r,g,b in src.get_flattened_data():  # type: ignore[misc]
        dominance=g-max(r,b)
        a=max(0,min(255,round((245-dominance)*255/245)))
        if a<8:
            out_pixels.append((0,0,0,0));continue
        af=a/255
        rr=max(0,min(255,round((r-(1-af)*bg[0])/af)))
        gg=max(0,min(255,round((g-(1-af)*bg[1])/af)))
        bb=max(0,min(255,round((b-(1-af)*bg[2])/af)))
        out_pixels.append((rr,gg,bb,a))
    out.putdata(out_pixels)
    bbox=out.getchannel('A').getbbox()
    if bbox is None:raise ValueError(f'empty artifact {path}')
    return out.crop(bbox)

def fit_width(im:Image.Image,width:int)->Image.Image:
    height=round(im.height*width/im.width)
    return im.resize((width,height),Image.Resampling.LANCZOS)

def registered(asset:Image.Image,xy:tuple[int,int])->Image.Image:
    layer=Image.new('RGBA',FRAME,(0,0,0,0));layer.alpha_composite(asset,xy);return layer

def checker(size):
    im=Image.new('RGBA',size,(60,66,76,255));d=ImageDraw.Draw(im)
    for y in range(0,size[1],20):
        for x in range(0,size[0],20):
            if (x//20+y//20)%2==0:d.rectangle((x,y,x+19,y+19),fill=(95,102,114,255))
    return im

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    base=Image.open(ROOT/'environment-base-master.png').convert('RGBA').resize(FRAME,Image.Resampling.LANCZOS)
    entrance=fit_width(extract_chroma(ROOT/'entrance-shell-chroma-master.png'),190)
    gantry=extract_chroma(ROOT/'gantry-shell-chroma-master.png').resize((650,300),Image.Resampling.LANCZOS)
    entrance_layer=registered(entrance,(1015,5))
    gantry_layer=registered(gantry,(500,25))
    reference=base.copy();reference.alpha_composite(entrance_layer);reference.alpha_composite(gantry_layer)
    base.save(OUT/'environment-base.png')
    entrance_layer.save(OUT/'entrance-shell.png')
    gantry_layer.save(OUT/'gantry-shell.png')
    reference.save(OUT/'reference-plate.png')
    board=Image.new('RGBA',(1920,1080),(9,13,18,255));d=ImageDraw.Draw(board);f=ImageFont.truetype(FONT,28);small=ImageFont.truetype(FONT,18)
    d.text((24,18),'ARTIFACT-FIRST LAYERED MAP — WORKING CANDIDATE',font=f,fill=(245,226,180,255))
    d.text((24,55),'reference plate is derived from a structure-free base plus canonical RGBA assets; no traced masks',font=small,fill=(170,194,210,255))
    board.alpha_composite(reference.resize((1280,720),Image.Resampling.LANCZOS),(20,90))
    c=checker((560,330));e=entrance.copy();e.thumbnail((240,280));g=gantry.copy();g.thumbnail((520,250));c.alpha_composite(e,(20,25));c.alpha_composite(g,(20,95));board.alpha_composite(c,(1340,90))
    d.text((1350,430),'CANONICAL RGBA ARTIFACTS',font=small,fill=(245,226,180,255))
    d.text((24,835),f'base 1280×720 | entrance native alpha → {entrance.size[0]}×{entrance.size[1]} | gantry native alpha → {gantry.size[0]}×{gantry.size[1]}',font=small,fill=(190,205,216,255))
    board.save(OUT/'artifact-first-progress-board.png')
    print({'ok':True,'entranceSize':entrance.size,'gantrySize':gantry.size,'out':str(OUT)})
if __name__=='__main__':main()
