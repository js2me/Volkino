'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),subtitles=require('../server/matroska-subtitles');
function vint(n){for(let len=1;len<=4;len++)if(n<2**(7*len)-1){const b=Buffer.alloc(len);b.writeUIntBE(n,0,len);b[0]|=1<<(8-len);return b;}throw Error('too large');}
const el=(id,data)=>Buffer.concat([Buffer.from(id,'hex'),vint(data.length),data]);
function number(n){let len=1;while(n>=2**(len*8))len++;const b=Buffer.alloc(len);b.writeUIntBE(n,0,len);return b;}
const num=(id,n)=>el(id,number(n)),text=(id,s)=>el(id,Buffer.from(s));
function track(n,codec,language='rus'){return el('ae',Buffer.concat([num('d7',n),num('83',17),text('86',codec),text('22b59c',language)]));}
function block(n,time,body,duration=2000){const h=Buffer.alloc(4);h[0]=0x80|n;h.writeInt16BE(time,1);return el('a0',Buffer.concat([el('a1',Buffer.concat([h,Buffer.from(body)])),num('9b',duration)]));}
function header(){return Buffer.concat([el('1a45dfa3',Buffer.alloc(0)),Buffer.from('1853806701ffffffffffffff','hex'),el('1549a966',num('2ad7b1',1000000)),el('1654ae6b',Buffer.concat([track(2,'S_HDMV/PGS'),track(3,'S_TEXT/UTF8'),track(4,'S_TEXT/ASS','eng')]))]);}
function cluster(clock,blocks){return el('1f43b675',Buffer.concat([num('e7',clock),...blocks]));}
test('Matroska reads exact subtitle start/end times, preserves track ordering and strips HTML/ASS markup',()=>{
 const m=subtitles.create(),p=m.tap('movie',0),data=Buffer.concat([header(),cluster(10000,[block(3,-500,'<font color="#ffff00">Привет &amp; мир</font>',2500),block(4,2000,'0,0,Default,,0,0,0,,{\\i1}Hello\\NWorld{\\i0}',1000)])]);
 for(let i=0;i<data.length;i++)p.feed(data.subarray(i,i+1));
 assert.deepEqual(m.tracks('movie').map(t=>t.renderable),[false,true,true]);
 assert.deepEqual(m.cues('movie',1,10).cues,[{start:9.5,end:12,text:'Привет & мир'}]);
 assert.deepEqual(m.cues('movie',2,12).cues,[{start:12,end:13,text:'Hello\nWorld'}]);
});
test('range requests resynchronize at a cluster and use previously captured track metadata',()=>{
 const m=subtitles.create();m.tap('movie',0).feed(header());
 const range=Buffer.concat([Buffer.from('partial video packet'),cluster(390000,[block(3,400,'<b>Реплика после перемотки</b>',2400)])]);
 const p=m.tap('movie',123456);for(let i=0;i<range.length;i+=3)p.feed(range.subarray(i,i+3));
 const [cue]=m.cues('movie',1,390).cues;assert.equal(cue.start,390.4);assert.ok(Math.abs(cue.end-392.8)<1e-8);assert.equal(cue.text,'Реплика после перемотки');
});
test('large video packets and non-Matroska streams are ignored without changing input bytes',()=>{
 const m=subtitles.create(),p=m.tap('movie',0),video=el('a3',Buffer.alloc(1024*1024,0x55));
 const data=Buffer.concat([header(),cluster(0,[video,block(3,1000,'<i>Текст</i>',1000)])]),copy=Buffer.from(data);
 for(let i=0;i<data.length;i+=4096)p.feed(data.subarray(i,i+4096));
 assert.deepEqual(data,copy);assert.equal(m.cues('movie',1,1).cues[0].text,'Текст');
 const other=m.tap('mp4',0);for(let i=0;i<100;i++)other.feed(Buffer.alloc(65536));assert.deepEqual(m.tracks('mp4'),[]);
});
test('escaped markup and malformed entities are plain text, never executable HTML',()=>{
 assert.equal(subtitles.plain('&lt;font color="yellow"&gt;Текст&lt;/font&gt;<br>вторая строка','S_TEXT/UTF8'),'Текст\nвторая строка');
 assert.equal(subtitles.plain('&#x1f600; &amp; <img src=x onerror=evil()>','S_TEXT/UTF8'),'😀 &');
});
