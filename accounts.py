"""Local accounts and thread-scoped private workspaces (stdlib only)."""
import hashlib,hmac,json,os,re,secrets,threading,uuid
from pathlib import Path
from collections.abc import MutableMapping

context=threading.local()
ADMIN={'id':'admin','username':'auracut','role':'admin','enabled':True,'ai_allowed':True}
def identity():
    user=getattr(context,'user',None)
    if user is None:raise RuntimeError('No authenticated workspace context')
    return user
def set_identity(user):context.user=dict(user)
# The startup/maintenance thread initializes legacy administrator storage.
# Request and worker threads must establish their own identity explicitly.
set_identity(ADMIN)

def user_thread(target,args=(),daemon=True):
    user=dict(identity())
    def run():
        set_identity(user)
        target(*args)
    return threading.Thread(target=run,daemon=daemon)

class WorkspacePath:
    def __init__(self,root,kind):self.root,self.kind=root,kind
    def path(self):
        user_id=identity()['id']
        base=self.root if user_id=='admin' else self.root/'users'/user_id
        return base/self.kind
    def __truediv__(self,value):return self.path()/value
    def __fspath__(self):return str(self.path())
    def __str__(self):return str(self.path())
    def __getattr__(self,name):return getattr(self.path(),name)

class PrivateJobs(MutableMapping):
    def __init__(self):self.values={}
    def key(self,key):return (identity()['id'],key)
    def __getitem__(self,key):return self.values[self.key(key)]
    def __setitem__(self,key,value):self.values[self.key(key)]=value
    def __delitem__(self,key):del self.values[self.key(key)]
    def __iter__(self):return iter([key for user,key in self.values if user==identity()['id']])
    def __len__(self):return sum(user==identity()['id'] for user,key in self.values)

class Store:
    def __init__(self,root):self.root=root;self.file=root/'accounts.json';self.lock=threading.Lock()
    def read(self):
        return json.loads(self.file.read_text()) if self.file.exists() else {}
    def write(self,rows):
        temporary=self.file.with_suffix('.tmp')
        fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
        with os.fdopen(fd,'w') as stream:json.dump(rows,stream)
        os.chmod(temporary,0o600);temporary.replace(self.file)
    @staticmethod
    def hash_password(password,salt=None):
        if not isinstance(password,str) or not 16<=len(password)<=256 or any(ord(c)<32 for c in password):
            raise ValueError('Password must contain 16–256 characters without control characters')
        salt=salt or secrets.token_hex(16)
        digest=hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex()
        return {'salt':salt,'hash':digest}
    @staticmethod
    def public(row):return {key:row[key] for key in ('id','username','role','enabled','ai_allowed')}
    def verify(self,username,password,admin_password):
        if username=='auracut' and admin_password and hmac.compare_digest(password.encode(),admin_password.encode()):return dict(ADMIN)
        with self.lock:row=self.read().get(username)
        if not row or not row['enabled']:return None
        try:matched=hmac.compare_digest(self.hash_password(password,row['password']['salt'])['hash'],row['password']['hash'])
        except (ValueError,TypeError):return None
        return self.public(row) if matched else None
    def list(self):
        with self.lock:return [dict(ADMIN)]+[self.public(row) for row in self.read().values()]
    def change(self,data):
        operation=data.get('operation');username=data.get('username')
        if not isinstance(username,str) or not re.fullmatch(r'[a-z][a-z0-9_-]{2,39}',username) or username=='auracut':
            raise ValueError('Use a unique lowercase username of 3–40 letters, digits, hyphens or underscores; auracut is reserved')
        with self.lock:
            rows=self.read();row=rows.get(username)
            if operation=='create':
                if row:raise ValueError('Username already exists')
                if len(rows)>=50:raise ValueError('V1 supports at most 50 invited accounts')
                if type(data.get('ai_allowed',False)) is not bool:raise ValueError('Invalid AI access setting')
                row={'id':uuid.uuid4().hex,'username':username,'role':'user','enabled':True,'ai_allowed':data.get('ai_allowed',False),'password':self.hash_password(data.get('password'))}
                rows[username]=row
                for kind in ('media','projects','exports'):
                    directory=self.root/'users'/row['id']/kind;directory.mkdir(parents=True,exist_ok=True)
                os.chmod(self.root/'users'/row['id'],0o700)
            elif operation=='reset-password':
                if not row:raise ValueError('Account not found')
                row['password']=self.hash_password(data.get('password'))
            elif operation=='update':
                if not row:raise ValueError('Account not found')
                for key in ('enabled','ai_allowed'):
                    if key in data:
                        if type(data[key]) is not bool:raise ValueError('Invalid account setting')
                        row[key]=data[key]
            else:raise ValueError('Unknown account operation')
            self.write(rows)
            return self.public(row)
