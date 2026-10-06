"""Adversarial media, workspace and login-throttling checks."""
import os,sys,tempfile,threading,subprocess,base64
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
root=Path(tempfile.mkdtemp(prefix='auracut-security-'));os.environ['AURACUT_DATA']=str(root)
os.environ.pop('AURACUT_PASSWORD_FILE',None);os.environ.pop('AURACUT_AI_KEY_FILE',None)
sys.path.insert(0,str(Path(__file__).resolve().parents[1]));import server as s,accounts
for name,text in [('playlist.mp4','#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://127.0.0.1:9/private\n#EXT-X-ENDLIST\n'),('concat.mp4','ffconcat version 1.0\nfile /run/secrets/auracut_password\n')]:
 path=root/name;path.write_text(text)
 try:s.ffprobe(path)
 except subprocess.CalledProcessError:pass
 else:raise AssertionError('Indirect media input accepted')
for extension,codec in [('wav',[]),('mp3',['-c:a','libmp3lame']),('m4a',['-c:a','aac']),('webm',['-c:a','libopus']),('mov',['-c:a','aac'])]:
 path=root/('fixture.'+extension)
 subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','0.3',*codec,str(path)],check=True)
 assert s.ffprobe(path)['has_audio']
failures=[]
def unscoped():
 try:accounts.identity()
 except RuntimeError:failures.append(True)
thread=threading.Thread(target=unscoped);thread.start();thread.join();assert failures==[True]
s.PASSWORD='administrator-test-password'
for name in ('editor1','editor2'):s.account_store.change({'operation':'create','username':name,'password':name+'-test-password'})
server=s.LimitedHTTPServer(('127.0.0.1',0),s.Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
def login(username,password):
 auth=base64.b64encode((username+':'+password).encode()).decode()
 try:
  with urlopen(Request('http://127.0.0.1:'+str(server.server_port)+'/api/me',headers={'Authorization':'Basic '+auth})) as r:return r.status
 except HTTPError as error:return error.code
try:
 for _ in range(8):
  assert login('editor1','wrong-password')==401
  assert login('editor2','editor2-test-password')==200
 assert login('editor1','editor1-test-password')==429
 assert login('auracut',s.PASSWORD)==200
 print('PASS: indirect media rejected, supported containers accepted, unscoped threads fail closed, login throttle isolated')
finally:server.shutdown();server.server_close()
