"""Extract individual core-book spells from already imported, locally supplied text."""
import json,pathlib,re,hashlib
root=pathlib.Path(__file__).resolve().parents[1]
catalog=json.loads((root/'src/shared/core-catalog.json').read_text('utf-8'))
out=[]
for cls in catalog:
 if cls['id'] not in ['elementalist','entropist','spiritist','arcanist']:continue
 for ref in cls['references']:
  text=ref['text']; page=ref['page']
  if cls['id']=='arcanist':
   if page==178:continue
   matches=list(re.finditer(r'^([^\n]+之阿尔卡纳)\s*$',text,re.M))
  else: matches=list(re.finditer(r'^(.+?)\s+(?:rr\s+)?(至多\d+|\d+(?:\s*×\s*T)?)\s+(.+?)\s+(场景|瞬发)\s*$',text,re.M))
  for i,m in enumerate(matches):
   body=text[m.end():matches[i+1].start() if i+1<len(matches) else len(text)]
   body=re.split(r'\n(?:cc |连结连结|连结解除|传说讲述|熵系咒语)',body)[0].strip()
   body=body.replace('\n','').replace('rr','（攻击性）')
   name=m[1].replace(' rr','').strip();key=hashlib.sha256((cls['id']+name).encode()).hexdigest()[:12]
   out.append(dict(id='spell-'+key,name=name,text=body,cost='40 MP' if cls['id']=='arcanist' else m[2]+' MP',target='依条目说明' if cls['id']=='arcanist' else m[3],duration='场景' if cls['id']=='arcanist' else m[4],source=f"{cls['name']} · 核心书 20230207 · {page} 页",classId=cls['id']))
(root/'src/shared/spells.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),'utf-8')
print('Structured spells:',len(out))
