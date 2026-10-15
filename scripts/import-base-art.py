"""Build app-integrated WebP artwork from the user's locally supplied archives.
Original archives stay outside the repository. Run after extracting to output/imports.
"""
import hashlib, io, json, pathlib, re
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/library/art'
OUT.mkdir(parents=True, exist_ok=True)
names = ['蝙蝠','犬兽','毒蛇','甲虫','幼虫','树人','食人花','蘑菇人','软泥怪','幽灵','哥布林','火精灵','小剑士','吸血鬼','兽人','蜥蜴人','阴影','骑士','巨鬼','独眼怪','幼龙','猛禽','三头犬','小恶魔','暗术士','骷髅骑士','蜘蛛','蝎子','风精灵','木乃伊','羊','宝箱怪','石魔像','鼠','雏鸟','鸡','熊','南瓜怪','骷髅','翼魔','猫剑士','深海鱼','魔王','巨龙','根须怪','水母','叉戟影怪','死神','变异体','稻草人']
jw = {'FlyingSkull':'飞颅','Genie':'灯灵','Goblin':'哥布林','Lich':'巫妖','LittleOrc':'小兽人','RazerToad':'利齿蟾蜍','Slime':'软泥怪','Skeleton':'骷髅士兵','SpiderLady':'蛛女','Worm':'巨虫'}
variants={'Ice':'冰霜','Lava':'熔岩','Thunder':'雷电','Toxic':'剧毒','Shadow':'暗影','Volcano':'火山','Fear':'恐惧','Plague':'瘟疫','Wrath':'愤怒','Tropical':'热带','Poisonous':'毒','Venomous':'毒液','Flame':'烈焰','Fire':'火焰','Green':'翠绿','Arachne':'织网','Desert':'沙漠','Jungle':'丛林','Widow':'寡妇','Common':'原色','DeepSea':'深海','Parasite':'寄生'}
packs={'pipoya':('Pipoya','Pipoya RPG Monster Pack'),'jw':('JW608Art','JW608Art Monster Pack 01'),'spring':('Starmage','Monsters of Spring'),'mushroom':("Moose n’ Stoat",'蘑菇森林'),'grass':("Moose n’ Stoat",'晴空草岩'),'castle':("Moose n’ Stoat",'城堡王座厅')}
entries=[]
for key,(author,pack) in packs.items():
 for p in sorted((ROOT/'output/imports'/key).rglob('*.png')):
  rel=p.relative_to(ROOT/'output/imports'/key).as_posix()
  # Keep the high-resolution source once; shaded/unshaded variants remain selectable.
  if key=='spring' and 'Bonus HD PNG' not in rel: continue
  if key in ['mushroom','grass','castle'] and ('1000' in rel or '1000x740' in rel): continue
  category='怪物'; subtype='其他';variant='原色';name=p.stem
  if key=='pipoya':
   m=re.search(r'(enemy|boss)(\d+)([a-z]?)',p.stem);n=int(m[2]);v=m[3]
   name=names[n-1] if m[1]=='enemy' else ['冰霜女王','深渊之门','暗物质','龙王'][n-1]
   subtype='首领' if m[1]=='boss' else ('野兽' if n in [1,2,3,4,5,22,27,28,31,34,35,36,37,42,46] else '不死' if n in [10,14,17,25,26,30,38,39,48] else '植物' if n in [6,7,8,45,50] else '魔物')
   variant=('换色 '+v.upper() if v else '原色')+(' · 无阴影' if 'non shade' in rel else ' · 阴影')
  elif key=='jw':
   parts=p.stem.split('_');name=jw.get(parts[0],parts[0]);variant=variants.get(parts[-1],'原色');subtype='不死' if parts[0] in ['Skeleton','Lich','FlyingSkull'] else '魔物'
  elif key=='spring': name=['春之花妖','春之叶灵','春之蜂妖'][int(re.search(r'(\d+)',p.stem)[1])-1];subtype='自然精怪'
  else:
   category='场景';subtype=pack;name=pack
   variant='完整场景' if 'full' in p.stem else '前景分层' if 'bottom' in p.stem else '背景分层'
  original=Image.open(p).convert('RGBA')
  if key=='pipoya' and original.getbbox(): original=original.crop(original.getbbox())
  original.thumbnail((1920,1440) if category=='场景' else (1200,1200),Image.Resampling.LANCZOS)
  buf=io.BytesIO();original.save(buf,'WEBP',quality=86,method=4);raw=buf.getvalue();digest=hashlib.sha256(raw).hexdigest()
  (OUT/(digest+'.webp')).write_bytes(raw)
  thumb=original.copy();thumb.thumbnail((256,192),Image.Resampling.LANCZOS);t=io.BytesIO();thumb.save(t,'WEBP',quality=80,method=6)
  (OUT/(digest+'-thumb.webp')).write_bytes(t.getvalue())
  stable=hashlib.sha256((key+'/'+rel).encode()).hexdigest()[:16]
  entries.append(dict(id='base-'+stable,name=name,category=category,group=subtype,variant=variant,pack=pack,author=author,path='library/art/'+digest+'.webp',thumbnail='library/art/'+digest+'-thumb.webp',size=len(raw),hash=digest,source=rel))
(ROOT/'src/shared/base-art.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'entries':len(entries),'bytes':sum(p.stat().st_size for p in OUT.iterdir())},ensure_ascii=False))
