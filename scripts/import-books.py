"""Convert user-provided local rule sources; source attachments are never redistributed."""
from pathlib import Path
from pypdf import PdfReader
from html.parser import HTMLParser
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import json,re,hashlib,gzip,subprocess,sys
root=Path(__file__).resolve().parents[1]
source=Path('E:/TRPG/FU')
out=root/'public/official/fu-20261011'
out.mkdir(parents=True,exist_ok=True)
manifest=[]
manifest_path=root/'public/official/manifest.json'
previous=json.loads(manifest_path.read_text(encoding='utf-8')).get('documents',[]) if manifest_path.exists() else []
def clean(text):
    text=text.replace('\x00','').replace('çç','SL ')
    lines=[x.rstrip() for x in text.splitlines() if not re.fullmatch(r'\s*(?:W|O|CHAPT|\d?GAME RULES|\d?CHARACTERS|)\s*',x)]
    return '\n'.join(lines).strip()
def save(key,title,kind,pages,origin,sections=None):
    record={'id':key,'title':title,'kind':kind,'source':origin,'pages':pages,'sections':sections or []}
    payload=json.dumps(record,ensure_ascii=False,separators=(',',':')).encode()
    digest=hashlib.sha256(payload).hexdigest()
    filename=key+'.'+digest[:12]+'.json'
    (out/filename).write_bytes(payload)
    manifest.append({'id':key,'title':title,'kind':kind,'file':'official/fu-20261011/'+filename,'pages':len(pages),'size':len(payload),'gzipSize':len(gzip.compress(payload)),'hash':digest})
for path in sorted(source.glob('*.pdf')):
    core='核心规则书' in path.name
    if 'Character-Sheet' in path.name: continue
    key='core' if core else 'pdf-'+hashlib.sha256(path.name.encode()).hexdigest()[:12]
    reader=PdfReader(path)
    pages=[{'number':i+1,'printed':i-1 if core and i>=2 else None,'text':clean(p.extract_text() or '')} for i,p in enumerate(reader.pages)]
    sections=[]
    def collect(items,depth=0):
        for item in items:
            if isinstance(item,list):collect(item,depth+1)
            else:
                page=reader.get_destination_page_number(item)
                if page is not None:sections.append({'title':str(item.title),'page':page+1,'depth':depth})
    collect(reader.outline)
    save(key,'核心规则书' if core else path.stem,'核心' if core else '扩展',pages,path.name,sections)
for path in sorted(source.glob('*.docx')):
    with ZipFile(path) as archive: doc=ET.fromstring(archive.read('word/document.xml'))
    ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    lines=[''.join(p.itertext()) for p in []]
    lines=[''.join(t.text or '' for t in p.findall('.//w:t',ns)) for p in doc.findall('.//w:p',ns)]
    save('doc-'+hashlib.sha256(path.name.encode()).hexdigest()[:12],path.stem,'可选规则',[{'number':1,'printed':None,'text':clean('\n'.join(lines))}],path.name)
class Text(HTMLParser):
    def __init__(self):super().__init__();self.parts=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'):self.skip+=1
        if tag in ('p','div','br','tr','h1','h2','h3','li'):self.parts.append('\n')
        if tag in ('td','th'):self.parts.append(' | ')
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.skip=max(0,self.skip-1)
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)
chm=Path('E:/project/AAF/output/fu-audit-20261011/chm')
for path in sorted(chm.rglob('*.htm*')):
    if path.stem=='Easy-CHM-HtmlHelp-Maker':continue
    raw=path.read_bytes()
    try:html=raw.decode('utf-8')
    except UnicodeDecodeError:html=raw.decode('gb18030',errors='replace')
    parser=Text();parser.feed(html);text=re.sub(r'\n[ \t\n]+','\n\n',''.join(parser.parts)).strip()
    if len(text)<100:continue
    relative=path.relative_to(chm).as_posix()
    save('chm-'+hashlib.sha256(relative.encode()).hexdigest()[:12],path.stem,'扩展资料',[{'number':1,'printed':None,'text':clean(text)}],'全扩展不全书 V1.0 / '+relative)
manifest_path.write_text(json.dumps({'version':'fu-20261011','documents':manifest},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
current_files={entry['file'] for entry in manifest}
for entry in previous:
    old=(root/'public'/entry['file']).resolve()
    if entry['file'] not in current_files and old.is_relative_to(out.resolve()) and old.suffix=='.json' and old.is_file():old.unlink()
print(json.dumps({'documents':len(manifest),'pages':sum(x['pages'] for x in manifest),'textBytes':sum(x['size'] for x in manifest),'gzipBytes':sum(x['gzipSize'] for x in manifest)}))
subprocess.run([sys.executable, str(root/'scripts/structure-core-book.py')], check=True)

subprocess.run([sys.executable, str(root/"scripts/structure-expansion-books.py")], check=True)
