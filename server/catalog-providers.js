'use strict';
// Third-party home collections. The helper never fetches URLs from a response.
var URL=require('url'),core=require('./core');
function plain(value,limit){return core.clean(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,limit||500);}
function image(url,provider){
  var u=URL.parse(String(url||'')),path=u.pathname||'';
  if(u.protocol!=='https:'||u.auth||u.port||u.search||u.hash)return '';
  var ok=provider==='cub'&&u.hostname==='image.tmdb.org'&&/^\/t\/p\/w200\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(path)||
    provider==='cinemeta'&&u.hostname==='images.metahub.space'&&/^\/poster\/small\/tt\d+\/img$/.test(path)||
    provider==='yts'&&u.hostname==='yts.gg'&&/^\/assets\/images\/movies\/[a-zA-Z0-9_-]+\/(small|medium|large)-cover\.(jpg|png|webp)$/.test(path);
  return ok?'/catalog-poster?url='+encodeURIComponent(url):'';
}
function year(value){var m=String(value||'').match(/^(19\d{2}|20\d{2})/);return m?m[1]:'';}
function rating(value){var n=Number(value);return isFinite(n)&&n>0&&n<=10?String(Math.round(n*10)/10):'';}
function metadata(y,r){return [y,r?'★ '+r:''].filter(Boolean).join(' · ');}
function card(provider,m,forcedType){
  if(!m||typeof m!=='object')return null;
  var type=forcedType||(provider==='cub'?(m.name&&!m.title?'tv':'movie'):(m.type==='series'?'tv':'movie'));
  if(type!=='movie'&&type!=='tv')return null;
  var name=plain(provider==='cub'?(m.title||m.name):(m.name||m.title)),id='',number=String(provider==='cub'?m.id:m.moviedb_id||''),imdb=String(m.imdb_id||m.imdb_code||m.id||'');
  if(/^\d{1,12}$/.test(number)&&Number(number)>0)id='tmdb:'+type+':'+number;
  else if(/^tt\d{1,12}$/.test(imdb))id='imdb:'+imdb;
  if(!id||!name)return null;
  var y=year(m.release_date||m.first_air_date||m.year||m.releaseInfo||m.released),r=rating(m.vote_average||m.imdbRating||m.rating),poster='';
  if(provider==='cub'&&/^\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(m.poster_path||''))poster=image('https://image.tmdb.org/t/p/w200'+m.poster_path,provider);
  if(provider==='cinemeta')poster=image(m.poster,provider);
  if(provider==='yts')poster=image(m.medium_cover_image||m.small_cover_image,provider);
  var description=plain(m.overview||m.description||m.description_full||m.synopsis||m.summary,4000);
  return{id:id,title:name,type:type,year:y,rating:r,poster:poster,metadata:metadata(y,r),description:description||'Описание пока недоступно.',searchTitle:name,provider:provider};
}
function cards(provider,data,type,filterYear){
  var list=provider==='cub'?data&&data.results:provider==='cinemeta'?data&&data.metas:data&&data.data&&data.data.movies;
  if(!Array.isArray(list))throw new Error('Источник вернул некорректный каталог');
  var seen={};return list.map(function(m){return card(provider,m,type);}).filter(function(c){if(!c||seen[c.id]||filterYear&&c.year!==String(filterYear))return false;seen[c.id]=true;return true;});
}
function create(options){
  var fetchJSON=options.fetchJSON,now=options.now||Date.now;
  function home(provider){
    var y=new Date(now()).getUTCFullYear(),base,requests,source;
    if(provider==='cub'){
      source='CUB';base='https://tmdb.cub.best/';
      requests=[{id:'popular',title:'Популярное сейчас',url:base+'?sort=now_playing'},
        {id:'movies',title:'Новые фильмы · '+y,url:base+'?cat=movie&sort=now&airdate='+y,type:'movie',year:y},
        {id:'series',title:'Новые сериалы · '+y,url:base+'?cat=tv&sort=now&airdate='+y,type:'tv',year:y}];
    }else if(provider==='cinemeta'){
      source='Cinemeta';base='https://v3-cinemeta.strem.io/catalog/';
      requests=[{id:'popular',title:'Популярное сейчас',url:base+'movie/top.json',type:'movie'},
        {id:'popular-series',title:'Популярное сейчас',url:base+'series/top.json',type:'tv'},
        {id:'movies',title:'Новые фильмы · '+y,url:base+'movie/year/genre='+y+'.json',type:'movie',year:y},
        {id:'series',title:'Новые сериалы · '+y,url:base+'series/year/genre='+y+'.json',type:'tv',year:y}];
    }else if(provider==='yts'){
      source='YTS';base='https://yts.lt/api/v2/list_movies.json?limit=50&sort_by=';
      requests=[{id:'popular',title:'Популярные фильмы · по загрузкам',url:base+'download_count',type:'movie'},
        {id:'movies',title:'Новые фильмы · '+y,url:base+'date_added',type:'movie',year:y}];
    }else return Promise.reject(new Error('Неизвестный источник каталога'));
    var failed=0;
    return Promise.all(requests.map(function(req){return Promise.resolve().then(function(){return fetchJSON(req.url);}).then(function(data){return cards(provider,data,req.type,req.year);}).catch(function(){failed++;return [];});})).then(function(pages){
      var sections=[];requests.forEach(function(req,i){
        if(req.id==='popular-series'){var first=sections.filter(function(s){return s.id==='popular';})[0];if(first){var a=first.items,b=pages[i],mixed=[];while(mixed.length<18&&(a.length||b.length)){if(a.length)mixed.push(a.shift());if(mixed.length<18&&b.length)mixed.push(b.shift());}first.items=mixed;}else if(pages[i].length)sections.push({id:'popular',title:req.title,items:pages[i].slice(0,18)});return;}
        if(pages[i].length)sections.push({id:req.id,title:req.title,items:pages[i].slice(0,18)});
      });
      if(!sections.length)throw new Error('Каталог '+source+' временно недоступен.');
      return{sections:sections,source:source,updatedAt:now(),partial:failed>0};
    });
  }
  return{home:home};
}
module.exports={create:create,card:card,cards:cards,image:image};
