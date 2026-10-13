"""Import only user-supplied text already extracted for the FU audit. No PDF is redistributed."""
from pathlib import Path
import json,re
source=Path('E:/project/AAF/output/fu-audit-20261011/core-pages')
target=Path(__file__).resolve().parents[1]/'src/shared/core-catalog.json'
classes=[
 ('arcanist','秘仪师',179,'mp',[],['阿尔卡纳圆环:4','阿尔卡纳再生:2','绑定和召唤','紧急秘仪:6','秘仪学派仪式']),
 ('chimerist','嵌合师',185,'mp',[],['吞噬:5','野性交谈','恶性循环','嵌合学派仪式','咒语模仿:10']),
 ('darkblade','暗黑之刃',187,'hp',['melee','armor'],['愤怒:5','暗黑之血','暗黑之心','痛苦的教训:3','暗影突袭:5']),
 ('elementalist','元素师',189,'mp',[],['灾难:3','元素魔法:10','魔法炮击:3','元素学派仪式','咒语之刃:4']),
 ('entropist','熵师',193,'mp',[],['吸收心智:5','熵系魔法:10','幸运七','熵系学派仪式','盗取时间:4']),
 ('fury','狂怒斗士',197,'hp',['melee','armor'],['肾上腺素:5','暴怒','不屈意志:4','挑衅:5','忍耐:5']),
 ('guardian','守护者',199,'hp',['armor','shield'],['保镖','防守掌握:5','双重盾牌','不动要塞:5','保护']),
 ('loremaster','博学士',201,'mp',[],['灵光一闪:3','集中:5','知识就是力量','快速评估:6','博闻强记']),
 ('orator','吟唱者',203,'mp',[],['谴责:4','激励:6','我相信你:2','能言善辩:2','意外盟友']),
 ('rogue','游荡者',205,'ip',[],['偷袭:5','闪避:3','迅捷:3','待会再见','灵魂窃取:5']),
 ('sharpshooter','神射手',207,'hp',['ranged','shield'],['连续射击','交叉火力','鹰眼:5','远程武器掌握:4','警告射击:4']),
 ('spiritist','灵师',209,'mp',[],['疗愈能力:2','灵魂学派仪式','灵魂魔法:10','支援魔法','活力魔法']),
 ('tinkerer','修补匠',213,'ip',[],['紧急道具','小工具:5','药水雨:2','秘密配方:5','高瞻远瞩:5']),
 ('wayfarer','旅人',219,'ip',[],['忠实伙伴:5','有备无患:4','酒馆闲聊:3','宝藏猎人:2','通晓道路']),
 ('weaponmaster','武器大师',221,'hp',['melee','shield'],['剑刃风暴','碎骨击:4','破甲击:3','招架反击','近战武器掌握:4'])
]
rows=[]
for cid,name,page,boost,training,titles in classes:
 text=(source/f'{page:03}.txt').read_text(encoding='utf-8')
 matches=[]
 for item in titles:
  title,_,rank=item.partition(':'); match=re.search(r'^'+re.escape(title)+r'(?:\s*\(çç\d+\))?\s*$',text,re.M)
  if not match:raise ValueError(f'Missing heading {title} on {page}')
  matches.append((title,int(rank or 1),match))
 skills=[]
 for i,(title,rank,match) in enumerate(matches):
  desc=text[match.end():matches[i+1][2].start() if i+1<len(matches) else len(text)]
  desc=desc.split('')[0].strip().rstrip('O').strip()
  desc=re.split(r'\n(?:[A-Za-z][^\n]*\n){2}',desc)[0].strip()
  skills.append({'id':f'{cid}-{i+1}','name':title,'max':rank,'description':desc,'page':page-2})
 extra={'arcanist':range(180,184),'elementalist':range(190,192),'entropist':range(194,196),'spiritist':range(210,212),'tinkerer':range(214,218)}.get(cid,[])
 references=[{'title':f'核心书 · {p-2} 页','page':p-2,'text':(source/f'{p:03}.txt').read_text(encoding='utf-8')} for p in extra]
 rows.append({'id':cid,'name':name,'boost':boost,'training':training,'page':page-2,'skills':skills,'references':references})
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(json.dumps({'classes':len(rows),'skills':sum(len(r['skills']) for r in rows),'bytes':target.stat().st_size}))
