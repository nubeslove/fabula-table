"""Rebuild local FU supplements from their semantic sources. No images/PDFs are shipped."""
from pathlib import Path
from bs4 import BeautifulSoup
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import json, re, hashlib, gzip, copy
import pymupdf as fitz

ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/'public'; SOURCE=Path('E:/TRPG/FU')
CHM=Path('E:/project/AAF/output/fu-audit-20261011/chm')
MANIFEST=PUBLIC/'official/manifest.json'
OUT=PUBLIC/'official/fu-20261013'; OUT.mkdir(parents=True,exist_ok=True)
manifest=json.loads(MANIFEST.read_text(encoding='utf-8'))
books={d['id']:json.loads((PUBLIC/d['file']).read_text(encoding='utf-8')) for d in manifest['documents']}

def clean(text):
    text=re.sub(r'[\s\u00a0]+',' ',text).strip()
    text=re.sub(r'(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff，。；：！？])','',text)
    return text.replace('\x00','')
def block(text,kind='p',level=2):
    b={'kind':kind,'text':clean(text)}
    if kind=='h':b['level']=level
    return b
DETAIL_LABELS={'要求','前提','前置条件','效果','目标','持续时间','费用','消耗','条件','重要提示','举例','示例','译注','注'}
def html_blocks(path):
    raw=path.read_bytes()
    try:raw=raw.decode('utf-8')
    except UnicodeDecodeError:raw=raw.decode('gb18030')
    soup=BeautifulSoup(raw,'html.parser'); result=[]
    for x in soup.find_all(['script','style','head']):x.decompose()
    for x in soup.find_all(['h1','h2','h3','h4','p','li','table']):
        if x.find_parent(['table','p','li']):continue
        if x.name=='table':
            rows=[[clean(cell.get_text(' ',strip=True)) for cell in row.find_all(['td','th'],recursive=False)] for row in x.find_all('tr')]
            rows=[row for row in rows if any(row)]
            if rows:result.append({'kind':'table','rows':rows})
            continue
        y=copy.copy(x)
        for br in y.find_all('br'):br.replace_with('\u2028')
        lines=[clean(t) for t in y.get_text('').split('\u2028')]; lines=[t for t in lines if t]
        if not lines:continue
        outline=re.search(r'mso-outline-level:(\d)',x.get('style',''))
        level=int(x.name[1]) if x.name.startswith('h') else int(outline[1]) if outline else 0
        if level and re.split('[：:]',lines[0],1)[0] in DETAIL_LABELS:
            result.extend(block(line) for line in lines)
            continue
        if level and len(lines[0])<150:
            result.append(block(lines[0],'h',min(4,level)));lines=lines[1:]
        elif len(lines)>1 and len(lines[0])<85 and re.search(r'[（(][A-Za-z]|[\[【]\s*\+\d',lines[0]):
            result.append(block(lines[0],'h',3));lines=lines[1:]
        for line in lines:
            if re.split('[：:]',line,1)[0] in DETAIL_LABELS:
                result.append(block(line));continue
            # A short named entry followed by its explanation is an addressable heading.
            named=re.match(r'^([^。；！？：:]{2,22})[：:]\s*(.{15,})$',line)
            if named and named[1] not in DETAIL_LABELS and len(named[1])<=12 and not re.search(r'你|目标|当|如果|在|\d',named[1]) and not line.startswith(('例如','举例','注意','注：','译注','·','•')):
                result.extend([block(named[1],'h',3),block(named[2])])
            elif len(line)<85 and (re.search(r'免费增益$|(?:的)?技能$',line) or re.match(r'^[^·。]{2,25}[（(][A-Za-z][^）)]*[）)](?:[【\[]\+\d+[】\]])?$',line)):
                result.append(block(line,'h',2 if re.search(r'免费增益$|(?:的)?技能$',line) else 3))
            else:result.append(block(line,'li' if re.match(r'^[·•¡◆]',line) or x.name=='li' else 'p'))
    return result

NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
def word_text(x):return ''.join(t.text or '' for t in x.findall('.//w:t',NS))
def docx_blocks(path):
    with ZipFile(path) as z:doc=ET.fromstring(z.read('word/document.xml'))
    result=[]
    for x in doc.find('w:body',NS):
        tag=x.tag.split('}')[-1]
        if tag=='tbl':
            rows=[[clean(word_text(cell)) for cell in row.findall('w:tc',NS)] for row in x.findall('w:tr',NS)]
            if rows:result.append({'kind':'table','rows':rows})
        elif tag=='p':
            text=clean(word_text(x))
            if not text:continue
            style=x.find('w:pPr/w:pStyle',NS);value=style.get('{'+NS['w']+'}val','') if style is not None else ''
            heading=re.search(r'(?:Heading|标题)(\d)',value,re.I)
            runs=x.findall('w:r',NS);bold=bool(runs) and all(r.find('w:rPr/w:b',NS) is not None for r in runs if word_text(r).strip())
            if heading or (len(text)<55 and bold):result.append(block(text,'h',int(heading[1]) if heading else 2))
            elif len(text)<60 and re.search(r'[（(][A-Za-z]|[【\[]\s*\+\d',text):result.append(block(text,'h',3))
            else:result.append(block(text,'li' if x.find('w:pPr/w:numPr',NS) is not None else 'p'))
    return result

def pdf_blocks(path):
    doc=fitz.open(path);result=[]
    for page in doc:
        blocks=[]
        for box in page.get_text('dict',sort=True)['blocks']:
            if 'lines' not in box:continue
            spans=[s for l in box['lines'] for s in l['spans']]; text=clean(''.join(s['text'] for s in spans))
            if not text or re.fullmatch(r'[WOjzyn\d]+|B ?O ?N ?U ?S ?B ?O ?N ?U ?S',text):continue
            if max((s['size'] for s in spans),default=0)>100:continue
            text=text.replace('\uf0e7','SL ')
            if text.endswith('。n'):text=text[:-1]
            if any(ord(c)<32 for c in text):continue
            size=max((s['size'] for s in spans),default=0)
            if len(text)<90 and size>=19 and not re.search(r'[。，；！？]$',text) and not re.match(r'^[\u4e00-\u9fff]{8,}。',text):blocks.append(block(text,'h',2 if size>=24 else 3))
            else:blocks.append(block(text,'li' if text.startswith('¡') else 'p'))
        merged=[]
        for b in blocks:
            if b['kind']=='p' and merged and merged[-1]['kind'] in ['p','li'] and not re.search(r'[。！？；：:!]$',merged[-1]['text']):
                merged[-1]['text']+=b['text']
            else:merged.append(b)
        blocks=merged
        # Source page boundaries are retained even for a long section.
        result.append((page.number+1,blocks))
    return result

def make_pages(blocks,title):
    pages=[];sections=[];current=[];heading=title;depth=0
    def flush():
        nonlocal current
        if current:
            n=len(pages)+1
            pages.append({'number':n,'printed':None,'text':'\n'.join(b.get('text','\n'.join(' | '.join(r) for r in b.get('rows',[]))) for b in current),'blocks':current})
            sections.append({'title':heading,'page':n,'depth':depth})
            current=[]
    for b in blocks:
        if b['kind']=='h':
            flush();heading=b['text'];depth=max(0,b.get('level',2)-2)
        if len(current)>35 and b['kind']!='h':
            flush();heading=heading+'（续）'
        current.append(b)
    flush()
    return pages,sections

def expansion(book):
    src=book['source']
    for part,key in [('高度奇幻','high'),('科技奇幻','techno'),('自然奇幻','natural')]:
        if part in src:return key
    if any(x in src for x in ['死灵术士','卡牌大师','新英雄技能','测试规则更新']):return 'playtest'
    return 'optional'

parsed={}
for key,b in books.items():
    if key=='core':continue
    if key.startswith('chm-'):blocks=html_blocks(CHM/b['source'].split(' / ',1)[1]);pages,sections=make_pages(blocks,b['title'])
    elif key.startswith('doc-'):blocks=docx_blocks(SOURCE/b['source']);pages,sections=make_pages(blocks,b['title'])
    elif key=='pdf-c9f4fbcf0ad8':continue
    else:
        pages=[];sections=[];blocks=[]
        for num,part in pdf_blocks(SOURCE/b['source']):
            headings=[x for x in part if x['kind']=='h']
            pages.append({'number':num,'printed':num,'text':'\n'.join(x['text'] for x in part),'blocks':part})
            for i,h in enumerate(part):
                if h['kind']=='h':sections.append({'title':h['text'],'page':num,'depth':max(0,h.get('level',2)-2),'block':i})
            if not headings:sections.append({'title':f'第 {num} 页','page':num,'depth':0})
            blocks.extend(part)
    parsed[key]=dict(b,pages=pages,sections=sections,expansion=expansion(b),structuredVersion=1)
    parsed[key]['_blocks']=blocks

def supplement_tables(b):
    names=['王牌轰炸','魔法同花顺','炫目连顺','状态满贯','支援三条','双重麻烦','魔法对子','禁断王牌']
    for page in b['pages']:
        output=[]; table=None
        for item in page['blocks']:
            text=item.get('text','')
            match=re.match(r'^(\d+[-~～]\d+)\s*([+＋]\d+\*?)\s*[\uf0ae→]\s*(.*)',text)
            name=next((n for n in names if text.startswith(n) and re.match(r'^'+n+r'\s*\d',text)),None)
            if match:
                if table is None:table={'kind':'table','rows':[['掷骰','成本调整','特性效果']]};output.append(table)
                table['rows'].append([match[1],match[2],match[3]])
            elif name:
                if table is None:table={'kind':'table','rows':[['组合','组合条件','效果']]};output.append(table)
                condition=text[len(name):].strip();split=re.search(r'[。；]',condition)
                if split:condition,effect=condition[:split.end()],condition[split.end():]
                else:effect=''
                table['rows'].append([name,condition,effect])
            elif table is not None and item['kind']=='p' and b['id']=='pdf-05b3d5db4f48':table['rows'][-1][2]+=text
            else:table=None;output.append(item)
        page['blocks']=output
    b['sections']=[{'title':x['text'],'page':p['number'],'depth':max(0,x.get('level',2)-2),'block':i} for p in b['pages'] for i,x in enumerate(p['blocks']) if x['kind']=='h']
for key in ['pdf-05b3d5db4f48','pdf-b081fe64463c']:supplement_tables(parsed[key])

# These short supplements use decorative cover fonts at the same size as headings.
# A checked, semantic TOC keeps cover slogans and attribution fragments out of navigation.
pdf_tocs={
 'pdf-05b3d5db4f48':[
  ('封面与介绍',1,0,0),('卡牌大师',2,0,0),('免费增益',3,4,0),('卡牌大师技能',3,6,0),
  ('豪赌乾坤',3,7,1),('风险对冲',3,9,1),('魔法卡牌',3,11,1),('时运再来',3,15,1),('陷阱卡牌',3,17,1),
  ('牌堆管理',4,0,0),('组合结算',4,10,0),('组合效果表',5,2,1),('新的英雄技能',6,0,0),
  ('白与黑',6,1,1),('卡牌先锋',6,5,1),('决斗大师',6,10,1),('禁断仪式',7,0,1),('禁断组合效果',7,4,1),
  ('示例角色',7,6,0),('收藏家',7,7,1),('催眠师',7,9,1),('作者与来源',8,2,0)],
 'pdf-b081fe64463c':[
  ('封面与介绍',1,0,0),('材料与锻造',2,0,0),('获得材料',2,6,1),('购买材料',2,11,1),('出售材料',2,13,1),
  ('锻造物品',3,0,0),('特殊影响',4,3,1),('生成特性',5,0,0),
  ('物品起源特性 · 第 5 页',5,3,1),('物品起源特性 · 第 6 页',6,0,1),('物品起源特性 · 第 7 页',7,0,1),('作者与来源',8,0,0)]
}
for key,entries in pdf_tocs.items():
    parsed[key]['sections']=[{'title':title,'page':page,'block':index,'depth':depth} for title,page,index,depth in entries]

# The standalone Necromancer PDF has no usable Unicode map. Do not ship its glyph IDs as prose.
alt=copy.deepcopy(parsed['chm-6a55f861c6a6'])
alt.update(id='pdf-c9f4fbcf0ad8',title='死灵术士 · 可读参考',source='全扩展不全书 V1.0 / 两小节日扩展/2022万圣节扩展/新职业-死灵术士.html',note='独立 PDF 缺少可用的文字编码。本条提供同资料集的死灵术士网页译文作为可读参考，不作 PDF 逐页对照。')
parsed[alt['id']]=alt

catalog=[];resources=[]
class_ids={'机师':'pilot','灵能者':'psychic','突变体':'mutant','商人':'merchant','植物学家':'floralist','祈唤者':'invoker','美食家':'gourmet','徽记师':'symbolist','指挥官':'commander','舞者':'dancer','魔奏者':'chanting','新职业-死灵术士':'necromancer'}
for key,b in parsed.items():
    blocks=b['_blocks'];name=b['title']
    if name in class_ids:
        class_id='exp-'+class_ids[name];skills=[];gain=[];active=False;free=False;current=None
        for x in blocks:
            text=x.get('text','')
            if x['kind']=='h':
                if re.search(r'(?:的)?技能$',text):active=True;free=False;continue
                if '免费增益' in text:free=True;continue
                if free and x.get('level',2)<=2:free=False
                if active and (x.get('level',2)<=2 or len(skills)>=5):active=False
                if active:
                    max_match=re.search(r'[【\[]\s*\+\s*(\d+)\s*[\]】]',text)
                    skill_name=re.split(r'[【\[（(]',text)[0].strip()
                    current={'id':class_id+'-'+str(len(skills)+1),'name':skill_name,'max':int(max_match[1]) if max_match else 1,'description':'','page':0}
                    skills.append(current)
            elif active and current:current['description']+=(text if x['kind']!='table' else '\n'.join(' | '.join(row) for row in x['rows']))+'\n'
            elif free:gain.append(text)
        text=' '.join(gain);boost='hp' if 'HP' in text else 'mp' if 'MP' in text else 'ip' if 'IP' in text else ''
        options=['hp','mp'] if 'HP' in text and 'MP' in text else []
        training=[]
        for word,value in [('近战武器','melee'),('远程武器','ranged'),('防具','armor'),('护具','armor'),('盾牌','shield')]:
            if word in text and value not in training:training.append(value)
        catalog.append({'id':class_id,'name':name.replace('新职业-',''),'boost':boost,'boostOptions':options,'training':training,'page':0,'skills':skills,'references':[], 'expansion':b['expansion'],'source':key,'gains':text})
    # Supplemental entries are manual abilities/references. Requirements remain visible, never auto-applied.
    if key!='pdf-c9f4fbcf0ad8':
        occurrences={}
        for section in b['sections']:
            page=b['pages'][section['page']-1]; start=section.get('block',0)+1; end=next((i for i in range(start,len(page['blocks'])) if page['blocks'][i]['kind']=='h'),len(page['blocks'])); txt='\n'.join(x.get('text','\n'.join(' | '.join(r) for r in x.get('rows',[]))) for x in page['blocks'][start:end])
            if not txt.strip() or len(txt)<15:continue
            occurrences[section['title']]=occurrences.get(section['title'],0)+1
            suffix='' if occurrences[section['title']]==1 else ':'+str(occurrences[section['title']])
            rid='ref-'+hashlib.sha256((key+':'+section['title']+suffix).encode()).hexdigest()[:16]
            category='英雄技能' if '英雄技能' in name else '金手指' if '金手指' in name else '职业资料' if name in class_ids else '可选规则'
            resources.append({'id':rid,'name':section['title'],'text':txt,'cost':'依说明手动处理','source':name,'book':key,'expansion':b['expansion'],'category':category})

card=parsed['pdf-05b3d5db4f48']
card_skills=[]
for part in card['_blocks']:
    text=part.get('text','')
    match=re.match(r'^(豪赌乾坤|风险对冲|魔法卡牌|时运再来|陷阱卡牌)',text)
    if part['kind']=='h' and match:
        card_skills.append({'id':'exp-cardmaster-'+str(len(card_skills)+1),'name':match[1],'max':{'魔法卡牌':3,'时运再来':5,'陷阱卡牌':4}.get(match[1],1),'description':'','page':3})
    elif part['kind']=='h' and card_skills and len(card_skills)==5:break
    elif card_skills:card_skills[-1]['description']+=text+'\n'
catalog.append({'id':'exp-cardmaster','name':'卡牌大师','boost':'hp','boostOptions':['hp','mp'],'training':[],'page':3,'skills':card_skills,'references':[],'expansion':'playtest','source':'pdf-05b3d5db4f48','gains':'永久性提升5点HP或5点MP（你自行选择）。'})
for cls in catalog:
    assert len(cls['skills'])==5, (cls['name'],len(cls['skills']))
    assert all(s['description'].strip() for s in cls['skills']),cls['name']

for key,b in parsed.items():
    b.pop('_blocks',None)
    payload=json.dumps(b,ensure_ascii=False,separators=(',',':')).encode();digest=hashlib.sha256(payload).hexdigest();file=OUT/(key+'.'+digest[:12]+'.json');file.write_bytes(payload)
    old=next(d for d in manifest['documents'] if d['id']==key)
    old.update(title=b['title'],file=file.relative_to(PUBLIC).as_posix(),pages=len(b['pages']),size=len(payload),gzipSize=len(gzip.compress(payload)),hash=digest,expansion=b['expansion'])
resources=list({r['id']:r for r in resources}.values())
resource_data=json.dumps(resources,ensure_ascii=False,separators=(',',':')).encode();resource_hash=hashlib.sha256(resource_data).hexdigest()
resource_file=OUT/('character-resources.'+resource_hash[:12]+'.json');resource_file.write_bytes(resource_data)
manifest['characterResources']={'file':resource_file.relative_to(PUBLIC).as_posix(),'hash':resource_hash,'size':len(resource_data)}
(ROOT/'src/shared/expansion-resource-index.json').write_text(json.dumps({r['id']:r['expansion'] for r in resources},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
manifest['version']='fu-20261013'
MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(ROOT/'src/shared/expansion-catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')

print(json.dumps({'books':len(parsed),'sections':sum(len(b['sections']) for b in parsed.values()),'classes':[(c['name'],c['boost'],len(c['skills'])) for c in catalog],'resources':len(resources)},ensure_ascii=False))

# Remove only stale generated JSON within the two explicit official output directories.
keep={d['file'] for d in manifest['documents']}|{manifest['characterResources']['file']}
for folder in [PUBLIC/'official/fu-20261011',OUT]:
    for old in folder.glob('*.json'):
        if old.relative_to(PUBLIC).as_posix() not in keep and re.fullmatch(r'[a-z0-9-]+\.[a-f0-9]{12}\.json',old.name):old.unlink()
