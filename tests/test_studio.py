import tempfile,os,sys,json,subprocess,uuid,io
from pathlib import Path
root=Path(tempfile.mkdtemp(prefix='auracut-test-'));os.environ['AURACUT_DATA']=str(root)
os.environ.pop('AURACUT_PASSWORD_FILE',None);os.environ.pop('AURACUT_AI_KEY_FILE',None)
sys.path.insert(0,str(Path(__file__).resolve().parents[1]));import server as s,studio
media_id='a'*32;path=s.MEDIA/(media_id+'.mp4')
subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','12','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-c:a','aac',str(path)],check=True)
meta={'id':media_id,'name':'speech.mp4','extension':'.mp4',**s.ffprobe(path)};(s.MEDIA/(media_id+'.json')).write_text(json.dumps(meta))
words=[{'start':.5,'end':1,'word':'Hello'},{'start':1.1,'end':1.6,'word':'um'},{'start':1.7,'end':2.2,'word':'everyone.'},{'start':4,'end':4.5,'word':'Welcome'},{'start':4.6,'end':5.1,'word':'today.'},{'start':8,'end':8.5,'word':'Thank'},{'start':8.6,'end':9.1,'word':'you.'}]
s.ai_key=lambda:'test-key'
class Response(io.BytesIO):
 def __enter__(self):return self
 def __exit__(self,*args):self.close()
def transcribe_request(req,timeout):
 assert req.full_url=='https://api.openai.com/v1/audio/transcriptions'
 assert b'timestamp_granularities[]' in req.data and b'whisper-1' in req.data
 return Response(json.dumps({'words':words}).encode())
studio.urlopen=transcribe_request
p=studio.speech_project(s,media_id,'Speech test');assert p['duration']==12 and p['source_audio']
studio.urlopen=lambda *a,**k:(_ for _ in ()).throw(AssertionError('cache must avoid paid request'))
assert studio.transcribe(s,media_id)['words']==words
s.ai_response=lambda content,limit:json.dumps({'remove':[1],'reason':'Filler word'})
smart=studio.action(s,'smart',{'project_id':p['id']},'b'*32);assert smart['remove']==[1]
q=studio.action(s,'transcript-apply',{'project_id':p['id'],'keep':[0,2,3,4,5,6],'remove_pauses':True,'fingerprint':studio.fingerprint(p)},'b'*32)['project']
assert q['id']!=p['id'] and len(q['shots'])==4
assert q['transcript_keep']==[0,2,3,4,5,6]
q['captions']=studio.generate_captions(q);assert 'um' not in studio.srt_text(q['captions']);studio.clean_captions(q['captions'],q['duration']);s.save_project(q)
job='c'*32;s.jobs[job]={'state':'running'};s.render(q,job);assert s.jobs[job]['state']=='done',s.jobs[job]
info=s.ffprobe(s.EXPORTS/(job+'.mp4'));assert abs(info['duration']-q['duration'])<.05 and info['has_audio']
# Caption timing and Chinese text are accepted, filter markup is neutralized.
assert '<' not in studio.srt_text([{'start':0,'end':1,'text':'<b>你好</b> {\\evil}'}])
backup=root/'test.zip';s.backup_project(q['id'],backup);restored=s.restore_project(backup)
assert restored['source_audio'] and restored['selection_mode']=='speech' and restored['captions']==q['captions']
assert list(restored['transcripts'])==restored['clip_ids']
assert restored['transcript_keep']==q['transcript_keep']
s.ai_response=lambda content,limit:json.dumps({'summary':'Review proposal','warnings':['Repeat source'],'story_order':['Greeting','Welcome']})
plan=studio.action(s,'plan',{'project_id':q['id']},'d'*32)['report'];assert len(plan['rows'])==4
accepted=studio.action(s,'accept-plan',{'project_id':q['id']},'d'*32)['project'];assert not accepted['draft_pending']
assert accepted['transcript_keep']==[0,2,3,4,5,6]
changed_selection=dict(accepted,transcript_keep=[0,2])
assert s.validate_project(changed_selection,accepted['id'])['transcript_keep']==[0,2]
def director_response(content,limit):
 import base64
 images=[item['image_url'] for item in content if item['type']=='input_image']
 assert images, 'Director must submit sampled frames'
 for image in images:
  assert image.count('data:image/jpeg;base64,')==1
  assert base64.b64decode(image.split(',',1)[1],validate=True).startswith(b'\xff\xd8')
 return json.dumps({'summary':'Sampled review','issues':['Listen to source audio'],'changes':[{'shot':1,'source_start':.5,'duration':.4,'reason':'Shorter opening'}]})
s.ai_response=director_response
job='e'*32;s.jobs[job]={'state':'running'}
report=studio.action(s,'director',{'project_id':q['id']},job)['report'];assert report['preview_url'] and report['audio_levels_db'] and report['changes']
changed=studio.action(s,'director-apply',{'project_id':q['id']},'f'*32)['project'];assert changed['id']!=q['id']
# Stale review is rejected after a real trim change.
current=json.loads((s.PROJECTS/(q['id']+'.json')).read_text());current['shots'][0]['source_start']+=.1;s.save_project(current)
try:studio.action(s,'director-apply',{'project_id':q['id']},'f'*32)
except ValueError:pass
else:raise AssertionError('stale report accepted')
for invalid in [[{'start':float('nan'),'end':1,'text':'bad'}],[{'start':1,'end':2,'text':'a'},{'start':1.5,'end':3,'text':'b'}]]:
 try:studio.clean_captions(invalid,12)
 except ValueError:pass
 else:raise AssertionError('invalid caption accepted')
print('PASS: multipart/cache, smart proposals, transcript copies, captions, real MP4 audio/subtitles, single-source backup/restore, plan approval, Director copy and stale protection')
print('Test workspace',root)
# ASR edge cases: preserve zero-length words; bound the truncated final word.
edges=studio.transcription_words([{'start':0,'end':0,'word':'Hi'},{'start':.1,'end':.2,'word':'there'},{'start':119.9,'end':120.2,'word':'ending'},{'start':120,'end':120.3,'word':'outside'}],120)
assert len(edges)==3 and edges[0]['start']==edges[0]['end']==0 and edges[-1]['end']==120
for bad in [[{'start':2,'end':1,'word':'bad'}],[{'start':float('nan'),'end':1,'word':'bad'}],[{'start':0,'end':1,'word':'good'},{'start':.5,'end':.7,'word':'x'},{'start':.1,'end':.2,'word':'backwards'}]]:
 try:studio.transcription_words(bad,120)
 except ValueError:pass
 else:raise AssertionError('Malformed ASR interval accepted')
print('PASS: zero-duration tokens, truncated end, out-of-window exclusion and malformed timing rejection')

# Real captioned exports at every supported resolution; timing/audio unchanged.
for resolution, expected in s.EXPORT_RESOLUTIONS.items():
 export=json.loads(json.dumps(q))
 export['shots']=[dict(q['shots'][0],duration=.4)]
 export['duration']=.4
 export['captions']=[{'start':0,'end':.4,'text':'你好 Test'}]
 job=uuid.uuid4().hex
 s.render(export,job,resolution)
 assert s.jobs[job]['state']=='done',s.jobs[job]
 output=s.EXPORTS/(job+'.mp4')
 streams=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(output)]))['streams']
 video=next(stream for stream in streams if stream['codec_type']=='video')
 assert (video['width'],video['height'])==expected
 assert abs(s.ffprobe(output)['duration']-.4)<.05 and s.ffprobe(output)['has_audio']
for invalid in ['8k','3840:2160',None,{}]:
 try:s.export_dimensions(invalid)
 except ValueError:pass
 else:raise AssertionError('Invalid resolution accepted')
print('PASS: real 720p/1080p/4K captioned exports, timing/audio, invalid resolution rejection')
# Normalization raises quiet speech-like audio without changing edit timing.
import re
outputs=[]
for enabled in (False,True):
 speech=json.loads(json.dumps(p));speech['normalize_speech']=enabled
 job=uuid.uuid4().hex;s.render(speech,job)
 assert s.jobs[job]['state']=='done',s.jobs[job]
 output=s.EXPORTS/(job+'.mp4');info=s.ffprobe(output)
 assert abs(info['duration']-p['duration'])<.05 and info['has_audio']
 stats=subprocess.run(['ffmpeg','-i',str(output),'-af','volumedetect','-f','null','-'],capture_output=True,text=True,check=True).stderr
 outputs.append(float(re.search(r'mean_volume: ([\-0-9.]+) dB',stats)[1]))
 peak=float(re.search(r'max_volume: ([\-0-9.]+) dB',stats)[1])
 assert peak<0
assert outputs[1]>outputs[0]+2,outputs
normalized=dict(p,normalize_speech=True)
assert studio.fingerprint(normalized)!=studio.fingerprint(p)
normalized=s.validate_project(normalized,p['id']);s.save_project(normalized)
s.backup_project(p['id'],root/'normalized.zip')
assert s.restore_project(root/'normalized.zip')['normalize_speech'] is True
try:s.validate_project(dict(normalized,normalize_speech='true'),p['id'])
except ValueError:pass
else:raise AssertionError('Invalid volume setting accepted')
print('PASS: normalized volume increases, peaks below zero, timing/audio, backup and fingerprint; mean dB',outputs)
# Caption conversion never gives AI control of timestamps or partially saves.
project=json.loads(json.dumps(normalized))
project['captions']=[{'start':i*.4,'end':i*.4+.3,'text':'搶救 台灣 '+str(i)} for i in range(21)]
project['caption_language']='original';project.pop('captions_original',None);s.save_project(project)
source=studio.clean_captions(project['captions'],project['duration']);calls=[]
def translate_response(content,limit):
 prompt=content[0]['text'];batch=json.loads(prompt.split('Captions: ',1)[1]);calls.append(batch)
 return json.dumps({'captions':[{'index':v['index'],'text':'Translated '+v['text']} for v in reversed(batch)]})
s.ai_response=translate_response
for language in ('zh-hans','zh-hant','en'):
 translated=studio.action(s,'caption-language',{'project_id':project['id'],'language':language},uuid.uuid4().hex)['project']
 assert [(c['start'],c['end']) for c in translated['captions']]==[(c['start'],c['end']) for c in source]
 assert translated['captions_original']==source and translated['caption_language']==language
 assert translated['captions'][0]['text']=='Translated '+source[0]['text']
assert len(calls)==6
s.backup_project(project['id'],root/'translated.zip')
restored=s.restore_project(root/'translated.zip')
assert restored['caption_language']=='en' and restored['captions_original']==source
before=(s.PROJECTS/(project['id']+'.json')).read_bytes()
s.ai_response=lambda *args:json.dumps({'captions':[{'index':0,'text':'Incomplete'}]})
try:studio.action(s,'caption-language',{'project_id':project['id'],'language':'en'},uuid.uuid4().hex)
except ValueError:pass
else:raise AssertionError('Incomplete translation accepted')
assert (s.PROJECTS/(project['id']+'.json')).read_bytes()==before
s.ai_response=lambda *args:(_ for _ in ()).throw(AssertionError('restore must be free'))
restored=studio.action(s,'caption-language',{'project_id':project['id'],'language':'original'},uuid.uuid4().hex)['project']
assert restored['captions']==source
corrected=json.loads(json.dumps(restored));corrected['captions'][0]['text']='搶救 corrected'
corrected=s.validate_project(corrected,corrected['id']);s.save_project(corrected)
assert corrected['captions_original'][0]['text']=='搶救 corrected'
trimmed=json.loads(json.dumps(corrected));trimmed['shots'][0]['source_start']+=.1;trimmed['shots'][0]['duration']-=.1
trimmed=s.validate_project(trimmed,trimmed['id'])
assert not trimmed['captions'] and 'captions_original' not in trimmed
print('PASS: caption languages/batching, exact timing, atomic failures, free original restore, corrected source and backup')
# Music soundtrack exports retain exact cumulative frame timing.
music=json.loads(json.dumps(p));music['source_audio']=False;music['normalize_speech']=True;music['captions']=[]
music['shots']=[dict(p['shots'][0],duration=.27),dict(p['shots'][0],source_start=1,duration=.33)]
music['duration']=.6
assert sum(s.render_frame_counts(music['shots']))==18
job=uuid.uuid4().hex;s.render(music,job)
assert s.jobs[job]['state']=='done' and abs(s.ffprobe(s.EXPORTS/(job+'.mp4'))['duration']-.6)<.05
from zipfile import ZipFile
bad=root/'unsafe.zip'
with ZipFile(bad,'w') as archive:archive.writestr('../outside.txt','bad')
try:s.restore_project(bad)
except ValueError:pass
else:raise AssertionError('Unsafe archive accepted')
print('PASS: music soundtrack/frame timing regression and unsafe archive rejection')
