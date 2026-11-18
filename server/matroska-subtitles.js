'use strict';
// Inspect bytes already passing through the proxy. Never alter or buffer video payloads.
var CLUSTER=Buffer.from([0x1f,0x43,0xb6,0x75]);
function vint(b,p,id){if(p>=b.length||!b[p])return null;var n=1,mask=128;while(!(b[p]&mask)){n++;mask>>=1;}if(n>(id?4:8)||p+n>b.length)return null;var v=id?b[p]:b[p]&(mask-1),unknown=!id&&v===mask-1;for(var i=1;i<n;i++){v=v*256+b[p+i];unknown=unknown&&b[p+i]===255;}return {n:n,v:unknown?Infinity:v};}
function uint(b){var v=0;for(var i=0;i<b.length;i++)v=v*256+b[i];return v;}
function plain(text,codec){
  if(codec==='S_TEXT/ASS'||codec==='S_TEXT/SSA')text=text.split(',').slice(8).join(',').replace(/\{\\[^}]*\}/g,'').replace(/\\[Nn]/g,'\n').replace(/\\h/g,' ');
  for(var pass=0;pass<2;pass++)text=text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,function(all,key){var entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '},k=key.toLowerCase();if(k[0]!=='#')return entities[k];var n=k[1]==='x'?parseInt(k.slice(2),16):parseInt(k.slice(1),10);return n>=0&&n<=0x10ffff?String.fromCodePoint(n):'';});
  return text.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/[\x00-\x08\x0b-\x1f]/g,'').split('\n').map(function(line){return line.trim();}).join('\n').trim().slice(0,8192);
}
function create(){
  var files=Object.create(null);
  function file(key){if(!files[key]){var keys=Object.keys(files);if(keys.length>=4){keys.sort(function(a,b){return files[a].used-files[b].used;});delete files[keys[0]];}files[key]={tracks:[],scale:1000000,cues:[],bytes:0,used:Date.now()};}files[key].used=Date.now();return files[key];}
  function add(f,cue){if(!cue||!Number.isFinite(cue.start)||cue.end<=cue.start||!cue.text)return;var old=f.cues.find(function(c){return c.track===cue.track&&c.start===cue.start&&c.end===cue.end;});if(old)return;f.cues.push(cue);f.bytes+=Buffer.byteLength(cue.text);while(f.cues.length>2048||f.bytes>1024*1024)f.bytes-=Buffer.byteLength(f.cues.shift().text);}
  function tap(key,offset){
    var f=file(key),b=Buffer.alloc(0),pos=offset||0,skip=0,stack=[],sync=pos!==0,track=null,group=null,clock=0,stopped=false;
    function finish(){while(stack.length&&pos>=stack[stack.length-1].end){var frame=stack.pop();if(frame.id===0xae&&track){var previous=f.tracks.findIndex(function(t){return t.number===track.number;});if(track.type===17&&track.number){if(previous>=0)f.tracks[previous]=track;else f.tracks.push(track);}track=null;}if(frame.id===0xa0&&group){if(group.block&&group.duration>0){group.block.end=group.block.start+group.duration*f.scale/1e9;add(f,group.block);}group=null;}}}
    function block(data){var t=vint(data,0,false);if(!t||data.length<t.n+3||(data[t.n+2]&6))return null;var entry=f.tracks.find(function(e){return e.number===t.v;});if(!entry||!/^S_TEXT\/(UTF8|ASS|SSA|WEBVTT)$/.test(entry.codec))return null;return {track:entry.number,start:(clock+data.readInt16BE(t.n))*f.scale/1e9,text:plain(data.slice(t.n+3).toString('utf8'),entry.codec)};}
    function feed(chunk){if(stopped)return;f.used=Date.now();try{
      if(skip){var count=Math.min(skip,chunk.length);skip-=count;pos+=count;chunk=chunk.slice(count);if(!chunk.length)return;}
      b=b.length?Buffer.concat([b,chunk]):chunk;
      while(b.length){if(pos===0&&!sync&&b.length>=4&&b.readUInt32BE(0)!==0x1a45dfa3){stopped=true;b=Buffer.alloc(0);return;}finish();if(sync){var at=b.indexOf(CLUSTER);if(at<0){var drop=Math.max(0,b.length-3);pos+=drop;b=b.slice(drop);return;}pos+=at;b=b.slice(at);stack=[];track=null;group=null;sync=false;}
        var id=vint(b,0,true);if(!id){if(b.length>8||b[0]===0){stopped=true;b=Buffer.alloc(0);}return;}var size=vint(b,id.n,false);if(!size){if(b.length>16){stopped=true;b=Buffer.alloc(0);}return;}var header=id.n+size.n,len=size.v;
        if([0x18538067,0x1549a966,0x1654ae6b,0xae,0x1f43b675,0xa0].indexOf(id.v)>=0){if(stack.length>=128){stopped=true;b=Buffer.alloc(0);return;}stack.push({id:id.v,end:pos+header+len});if(id.v===0xae)track={};if(id.v===0xa0)group={};if(id.v===0x1f43b675)clock=0;pos+=header;b=b.slice(header);continue;}
        var wanted=[0x2ad7b1,0xd7,0x83,0x86,0x22b59c,0x536e,0xe7,0xa1,0x9b].indexOf(id.v)>=0;
        if(!Number.isFinite(len)){sync=true;pos++;b=b.slice(1);continue;}
        if(!wanted||len>256*1024){var available=Math.min(len,b.length-header);pos+=header+available;b=b.slice(header+available);skip=len-available;if(skip)return;continue;}
        if(b.length<header+len)return;
        var data=b.slice(header,header+len);
        if(id.v===0x2ad7b1)f.scale=uint(data)||1000000;
        else if(track){if(id.v===0xd7)track.number=uint(data);if(id.v===0x83)track.type=uint(data);if(id.v===0x86)track.codec=data.toString('utf8');if(id.v===0x22b59c)track.language=data.toString('utf8');if(id.v===0x536e)track.label=data.toString('utf8');}
        if(id.v===0xe7)clock=uint(data);
        if(id.v===0xa1&&group)group.block=block(data);
        if(id.v===0x9b&&group)group.duration=uint(data);
        pos+=header+len;b=b.slice(header+len);finish();
      }
    }catch(_){stopped=true;b=Buffer.alloc(0);}}
    return {feed:feed};
  }
  function tracks(key){var f=files[key];return f?f.tracks.map(function(t,index){return {index:index,label:t.label||t.language||'Дорожка '+(index+1),renderable:/^S_TEXT\/(UTF8|ASS|SSA|WEBVTT)$/.test(t.codec)};}):[];}
  function cues(key,index,time){var f=files[key],t=f&&f.tracks[index];return {cues:t?f.cues.filter(function(c){return c.track===t.number&&c.end>=time-2&&c.start<=time+30;}).map(function(c){return {start:c.start,end:c.end,text:c.text};}):[]};}
  return {tap:tap,tracks:tracks,cues:cues};
}
module.exports={create:create,plain:plain};
