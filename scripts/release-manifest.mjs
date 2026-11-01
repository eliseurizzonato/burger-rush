import {readFileSync,writeFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), web = path.join(root,'www');
function gitHead(){let dir=path.join(root,'.git');if(!statSync(dir).isDirectory())dir=path.resolve(root,readFileSync(dir,'utf8').trim().replace(/^gitdir:\s*/,''));const head=readFileSync(path.join(dir,'HEAD'),'utf8').trim();if(/^[a-f0-9]{40}$/.test(head))return head;const ref=head.replace(/^ref:\s*/,'');const loose=path.join(dir,ref);if(existsSync(loose))return readFileSync(loose,'utf8').trim();const common=existsSync(path.join(dir,'commondir'))?path.resolve(dir,readFileSync(path.join(dir,'commondir'),'utf8').trim()):dir;const regular=path.join(common,ref);if(existsSync(regular))return readFileSync(regular,'utf8').trim();const entry=readFileSync(path.join(common,'packed-refs'),'utf8').split('\n').find(l=>l.endsWith(' '+ref));if(entry)return entry.split(' ')[0];throw Error('Não foi possível identificar o commit base')}
const files=[];
function scan(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('Manifesto não aceita links simbólicos');if(item.isDirectory())scan(file);else if(item.isFile()&&item.name!=='build-info.json')files.push(file)}}
scan(web); files.sort();
const digest=createHash('sha256');
for(const file of files){digest.update(path.relative(web,file).replaceAll(path.sep,'/')+'\0');digest.update(readFileSync(file));digest.update('\0')}
const packageInfo=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
const manifest={version:packageInfo.version,schema:8,channel:'web-candidate',baseCommit:gitHead(),sourceHash:digest.digest('hex'),preparedAt:new Date().toISOString().slice(0,10),publication:'pending',android:{publishedByThisChange:false,previousVersionCode:9,previousVersionName:'1.4'}};
writeFileSync(path.join(web,'build-info.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({version:manifest.version,schema:manifest.schema,files:files.length,sourceHash:manifest.sourceHash}));
