"""Local HTTP acceptance tests; no external API calls or user secrets."""
import os,tempfile,sys,json,base64,threading,time
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
root=Path(tempfile.mkdtemp(prefix='auracut-http-'))
os.environ['AURACUT_DATA']=str(root)
os.environ.pop('AURACUT_PASSWORD_FILE',None);os.environ.pop('AURACUT_AI_KEY_FILE',None)
sys.path.insert(0,str(Path(__file__).resolve().parents[1]));import server as s,studio
s.PASSWORD='local-test-password-only'
media_id='a'*32;project_id='b'*32
(s.MEDIA/(media_id+'.mp4')).write_bytes(b'test')
(s.MEDIA/(media_id+'.json')).write_text(json.dumps({'id':media_id,'name':'test.mp4','extension':'.mp4','duration':2,'has_audio':True}))
p={'id':project_id,'name':'Test','song_id':media_id,'song_name':'test.mp4','clip_ids':[media_id],'shots':[{'id':'c'*32,'media_id':media_id,'source_start':0,'duration':2,'name':'test.mp4','reason':'Test'}],'duration':2,'selection_mode':'speech','source_audio':True,'transcripts':{media_id:[{'word':'Hello','start':0,'end':1},{'word':'um','start':1,'end':1.5}]},'captions':[{'start':0,'end':1,'text':'Hello'}],'draft_pending':True}
s.save_project(p)
s.ai_key=lambda:'mock-key';s.ai_response=lambda *args:json.dumps({'captions':[{'index':0,'text':'你好'}]})
server=s.LimitedHTTPServer(('127.0.0.1',0),s.Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)
def request(path,data=None,auth=True,marker=True,cross=False):
 headers={}
 if auth:headers['Authorization']='Basic '+base64.b64encode(('auracut:'+s.PASSWORD).encode()).decode()
 if marker:headers['X-Auracut-Request']='1'
 if cross:headers['Sec-Fetch-Site']='cross-site'
 payload=None if data is None else json.dumps(data).encode()
 if payload:headers['Content-Type']='application/json'
 try:
  with urlopen(Request(base+path,data=payload,headers=headers),timeout=5) as response:return response.status,json.load(response)
 except HTTPError as error:
  body=error.read();return error.code,json.loads(body) if body else {}
try:
 assert request('/api/projects',auth=False)[0]==401
 assert request('/api/capabilities')[1]['version']=='1.1.1'
 assert request('/api/projects/'+project_id+'/save',p,marker=False)[0]==400
 assert request('/api/projects/'+project_id+'/save',p,cross=True)[0]==400
 assert request('/api/studio',{'operation':'plan','project_id':'../outside'})[0]==400
 assert request('/api/studio',{'operation':'caption-language','project_id':project_id,'language':[]})[0]==400
 assert request('/api/projects/'+project_id+'/export',dict(p,export_resolution='8k'))[0]==400
 assert request('/api/projects/'+project_id+'/export',dict(p,export_resolution='720p'))[0]==400
 status,saved=request('/api/projects/'+project_id+'/save',dict(p,transcript_keep=[0],normalize_speech=True))
 assert status==200 and saved['transcript_keep']==[0] and saved['normalize_speech']
 status,job=request('/api/studio',{'operation':'caption-language','project_id':project_id,'language':'zh-hans'})
 assert status==202
 for attempt in range(100):
  result=request('/api/jobs/'+job['job_id'])[1]
  if result['state']!='running':break
  time.sleep(.01)
 assert result['state']=='done',result
 converted=result['result']['project']
 assert converted['captions']==[{'start':0,'end':1,'text':'你好'}] and converted['transcript_keep']==[0]
 assert s.work_lock.acquire(blocking=False);s.work_lock.release()
 print('PASS: auth, cross-site protection, invalid IDs/language/resolution, draft gate, save settings and async conversion')
finally:server.shutdown();server.server_close()
