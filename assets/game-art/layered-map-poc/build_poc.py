#!/usr/bin/env python3
"""Deterministic layered-map proof-of-concept compositor and verifier."""
from __future__ import annotations
import argparse, hashlib, json, shutil, tempfile
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT=Path(__file__).resolve().parents[3]
PACKAGE=Path(__file__).resolve().parent
FRAME=(1280,720)
MASTER=PACKAGE/'sources/layered-shuttergate-master.png'
MASKS={
 'entrance-shell':PACKAGE/'sources/entrance-shell-mask.png',
 'gantry-shell':PACKAGE/'sources/gantry-shell-mask.png',
}
ENTITY_ROOT=ROOT/'assets/game-art/production-scene/exports'
SPRITES={
 'solid-warden':(ENTITY_ROOT/'diagnostics/solid-warden-proxy.png',(56,66)),
 'solid-raider':(ENTITY_ROOT/'diagnostics/solid-raider-proxy.png',(40,54)),
 'warden':(ENTITY_ROOT/'entities/iron-warden-idle.png',(56,66)),
 'raider':(ENTITY_ROOT/'entities/mine-raider-idle.png',(40,54)),
}
ENTRANCE_POINTS=[(1050,165),(1035,180),(1020,195),(1005,210),(990,225),(970,240),(950,255)]
GANTRY_POINTS=[(790,430),(750,450),(710,470),(670,490),(630,510),(590,530),(550,550)]
FONT_PATH=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')


def font(size:int,bold:bool=False):
 p=FONT_PATH.with_name('DejaVuSans-Bold.ttf') if bold else FONT_PATH
 return ImageFont.truetype(str(p),size) if p.exists() else ImageFont.load_default()

def sha(path:Path)->str:
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()

def prepare_plate()->Image.Image:
 src=Image.open(MASTER).convert('RGBA')
 if abs(src.width/src.height-16/9)>0.01:raise ValueError(f'unexpected master aspect {src.size}')
 return src.resize(FRAME,Image.Resampling.LANCZOS)

def load_mask(path:Path)->Image.Image:
 m=Image.open(path).convert('L')
 if m.size!=FRAME:raise ValueError(f'bad mask dimensions: {path}')
 if m.getbbox() is None:raise ValueError(f'empty mask: {path}')
 if sum(m.histogram()[1:255])!=0:raise ValueError(f'mask must be strictly binary: {path}')
 return m

def overlay_from(plate:Image.Image,mask:Image.Image)->Image.Image:
 out=Image.new('RGBA',FRAME,(0,0,0,0));out.paste(plate,(0,0),mask);out.putalpha(mask);return out

def sprite(name:str)->tuple[Image.Image,tuple[int,int]]:
 p,pivot=SPRITES[name];return Image.open(p).convert('RGBA'),pivot

def place(base:Image.Image,subject:Image.Image,ground:tuple[int,int],pivot:tuple[int,int])->None:
 base.alpha_composite(subject,(ground[0]-pivot[0],ground[1]-pivot[1]))

def contour(mask:Image.Image)->Image.Image:
 dil=mask.filter(ImageFilter.MaxFilter(3))
 ero=mask.filter(ImageFilter.MinFilter(3))
 return ImageChops.difference(dil,ero)

def checker(size:tuple[int,int])->Image.Image:
 out=Image.new('RGBA',size,(45,50,58,255));d=ImageDraw.Draw(out)
 for y in range(0,size[1],16):
  for x in range(0,size[0],16):
   if (x//16+y//16)%2==0:d.rectangle((x,y,x+15,y+15),fill=(82,88,98,255))
 return out

def panel_header(board:Image.Image,xy:tuple[int,int],title:str,sub:str='')->None:
 d=ImageDraw.Draw(board);x,y=xy
 d.text((x,y),title,font=font(24,True),fill=(244,228,185,255))
 if sub:d.text((x,y+30),sub,font=font(15),fill=(166,187,204,255))

def make_sweep(plate,overlay,points,subject_name,title,subtitle)->Image.Image:
 subject,pivot=sprite(subject_name);n=len(points);pw=220;ph=190
 board=Image.new('RGBA',(40+n*pw,280),(12,17,23,255));panel_header(board,(24,14),title,subtitle)
 for i,p in enumerate(points):
  frame=plate.copy();place(frame,subject,p,pivot);frame.alpha_composite(overlay)
  crop=(p[0]-90,p[1]-115,p[0]+90,p[1]+45)
  shot=frame.crop(crop).resize((200,178),Image.Resampling.NEAREST)
  x=25+i*pw;board.alpha_composite(shot,(x,92))
  d=ImageDraw.Draw(board);d.text((x,70),f'{i+1}  ground {p[0]},{p[1]}',font=font(13),fill=(220,226,230,255))
 return board

def make_combined_sweeps(plate,overlays,actual:bool)->Image.Image:
 a=make_sweep(plate,overlays['entrance-shell'],ENTRANCE_POINTS,'raider' if actual else 'solid-raider','ENTRANCE SHELL — '+('PRODUCTION RAIDER' if actual else 'SOLID RAIDER PROXY'),'inside tunnel → aperture → open road; exact foreground RGBA composites last')
 b=make_sweep(plate,overlays['gantry-shell'],GANTRY_POINTS,'warden' if actual else 'solid-warden','GANTRY SHELL — '+('PRODUCTION WARDEN' if actual else 'SOLID WARDEN PROXY'),'upper terrace → beneath beam → defended plaza; no visibility toggle')
 out=Image.new('RGBA',(max(a.width,b.width),a.height+b.height),(8,12,17,255));out.alpha_composite(a);out.alpha_composite(b,(0,a.height));return out

def make_isolation(plate,masks,overlays)->Image.Image:
 specs=[('entrance-shell',(900,0,1180,270)),('gantry-shell',(390,270,810,680))]
 board=Image.new('RGBA',(1500,1060),(10,14,20,255));panel_header(board,(24,14),'CANONICAL FOREGROUND ARTIFACTS','source pixels + authored alpha; checker, alpha, one-pixel contour, and no-op reconstruction')
 d=ImageDraw.Draw(board)
 for col,(name,crop) in enumerate(specs):
  x=30+col*735;d.text((x,64),name,font=font(20,True),fill=(235,196,112,255))
  crop_size=(690,300)
  bg=checker(FRAME);bg.alpha_composite(overlays[name]);view=bg.crop(crop).resize(crop_size,Image.Resampling.NEAREST);board.alpha_composite(view,(x,90))
  m=masks[name].crop(crop).resize(crop_size,Image.Resampling.NEAREST)
  alpha=Image.merge('RGBA',(m,m,m,Image.new('L',crop_size,255)));board.alpha_composite(alpha,(x,410))
  src=plate.crop(crop).resize(crop_size,Image.Resampling.NEAREST);c=contour(masks[name]).crop(crop).resize(crop_size,Image.Resampling.NEAREST)
  tint=Image.new('RGBA',crop_size,(40,255,220,0));tint.putalpha(c);src.alpha_composite(tint);board.alpha_composite(src,(x,730))
  d.text((x,394),'checkerboard RGBA artifact',font=font(14),fill=(180,190,200,255));d.text((x,714),'authored alpha',font=font(14),fill=(180,190,200,255));d.text((x,1034),'source + cyan alpha contour',font=font(14),fill=(180,190,200,255))
 # no-op assertion in title area
 recon=plate.copy();recon.alpha_composite(overlays['entrance-shell']);recon.alpha_composite(overlays['gantry-shell']);diff=ImageChops.difference(plate,recon)
 pixels=[]
 for y in range(diff.height):
  for x in range(diff.width):
   px=diff.getpixel((x,y))
   if not isinstance(px,tuple):raise TypeError('expected RGBA difference pixel')
   pixels.append(tuple(int(channel) for channel in px))
 changed=sum(1 for px in pixels if px!=(0,0,0,0))
 mx=max(max(px) for px in pixels)
 d.text((885,48),f'NO-ENTITY RECONSTRUCTION: changedPixels={changed}  maxDelta={mx}',font=font(13,True),fill=(100,255,170,255) if changed==0 else (255,80,80,255))
 return board

def make_overview(plate,overlays)->Image.Image:
 scene=plate.copy();raider,rp=sprite('raider');warden,wp=sprite('warden')
 place(scene,raider,(1005,210),rp);scene.alpha_composite(overlays['entrance-shell'])
 place(scene,warden,(630,510),wp);scene.alpha_composite(overlays['gantry-shell'])
 board=Image.new('RGBA',(1280,810),(9,13,18,255));board.alpha_composite(scene,(0,90));panel_header(board,(24,16),'LAYERED SHUTTERGATE — PROOF OF CONCEPT','one clean map, two explicit foreground RGBA artifacts, approved 56/44 px units; no HUD or runtime-state claim')
 return board

def write_json(path:Path,data)->None:path.write_text(json.dumps(data,indent=2,sort_keys=True)+'\n')

def build(out_root:Path)->list[Path]:
 exp=out_root/'exports';ev=out_root/'evidence';meta=out_root/'metadata'
 for p in [exp/'environment',exp/'foreground',ev,meta]:p.mkdir(parents=True,exist_ok=True)
 plate=prepare_plate();plate_path=exp/'environment/layered-shuttergate-clean-plate-1280x720.png';plate.save(plate_path,optimize=False,compress_level=9)
 masks={k:load_mask(v) for k,v in MASKS.items()};overlays={k:overlay_from(plate,m) for k,m in masks.items()}
 no_op=plate.copy()
 for key in ('entrance-shell','gantry-shell'):no_op.alpha_composite(overlays[key])
 if ImageChops.difference(plate,no_op).getbbox() is not None:
  raise ValueError('foreground artifacts must reconstruct the no-entity plate exactly')
 files=[plate_path]
 for k in masks:
  mp=exp/'foreground'/f'{k}-mask.png';op=exp/'foreground'/f'{k}.png';masks[k].save(mp,optimize=False,compress_level=9);overlays[k].save(op,optimize=False,compress_level=9);files += [mp,op]
 artifacts={
  'layered-map-overview.png':make_overview(plate,overlays),
  'foreground-artifact-isolation.png':make_isolation(plate,masks,overlays),
  'solid-proxy-traversal.png':make_combined_sweeps(plate,overlays,False),
  'production-sprite-traversal.png':make_combined_sweeps(plate,overlays,True),
 }
 for name,img in artifacts.items():p=ev/name;img.save(p,optimize=False,compress_level=9);files.append(p)
 contract={
  'schemaVersion':1,'authority':'presentation-only-proof-of-concept','frame':[1280,720],
  'route':{'entrance':[1015,205],'gantry':[650,500],'backstop':[230,520],'branching':False},
  'layerOrder':['environment-base','world-subjects-behind-structure','entrance-shell','gantry-shell','world-subjects-in-front-of-structure','screen-indicators','hud'],
  'foregroundArtifacts':[
   {'id':'entrance-shell','alpha':'straight','activation':'depth-zone','aperture':'transparent','sourceMask':'sources/entrance-shell-mask.png'},
   {'id':'gantry-shell','alpha':'straight','activation':'depth-zone','aperture':'transparent','sourceMask':'sources/gantry-shell-mask.png'}],
  'subjects':{'warden':{'nominalHeight':56,'pivot':[56,66]},'raider':{'nominalHeight':44,'pivot':[40,54]}},
  'nonClaims':['runtime integration','simulation authority','HUD approval','final animation']}
 cp=meta/'layered-map-contract.json';write_json(cp,contract);files.append(cp)
 provenance_inputs=[*MASKS.values(),PACKAGE/'sources/generation-notes.md',*(x[0] for x in SPRITES.values())]
 provenance={'generator':'assets/game-art/layered-map-poc/build_poc.py','generatorSha256':sha(Path(__file__)),'master':str(MASTER.relative_to(ROOT)),'masterSha256':sha(MASTER),'inputs':{str(p.relative_to(ROOT)):sha(p) for p in provenance_inputs}}
 pp=meta/'provenance.json';write_json(pp,provenance);files.append(pp)
 manifest={'schemaVersion':1,'files':{str(p.relative_to(out_root)):sha(p) for p in sorted(files)}}
 mp=meta/'manifest.json';write_json(mp,manifest);files.append(mp)
 return files

def main()->None:
 ap=argparse.ArgumentParser();ap.add_argument('--verify',action='store_true');args=ap.parse_args()
 if args.verify:
  with tempfile.TemporaryDirectory() as td:
   tmp=Path(td);build(tmp)
   committed=PACKAGE
   generated=sorted(p.relative_to(tmp) for p in tmp.rglob('*') if p.is_file())
   expected=sorted([p.relative_to(PACKAGE) for root in [PACKAGE/'exports',PACKAGE/'evidence',PACKAGE/'metadata'] if root.exists() for p in root.rglob('*') if p.is_file()])
   if generated!=expected:raise SystemExit(f'file set mismatch generated={generated} committed={expected}')
   bad=[str(rel) for rel in generated if sha(tmp/rel)!=sha(committed/rel)]
   if bad:raise SystemExit('content mismatch: '+', '.join(bad))
  print(json.dumps({'ok':True,'verified':True,'reproducible':True}))
 else:
  for d in [PACKAGE/'exports',PACKAGE/'evidence',PACKAGE/'metadata']:
   if d.exists():shutil.rmtree(d)
  build(PACKAGE);print(json.dumps({'ok':True,'built':True}))
if __name__=='__main__':main()
