#!/usr/bin/env python3
"""Deterministic layered-map proof-of-concept compositor and verifier."""
from __future__ import annotations
import argparse, hashlib, json, shutil, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont
from blender.build_review_packet import build_review_packet

ROOT=Path(__file__).resolve().parents[3]
PACKAGE=Path(__file__).resolve().parent
FRAME=(1280,720)
BLENDER_ROOT=PACKAGE/'blender'
BLENDER_OUTPUTS=BLENDER_ROOT/'outputs'
BLENDER_MANIFEST=BLENDER_ROOT/'render-manifest.json'
BLENDER_SOURCE=BLENDER_ROOT/'layered-shuttergate.blend'
BLENDER_BUILDER=BLENDER_ROOT/'build_scene.py'
BLENDER_COMPOSITOR=BLENDER_ROOT/'compose_reference.py'
REVIEW_PACKET_BUILDER=BLENDER_ROOT/'build_review_packet.py'
BASE=BLENDER_OUTPUTS/'environment-base.png'
REFERENCE=BLENDER_OUTPUTS/'reference-plate.png'
ARTIFACTS={
 'entrance-shell':BLENDER_OUTPUTS/'entrance-shell.png',
 'architecture-framing':BLENDER_OUTPUTS/'architecture-framing.png',
}
ENTITY_ROOT=ROOT/'assets/game-art/production-scene/exports'
SPRITES={
 'solid-warden':(ENTITY_ROOT/'diagnostics/solid-warden-proxy.png',(56,66)),
 'solid-raider':(ENTITY_ROOT/'diagnostics/solid-raider-proxy.png',(40,54)),
 'warden-card':(ENTITY_ROOT/'diagnostics/warden-calibration-card.png',(56,66)),
 'raider-card':(ENTITY_ROOT/'diagnostics/raider-calibration-card.png',(40,54)),
 'warden':(ENTITY_ROOT/'entities/iron-warden-idle.png',(56,66)),
 'raider':(ENTITY_ROOT/'entities/mine-raider-idle.png',(40,54)),
}
ENTRANCE_POINTS=[(990,125),(960,150),(930,175),(900,200),(870,225),(840,250)]
FLOOR_POINTS=[(870,245),(820,280),(760,320),(700,360),(640,400),(580,440),(520,480)]
FONT_PATH=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
FONT_HASHES={
 FONT_PATH:'57f73e11f51999432bf7ab22ce55b6f945d5eca1bf824404cfa9ec2e3718c84e',
 FONT_PATH.with_name('DejaVuSans-Bold.ttf'):'a4c5bc453ca281d90ea079e596da7ae0dfeb5777497c29ec254e76d97ff6f890',
}


def font(size:int,bold:bool=False):
 p=FONT_PATH.with_name('DejaVuSans-Bold.ttf') if bold else FONT_PATH
 return ImageFont.truetype(str(p),size) if p.exists() else ImageFont.load_default()

def sha(path:Path)->str:
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()

def validate_environment()->None:
 import PIL
 if PIL.__version__!='12.3.0':raise ValueError(f'Pillow 12.3.0 required, got {PIL.__version__}')
 for path,digest in FONT_HASHES.items():
  if not path.exists() or sha(path)!=digest:raise ValueError(f'font input drift: {path}')

def prepare_plate()->Image.Image:
 src=Image.open(BASE).convert('RGBA')
 if src.size!=FRAME:raise ValueError(f'unexpected environment-base size {src.size}')
 return src

def load_reference()->Image.Image:
 with Image.open(REFERENCE) as source:
  if source.format!='PNG' or source.mode!='RGBA' or source.size!=FRAME:
   raise ValueError(f'canonical reference must be a {FRAME[0]}x{FRAME[1]} RGBA PNG: {REFERENCE}')
  return source.copy()

def load_artifact(path:Path)->Image.Image:
 with Image.open(path) as source:
  if source.format!='PNG' or source.mode!='RGBA' or source.size!=FRAME:
   raise ValueError(f'artifact must be a {FRAME[0]}x{FRAME[1]} RGBA PNG: {path}')
  artifact=source.copy()
 alpha=artifact.getchannel('A')
 if alpha.getbbox() is None:raise ValueError(f'empty artifact: {path}')
 if any(a==0 and (r!=0 or g!=0 or b!=0) for r,g,b,a in artifact.get_flattened_data()):
  raise ValueError(f'artifact contains nonzero RGB beneath zero alpha: {path}')
 return artifact

def assert_authoring_reproducible()->None:
 manifest=json.loads(BLENDER_MANIFEST.read_text())
 if set(manifest)!={'schemaVersion','blenderVersion','camera','collections','source','sourceAssets','outputs'}:
  raise ValueError('unexpected Blender manifest shape')
 if manifest['schemaVersion']!=1 or manifest['camera'].get('name')!='CAMERA_Shuttergate_Ortho' or manifest['camera'].get('projection')!='orthographic':
  raise ValueError('unexpected shared-camera contract')
 if manifest['source']!={'builderSha256':sha(BLENDER_BUILDER),'blendSha256':sha(BLENDER_SOURCE),'compositorSha256':sha(BLENDER_COMPOSITOR)}:
  raise ValueError('Blender editable-source binding drift')
 expected_outputs={'environment-base.png','entrance-shell.png','architecture-framing.png','route-subjects.png','production-sprite-subjects.png','reference-plate.png','route-traversal.png','production-sprite-traversal.png'}
 if set(manifest['outputs'])!=expected_outputs:raise ValueError('unexpected Blender output set')
 bad=[name for name in expected_outputs if manifest['outputs'][name]['sha256']!=sha(BLENDER_OUTPUTS/name)]
 if bad:raise ValueError('shared-camera render drift: '+', '.join(sorted(bad)))
 for record in manifest['sourceAssets'].values():
  if set(record)!={'path','sha256','canvas','pivot','nominalHeight','alphaSemantics'}:raise ValueError('unexpected Blender source-asset shape')
  source=ROOT/record['path']
  if not source.is_file() or sha(source)!=record['sha256']:raise ValueError(f'Blender source-asset drift: {source}')

def assert_blender_render_verified()->None:
 result=subprocess.run(
  ['blender','-b','--factory-startup','--python-exit-code','1','--python',str(BLENDER_BUILDER),'--','--verify'],
  cwd=ROOT,text=True,capture_output=True,timeout=600,check=False,
 )
 if result.returncode!=0 or 'SHARED_SCENE_VERIFY_OK' not in result.stdout:
  raise ValueError('shared-camera Blender rerender verification failed: '+(result.stderr or result.stdout)[-500:])

def load_mask(path:Path)->Image.Image:
 with Image.open(path) as source:
  if source.format!='PNG':raise ValueError(f'mask must be a PNG: {path}')
  if source.mode!='L' or 'transparency' in source.info:raise ValueError(f'mask must use mode L without transparency: {path}')
  m=source.copy()
 if m.size!=FRAME:raise ValueError(f'bad mask dimensions: {path}')
 if m.getbbox() is None:raise ValueError(f'empty mask: {path}')
 if sum(m.histogram()[1:255])!=0:raise ValueError(f'mask must be strictly binary: {path}')
 return m

def assert_mask_mode_tamper_rejected(mask:Image.Image,root:Path)->None:
 probe=root/'rgba-mask-alpha-tamper.png'
 rgba=Image.merge('RGBA',(mask,mask,mask,Image.new('L',mask.size,0)))
 rgba.save(probe,optimize=False,compress_level=9)
 try:load_mask(probe)
 except ValueError:pass
 else:raise AssertionError('RGBA source-mask alpha tamper was not rejected')

def sprite(name:str)->tuple[Image.Image,tuple[int,int]]:
 p,pivot=SPRITES[name];return Image.open(p).convert('RGBA'),pivot

def presentation_lighting(subject:Image.Image,warm:float,brightness:float)->Image.Image:
 alpha=subject.getchannel('A')
 rgb=ImageEnhance.Brightness(subject.convert('RGB')).enhance(brightness)
 rgb=ImageEnhance.Contrast(rgb).enhance(1.08)
 if warm>0:
  warmth=Image.new('RGB',rgb.size,(255,145,58));rgb=Image.blend(rgb,warmth,warm)
 out=rgb.convert('RGBA');out.putalpha(alpha);return out

def soft_contact_shadow(frame:Image.Image,ground:tuple[int,int])->None:
 layer=Image.new('RGBA',FRAME,(0,0,0,0));ImageDraw.Draw(layer).ellipse((ground[0]-11,ground[1]-3,ground[0]+11,ground[1]+2),fill=(0,0,0,62))
 frame.alpha_composite(layer.filter(ImageFilter.GaussianBlur(2.0)))

def world_ring(frame:Image.Image,ground:tuple[int,int],color:tuple[int,int,int])->None:
 box=(ground[0]-16,ground[1]-7,ground[0]+16,ground[1]+7)
 glow=Image.new('RGBA',FRAME,(0,0,0,0));ImageDraw.Draw(glow).ellipse(box,outline=(*color,105),width=4);frame.alpha_composite(glow.filter(ImageFilter.GaussianBlur(2.0)))
 crisp=Image.new('RGBA',FRAME,(0,0,0,0));ImageDraw.Draw(crisp).ellipse(box,outline=(*color,205),width=2);frame.alpha_composite(crisp)

def place(base:Image.Image,subject:Image.Image,ground:tuple[int,int],pivot:tuple[int,int])->None:
 base.alpha_composite(subject,(ground[0]-pivot[0],ground[1]-pivot[1]))

def contour(mask:Image.Image)->Image.Image:
 ero=mask.filter(ImageFilter.MinFilter(3))
 return ImageChops.difference(mask,ero)

def assert_contour_one_pixel()->None:
 probe=Image.new('L',(10,10),0);ImageDraw.Draw(probe).rectangle((5,0,9,9),fill=255)
 edge=contour(probe)
 columns=[x for x in range(edge.width) if edge.crop((x,0,x+1,edge.height)).getbbox() is not None]
 if columns!=[5]:raise AssertionError(f'contour must occupy one inner boundary column, got {columns}')

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

def make_sweep(plate,overlay,points,subject_name,title,subtitle,lighting:str|None=None)->Image.Image:
 subject,pivot=sprite(subject_name);n=len(points);pw=220;ph=190
 board=Image.new('RGBA',(40+n*pw,280),(12,17,23,255));panel_header(board,(24,14),title,subtitle)
 for i,p in enumerate(points):
  frame=plate.copy()
  rendered=subject
  if lighting:
   warm=(0.12*(1-i/(n-1))) if lighting=='entrance' else 0.04
   brightness=(1.22-0.10*i/(n-1)) if lighting=='entrance' else 1.18
   rendered=presentation_lighting(subject,warm,brightness)
   world_ring(frame,p,(255,76,62) if lighting=='entrance' else (82,205,255))
   soft_contact_shadow(frame,p)
  place(frame,rendered,p,pivot);frame.alpha_composite(overlay)
  crop=(p[0]-90,p[1]-115,p[0]+90,p[1]+45)
  shot=frame.crop(crop).resize((200,178),Image.Resampling.NEAREST)
  x=25+i*pw;board.alpha_composite(shot,(x,92))
  d=ImageDraw.Draw(board);d.text((x,70),f'{i+1}  ground {p[0]},{p[1]}',font=font(13),fill=(220,226,230,255))
 return board

def make_combined_sweeps(underlays,overlays,actual:bool)->Image.Image:
 a=make_sweep(underlays['entrance-shell'],overlays['entrance-shell'],ENTRANCE_POINTS,'raider' if actual else 'solid-raider','ENTRANCE SHELL — '+('PRODUCTION RAIDER' if actual else 'SOLID RAIDER PROXY'),'native authored arch alpha; entrance transition remains inside the open route',lighting='entrance' if actual else None)
 b=make_sweep(underlays['architecture-framing'],overlays['architecture-framing'],FLOOR_POINTS,'warden' if actual else 'solid-warden','OPEN FLOOR — '+('PRODUCTION WARDEN' if actual else 'SOLID WARDEN PROXY'),'route samples remain clear of edge-framing architecture',lighting='floor' if actual else None)
 out=Image.new('RGBA',(max(a.width,b.width),a.height+b.height),(8,12,17,255));out.alpha_composite(a);out.alpha_composite(b,(0,a.height));return out

def make_card_sweeps(underlays,overlays)->Image.Image:
 a=make_sweep(underlays['entrance-shell'],overlays['entrance-shell'],ENTRANCE_POINTS,'raider-card','ENTRANCE SHELL — 44 PX BANDED CARD','exact Raider canvas and pivot through the native authored arch')
 b=make_sweep(underlays['architecture-framing'],overlays['architecture-framing'],FLOOR_POINTS,'warden-card','OPEN FLOOR — 56 PX BANDED CARD','exact Warden canvas and pivot remains unobscured across the tactical floor')
 out=Image.new('RGBA',(max(a.width,b.width),a.height+b.height),(8,12,17,255));out.alpha_composite(a);out.alpha_composite(b,(0,a.height));return out

def alpha_visibility(mask:Image.Image,subject:Image.Image,ground:tuple[int,int],pivot:tuple[int,int])->tuple[int,int]:
 alpha=subject.getchannel('A');hidden=visible=0
 for sy in range(alpha.height):
  for sx in range(alpha.width):
   value=alpha.getpixel((sx,sy))
   if not isinstance(value,int):raise TypeError('expected scalar alpha')
   if value:
    if mask.getpixel((ground[0]-pivot[0]+sx,ground[1]-pivot[1]+sy)):hidden+=value
    else:visible+=value
 return hidden,visible

def boundary_pair(plate:Image.Image,overlay:Image.Image,subject:Image.Image,pivot:tuple[int,int],ground:tuple[int,int],crop_size:int,scale:int)->tuple[Image.Image,int,int]:
 before=plate.copy();place(before,subject,ground,pivot)
 after=before.copy();after.alpha_composite(overlay)
 box=(ground[0]-crop_size//2,ground[1]-crop_size+6,ground[0]+crop_size//2,ground[1]+6)
 pair=Image.new('RGBA',(crop_size*scale*2,crop_size*scale),(8,12,17,255))
 pair.alpha_composite(before.crop(box).resize((crop_size*scale,crop_size*scale),Image.Resampling.NEAREST))
 pair.alpha_composite(after.crop(box).resize((crop_size*scale,crop_size*scale),Image.Resampling.NEAREST),(crop_size*scale,0))
 return pair,*alpha_visibility(overlay.getchannel('A'),subject,ground,pivot)

def make_framing_clearance_diagnostics(plate:Image.Image,overlay:Image.Image)->Image.Image:
 subject,pivot=sprite('solid-warden')
 labels=('entrance approach','upper bend','high court','central court','lower court','shutter bend','shutter approach')
 board=Image.new('RGBA',(2100,610),(8,12,17,255));panel_header(board,(24,14),'EDGE-FRAMING ROUTE CLEARANCE — BEFORE | AFTER','all declared open-floor samples must retain 100% subject alpha after edge framing')
 d=ImageDraw.Draw(board)
 for i,(label,p) in enumerate(zip(labels,FLOOR_POINTS,strict=True)):
  pair,h,v=boundary_pair(plate,overlay,subject,pivot,p,80,1)
  if h!=0:raise ValueError(f'edge framing covers route sample {label} at {p}: hidden alpha {h}')
  x=20+i*290;board.alpha_composite(pair,(x,105))
  d.text((x,80),label.upper(),font=font(14,True),fill=(235,196,112,255))
  d.text((x,189),f'{p[0]},{p[1]}  100.0% visible',font=font(12),fill=(110,255,190,255))
  d.text((x,207),f'alpha V {v}  H {h}  native B | A',font=font(10),fill=(176,196,208,255))
 critical=((labels[0],FLOOR_POINTS[0]),(labels[2],FLOOR_POINTS[2]),(labels[4],FLOOR_POINTS[4]),(labels[6],FLOOR_POINTS[6]))
 y=315;d.text((20,y-35),'4× NEAREST-NEIGHBOR CLEARANCE CHECKS',font=font(17,True),fill=(235,196,112,255))
 for i,(label,p) in enumerate(critical):
  pair,h,v=boundary_pair(plate,overlay,subject,pivot,p,48,4);x=20+i*500;board.alpha_composite(pair,(x,y))
  d.text((x,y+198),f'{label}: {p[0]},{p[1]}  100.0% visible  V {v}  H {h}',font=font(12,True),fill=(110,255,190,255))
 return board

def make_noop_heatmap(base:Image.Image,reference:Image.Image,overlays:dict[str,Image.Image])->Image.Image:
 recon=base.copy();recon.alpha_composite(overlays['entrance-shell']);recon.alpha_composite(overlays['architecture-framing'])
 diff=ImageChops.difference(reference,recon);changed=0;mx=0;heat=Image.new('RGBA',FRAME,(0,0,0,255));hp=heat.load()
 if hp is None:raise RuntimeError('heatmap pixel access unavailable')
 for y in range(FRAME[1]):
  for x in range(FRAME[0]):
   px=diff.getpixel((x,y))
   if not isinstance(px,tuple):raise TypeError('expected RGBA difference pixel')
   delta=max(int(channel) for channel in px);mx=max(mx,delta)
   if delta:changed+=1;hp[x,y]=(delta,0,0,255)
 board=Image.new('RGBA',(1280,810),(8,12,17,255));panel_header(board,(24,14),'NO-ENTITY RECONSTRUCTION — REAL DIFFERENCE HEATMAP',f'changedPixels={changed}  maxChannelDelta={mx}; black means exact identity')
 board.alpha_composite(heat,(0,90));return board

def make_isolation(base,reference,masks,overlays)->Image.Image:
 specs=[('entrance-shell',(900,0,1280,260)),('architecture-framing',(0,260,1280,720))]
 board=Image.new('RGBA',(1500,1060),(10,14,20,255));panel_header(board,(24,14),'CANONICAL FOREGROUND ARTIFACTS','source pixels + authored alpha; checker, alpha, one-pixel contour, and no-op reconstruction')
 d=ImageDraw.Draw(board)
 for col,(name,crop) in enumerate(specs):
  x=30+col*735;d.text((x,64),name,font=font(20,True),fill=(235,196,112,255))
  crop_size=(690,300)
  bg=checker(FRAME);bg.alpha_composite(overlays[name]);view=bg.crop(crop).resize(crop_size,Image.Resampling.NEAREST);board.alpha_composite(view,(x,90))
  m=masks[name].crop(crop).resize(crop_size,Image.Resampling.NEAREST)
  alpha=Image.merge('RGBA',(m,m,m,Image.new('L',crop_size,255)));board.alpha_composite(alpha,(x,410))
  src=reference.crop(crop).resize(crop_size,Image.Resampling.NEAREST);c=contour(masks[name]).crop(crop).resize(crop_size,Image.Resampling.NEAREST)
  tint=Image.new('RGBA',crop_size,(40,255,220,0));tint.putalpha(c);src.alpha_composite(tint);board.alpha_composite(src,(x,730))
  d.text((x,394),'checkerboard RGBA artifact',font=font(14),fill=(180,190,200,255));d.text((x,714),'authored alpha',font=font(14),fill=(180,190,200,255));d.text((x,1034),'source + cyan alpha contour',font=font(14),fill=(180,190,200,255))
 # no-op assertion in title area
 recon=base.copy();recon.alpha_composite(overlays['entrance-shell']);recon.alpha_composite(overlays['architecture-framing']);diff=ImageChops.difference(reference,recon)
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

def make_entrance_alignment(plate:Image.Image,mask:Image.Image,overlay:Image.Image)->Image.Image:
 crop=(970,5,1160,215);size=(760,840)
 board=Image.new('RGBA',(1560,930),(8,12,17,255));panel_header(board,(24,14),'ENTRANCE MASK — EXACT 4× ALIGNMENT','nearest-neighbor magnification; cyan is the one-pixel binary-alpha contour; aperture and route floor remain transparent')
 source=plate.crop(crop);edge=contour(mask).crop(crop);tint=Image.new('RGBA',source.size,(40,255,220,0));tint.putalpha(edge);source.alpha_composite(tint)
 board.alpha_composite(source.resize(size,Image.Resampling.NEAREST),(20,80))
 checked=checker(FRAME);checked.alpha_composite(overlay);board.alpha_composite(checked.crop(crop).resize(size,Image.Resampling.NEAREST),(800,80))
 d=ImageDraw.Draw(board);d.text((20,62),'SOURCE + 1 PX CONTOUR',font=font(14,True),fill=(235,196,112,255));d.text((800,62),'REGISTERED RGBA ON CHECKER',font=font(14,True),fill=(235,196,112,255))
 return board

def make_overview(base,overlays)->Image.Image:
 scene=base.copy();raider,rp=sprite('raider');warden,wp=sprite('warden')
 world_ring(scene,(930,175),(255,76,62));soft_contact_shadow(scene,(930,175));place(scene,presentation_lighting(raider,0.08,1.18),(930,175),rp);scene.alpha_composite(overlays['entrance-shell'])
 world_ring(scene,(620,410),(82,205,255));soft_contact_shadow(scene,(620,410));place(scene,presentation_lighting(warden,0.04,1.18),(620,410),wp);scene.alpha_composite(overlays['architecture-framing'])
 board=Image.new('RGBA',(1280,810),(9,13,18,255));board.alpha_composite(scene,(0,90));panel_header(board,(24,16),'LAYERED SHUTTERGATE — PROOF OF CONCEPT','one clean map, two explicit foreground RGBA artifacts, approved 56/44 px units; no HUD or runtime-state claim')
 return board

def assert_exact_noop(reference:Image.Image,reconstruction:Image.Image)->None:
 if reference.mode!=reconstruction.mode or reference.size!=reconstruction.size or reference.tobytes()!=reconstruction.tobytes():
  raise ValueError('foreground artifacts must reconstruct the no-entity plate exactly')

def write_json(path:Path,data)->None:path.write_text(json.dumps(data,indent=2,sort_keys=True)+'\n')

def build(out_root:Path)->list[Path]:
 validate_environment()
 assert_contour_one_pixel()
 assert_authoring_reproducible()
 exp=out_root/'exports';ev=out_root/'evidence';meta=out_root/'metadata'
 for p in [exp/'environment',exp/'foreground',ev,meta]:p.mkdir(parents=True,exist_ok=True)
 base=prepare_plate()
 overlays={key:load_artifact(path) for key,path in ARTIFACTS.items()}
 masks={key:artifact.getchannel('A') for key,artifact in overlays.items()}
 with tempfile.TemporaryDirectory() as td:assert_mask_mode_tamper_rejected(masks['entrance-shell'],Path(td))
 reference=load_reference()
 base_path=exp/'environment/structure-free-environment-base-1280x720.png'
 plate_path=exp/'environment/layered-shuttergate-clean-plate-1280x720.png'
 base.save(base_path,optimize=False,compress_level=9);reference.save(plate_path,optimize=False,compress_level=9)
 reconstruction=base.copy()
 for key in ('entrance-shell','architecture-framing'):reconstruction.alpha_composite(overlays[key])
 assert_exact_noop(reference,reconstruction)
 # Regression: unchanged-alpha RGB drift must be rejected.
 probe=reference.copy();px=probe.getpixel((0,0))
 if not isinstance(px,tuple) or len(px)!=4:raise TypeError('expected RGBA probe pixel')
 probe.putpixel((0,0),((int(px[0])+1)%256,int(px[1]),int(px[2]),int(px[3])))
 try:assert_exact_noop(reference,probe)
 except ValueError:pass
 else:raise AssertionError('RGB-only unchanged-alpha no-op drift was not rejected')
 underlays={'entrance-shell':base.copy(),'architecture-framing':base.copy()}
 underlays['architecture-framing'].alpha_composite(overlays['entrance-shell'])
 files=[base_path,plate_path]
 for k in masks:
  mp=exp/'foreground'/f'{k}-mask.png';op=exp/'foreground'/f'{k}.png';masks[k].save(mp,optimize=False,compress_level=9);overlays[k].save(op,optimize=False,compress_level=9);files += [mp,op]
 artifacts={
  'layered-map-overview.png':make_overview(base,overlays),
  'foreground-artifact-isolation.png':make_isolation(base,reference,masks,overlays),
  'entrance-mask-alignment.png':make_entrance_alignment(reference,masks['entrance-shell'],overlays['entrance-shell']),
  'solid-proxy-traversal.png':make_combined_sweeps(underlays,overlays,False),
  'calibration-card-traversal.png':make_card_sweeps(underlays,overlays),
  'edge-framing-clearance.png':make_framing_clearance_diagnostics(underlays['architecture-framing'],overlays['architecture-framing']),
  'no-op-difference-heatmap.png':make_noop_heatmap(base,reference,overlays),
  'production-sprite-traversal.png':make_combined_sweeps(underlays,overlays,True),
 }
 for name,img in artifacts.items():p=ev/name;img.save(p,optimize=False,compress_level=9);files.append(p)
 files.extend(build_review_packet(ev))
 contract={
  'schemaVersion':2,'authority':'presentation-only-proof-of-concept','frame':[1280,720],
  'route':{'id':'route.layered-shuttergate','entrance':[930,175],'centralCourt':[640,400],'backstop':[500,500],'branching':False,'authoritativeMovement':False},
  'layerOrder':['environment-base','world-rings-behind-structure','world-effects-behind-structure','world-subjects-behind-structure','structure-foreground-artifact','world-rings-in-front','world-effects-in-front','world-subjects-in-front','screen-focus-indicators','hud'],
  'foregroundArtifacts':[
   {'id':'entrance-shell','alpha':'straight','transparentRgb':[0,0,0],'sourceArtifact':'blender/outputs/entrance-shell.png','activation':{'source':'presentation-route-state','routeSegment':'entrance-aperture','states':['inside','aperture','outside']},'routeBehavior':'shared-camera-authored-arch-occlusion','affectedClasses':['world-subject','world-ring','world-effect'],'exemptClasses':['screen-focus-indicator','hud'],'evidence':['solid-proxy-traversal.png','calibration-card-traversal.png','foreground-artifact-isolation.png']},
   {'id':'architecture-framing','alpha':'straight','transparentRgb':[0,0,0],'sourceArtifact':'blender/outputs/architecture-framing.png','activation':{'source':'presentation-route-state','routeSegment':'open-defense-floor','states':['approach','central-court','shutter-approach']},'routeBehavior':'shared-camera-edge-framing-no-route-coverage','placement':'edge architecture only; no bridge, gantry, bastion, or support occupies the tactical floor','diagnosticPath':'unobstructed shared-camera route','affectedClasses':['world-subject','world-ring','world-effect'],'exemptClasses':['screen-focus-indicator','hud'],'evidence':['edge-framing-clearance.png','solid-proxy-traversal.png','calibration-card-traversal.png','production-sprite-traversal.png']}],
  'subjects':{'warden':{'nominalHeight':56,'pivot':[56,66]},'raider':{'nominalHeight':44,'pivot':[40,54]}},
  'presentationLighting':{'raider':'warm entrance adaptation plus contact shadow and hostile world ring','warden':'bounded brightness/contrast adaptation plus contact shadow and allied world ring','baseSpriteGeometryChanged':False},
  'nonClaims':['runtime integration','simulation authority','HUD approval','final animation']}
 cp=meta/'layered-map-contract.json';write_json(cp,contract);files.append(cp)
 provenance_inputs=[BASE,REFERENCE,*ARTIFACTS.values(),BLENDER_BUILDER,BLENDER_COMPOSITOR,REVIEW_PACKET_BUILDER,BLENDER_SOURCE,BLENDER_MANIFEST,BLENDER_OUTPUTS/'production-sprite-subjects.png',BLENDER_OUTPUTS/'production-sprite-traversal.png',PACKAGE/'requirements.lock',*(x[0] for x in SPRITES.values())]
 provenance={'generator':'assets/game-art/layered-map-poc/build_poc.py','generatorSha256':sha(Path(__file__)),'authoringModel':'single editable Blender scene and orthographic camera; complete plate derives from same-camera environment plus canonical RGBA passes','environment':{'blender':'4.3.2','cycles':'CPU 16 samples, denoising disabled','pillow':'12.3.0','fonts':{str(path):digest for path,digest in FONT_HASHES.items()}},'inputs':{str(p.relative_to(ROOT)):sha(p) for p in provenance_inputs}}
 pp=meta/'provenance.json';write_json(pp,provenance);files.append(pp)
 manifest={'schemaVersion':1,'files':{str(p.relative_to(out_root)):sha(p) for p in sorted(files)}}
 mp=meta/'manifest.json';write_json(mp,manifest);files.append(mp)
 return files

def main()->None:
 ap=argparse.ArgumentParser();ap.add_argument('--verify',action='store_true');args=ap.parse_args()
 assert_blender_render_verified()
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
