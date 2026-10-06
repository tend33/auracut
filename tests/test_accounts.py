"""Multiuser HTTP isolation and background-worker tests, without paid APIs."""
import os,sys,json,tempfile,threading,base64,time,subprocess
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
root=Path(tempfile.mkdtemp(prefix='auracut-accounts-'));os.environ['AURACUT_DATA']=str(root)
os.environ.pop('AURACUT_PASSWORD_FILE',None);os.environ.pop('AURACUT_AI_KEY_FILE',None)
sys.path.insert(0,str(Path(__file__).resolve().parents[1]));import server as s,accounts
s.PASSWORD='administrator-test-password'
key=root/'mock-key';key.write_text('not-a-real-key');s.AI_KEY_FILE=str(key)
server=s.LimitedHTTPServer(('127.0.0.1',0),s.Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)
passwords={'auracut':s.PASSWORD,'editor1':'first-user-test-password','editor2':'second-user-test-password'}
def request(path,data=None,user='auracut',raw=False):
 headers={'Authorization':'Basic '+base64.b64encode((user+':'+passwords[user]).encode()).decode(),'X-Auracut-Request':'1'}
 if raw:payload=data;headers['Content-Type']='application/octet-stream';headers['X-Filename']='clip.mp4'
 else:payload=None if data is None else json.dumps(data).encode();headers['Content-Type']='application/json'
 try:
  with urlopen(Request(base+path,data=payload,headers=headers),timeout=15) as r:
   body=r.read();return r.status,json.loads(body) if r.headers.get('Content-Type','').startswith('application/json') else body
 except HTTPError as e:
  body=e.read();return e.code,json.loads(body) if body else {}
def poll(job,user):
 for _ in range(300):
  result=request('/api/jobs/'+job,user=user)[1]
  if result['state']!='running':return result
  time.sleep(.02)
 raise AssertionError('job did not finish')
try:
 for username in ('editor1','editor2'):
  status,row=request('/api/accounts',{'operation':'create','username':username,'password':passwords[username]})
  assert status==200 and row['account']['role']=='user' and not row['account']['ai_allowed']
 assert request('/api/accounts',user='editor1')[0]==403
 assert request('/api/accounts',{'operation':'create','username':'evil','password':'long-enough-test-password'},user='editor1')[0]==403
 assert request('/api/accounts',{'operation':'create','username':'editor1','password':passwords['editor1']})[0]==400
 assert request('/api/accounts',{'operation':'create','username':'../evil','password':passwords['editor1']})[0]==400
 assert request('/api/accounts',{'operation':'create','username':'short','password':'short'})[0]==400
 stored=(root/'accounts.json').read_text()
 assert all(password not in stored for password in passwords.values())
 assert (root/'accounts.json').stat().st_mode&0o777==0o600
 video=root/'fixture.mp4'
 subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1','-c:v','libx264','-threads','2','-c:a','aac',str(video)],check=True)
 status,media=request('/api/media?name=clip.mp4',video.read_bytes(),user='editor1',raw=True)
 assert status==201,(status,media)
 mid=media['id'];user=accounts.Store(root).verify('editor1',passwords['editor1'],s.PASSWORD)
 accounts.set_identity(user)
 project={'id':'a'*32,'name':'Private','song_id':mid,'song_name':'clip.mp4','duration':1,'clip_ids':[mid],'shots':[{'id':'b'*32,'media_id':mid,'source_start':0,'duration':1,'name':'clip.mp4','reason':'Test'}],'captions':[{'start':0,'end':.5,'text':'Hello'}],'source_audio':True,'selection_mode':'speech','transcripts':{mid:[{'word':'Hello','start':0,'end':.5}]}}
 s.save_project(project);s.jobs['c'*32]={'state':'done','result':{'private':True}}
 accounts.set_identity(accounts.ADMIN)
 assert request('/api/projects',user='editor1')[1]['projects'][0]['id']==project['id']
 assert not request('/api/projects',user='editor2')[1]['projects']
 assert not request('/api/projects')[1]['projects']
 for user_name in ('editor2','auracut'):
  for path in ('/api/projects/'+project['id'],'/media/'+mid,'/api/jobs/'+'c'*32,'/api/projects/'+project['id']+'/backup'):
   assert request(path,user=user_name)[0]==404,(user_name,path)
  assert request('/api/projects/'+project['id']+'/save',project,user=user_name)[0] in (400,404)
 assert request('/api/studio',{'operation':'plan','project_id':project['id']},user='editor1')[0]==400
 assert not request('/api/capabilities',user='editor1')[1]['ai_available']
 assert request('/api/accounts',{'operation':'update','username':'editor1','ai_allowed':True})[0]==200
 assert request('/api/capabilities',user='editor1')[1]['ai_available']
 status,job=request('/api/studio',{'operation':'preview','project_id':project['id']},user='editor1')
 assert status==202,(status,job)
 assert request('/api/jobs/'+job['job_id'],user='editor2')[0]==404
 result=poll(job['job_id'],'editor1');assert result['state']=='done',result
 url=result['result']['preview_url'];assert request(url,user='editor1')[0]==200
 assert request(url,user='editor2')[0]==404 and request(url)[0]==404
 assert request('/api/projects/'+project['id']+'/backup',user='editor1')[0]==200
 assert request('/api/accounts',{'operation':'reset-password','username':'editor1','password':'new-user-test-password'})[0]==200
 assert request('/api/me',user='editor1')[0]==401
 passwords['editor1']='new-user-test-password';assert request('/api/me',user='editor1')[0]==200
 request('/api/accounts',{'operation':'update','username':'editor1','enabled':False})
 assert request('/api/me',user='editor1')[0]==401
 request('/api/accounts',{'operation':'update','username':'editor1','enabled':True})
 assert request('/api/me',user='editor1')[0]==200
 assert accounts.Store(root).verify('editor1',passwords['editor1'],s.PASSWORD)['id']==user['id']
 print('PASS: account lifecycle, hashed passwords, AI grants, isolated uploads/projects/jobs/media/exports/backups and worker context')
finally:server.shutdown();server.server_close();accounts.set_identity(accounts.ADMIN)
