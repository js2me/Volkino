/* ES5 syntax for LG webOS 5.x / Chromium 68. No framework or remote scripts. */
(function () {
  'use strict';
  var content = document.getElementById('content'), title = document.getElementById('page-title');
  var video = document.getElementById('video'), player = document.getElementById('player');
  var state = { view: 'search', token: '', config: {}, results: [], query: '', hash: '', torrent: null, files: [], timer: null, generation: 0, playing: null, overlayTimer: null, returnFocus: null, sort: 'seeders', resume: 0, playerTimer: null, playerDeadline: null, enterHeld: false, controlsPinned: false, homeData: null, homeScroll: 0, detailItem: null, lastHomeId: null, searchFromDetail: false };
  var toastTimer, historyWarning=false, history = readHistory();
  var seekControl=TWPlayback.create(video,{
    onPreview:function(position){renderPosition(position);$('playing-status').textContent='Перемотка к '+time(position)+'…';showOverlay();},
    onStart:function(position){$('playing-status').textContent='Перемотка к '+time(position)+' · ждём данные от TorrServer…';$('player-back').className='btn';showOverlay();},
    onDone:function(){if(!state.playing)return;$('playing-status').textContent=video.paused?'Пауза':'';$('player-back').className='hidden';showOverlay();},
    onError:function(message){if(!state.playing)return;$('playing-status').textContent=message;$('player-back').className='btn';state.controlsPinned=true;showOverlay();}
  });
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function readHistory() { try { return TWHistory.load(localStorage); } catch (_) { return []; } }
  function storeHistory() { try { history=TWHistory.save(localStorage,history); } catch (_) { if(!historyWarning){historyWarning=true;toast('Не удалось сохранить историю на телевизоре: хранилище недоступно или заполнено');} } }
  function toast(message) { $('toast').textContent = message; $('toast').className = ''; clearTimeout(toastTimer); toastTimer = setTimeout(function () { $('toast').className = 'hidden'; }, 6500); }
  function api(route, data, done) {
    var xhr = new XMLHttpRequest(); xhr.open(data == null ? 'GET' : 'POST', '/api/' + route, true); xhr.timeout = route === 'preload' ? 50000 : 25000;
    if (state.token) xhr.setRequestHeader('X-App-Token', state.token);
    if (data != null) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () { var body; try { body = JSON.parse(xhr.responseText); } catch (_) { return done(new Error('Некорректный ответ сервера')); } if (xhr.status >= 400) return done(new Error(body.error || 'Ошибка HTTP ' + xhr.status)); done(null, body); };
    xhr.onerror = function () { done(new Error('Нет соединения с локальным помощником. Перезапустите приложение.')); };
    xhr.ontimeout = function () { done(new Error('Сервер не ответил вовремя. Проверьте подключение.')); };
    xhr.send(data == null ? null : JSON.stringify(data));
  }
  function button(text, fn, cls) { var b = el('button', cls || 'btn', text); b.onclick = fn; return b; }
  function bytes(n) { if (typeof n === 'string' && !/^\d+$/.test(n)) return n; n = Number(n || 0); if (!n) return '—'; var units = ['Б','КиБ','МиБ','ГиБ','ТиБ'], i = Math.min(4, Math.floor(Math.log(n)/Math.log(1024))); return (n/Math.pow(1024,i)).toFixed(i ? 1 : 0) + ' ' + units[i]; }
  function time(n) { n = Math.max(0,Math.floor(n || 0)); var h = Math.floor(n/3600), m = Math.floor(n/60)%60, s = n%60; return (h ? h + ':' + ('0'+m).slice(-2) : m) + ':' + ('0'+s).slice(-2); }
  function focusFirst() { var e = content.querySelector('input,button,select'); if (e) e.focus(); }
  function message(heading, text, busy) { var d = el('div','empty'); var h = el('h2'); if (busy) h.appendChild(el('i','spinner')); h.appendChild(document.createTextNode(heading)); d.appendChild(h); d.appendChild(el('p','',text)); content.appendChild(d); return d; }
  function change(view) {
    clearTimeout(state.timer); state.generation++; state.view = view; content.innerHTML = ''; title.className=view==='files'?'file-page-title':'';
    var navs = document.querySelectorAll('[data-view]'); for (var i=0;i<navs.length;i++) navs[i].className = 'nav' + (navs[i].getAttribute('data-view') === view ? ' active' : '');
    $('main').scrollTop=0;
    title.textContent = { home:'Что посмотрим сегодня?', details:'О фильме', search:'Что посмотрим?', history:'История просмотров', torrents:'Торренты на сервере', magnet:'Открыть торрент', settings:'Настройки', files:'Выберите файл' }[view] || 'Torrenter Watcher';
    if (view === 'home') homeView(); else if (view === 'search') searchView(); else if (view === 'settings') settingsView(); else if (view === 'magnet') magnetView(); else if (view === 'history') historyView(); else if (view === 'torrents') torrentsView();
  }
  function posterImage(parent,src,name){
    var wrap=el('div','poster-art'),fallback=el('span','poster-fallback',String(name||'Кино').slice(0,1));wrap.appendChild(fallback);
    if(src){var img=el('img');img.alt='';img.src=src;img.setAttribute('loading','lazy');img.onerror=function(){img.style.display='none';};wrap.appendChild(img);}parent.appendChild(wrap);return wrap;
  }
  function catalogCard(item){
    var card=el('button','poster-card');card.setAttribute('data-catalog-id',item.id);card.setAttribute('aria-label',item.title+(item.year?' · '+item.year:''));
    var art=posterImage(card,item.poster,item.title);if(item.rating)art.appendChild(el('span','poster-rating',item.rating));
    card.appendChild(el('span','poster-name',item.title));card.appendChild(el('span','poster-meta',(item.year||'')+(item.type==='tv'?' · Сериал':' · Фильм')));
    card.onclick=function(){state.homeScroll=$('main').scrollTop;state.lastHomeId=item.id;openDetails(item);};return card;
  }
  function homeView(){
    if(state.homeData&&Date.now()-state.homeData.updatedAt<3*60*60*1000){renderHome();return;}
    message('Подбираем, что посмотреть…','Загружаем постеры, популярное и новые фильмы и сериалы.',true);var gen=state.generation;
    api('catalog/home',null,function(err,data){if(gen!==state.generation)return;content.innerHTML='';if(err){message('Подборки временно недоступны',err.message);content.appendChild(button('Повторить',function(){change('home');},'btn primary'));content.appendChild(button('Перейти к поиску',function(){state.searchFromDetail=false;change('search');}));focusFirst();return;}state.homeData=data;renderHome();});
  }
  function renderHome(){
    content.innerHTML='';title.textContent='Что посмотрим сегодня?';
    var intro=el('div','home-intro');intro.appendChild(el('p','muted','Выберите фильм или сериал — найдём раздачи для просмотра.'));intro.appendChild(button('Поиск по названию',function(){state.searchFromDetail=false;change('search');},'btn'));content.appendChild(intro);
    if(history.length){var recent=el('section','home-section');recent.appendChild(el('h2','','Продолжить просмотр'));var strip=el('div','continue-row');history.slice(0,8).forEach(function(h){var card=button('',function(){openTorrent(h.link,h.torrentTitle,h);},'continue-card');card.appendChild(el('span','continue-name',h.title));card.appendChild(el('span','muted',h.position>0?time(h.position)+' / '+time(h.duration):'Открыто · начать просмотр'));var track=el('span','continue-track'),fill=el('span');fill.style.width=(h.duration?Math.min(100,100*h.position/h.duration):0)+'%';track.appendChild(fill);card.appendChild(track);strip.appendChild(card);});recent.appendChild(strip);content.appendChild(recent);}
    state.homeData.sections.forEach(function(section){var area=el('section','home-section'),head=el('div','catalog-section-head');head.appendChild(el('h2','',section.title));head.appendChild(el('span','muted',section.items.length+' в подборке'));area.appendChild(head);var strip=el('div','poster-row');section.items.slice(0,18).forEach(function(item){strip.appendChild(catalogCard(item));});area.appendChild(strip);content.appendChild(area);});
    content.appendChild(el('p','catalog-source','Каталог: VilkaDB · подборки обновляются каждые 3 часа'+(state.homeData.stale?' · показана сохранённая подборка':state.homeData.partial?' · часть подборок временно недоступна':'')));
    var first=content.querySelector('.poster-card')||content.querySelector('button');if(state.lastHomeId){var cards=content.querySelectorAll('[data-catalog-id]');for(var i=0;i<cards.length;i++)if(cards[i].getAttribute('data-catalog-id')===state.lastHomeId)first=cards[i];}
    if(first)first.focus();$('main').scrollTop=state.homeScroll||0;
  }
  function openDetails(item){
    state.detailItem=item;state.searchFromDetail=false;change('details');renderDetails(item,true);var gen=state.generation;
    api('catalog/item?key='+encodeURIComponent(item.id),null,function(err,data){if(gen!==state.generation)return;if(err){toast('Описание недоступно; можно найти раздачи по названию');renderDetails(item,false);return;}if(!data.poster)data.poster=item.poster;state.detailItem=data;renderDetails(data,false);});
  }
  function renderDetails(item,loading){
    content.innerHTML='';title.textContent=item.type==='tv'?'О сериале':'О фильме';var layout=el('div','movie-details');posterImage(layout,item.poster,item.title);var body=el('div','movie-detail-body');body.appendChild(el('div','eyebrow',item.type==='tv'?'СЕРИАЛ':'ФИЛЬМ'));body.appendChild(el('h2','movie-name',item.title));var meta=item.metadata||'';if(meta.indexOf(item.title)===0)meta=meta.slice(item.title.length).trim();body.appendChild(el('p','movie-metadata',meta));
    body.appendChild(el('p','movie-description',loading?'Загружаем описание…':item.description||'Описание пока недоступно.'));
    var actions=el('div','detail-actions');actions.appendChild(button('Найти раздачи',function(){state.searchFromDetail=true;state.query=item.searchTitle||item.title;state.results=[];change('search');runSearch();},'btn primary'));actions.appendChild(button('На главную',function(){change('home');}));body.appendChild(actions);body.appendChild(el('p','muted','Доступность раздач и формат видео зависят от источника и телевизора.'));layout.appendChild(body);content.appendChild(layout);var b=body.querySelector('button');if(b)b.focus();
  }
  function searchView() {
    var form = el('form','search-form'), input = el('input','input'); input.id='query'; input.placeholder='Название фильма или сериала'; input.value=state.query; input.maxLength=160; input.autocomplete='off'; input.setAttribute('aria-label','Название фильма или сериала'); form.appendChild(input); form.appendChild(button('Найти  →',null,'btn primary')); content.appendChild(form);
    form.onsubmit = function (e) { e.preventDefault(); state.query=input.value.trim(); if (state.query.length<2) return toast('Введите хотя бы два символа'); runSearch(); };
    content.appendChild(el('div','muted','Поиск раздач · VilkaDB / Rutor / Torznab / Jacred · Воспроизведение через ваш TorrServer'));
    var results=el('div'); results.id='search-results';content.appendChild(results);
    if(state.results.length) renderResults();else welcome();
    input.focus();
  }
  function welcome() {
    var d=el('div','empty');d.appendChild(el('h2','','От названия до первого кадра.'));d.appendChild(el('p','','Найдите раздачу, выберите подходящий размер и качество. TorrServer подготовит поток, а телевизор начнёт просмотр.'));
    var b=button('Попробовать Big Buck Bunny',function(){state.query='Big Buck Bunny';$('query').value=state.query;runSearch();},'btn');d.appendChild(b);
    var steps=el('div','steps');['01  Найдите фильм','02  Выберите раздачу','03  Смотрите на ТВ'].forEach(function(t){steps.appendChild(el('span','',t));});d.appendChild(steps);$('search-results').appendChild(d);
  }
  function runSearch() {
    state.results=[];var target=$('search-results');target.innerHTML='';var d=el('div','empty');d.appendChild(el('h2','','Ищем раздачи…'));d.appendChild(el('p','','Получаем результаты от вашего поискового источника.'));target.appendChild(d);
    var gen=++state.generation,query=state.query;
    api('search?q='+encodeURIComponent(query),null,function(err,data){if(gen!==state.generation||state.view!=='search')return;target.innerHTML='';if(err){target.appendChild(el('p','error-text',err.message));return;}state.results=data.results;if(!data.results.length){target.appendChild(el('p','muted',data.hint||'Ничего не найдено. Попробуйте другое название.'));return;}renderResults();var first=target.querySelector('.torrent');if(first)first.focus();});
  }
  function row(number, text, meta, fn) {
    var b=el('button','torrent');b.appendChild(el('span','torrent-number',number<10?'0'+number:String(number)));var body=el('span','torrent-body');body.appendChild(el('span','torrent-title',text));var m=el('span','torrent-meta');meta.forEach(function(x){m.appendChild(el('span',x.cls||'',x.text));});body.appendChild(m);b.appendChild(body);b.appendChild(el('span','torrent-arrow','→'));b.onclick=fn;return b;
  }
  function renderResults() {
    var target=$('search-results');target.innerHTML='';var head=el('div','section-head');head.appendChild(el('h2','',state.results.length+' раздач'));var sort=el('select','input sort');[['seeders','Сначала больше сидов'],['size','Сначала меньше размер']].forEach(function(p){var o=el('option','',p[1]);o.value=p[0];sort.appendChild(o);});sort.value=state.sort;sort.setAttribute('aria-label','Сортировка');sort.onchange=function(){state.sort=sort.value;renderResults();var select=$('search-results').querySelector('select');if(select)select.focus();};head.appendChild(sort);target.appendChild(head);
    var list=state.results.slice();if(state.sort==='size')list.sort(function(a,b){return sizeNumber(a.size)-sizeNumber(b.size);});
    list.forEach(function(r,i){target.appendChild(row(i+1,r.title,[{text:bytes(r.size)},{text:'↑ '+r.seeders+' сидов',cls:'seed'},{text:r.tracker},{text:r.quality}],function(){openTorrent(r.magnet,r.title);}));});
  }
  function sizeNumber(v){if(typeof v==='number')return v;var m=String(v).replace(',','.').match(/([\d.]+)\s*(TB|GB|MB|KB|ТБ|ГБ|МБ|КБ|ТиБ|ГиБ|МиБ|КиБ)/i);if(!m)return Number(v)||0;var u=m[2].toUpperCase(),p=/^(T|Т)/.test(u)?4:/^(G|Г)/.test(u)?3:/^(M|М)/.test(u)?2:1;return Number(m[1])*Math.pow(1024,p);}
  function field(parent,label,value,type,id){var d=el('div','field'),l=el('label','',label),input=el(type==='select'?'select':'input','input');input.id=id;l.htmlFor=id;if(type!=='select'){input.type=type||'text';input.value=value||'';input.autocomplete='off';}d.appendChild(l);d.appendChild(input);parent.appendChild(d);return input;}
  function settingsView(){
    var p=el('div','panel');content.appendChild(p);p.appendChild(el('p','muted','TorrServer работает на отдельной машине. Укажите её адрес в вашей локальной сети.'));
    field(p,'Адрес TorrServer',state.config.torrserverUrl,'url','ts-url').placeholder='http://192.168.1.100:8090';
    var pair=el('div','two-columns');p.appendChild(pair);field(pair,'Логин (если установлен)',state.config.torrserverUsername,'text','ts-user');var password=field(pair,'Пароль','','password','ts-password');password.placeholder=state.config.hasPassword?'Сохранён · пустое поле оставит пароль':'';
    var provider=field(p,'Источник поиска','','select','search-provider');[['vilkadb','VilkaDB — как в ForkPlayer'],['torrserver','Rutor — индекс TorrServer'],['torznab','Torznab — индексаторы TorrServer'],['jacred','Jacred — внешний агрегатор']].forEach(function(x){var o=el('option','',x[1]);o.value=x[0];provider.appendChild(o);});provider.value=state.config.searchProvider;
    var extra=el('div');p.appendChild(extra);field(extra,'Адрес Jacred',state.config.jacredUrl,'url','jacred-url');var key=field(extra,'API-ключ Jacred (если нужен)','','password','jacred-key');key.placeholder=state.config.hasApiKey?'Сохранён':'';extra.style.display=provider.value==='jacred'?'block':'none';provider.onchange=function(){extra.style.display=provider.value==='jacred'?'block':'none';};
    var actions=el('div','settings-actions');p.appendChild(actions);actions.appendChild(button('Сохранить',saveSettings,'btn primary'));actions.appendChild(button('Проверить сервер',function(){saveSettings(function(){health(true);});}));actions.appendChild(button('Включить поиск Rutor',function(){saveSettings(function(){api('enable-search',{},function(err,r){toast(err?err.message:r.message||'Поиск уже включён');});});}));
    p.appendChild(el('p','muted','Torznab настраивается на стороне TorrServer: добавьте туда адреса Jackett / Prowlarr. Если у раздачи нет сидов, начало просмотра может занять много времени.'));focusFirst();
  }
  function saveSettings(after){var data={torrserverUrl:$('ts-url').value,torrserverUsername:$('ts-user').value,searchProvider:$('search-provider').value,jacredUrl:$('jacred-url').value};if($('ts-password').value)data.torrserverPassword=$('ts-password').value;if(!data.torrserverUsername)data.torrserverPassword='';if($('jacred-key').value)data.jacredApiKey=$('jacred-key').value;api('config',data,function(err,r){if(err)return toast(err.message);state.config=r;toast('Настройки сохранены');health(false);if(typeof after==='function')after();});}
  function health(show){api('health',null,function(err,r){$('connection-light').className=err?'error':'ok';$('connection-text').textContent=err?'TorrServer недоступен':r.version;if(show)toast(err?err.message:'Соединение работает: '+r.version);});}
  function magnetView(){var p=el('div','panel');content.appendChild(p);p.appendChild(el('p','','Вставьте magnet-ссылку или адрес .torrent. Файлы подготовит внешний TorrServer.'));var input=field(p,'Ссылка на торрент','','text','magnet-link');input.placeholder='magnet:?xt=urn:btih:…';p.appendChild(button('Открыть торрент',function(){openTorrent(input.value,'Торрент по ссылке');},'btn primary'));focusFirst();}
  function openTorrent(link,name,resumeItem){
    change('files');state.hash='';state.torrent=null;state.files=[];title.textContent=name;message('Получаем список файлов…','TorrServer ищет участников раздачи и метаданные. Это может занять до двух минут.',true);
    var gen=state.generation;api('add',{link:link,title:name},function(err,r){if(gen!==state.generation)return;if(err){content.innerHTML='';message('Не удалось открыть торрент',err.message);content.appendChild(button('Вернуться к поиску',function(){change('search');}));focusFirst();return;}state.hash=r.hash;state.torrent=r;state.originalLink=link;pollFiles(gen,Date.now(),resumeItem);});
  }
  function pollFiles(gen,started,resumeItem){api('status?hash='+encodeURIComponent(state.hash),null,function(err,r){if(gen!==state.generation)return;if(err){content.innerHTML='';message('Не удалось получить файлы',err.message);content.appendChild(button('Повторить',function(){pollFiles(gen,Date.now(),resumeItem);}));focusFirst();return;}state.torrent=r.torrent;state.files=r.files;if(r.files.length){renderFiles();if(resumeItem){var f=r.files.filter(function(x){return x.id===resumeItem.fileId;})[0];if(f)playFile(f,resumeItem.position);}return;}if(Date.now()-started>120000){content.innerHTML='';message('Метаданные пока не получены','Возможно, у раздачи нет доступных участников. Попробуйте другую раздачу или повторите запрос.');content.appendChild(button('Подождать ещё',function(){content.innerHTML='';message('Ждём метаданные…','Можно вернуться назад и выбрать другую раздачу.',true);pollFiles(gen,Date.now(),resumeItem);}));content.appendChild(button('К результатам',function(){change('search');}));focusFirst();return;}state.timer=setTimeout(function(){pollFiles(gen,started,resumeItem);},2000);});}
  function statsBar(t){var d=el('div','statusbar');['↓ '+bytes(t.download_speed)+'/с','Пиры: '+(t.active_peers||0),'Сиды: '+(t.connected_seeders||0),'Размер: '+bytes(t.torrent_size)].forEach(function(x){d.appendChild(el('span','',x));});return d;}
  function renderFiles(){content.innerHTML='';title.textContent=state.torrent.title||state.torrent.name||'Выберите файл';content.appendChild(statsBar(state.torrent));content.appendChild(el('p','muted','Выберите видео. Плеер поддерживает перемотку, паузу и продолжение просмотра.'));state.files.forEach(function(f,i){content.appendChild(row(i+1,f.path,[{text:bytes(f.length)}],function(){playFile(f,0);}));});focusFirst();}
  function torrentsView(){var gen=state.generation;message('Загружаем список…','Торренты, которые уже добавлены в ваш TorrServer.',true);api('torrents',null,function(err,list){if(gen!==state.generation)return;content.innerHTML='';if(err){message('Сервер недоступен',err.message);return;}if(!list.length){message('Пока пусто','Найдите фильм через поиск или откройте magnet-ссылку.');return;}list.forEach(function(t,i){content.appendChild(row(i+1,t.title||t.name||t.hash,[{text:bytes(t.torrent_size)},{text:t.stat_string}],function(){openTorrent('magnet:?xt=urn:btih:'+t.hash,t.title||t.name);}));});focusFirst();});}
  function historyView(){
    if(!history.length){message('История пока пуста','Откройте видео — сохраним его сразу. Здесь остаются последние 100 файлов и позиции просмотра.');return;}
    content.appendChild(el('p','muted',history.length+' из '+TWHistory.limit+' · последние открытые видео · старые записи удаляются автоматически'));
    history.forEach(function(h,i){var date=new Date(h.updated);var when=isNaN(date.getTime())?'':date.toLocaleDateString('ru-RU');content.appendChild(row(i+1,h.title,[{text:h.position>0?time(h.position)+' / '+time(h.duration):'Открыто · просмотр ещё не начат'},{text:when},{text:h.torrentTitle||h.fileName}],function(){openTorrent(h.link,h.torrentTitle,h);}));});
    content.appendChild(button('Очистить историю',function(){history=[];storeHistory();change('history');}));focusFirst();
  }
  function updateHistory(opening){
    if(!state.playing)return;var p=state.playing;
    var previous=history.filter(function(h){return h.hash.toLowerCase()===state.hash.toLowerCase()&&Number(h.fileId)===Number(p.file.id);})[0];
    // Before metadata arrives, keep the previous position instead of overwriting it with zero.
    var position=opening||!isFinite(video.currentTime)||video.currentTime<0.1?(previous?previous.position||0:state.resume||0):video.currentTime;
    var duration=!opening&&isFinite(video.duration)&&video.duration>0?video.duration:previous?previous.duration||0:0;
    var item={hash:state.hash,fileId:p.file.id,fileName:p.file.path,title:p.file.path.split('/').pop(),torrentTitle:state.torrent.title||state.torrent.name,link:state.originalLink||'magnet:?xt=urn:btih:'+state.hash,position:position,duration:duration,updated:Date.now()};
    history=TWHistory.upsert(history,item);storeHistory();
  }
  function showOverlay(){ $('player-top').className='';$('player-controls').className='';clearTimeout(state.overlayTimer);if(!video.paused&&video.readyState>=3&&!state.controlsPinned&&!seekControl.isBusy())state.overlayTimer=setTimeout(function(){$('player-top').className='hidden';$('player-controls').className='hidden';},5000);}
  function playFile(file,resume){
    seekControl.cancel();state.controlsPinned=false;state.returnFocus=document.activeElement;state.playing={file:file,lastSave:0,started:Date.now()};state.resume=resume||0;player.className='';$('playing-title').textContent=file.path.split('/').pop();$('playing-status').textContent='Буферизация · получаем данные от TorrServer…';$('player-back').className='btn';$('player-back').focus();showOverlay();updateHistory(true);
    var current=state.playing;api('preload',{hash:state.hash,index:file.id},function(err){if(state.playing!==current)return;if(err)$('playing-status').textContent='Предзагрузка: '+err.message+' · пробуем открыть поток';});
    // Let the TV paint the player before entering its native media pipeline.
    setTimeout(function(){if(state.playing!==current)return;video.src='/stream?hash='+encodeURIComponent(state.hash)+'&index='+file.id;video.load();var p=video.play();if(p&&p.catch)p.catch(function(e){if(state.playing===current){$('playing-status').textContent='Не удалось начать просмотр: '+e.message;showOverlay();}});},100);
    state.playerDeadline=setTimeout(function(){if(state.playing!==current||video.readyState>=3)return;clearTimeout(state.playerTimer);video.pause();video.removeAttribute('src');video.load();current.failed=true;$('playing-status').textContent='Не удалось начать просмотр за 60 секунд. Проверьте сидов и выберите другую раздачу; её видео или аудио также могут не поддерживаться телевизором.';showOverlay();},60000);
    pollPlayer(current);
  }
  function pollPlayer(current){state.playerTimer=setTimeout(function(){if(state.playing!==current||current.failed||video.readyState>=3)return;api('status?hash='+encodeURIComponent(state.hash),null,function(err,r){if(state.playing!==current||current.failed||video.readyState>=3)return;if(!err){var t=r.torrent,p=t.preload_size?Math.min(100,Math.floor(100*(t.preloaded_bytes||0)/t.preload_size)):0;$('playing-status').textContent='Подготовка: '+p+'% · '+bytes(t.download_speed)+'/с · сиды '+(t.connected_seeders||0)+' · '+Math.floor((Date.now()-current.started)/1000)+' сек. BACK — вернуться к файлам';}pollPlayer(current);});},2000);}
  function stopPlayer(){updateHistory();seekControl.cancel();state.controlsPinned=false;state.playing=null;clearTimeout(state.overlayTimer);clearTimeout(state.playerTimer);clearTimeout(state.playerDeadline);video.pause();video.removeAttribute('src');video.load();player.className='hidden';if(state.returnFocus&&document.body.contains(state.returnFocus))state.returnFocus.focus();else focusFirst();}
  $('player-back').onclick=stopPlayer;
  function renderPosition(position){
    var duration=isFinite(video.duration)&&video.duration>0?video.duration:0;
    $('player-time').textContent=time(position)+' / '+time(duration);
    $('player-progress').style.width=(duration?100*position/duration:0)+'%';
    $('player-timeline').setAttribute('aria-valuemax',String(Math.floor(duration)));
    $('player-timeline').setAttribute('aria-valuenow',String(Math.floor(position||0)));
    $('player-timeline').setAttribute('aria-valuetext',time(position)+' из '+time(duration));
  }
  function seek(delta){if(!seekControl.by(delta))toast('Перемотка станет доступна после загрузки метаданных');}
  $('player-timeline').onclick=function(e){
    if(!state.playing)return;e.preventDefault();e.stopPropagation();state.controlsPinned=true;$('player-timeline').focus();
    var rect=$('player-timeline').getBoundingClientRect();var position=TWPlayback.pointerTime(e.clientX,rect.left,rect.width,video.duration);
    if(position===null||!seekControl.to(position))toast('Перемотка станет доступна после загрузки метаданных');
  };
  player.addEventListener('mousemove',function(){if(state.playing)showOverlay();});
  video.addEventListener('seeked',function(){seekControl.update();});
  video.addEventListener('loadedmetadata',function(){if(state.resume>0){try{video.currentTime=Math.min(state.resume,Math.max(0,video.duration-5));}catch(_){}state.resume=0;}});
  video.addEventListener('playing',function(){clearTimeout(state.playerDeadline);clearTimeout(state.playerTimer);seekControl.update();if(!seekControl.isBusy()){$('playing-status').textContent='';$('player-back').className='hidden';}showOverlay();});video.addEventListener('waiting',function(){if(!state.playing||state.playing.failed)return;if(seekControl.isBusy()){showOverlay();return;}$('playing-status').textContent='Буферизация · ждём данные от участников раздачи…';showOverlay();});
  video.addEventListener('canplay',function(){if(state.playing&&!seekControl.isBusy())$('playing-status').textContent=video.paused?'Пауза':'';});video.addEventListener('pause',function(){if(state.playing&&!seekControl.isBusy())$('playing-status').textContent='Пауза';showOverlay();});video.addEventListener('ended',function(){updateHistory();stopPlayer();toast('Просмотр завершён');});
  video.addEventListener('error',function(){if(!state.playing)return;var code=video.error?video.error.code:0;$('playing-status').textContent=code===4?'Формат видео или аудио не поддерживается телевизором. Выберите другую раздачу.':'Ошибка потока ('+code+'). Проверьте TorrServer и доступность сидов.';showOverlay();});
  video.addEventListener('timeupdate',function(){seekControl.update();renderPosition(seekControl.target()===null?video.currentTime:seekControl.target());if(state.playing&&!seekControl.isBusy()&&Date.now()-state.playing.lastSave>10000){state.playing.lastSave=Date.now();updateHistory();}});
  function audioTrack(){var tracks=video.audioTracks;if(!tracks||tracks.length<2)return toast('Другие аудиодорожки недоступны в этом файле');var index=0;for(var i=0;i<tracks.length;i++)if(tracks[i].enabled)index=i;var next=(index+1)%tracks.length;for(var j=0;j<tracks.length;j++)tracks[j].enabled=j===next;toast('Аудио: '+(tracks[next].label||tracks[next].language||next+1));}
  function navigate(code){var active=document.activeElement;if(active&&(active.tagName==='INPUT'||active.tagName==='SELECT')){if(active.tagName==='SELECT')return false;if(code===37&&active.selectionStart>0||code===39&&active.selectionStart<active.value.length)return false;}
    var all=Array.prototype.slice.call(document.querySelectorAll('button,input,select')).filter(function(e){return e.offsetWidth&&e.offsetHeight&&!e.disabled;});var r=active&&active.getBoundingClientRect();if(!r||active===document.body){if(all[0])all[0].focus();return true;}var best=null,score=Infinity;var x=r.left+r.width/2,y=r.top+r.height/2;
    all.forEach(function(e){if(e===active)return;var q=e.getBoundingClientRect(),dx=q.left+q.width/2-x,dy=q.top+q.height/2-y;var main=code===37?-dx:code===39?dx:code===38?-dy:dy,cross=code===37||code===39?Math.abs(dy):Math.abs(dx);if(main<=2)return;var s=main+cross*3;if(s<score){score=s;best=e;}});if(best){best.focus();try{best.scrollIntoView({block:'nearest'});}catch(_){best.scrollIntoView(false);}}return true;}
  document.addEventListener('keydown',function(e){var c=e.keyCode,active=document.activeElement,back=c===461||c===27||(c===8&&active.tagName!=='INPUT');
    // webOS remote Enter does not synthesize an HTML button click reliably.
    if(c===13){if(state.enterHeld||e.repeat){e.preventDefault();return;}state.enterHeld=true;}
    if(c===13&&!state.playing&&active.tagName==='BUTTON'){e.preventDefault();active.click();return;}
    if(c===13&&!state.playing&&active.tagName==='INPUT'&&active.form){e.preventDefault();var submit=document.createEvent('Event');submit.initEvent('submit',true,true);active.form.dispatchEvent(submit);return;}
    if(state.playing&&c===13&&(state.playing.failed||active===$('player-back')&&$('player-back').className!=='hidden')){e.preventDefault();stopPlayer();return;}
    if(state.playing){if(back){e.preventDefault();stopPlayer();return;}if([13,19,415,10252].indexOf(c)>=0){e.preventDefault();seekControl.pausedIntent(!video.paused);if(video.paused){var p=video.play();if(p&&p.catch)p.catch(function(err){toast(err.message);});}else video.pause();showOverlay();return;}if(c===413){e.preventDefault();stopPlayer();return;}if(c===40||c===38){e.preventDefault();state.controlsPinned=c===40;showOverlay();if(c===40)$('player-timeline').focus();else $('player-timeline').blur();return;}if([37,39,412,417].indexOf(c)>=0){e.preventDefault();seek(c===37||c===412?-30:30);return;}if(c===405){e.preventDefault();audioTrack();return;}showOverlay();return;}
    if(back){e.preventDefault();if(state.view==='details'){change('home');}else if(state.view==='files'){change('search');}else if(state.view==='search'&&state.searchFromDetail&&state.detailItem){openDetails(state.detailItem);}else if(state.view!=='home'){change('home');}else if(document.activeElement!==$('nav-home')){$('nav-home').focus();}else if(window.PalmSystem&&PalmSystem.platformBack){PalmSystem.platformBack();}return;}
    if(c>=37&&c<=40){if(navigate(c))e.preventDefault();}
  });
  document.addEventListener('keyup',function(e){if(e.keyCode===13){state.enterHeld=false;if(document.activeElement.tagName==='BUTTON'||state.playing)e.preventDefault();}});
  window.addEventListener('blur',function(){state.enterHeld=false;});
  document.addEventListener('visibilitychange',function(){if(document.hidden&&state.playing){video.pause();updateHistory();}});window.addEventListener('beforeunload',function(){updateHistory();});
  Array.prototype.forEach.call(document.querySelectorAll('[data-view]'),function(b){b.onclick=function(){state.searchFromDetail=false;change(b.getAttribute('data-view'));};});
  api('session',null,function(err,r){if(err){message('Помощник недоступен',err.message);return;}state.token=r.token;api('config',null,function(e,c){if(e){message('Ошибка настроек',e.message);return;}state.config=c;storeHistory();change(c.torrserverUrl?'home':'settings');health(false);});});
}());
