/* ES5 syntax for LG webOS 5.x / Chromium 68. No framework or remote scripts. */
(function () {
  'use strict';
  var content = document.getElementById('content'), title = document.getElementById('page-title');
  var video = document.getElementById('video'), player = document.getElementById('player');
  var state = { source:'torrent', filmix:null, filmixId:0, filmixVoice:'', filmixSeason:0, filmixQuality:0, filmixResults:[], filmixQuery:'', filmixOrigin:'search', view: 'search', token: '', config: {}, results: [], query: '', hash: '', torrent: null, files: [], timer: null, generation: 0, playing: null, overlayTimer: null, returnFocus: null, sort: 'seeders', resume: 0, playerTimer: null, playerDeadline: null, enterHeld: false, optionsOpen: false, fitIndex: 0, episodesOpen: false, episodeIndex: 0, episodeFiles: [], overlayVisible: false, homeData: null, homeScroll: 0, detailItem: null, lastHomeId: null, searchFromDetail: false, searchGeneration: 0, searchStatus: null, detailScroll: 0, detailTorrentIndex: 0, detailOrigin: 'home' };
  var disposeCatalog = null, disposeLatest = null, disposeAudioSettings = null, disposeScreen = null;
  var toastTimer, historyWarning=false, history = readHistory();
  var seekControl, timelineDrag=null, suppressTimelineClickUntil=0;
  if(window.TWApp)window.TWApp.initialize({
    api:api,state:state,history:function(){return history;},historyLimit:TWHistory.limit,
    time:time,bytes:bytes,sizeNumber:sizeNumber,toast:toast,resume:resumeHistory,
    clearHistory:function(){history=[];storeHistory();},
    search:function(){state.searchFromDetail=false;change('search');},
    openItem:function(item,origin){
      state.detailOrigin=origin;
      if(origin==='home'){state.homeScroll=$('main').scrollTop;state.lastHomeId=item.id;}
      openDetails(item);
    },
    openFilmix:function(id,name){state.filmixOrigin='latest';state.searchFromDetail=false;openFilmix(id,name);},
    filmix:searchFilmix,
    openSearch:function(result){state.searchFromDetail=false;openTorrent(result.magnet,result.title);},
    openTorrent:function(torrent){openTorrent('magnet:?xt=urn:btih:'+torrent.hash,torrent.title||torrent.name);}
  });
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function readHistory() { try { return TWHistory.load(localStorage); } catch (_) { return []; } }
  function storeHistory() { try { history=TWHistory.save(localStorage,history); } catch (_) { if(!historyWarning){historyWarning=true;toast('Не удалось сохранить историю на телевизоре: хранилище недоступно или заполнено');} } }
  function toast(message) { $('toast').textContent = message; $('toast').className = ''; clearTimeout(toastTimer); toastTimer = setTimeout(function () { $('toast').className = 'hidden'; }, 6500); }
  function api(route, data, done, renewed) {
    var xhr = new XMLHttpRequest(); xhr.open(data == null ? 'GET' : 'POST', '/api/' + route, true); xhr.timeout = route === 'preload' ? 50000 : route.indexOf('filmix/')===0?35000:25000;
    if (state.token) xhr.setRequestHeader('X-App-Token', state.token);
    if (data != null) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () {
      var body; try { body = JSON.parse(xhr.responseText); } catch (_) { return done(new Error('Некорректный ответ сервера')); }
      // The helper rotates its token on restart while webOS may retain the page.
      // A rejected request has not run yet, so it is safe to retry it once.
      if (xhr.status === 403 && route !== 'session' && !renewed &&
          (body.code === 'SESSION_EXPIRED' || body.error === 'Обновите приложение')) {
        return api('session', null, function (error, session) {
          if (error) return done(error);
          state.token = session.token;
          api(route, data, done, true);
        });
      }
      if (xhr.status >= 400) return done(new Error(body.error || 'Ошибка HTTP ' + xhr.status));
      done(null, body);
    };
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
    if(disposeScreen){disposeScreen();disposeScreen=null;}
    if(disposeLatest){disposeLatest();disposeLatest=null;}
    if(disposeAudioSettings){disposeAudioSettings();disposeAudioSettings=null;}
    if(window.TWNavigation)window.TWNavigation.close(false);
    if(disposeCatalog){disposeCatalog();disposeCatalog=null;}
    clearTimeout(state.timer); state.generation++; state.view = view; content.innerHTML = ''; title.className=view==='files'?'file-page-title':'';
    var menuView = view==='details' ? state.detailOrigin :
      view==='filmix-search'||view==='files'&&state.source==='filmix' ?
        (state.filmixOrigin==='latest'?'latest':state.filmixOrigin==='details'?state.detailOrigin:'search') : view;
    var navs = document.querySelectorAll('[data-view]'); for (var i=0;i<navs.length;i++) navs[i].className = 'nav' + (navs[i].getAttribute('data-view') === menuView ? ' active' : '');
    $('main').scrollTop=0;
    title.textContent = { latest:'Последние добавления', catalog:'Каталог', home:'Что посмотрим сегодня?', details:'О фильме', search:'Что посмотрим?', history:'История просмотров', torrents:'Торренты на сервере', magnet:'Открыть торрент', settings:'Настройки', 'filmix-search':'Смотреть через Filmix', files:'Выберите файл' }[view] || 'VolKino';
    if(view==='latest')latestView();else if(view==='filmix-search')renderFilmixResults();else if (view === 'catalog') catalogView(); else if (view === 'home') homeView(); else if (view === 'search') searchView(); else if (view === 'settings') settingsView(); else if (view === 'magnet') magnetView(); else if (view === 'history') historyView(); else if (view === 'torrents') torrentsView();
  }
  function posterImage(parent,src,name){
    var wrap=el('div','poster-art'),fallback=el('span','poster-fallback',String(name||'Кино').slice(0,1));wrap.appendChild(fallback);
    if(src){var img=el('img');img.alt='';img.src=src;img.setAttribute('loading','lazy');img.onerror=function(){img.style.display='none';};wrap.appendChild(img);}parent.appendChild(wrap);return wrap;
  }
  function catalogView(){
    disposeCatalog=window.TWCatalog.mount(content);
  }
  function latestView(){
    disposeLatest=window.TWLatest.mount(content);
  }
  function homeView(){
    disposeScreen=window.TWHome.mount(content);
  }
  function openDetails(item){
    state.detailItem=item;state.searchFromDetail=true;state.query=item.searchTitle||item.title;state.results=[];state.detailScroll=0;state.detailTorrentIndex=0;change('details');renderDetails(item,true);var gen=state.generation;
    runSearch();
    api('catalog/item?key='+encodeURIComponent(item.id),null,function(err,data){if(gen!==state.generation||state.view!=='details')return;if(err){renderDetails(item,false,true);return;}if(!data.poster)data.poster=item.poster;state.detailItem=data;renderDetails(data,false,true);var query=data.searchTitle||data.title;if(query!==state.query){state.query=query;runSearch();}});
  }
  function renderDetails(item,loading,summaryOnly){
    var summary=$('detail-summary');if(!summaryOnly){content.innerHTML='';summary=el('div');summary.id='detail-summary';content.appendChild(summary);}var focused=summary.contains(document.activeElement);summary.innerHTML='';
    if(item.poster){
      var backdrop=el('div','movie-backdrop'),backdropImage=el('img');
      backdrop.setAttribute('aria-hidden','true');backdropImage.alt='';backdropImage.src=item.poster;
      backdropImage.onerror=function(){backdrop.style.display='none';};
      backdrop.appendChild(backdropImage);summary.appendChild(backdrop);
    }
    title.textContent=item.type==='tv'?'О сериале':'О фильме';var layout=el('div','movie-details');posterImage(layout,item.poster,item.title);var body=el('div','movie-detail-body');body.appendChild(el('div','eyebrow',item.type==='tv'?'СЕРИАЛ':'ФИЛЬМ'));body.appendChild(el('h2','movie-name',item.title));var meta=item.metadata||'';if(meta.indexOf(item.title)===0)meta=meta.slice(item.title.length).trim();body.appendChild(el('p','movie-metadata',meta));
    body.appendChild(el('p','movie-description',loading?'Загружаем описание…':item.description||'Описание пока недоступно.'));
    var actions=el('div','detail-actions');actions.appendChild(button('Смотреть через Filmix',function(){searchFilmix(item.searchTitle||item.title);},'btn primary'));actions.appendChild(button(state.detailOrigin==='catalog'?'В каталог':'На главную',function(){change(state.detailOrigin);}));body.appendChild(actions);layout.appendChild(body);summary.appendChild(layout);
    if(!summaryOnly){var torrents=el('section','detail-torrents');torrents.appendChild(el('h2','','Раздачи'));var results=el('div');results.id='search-results';torrents.appendChild(results);content.appendChild(torrents);}if(!summaryOnly||focused){var b=body.querySelector('button');if(b)b.focus();}
  }
  function returnToResults(){
    if(state.source==='filmix'){if(state.filmixOrigin==='latest'){state.source='torrent';change('latest');}else change('filmix-search');return;}
    if(!state.searchFromDetail||!state.detailItem){change('search');return;}
    change('details');renderDetails(state.detailItem,false);renderSearchState();var rows=$('search-results').querySelectorAll('.torrent');if(rows.length)rows[Math.min(state.detailTorrentIndex,rows.length-1)].focus();$('main').scrollTop=state.detailScroll;
  }
  function searchView(){
    disposeScreen=window.TWSearch.mount(content);
  }
  function renderSearchState(){
    var target=$('search-results');if(!target)return;target.innerHTML='';if(state.results.length){renderResults();return;}
    var status=state.searchStatus||{text:'Ничего не найдено. Попробуйте другое название.'};target.appendChild(el('p',status.error?'error-text':'muted',status.text));
    if(status.error)target.appendChild(button('Повторить поиск',runSearch));
  }
  function runSearch() {
    state.results=[];state.searchStatus={text:'Ищем раздачи…'};renderSearchState();
    var gen=state.generation,request=++state.searchGeneration,query=state.query,view=state.view;
    api('search?q='+encodeURIComponent(query),null,function(err,data){if(gen!==state.generation||request!==state.searchGeneration||state.view!==view)return;
      if(err){state.searchStatus={error:true,text:err.message};renderSearchState();return;}state.results=data.results;state.searchStatus={text:data.hint||'Раздачи не найдены.'};renderSearchState();if(view==='search'){var first=$('search-results').querySelector('.torrent');if(first)first.focus();}});
  }
  function row(number, text, meta, fn) {
    var b=el('button','torrent');b.appendChild(el('span','torrent-number',number<10?'0'+number:String(number)));var body=el('span','torrent-body');body.appendChild(el('span','torrent-title',text));var m=el('span','torrent-meta');meta.forEach(function(x){m.appendChild(el('span',x.cls||'',x.text));});body.appendChild(m);b.appendChild(body);b.appendChild(el('span','torrent-arrow','→'));b.onclick=fn;return b;
  }
  function renderResults() {
    var target=$('search-results');target.innerHTML='';var head=el('div','section-head');head.appendChild(el('h2','',state.results.length+' раздач'));var sort=el('select','input sort');sort.id='torrent-sort';[['seeders','Сначала больше сидов'],['size','Сначала меньше размер']].forEach(function(p){var o=el('option','',p[1]);o.value=p[0];sort.appendChild(o);});sort.value=state.sort;sort.setAttribute('aria-label','Сортировка');sort.onchange=function(){state.sort=sort.value;renderResults();var select=$('search-results').querySelector('select');if(select)select.focus();};head.appendChild(sort);target.appendChild(head);
    var list=state.results.slice();if(state.sort==='size')list.sort(function(a,b){return sizeNumber(a.size)-sizeNumber(b.size);});
    list.forEach(function(r,i){target.appendChild(row(i+1,r.title,[{text:bytes(r.size)},{text:'↑ '+r.seeders+' сидов',cls:'seed'},{text:r.tracker},{text:r.quality}],function(){if(state.view==='details'){state.detailScroll=$('main').scrollTop;state.detailTorrentIndex=i;}openTorrent(r.magnet,r.title);}));});
  }
  function sizeNumber(v){if(typeof v==='number')return v;var m=String(v).replace(',','.').match(/([\d.]+)\s*(TB|GB|MB|KB|ТБ|ГБ|МБ|КБ|ТиБ|ГиБ|МиБ|КиБ)/i);if(!m)return Number(v)||0;var u=m[2].toUpperCase(),p=/^(T|Т)/.test(u)?4:/^(G|Г)/.test(u)?3:/^(M|М)/.test(u)?2:1;return Number(m[1])*Math.pow(1024,p);}
  function field(parent,label,value,type,id){var d=el('div','field'),l=el('label','',label),input=el(type==='select'?'select':'input','input');input.id=id;l.htmlFor=id;if(type!=='select'){input.type=type||'text';input.value=value||'';input.autocomplete='off';}d.appendChild(l);d.appendChild(input);parent.appendChild(d);return input;}
  function settingsView(){
    var p=el('div','panel');content.appendChild(p);if(window.TWAudio)disposeAudioSettings=window.TWAudio.mountSettings(p.appendChild(el('div')),state.config.audioFix||'off');p.appendChild(el('p','muted','Выберите TorrServer на этом устройстве или подключите внешний сервер.'));
    var step=field(p,'Шаг перемотки плеера (секунды)',seekStep(),'number','seek-step');step.min='1';step.max='3600';step.step='1';
    var mode=field(p,'Где запускать TorrServer','','select','ts-mode');[['external','Внешний сервер'],['local','На этом устройстве']].forEach(function(x){var o=el('option','',x[1]);o.value=x[0];mode.appendChild(o);});mode.value=state.config.torrserverMode||'external';
    var local=el('div');p.appendChild(local);var status=el('p','muted','Проверяем локальный сервер…');status.id='local-server-status';local.appendChild(status);
    var android=window.navigator&&/Android/i.test(window.navigator.userAgent||'');
    local.appendChild(button(android?'Запустить':'Установить и запустить',function(){localServerAction('start');},'btn primary'));local.appendChild(button('Остановить',function(){localServerAction('stop');}));
    local.appendChild(el('p','muted',android?'TorrServer включён в APK. Кэш видео — 32 МиБ в памяти. Сервер останавливается при выходе из приложения кнопкой «Назад».':'При первой установке нужен интернет: TorrServer загружается с GitHub. Кэш видео — 32 МиБ в памяти. Локальный режим запускается вместе с помощником, даже если окно приложения закрыто.'));
    var external=el('div');p.appendChild(external);
    function showMode(){external.style.display=mode.value==='external'?'block':'none';local.style.display=mode.value==='local'?'block':'none';}mode.onchange=showMode;showMode();pollLocalServer();
    field(external,'Адрес TorrServer',state.config.torrserverUrl,'url','ts-url').placeholder='http://192.168.1.100:8090';
    var pair=el('div','two-columns');external.appendChild(pair);field(pair,'Логин (если установлен)',state.config.torrserverUsername,'text','ts-user');var password=field(pair,'Пароль','','password','ts-password');password.placeholder=state.config.hasPassword?'Сохранён · пустое поле оставит пароль':'';
    var provider=field(p,'Источник поиска','','select','search-provider');[['vilkadb','VilkaDB — как в ForkPlayer'],['torrserver','Rutor — индекс TorrServer'],['torznab','Torznab — индексаторы TorrServer'],['jacred','Jacred — внешний агрегатор']].forEach(function(x){var o=el('option','',x[1]);o.value=x[0];provider.appendChild(o);});provider.value=state.config.searchProvider;
    var extra=el('div');p.appendChild(extra);field(extra,'Адрес Jacred',state.config.jacredUrl,'url','jacred-url');var key=field(extra,'API-ключ Jacred (если нужен)','','password','jacred-key');key.placeholder=state.config.hasApiKey?'Сохранён':'';extra.style.display=provider.value==='jacred'?'block':'none';provider.onchange=function(){extra.style.display=provider.value==='jacred'?'block':'none';};
    var actions=el('div','settings-actions');p.appendChild(actions);actions.appendChild(button('Сохранить',saveSettings,'btn primary'));actions.appendChild(button('Проверить сервер',function(){saveSettings(function(){health(true);});}));actions.appendChild(button('Включить поиск Rutor',function(){saveSettings(function(){api('enable-search',{},function(err,r){toast(err?err.message:r.message||'Поиск уже включён');});});}));
    filmixSettings(p);p.appendChild(el('p','muted','Torznab настраивается на стороне TorrServer: добавьте туда адреса Jackett / Prowlarr. Если у раздачи нет сидов, начало просмотра может занять много времени.'));focusFirst();
  }
  function filmixSettings(parent){
    var section=el('section','filmix-settings');parent.appendChild(section);section.appendChild(el('h2','','Filmix — онлайн-просмотр'));
    var transport=field(section,'Подключение Filmix','','select','filmix-transport');
    [['web','Filmix TV — как в Media Station X'],['mobile','Мобильный API — прежнее подключение']].forEach(function(x){var o=el('option','',x[1]);o.value=x[0];transport.appendChild(o);});transport.value=state.config.filmixTransport||'mobile';
    transport.onchange=function(){api('config',{filmixTransport:transport.value},function(error,r){if(error)return toast(error.message);state.config=r;change('settings');});};
    if(state.config.filmixTransport==='web'){
      section.appendChild(el('p','muted','Вход в Filmix TV. Пароль используется только для входа; настройки сохраняют сессию устройства.'));
      var login=field(section,'Логин или e-mail Filmix','','text','filmix-login');
      var webPassword=field(section,'Пароль Filmix','','password','filmix-web-password');webPassword.autocomplete='off';
      var webStatus=el('p','muted',state.config.hasFilmixToken?'Аккаунт подключён к Filmix TV.':'Войдите в аккаунт Filmix TV.');webStatus.id='filmix-status';section.appendChild(webStatus);
      var webActions=el('div','settings-actions');section.appendChild(webActions);
      webActions.appendChild(button('Войти в Filmix TV',function(){
        var gen=state.generation;webStatus.textContent='Входим в Filmix TV…';
        api('filmix/auth/login',{name:login.value,password:webPassword.value},function(error,r){if(gen!==state.generation)return;webStatus.textContent=error?error.message:(r.login||'Подключено')+' · '+r.plan+' · до '+r.maxQuality+'p';if(!error)state.config.hasFilmixToken=true;});webPassword.value='';
      }));
      webActions.appendChild(button('Проверить Filmix',function(){filmixAccountAction('profile');}));
      webActions.appendChild(button('Отключить Filmix',function(){filmixAccountAction('auth/disconnect');}));return;
    }
    section.appendChild(el('p','muted','Без TorrServer. Доступное качество зависит от аккаунта и подписки Filmix. Для входа получите код и введите его на сайте со своего телефона.'));
    field(section,'Адрес API Filmix',state.config.filmixApiUrl||'http://filmixapp.cyou/api/v2','url','filmix-api');field(section,'Сайт Filmix для подключения устройства',state.config.filmixSiteUrl||'https://filmix.my','url','filmix-site');
    section.appendChild(el('p','muted','Для HTTP-адреса API токен передаётся без шифрования. Если доступен рабочий HTTPS-адрес Filmix, укажите его выше.'));
    var token=field(section,'Токен Filmix (если уже есть)','','password','filmix-token');token.placeholder=state.config.hasFilmixToken?'Сохранён · пустое поле оставит токен':'Можно подключить по коду ниже';
    var status=el('p','muted',state.config.hasFilmixToken?'Аккаунт подключён. Нажмите «Проверить Filmix», чтобы проверить доступ.':'Гостевой режим · до 480p');status.id='filmix-status';section.appendChild(status);
    var actions=el('div','settings-actions');section.appendChild(actions);
    actions.appendChild(button('Получить код Filmix',function(){saveFilmixSettings(function(){filmixAccountAction('auth/start');});}));actions.appendChild(button('Я ввёл код',function(){filmixAccountAction('auth/check');}));actions.appendChild(button('Проверить Filmix',function(){saveFilmixSettings(function(){filmixAccountAction('profile');});}));actions.appendChild(button('Отключить Filmix',function(){filmixAccountAction('auth/disconnect');}));
  }
  function saveFilmixSettings(done){var data={filmixApiUrl:$('filmix-api').value,filmixSiteUrl:$('filmix-site').value};if($('filmix-token').value)data.filmixToken=$('filmix-token').value;var gen=state.generation;api('config',data,function(err,r){if(gen!==state.generation)return;if(err){$('filmix-status').textContent=err.message;return;}state.config=r;$('filmix-token').value='';$('filmix-token').placeholder=r.hasFilmixToken?'Сохранён':'';done();});}
  function filmixAccountAction(action){
    var gen=state.generation;api('filmix/'+action,action==='profile'?null:{},function(err,r){if(gen!==state.generation||!$('filmix-status'))return;
      if(err){$('filmix-status').textContent=err.message;return;}
      $('filmix-status').textContent=r.code?'Код: '+r.code+' · Введите на '+r.activationUrl+', затем нажмите «Я ввёл код».':action==='auth/disconnect'?(state.config.filmixTransport==='web'?'Filmix TV отключён':'Filmix отключён · гостевой режим'):(r.authenticated?(r.login||'Подключено')+' · '+r.plan:'Гость')+' · до '+r.maxQuality+'p';
      if(action==='auth/check'||action==='auth/disconnect'){state.config.hasFilmixToken=action==='auth/check';if($('filmix-token')){$('filmix-token').value='';$('filmix-token').placeholder=state.config.hasFilmixToken?'Сохранён':'';}}
    });
  }
  function searchFilmix(query){
    query=String(query||'').trim();if(query.length<2)return toast('Введите хотя бы два символа');
    if(state.view!=='filmix-search'&&state.view!=='files')state.filmixOrigin=state.view==='details'?'details':'search';state.filmixQuery=query;state.filmixResults=[];change('filmix-search');content.innerHTML='';message('Ищем в Filmix…',query,true);var gen=state.generation;
    api('filmix/search?q='+encodeURIComponent(query),null,function(err,r){if(gen!==state.generation)return;content.innerHTML='';if(err){message('Filmix недоступен',err.message);content.appendChild(button('Повторить',function(){searchFilmix(query);}));content.appendChild(button('Назад',leaveFilmix));focusFirst();return;}state.filmixResults=r.results;renderFilmixResults();});
  }
  function leaveFilmix(){state.source='torrent';if(state.filmixOrigin==='details'&&state.detailItem){returnToResults();if(!state.results.length)runSearch();}else change('search');}
  function renderFilmixResults(){
    content.innerHTML='';content.appendChild(button('← Назад',leaveFilmix));content.appendChild(el('p','muted','Filmix · '+state.filmixQuery+' · выберите нужный фильм или сериал'));
    if(!state.filmixResults.length)content.appendChild(el('p','muted','Ничего не найдено. Попробуйте другое название через поиск.'));
    state.filmixResults.forEach(function(item,i){content.appendChild(row(i+1,item.title,[{text:item.year||''},{text:item.originalTitle}],function(){openFilmix(item.id,item.title);}));});focusFirst();
  }
  function openFilmix(id,name,resumeItem){
    state.source='filmix';state.filmixId=Number(id);state.hash='';state.originalLink='filmix:'+id;state.torrent={title:name||'Filmix'};state.files=[];change('files');title.textContent=name||'Filmix';message('Получаем видео Filmix…','Загружаем озвучки, сезоны и доступное качество.',true);var gen=state.generation;
    api('filmix/post?id='+Number(id),null,function(err,r){if(gen!==state.generation)return;if(err){content.innerHTML='';message('Не удалось открыть Filmix',err.message);content.appendChild(button('Повторить',function(){openFilmix(id,name,resumeItem);}));content.appendChild(button('Назад',returnToResults));focusFirst();return;}
      state.filmix=r;state.torrent={title:r.title};state.filmixVoice=resumeItem&&r.voices.indexOf(resumeItem.voice)>=0?resumeItem.voice:r.voices[0];state.filmixSeason=resumeItem&&r.seasons.indexOf(Number(resumeItem.season))>=0?Number(resumeItem.season):r.seasons[0];state.filmixQuality=resumeItem&&resumeItem.quality?Number(resumeItem.quality):r.maxQuality;
      applyFilmixFiles();if(resumeItem){var file=state.files.filter(function(f){return f.id===Number(resumeItem.fileId);})[0];if(file)playFile(file,resumeItem.position||0);}
    });
  }
  function applyFilmixFiles(){
    var r=state.filmix,matching=r.files.filter(function(f){return f.season===state.filmixSeason&&f.voice===state.filmixVoice;});
    if(!matching.length){var fallback=r.files.filter(function(f){return f.season===state.filmixSeason;})[0];if(fallback){state.filmixVoice=fallback.voice;matching=r.files.filter(function(f){return f.season===state.filmixSeason&&f.voice===state.filmixVoice;});}}
    state.files=matching;renderFiles();
  }
  function filmixFilters(){
    var bar=el('div','filmix-filters'),r=state.filmix;content.appendChild(bar);
    var voice=field(bar,'Озвучка','','select','filmix-voice'),season=field(bar,'Сезон','','select','filmix-season'),quality=field(bar,'Качество до','','select','filmix-quality');
    r.voices.forEach(function(v){var o=el('option','',v);o.value=v;voice.appendChild(o);});voice.value=state.filmixVoice;
    r.seasons.forEach(function(n){var o=el('option','',n?'Сезон '+n:r.isSeries?'Спецвыпуски':'Фильм');o.value=String(n);season.appendChild(o);});season.value=String(state.filmixSeason);
    var levels=[];r.files.forEach(function(f){f.qualities.forEach(function(q){if(levels.indexOf(q)<0)levels.push(q);});});levels.sort(function(a,b){return b-a;});levels.forEach(function(n){var o=el('option','',n+'p');o.value=String(n);quality.appendChild(o);});if(levels.indexOf(state.filmixQuality)<0)state.filmixQuality=levels.filter(function(q){return q<=state.filmixQuality;})[0]||levels[0];quality.value=String(state.filmixQuality);
    voice.onchange=function(){state.filmixVoice=voice.value;applyFilmixFiles();$('filmix-voice').focus();};season.onchange=function(){state.filmixSeason=Number(season.value);applyFilmixFiles();$('filmix-season').focus();};quality.onchange=function(){state.filmixQuality=Number(quality.value);};
    content.appendChild(el('p','muted','Filmix · до '+r.maxQuality+'p для текущего аккаунта · позиция и просмотренные серии сохраняются на этом ТВ.'));
  }
  function resumeHistory(item){if(item.source==='filmix'){state.filmixOrigin='search';openFilmix(item.filmixId,item.torrentTitle,item);}else openTorrent(item.link,item.torrentTitle,item);}
  function localServerAction(action){
    var gen=state.generation;api('local-server/'+action,{},function(err){if(gen!==state.generation)return;if(err)return toast(err.message);pollLocalServer(true);});
  }
  function pollLocalServer(refresh){
    clearTimeout(state.timer);
    var gen=state.generation;
    api('local-server',null,function(err,r){
      if(gen!==state.generation||!$('local-server-status'))return;
      var labels={stopped:'Остановлен',installing:'Загружаем TorrServer…',starting:'Запускаем TorrServer…',stopping:'Останавливаем TorrServer…',running:'Работает',error:'Ошибка'};
      $('local-server-status').textContent=err?err.message:(labels[r.state]||r.state)+' · '+r.version+(r.error?' · '+r.error:'');
      if(!err&&(r.state==='installing'||r.state==='starting'||r.state==='stopping')){state.timer=setTimeout(function(){pollLocalServer(true);},1000);return;}
      if(refresh&&!err&&r.state!=='error')api('config',null,function(e,c){if(e||gen!==state.generation)return;state.config=c;$('ts-mode').value=c.torrserverMode;$('ts-mode').onchange();health(false);});
      state.timer=setTimeout(function(){pollLocalServer(false);},5000);
    });
  }
  function saveSettings(after){var step=Number($('seek-step').value);if(!isFinite(step)||Math.floor(step)!==step||step<1||step>3600){toast('Шаг перемотки должен быть целым числом от 1 до 3600 секунд');$('seek-step').focus();return;}var data={seekStep:step,audioFix:$('audio-fix')?$('audio-fix').value:state.config.audioFix||'off',filmixApiUrl:$('filmix-api')?$('filmix-api').value:state.config.filmixApiUrl,filmixSiteUrl:$('filmix-site')?$('filmix-site').value:state.config.filmixSiteUrl,torrserverMode:$('ts-mode').value,torrserverUrl:$('ts-url').value,torrserverUsername:$('ts-user').value,searchProvider:$('search-provider').value,jacredUrl:$('jacred-url').value};if($('filmix-token')&&$('filmix-token').value)data.filmixToken=$('filmix-token').value;if($('ts-password').value)data.torrserverPassword=$('ts-password').value;if(!data.torrserverUsername)data.torrserverPassword='';if($('jacred-key').value)data.jacredApiKey=$('jacred-key').value;api('config',data,function(err,r){if(err)return toast(err.message);state.config=r;toast('Настройки сохранены');health(false);if(typeof after==='function')after();});}
  function health(show){if(state.config.torrserverMode!=='local'&&!state.config.torrserverUrl){$('connection-light').className='';$('connection-text').textContent='Онлайн-просмотр · Filmix';return;}api('health',null,function(err,r){$('connection-light').className=err?'error':'ok';$('connection-text').textContent=err?'TorrServer недоступен':r.version;if(show)toast(err?err.message:'Соединение работает: '+r.version);});}
  function magnetView(){var p=el('div','panel');content.appendChild(p);p.appendChild(el('p','','Вставьте magnet-ссылку или адрес .torrent. Файлы подготовит выбранный TorrServer.'));var input=field(p,'Ссылка на торрент','','text','magnet-link');input.placeholder='magnet:?xt=urn:btih:…';p.appendChild(button('Открыть торрент',function(){openTorrent(input.value,'Торрент по ссылке');},'btn primary'));focusFirst();}
  function openTorrent(link,name,resumeItem){
    state.source='torrent';change('files');state.hash='';state.torrent=null;state.files=[];title.textContent=name;message('Получаем список файлов…','TorrServer ищет участников раздачи и метаданные. Это может занять до двух минут.',true);
    var gen=state.generation;api('add',{link:link,title:name},function(err,r){if(gen!==state.generation)return;if(err){content.innerHTML='';message('Не удалось открыть торрент',err.message);content.appendChild(button('К раздачам',returnToResults));focusFirst();return;}state.hash=r.hash;state.torrent=r;state.originalLink=link;pollFiles(gen,Date.now(),resumeItem);});
  }
  function pollFiles(gen,started,resumeItem){api('status?hash='+encodeURIComponent(state.hash),null,function(err,r){if(gen!==state.generation)return;if(err){content.innerHTML='';message('Не удалось получить файлы',err.message);content.appendChild(button('Повторить',function(){pollFiles(gen,Date.now(),resumeItem);}));focusFirst();return;}state.torrent=r.torrent;state.files=r.files;if(r.files.length){renderFiles();if(resumeItem){var f=r.files.filter(function(x){return x.id===resumeItem.fileId;})[0];if(f)playFile(f,resumeItem.position);}return;}if(Date.now()-started>120000){content.innerHTML='';message('Метаданные пока не получены','Возможно, у раздачи нет доступных участников. Попробуйте другую раздачу или повторите запрос.');content.appendChild(button('Подождать ещё',function(){content.innerHTML='';message('Ждём метаданные…','Можно вернуться назад и выбрать другую раздачу.',true);pollFiles(gen,Date.now(),resumeItem);}));content.appendChild(button('К результатам',returnToResults));focusFirst();return;}state.timer=setTimeout(function(){pollFiles(gen,started,resumeItem);},2000);});}
  function statsBar(t){var d=el('div','statusbar');['↓ '+bytes(t.download_speed)+'/с','Пиры: '+(t.active_peers||0),'Сиды: '+(t.connected_seeders||0),'Размер: '+bytes(t.torrent_size)].forEach(function(x){d.appendChild(el('span','',x));});return d;}
  function watchedFile(file){var key=TWHistory.key({source:state.source,hash:state.hash,filmixId:state.filmixId,fileId:file.id});return history.filter(function(h){return TWHistory.key(h)===key;})[0];}
  function fileProgress(file){
    var h=watchedFile(file);
    if(state.playing&&Number(state.playing.file.id)===Number(file.id)&&isFinite(video.duration)&&video.duration>0)h={position:video.currentTime,duration:video.duration,completed:h&&h.completed};
    return TWHistory.progress(h);
  }
  function appendFileProgress(card,file){
    var track=el('span','file-watch-track'),fill=el('span','file-watch-fill');fill.setAttribute('data-file-id',String(file.id));track.setAttribute('role','img');track.appendChild(fill);card.appendChild(track);setFileProgress(fill,fileProgress(file));
  }
  function setFileProgress(fill,percent){fill.style.width=percent+'%';fill.parentNode.setAttribute('aria-label',percent>=100?'Просмотрено':'Просмотрено '+Math.floor(percent)+'%');}
  function refreshFileProgress(){Array.prototype.forEach.call(document.querySelectorAll('.file-watch-fill'),function(fill){var id=Number(fill.getAttribute('data-file-id')),file=state.files.filter(function(f){return Number(f.id)===id;})[0];if(file)setFileProgress(fill,fileProgress(file));});}
  function renderFiles(){content.innerHTML='';title.textContent=state.torrent.title||state.torrent.name||'Выберите файл';if(state.source==='filmix')filmixFilters();else content.appendChild(statsBar(state.torrent));content.appendChild(el('p','muted','Выберите видео. Плеер поддерживает перемотку, паузу и продолжение просмотра.'));state.files.forEach(function(f,i){var card=row(i+1,f.path,[{text:state.source==='filmix'?f.voice+' · '+f.qualities.join(' / ')+'p':bytes(f.length)}],function(){var h=watchedFile(f);playFile(f,h&&!h.completed?h.position:0);});card.className+=' file-card';appendFileProgress(card,f);content.appendChild(card);});focusFirst();}
  function torrentsView(){
    disposeScreen=window.TWTorrents.mount(content);
  }
  function historyView(){
    disposeScreen=window.TWHistoryScreen.mount(content);
  }
  function updateHistory(opening,completed){
    if(!state.playing)return;var p=state.playing;
    var previous=watchedFile(p.file);
    // Before metadata arrives, keep the previous position instead of overwriting it with zero.
    var playback=p.nativePlayback||video;
    var position=opening||!isFinite(playback.currentTime)||playback.currentTime<0.1?(previous?previous.position||0:state.resume||0):playback.currentTime;
    var duration=!opening&&isFinite(playback.duration)&&playback.duration>0?playback.duration:previous?previous.duration||0:0;
    var item={hash:state.hash,fileId:p.file.id,fileName:p.file.path,title:p.file.path.split('/').pop(),torrentTitle:state.torrent.title||state.torrent.name,link:state.originalLink||'magnet:?xt=urn:btih:'+state.hash,position:position,duration:duration,completed:!!completed||!!(previous&&previous.completed)||(!opening&&duration>0&&position/duration>=0.95),updated:Date.now()};
    if(state.source==='filmix'){item.source='filmix';item.filmixId=state.filmixId;item.voice=p.file.voice;item.season=p.file.season;item.quality=state.filmixQuality;}
    history=TWHistory.upsert(history,item);storeHistory();refreshFileProgress();
  }
  function armOverlay(){
    clearTimeout(state.overlayTimer);state.overlayTimer=null;
    if(!state.playing||!state.overlayVisible||state.optionsOpen||video.paused||video.readyState<3||seekControl.isBusy()||timelineDrag||state.playing.failed)return;
    state.overlayTimer=setTimeout(function(){state.overlayTimer=null;if(!video.paused&&!seekControl.isBusy()&&video.readyState>=3)hideOverlay();},5000);
  }
  function showOverlay(){if(!state.playing)return;state.overlayVisible=true;$('player-top').className='';$('player-controls').className='';armOverlay();}
  function hideOverlay(){
    clearTimeout(state.overlayTimer);state.overlayTimer=null;state.overlayVisible=false;state.episodesOpen=false;state.optionsOpen=false;$('player-options').className='hidden';
    $('player-top').className='hidden';$('player-controls').className='hidden';$('player-episodes').className='hidden';
    if(player.contains(document.activeElement)&&document.activeElement!==video)video.focus();
  }
  function fileFolder(file){var name=file.path.replace(/\\/g,'/');return name.slice(0,name.lastIndexOf('/')+1);}
  function focusEpisode(index){
    var cards=$('episode-list').querySelectorAll('button');if(!cards.length)return;
    state.episodeIndex=Math.max(0,Math.min(index,cards.length-1));var card=cards[state.episodeIndex];card.focus();
    try{card.scrollIntoView({block:'nearest',inline:'nearest'});}catch(_){card.scrollIntoView(false);}showOverlay();
  }
  function openEpisodes(){
    if(!state.playing)return;closePlayerOptions();updateHistory();var current=state.playing.file,folder=fileFolder(current),list=$('episode-list');list.innerHTML='';
    state.episodeFiles=state.files.filter(function(f){return fileFolder(f)===folder;});state.episodeIndex=0;
    state.episodeFiles.forEach(function(file,i){
      var selected=Number(file.id)===Number(current.id);if(selected)state.episodeIndex=i;
      var card=button('',function(){if(Number(file.id)===Number(state.playing.file.id)){closeEpisodes();return;}var h=watchedFile(file);playFile(file,h&&!h.completed?h.position:0);},'episode-card'+(selected?' episode-current':''));
      card.appendChild(el('span','episode-name',file.path.replace(/\\/g,'/').split('/').pop()));card.appendChild(el('span','episode-meta',selected?'Сейчас смотрите':state.source==='filmix'?file.voice:bytes(file.length)));if(selected)card.setAttribute('aria-current','true');
      card.onfocus=function(){state.episodeIndex=i;showOverlay();};appendFileProgress(card,file);list.appendChild(card);
    });
    state.episodesOpen=true;$('player-episodes').className='';focusEpisode(state.episodeIndex);
  }
  function closeEpisodes(){state.episodesOpen=false;$('player-episodes').className='hidden';video.focus();showOverlay();}
  function playFile(file,resume){
    closePlayerOptions();var switching=!!state.playing;if(switching)updateHistory();else state.returnFocus=document.activeElement;
    clearTimeout(state.playerTimer);clearTimeout(state.playerDeadline);clearTimeout(state.overlayTimer);seekControl.cancel();state.playing=null;resetAudioVideo();video.pause();video.removeAttribute('src');video.load();state.episodesOpen=false;$('player-episodes').className='hidden';state.playing={file:file,lastSave:0,started:Date.now()};state.resume=resume||0;if($('player-seek-step'))$('player-seek-step').textContent=seekStep()+' сек';$('touch-rewind').textContent='−'+seekStep()+' сек';$('touch-forward').textContent='+'+seekStep()+' сек';player.className='';$('playing-title').textContent=file.path.split('/').pop();$('playing-status').textContent=state.source==='filmix'?'Загружаем видео Filmix…':'Буферизация · получаем данные от TorrServer…';$('player-back').className='btn';$('player-back').focus();showOverlay();updateHistory(true);
    var current=state.playing;setAudioStatus('');if(!window.TWNativePlayer&&window.TWAudio)window.TWAudio.attach(video,state.config.audioFix||'off',function(active,message){if(state.playing!==current)return;if(active)setAudioStatus(message);else recoverAudio(current,message);});if(state.source!=='filmix')api('preload',{hash:state.hash,index:file.id},function(err){if(state.playing!==current)return;if(err)$('playing-status').textContent='Предзагрузка: '+err.message+' · пробуем открыть поток';});
    // Let the TV paint the player before entering its native media pipeline.
    function startVideo(url){if(state.playing!==current)return;
      if(window.TWNativePlayer){
        clearTimeout(state.playerDeadline);clearTimeout(state.playerTimer);
        current.nativeToken=String(current.started)+':'+file.id;
        current.nativePlayback={currentTime:state.resume||0,duration:0};
        try{window.TWNativePlayer.play(url,file.path.split('/').pop(),state.resume||0,seekStep(),current.nativeToken);}
        catch(e){stopPlayer();toast('Не удалось открыть Android-плеер: '+e.message);}
        return;
      }
      video.src=url;video.load();var p=video.play();if(p&&p.catch)p.catch(function(e){if(state.playing===current){$('playing-status').textContent='Не удалось начать просмотр: '+e.message;showOverlay();}});}
    setTimeout(function(){if(state.playing!==current)return;if(state.source==='filmix'){
      var quality=file.qualities.filter(function(q){return q<=state.filmixQuality;})[0]||file.qualities[0];
      api('filmix/play',{id:state.filmixId,fileId:file.id,voice:file.voice,quality:quality},function(err,r){if(state.playing!==current)return;if(err){clearTimeout(state.playerDeadline);current.failed=true;$('playing-status').textContent=err.message;showOverlay();return;}startVideo(r.url);});
    }else startVideo('/stream?hash='+encodeURIComponent(state.hash)+'&index='+file.id);},100);
    state.playerDeadline=setTimeout(function(){if(state.playing!==current||video.readyState>=3)return;clearTimeout(state.playerTimer);video.pause();video.removeAttribute('src');video.load();current.failed=true;$('playing-status').textContent=state.source==='filmix'?'Не удалось начать просмотр Filmix за 60 секунд. Проверьте доступность видео и выберите другое качество.':'Не удалось начать просмотр за 60 секунд. Проверьте сидов и выберите другую раздачу; её видео или аудио также могут не поддерживаться телевизором.';showOverlay();},60000);
    if(state.source!=='filmix')pollPlayer(current);
  }
  window.TWAndroidPlayback=function(result){
    var current=state.playing;if(!current||current.nativeToken!==result.token)return;
    current.nativePlayback={currentTime:result.position,duration:result.duration};
    updateHistory(false,result.completed);
    if(result.closed){stopPlayer();if(result.error)toast(result.error);}
  };
  function setAudioStatus(text){var label=$('audio-mode-status');if(label)label.textContent=text;}
  function resetAudioVideo(){
    if(!window.TWAudio||!window.TWAudio.reset())return;
    seekControl.cancel();video.pause();video.removeAttribute('src');video.load();
    var previous=video,fresh=previous.cloneNode(false);fresh.muted=previous.muted;fresh.volume=previous.volume;previous.parentNode.replaceChild(fresh,previous);video=fresh;bindVideo();
  }
  function recoverAudio(current,message){
    if(state.playing!==current)return;
    var url=video.currentSrc||video.getAttribute('src'),position=isFinite(video.currentTime)&&video.currentTime>0?video.currentTime:state.resume,paused=video.paused;
    resetAudioVideo();state.resume=position||0;setAudioStatus('Оригинальный звук · автофикс недоступен');toast(message+'. Продолжаем с оригинальным звуком.');
    if(url){video.src=url;video.load();if(!paused){var p=video.play();if(p&&p.catch)p.catch(function(){if(state.playing===current){$('playing-status').textContent='Нажмите OK, чтобы продолжить';showOverlay();}});}}
  }
  function pollPlayer(current){state.playerTimer=setTimeout(function(){if(state.playing!==current||current.failed||video.readyState>=3)return;api('status?hash='+encodeURIComponent(state.hash),null,function(err,r){if(state.playing!==current||current.failed||video.readyState>=3)return;if(!err){var t=r.torrent,p=t.preload_size?Math.min(100,Math.floor(100*(t.preloaded_bytes||0)/t.preload_size)):0;$('playing-status').textContent='Подготовка: '+p+'% · '+bytes(t.download_speed)+'/с · сиды '+(t.connected_seeders||0)+' · '+Math.floor((Date.now()-current.started)/1000)+' сек. BACK — вернуться к файлам';}pollPlayer(current);});},2000);}
  function stopPlayer(){cancelTimelineDrag();closePlayerOptions();updateHistory();seekControl.cancel();state.episodesOpen=false;state.overlayVisible=false;$('player-episodes').className='hidden';state.playing=null;clearTimeout(state.overlayTimer);clearTimeout(state.playerTimer);clearTimeout(state.playerDeadline);video.pause();video.removeAttribute('src');video.load();resetAudioVideo();setAudioStatus('');player.className='hidden';if(state.returnFocus&&document.body.contains(state.returnFocus))state.returnFocus.focus();else focusFirst();}
  $('player-back').onclick=stopPlayer;
  $('touch-exit').onclick=stopPlayer;
  $('touch-rewind').onclick=function(){seek(-seekStep());};
  $('touch-forward').onclick=function(){seek(seekStep());};
  function togglePlayback(){
    if(!state.playing)return;
    seekControl.pausedIntent(!video.paused);
    if(video.paused){var p=video.play();if(p&&p.catch)p.catch(function(err){toast(err.message);});}else video.pause();
    showOverlay();
  }
  $('touch-pause').onclick=togglePlayback;
  $('touch-episodes').onclick=function(){if(state.episodesOpen)closeEpisodes();else openEpisodes();};
  $('touch-audio').onclick=openPlayerOptions;
  $('player-audio').onclick=audioTrack;
  $('player-fit').onclick=function(){state.fitIndex=(state.fitIndex+1)%3;updatePlayerOptions();};
  $('player-options-close').onclick=closePlayerOptions;
  function renderPosition(position){
    var duration=isFinite(video.duration)&&video.duration>0?video.duration:0;
    $('player-time').textContent=time(position)+' / '+time(duration);
    $('player-progress').style.width=(duration?100*position/duration:0)+'%';
    $('player-timeline').setAttribute('aria-valuemax',String(Math.floor(duration)));
    $('player-timeline').setAttribute('aria-valuenow',String(Math.floor(position||0)));
    $('player-timeline').setAttribute('aria-valuetext',time(position)+' из '+time(duration));
  }
  function seekStep(){var value=state.config.seekStep;return typeof value==='number'&&isFinite(value)&&Math.floor(value)===value&&value>=1&&value<=3600?value:30;}
  function seek(delta){if(!seekControl.by(delta))toast('Перемотка станет доступна после загрузки метаданных');}
  $('player-timeline').onclick=function(e){
    if(!state.playing||Date.now()<suppressTimelineClickUntil)return;e.preventDefault();e.stopPropagation();closeEpisodes();$('player-timeline').focus();
    var rect=$('player-timeline').getBoundingClientRect();var position=TWPlayback.pointerTime(e.clientX,rect.left,rect.width,video.duration);
    if(position===null||!seekControl.to(position))toast('Перемотка станет доступна после загрузки метаданных');
  };
  function dragTimeline(e){
    var rect=$('player-timeline').getBoundingClientRect();
    var position=TWPlayback.pointerTime(e.clientX,rect.left,rect.width,video.duration);
    if(position===null)return;
    timelineDrag.position=position;renderPosition(position);showOverlay();
  }
  function cancelTimelineDrag(){
    if(!timelineDrag)return;
    var id=timelineDrag.id;timelineDrag=null;
    try{$('player-timeline').releasePointerCapture(id);}catch(_){}
    renderPosition(seekControl.target()===null?video.currentTime:seekControl.target());showOverlay();
  }
  $('player-timeline').addEventListener('pointerdown',function(e){
    if(!state.playing||timelineDrag||e.isPrimary===false||(e.button!==undefined&&e.button!==0))return;
    if(video.readyState<1||!isFinite(video.duration)||video.duration<=0)return;
    e.preventDefault();e.stopPropagation();timelineDrag={id:e.pointerId,position:video.currentTime};
    closeEpisodes();$('player-timeline').focus();
    try{$('player-timeline').setPointerCapture(e.pointerId);}catch(_){}
    dragTimeline(e);
  });
  $('player-timeline').addEventListener('pointermove',function(e){
    if(!timelineDrag||timelineDrag.id!==e.pointerId)return;
    e.preventDefault();e.stopPropagation();dragTimeline(e);
  });
  $('player-timeline').addEventListener('pointerup',function(e){
    if(!timelineDrag||timelineDrag.id!==e.pointerId)return;
    e.preventDefault();e.stopPropagation();dragTimeline(e);
    var position=timelineDrag.position;timelineDrag=null;suppressTimelineClickUntil=Date.now()+500;
    try{$('player-timeline').releasePointerCapture(e.pointerId);}catch(_){}
    if(!seekControl.to(position))toast('Перемотка станет доступна после загрузки метаданных');
    showOverlay();
  });
  ['pointercancel','lostpointercapture'].forEach(function(type){$('player-timeline').addEventListener(type,function(e){
    if(timelineDrag&&timelineDrag.id===e.pointerId){suppressTimelineClickUntil=Date.now()+500;cancelTimelineDrag();}
  });});
  var pointerPosition=null,touchMouseUntil=0;
  player.addEventListener('pointerdown',function(e){if(e.pointerType==='touch')touchMouseUntil=Date.now()+1000;});
  player.addEventListener('mousemove',function(e){if(!state.playing||Date.now()<touchMouseUntil||(e.sourceCapabilities&&e.sourceCapabilities.firesTouchEvents))return;if(pointerPosition&&Math.abs(e.clientX-pointerPosition.x)<4&&Math.abs(e.clientY-pointerPosition.y)<4)return;pointerPosition={x:e.clientX,y:e.clientY};showOverlay();});
  player.addEventListener('click',function(e){if(!state.playing||e.target!==video)return;if(state.overlayVisible)hideOverlay();else showOverlay();});
  function bindVideo(){
  if(video.audioTracks&&video.audioTracks.addEventListener){['addtrack','removetrack','change'].forEach(function(event){video.audioTracks.addEventListener(event,updatePlayerOptions);});}
  seekControl=TWPlayback.create(video,{
    onPreview:function(position){renderPosition(position);$('playing-status').textContent='Перемотка к '+time(position)+'…';showOverlay();},
    onStart:function(position){$('playing-status').textContent='Перемотка к '+time(position)+(state.source==='filmix'?' · ждём данные Filmix…':' · ждём данные от TorrServer…');$('player-back').className='btn';showOverlay();},
    onDone:function(){if(!state.playing)return;$('playing-status').textContent=video.paused?'Пауза':'';$('player-back').className='hidden';showOverlay();},
    onError:function(message){if(!state.playing)return;$('playing-status').textContent=message;$('player-back').className='btn';showOverlay();}
  });
  video.addEventListener('seeked',function(){seekControl.update();});
  video.addEventListener('loadedmetadata',function(){updatePlayerOptions();if(state.resume>0){try{video.currentTime=Math.min(state.resume,Math.max(0,video.duration-5));}catch(_){}state.resume=0;}});
  video.addEventListener('playing',function(){$('touch-pause').textContent='Пауза';clearTimeout(state.playerDeadline);clearTimeout(state.playerTimer);seekControl.update();if(!seekControl.isBusy()){$('playing-status').textContent='';$('player-back').className='hidden';}showOverlay();});video.addEventListener('waiting',function(){if(!state.playing||state.playing.failed)return;if(seekControl.isBusy()){showOverlay();return;}$('playing-status').textContent=state.source==='filmix'?'Буферизация · ждём данные Filmix…':'Буферизация · ждём данные от участников раздачи…';showOverlay();});
  video.addEventListener('canplay',function(){if(state.playing&&!seekControl.isBusy())$('playing-status').textContent=video.paused?'Пауза':'';if(state.overlayTimer===null)armOverlay();});video.addEventListener('pause',function(){$('touch-pause').textContent='Продолжить';if(state.playing&&!seekControl.isBusy())$('playing-status').textContent='Пауза';showOverlay();});video.addEventListener('ended',function(){updateHistory(false,true);stopPlayer();toast('Просмотр завершён');});
  video.addEventListener('error',function(){if(!state.playing)return;var code=video.error?video.error.code:0;$('playing-status').textContent=code===4?'Формат видео или аудио не поддерживается телевизором. Выберите другое видео или качество.':'Ошибка потока ('+code+'). '+(state.source==='filmix'?'Проверьте Filmix или выберите другое качество.':'Проверьте TorrServer и доступность сидов.');showOverlay();});
  video.addEventListener('timeupdate',function(){seekControl.update();renderPosition(timelineDrag?timelineDrag.position:seekControl.target()===null?video.currentTime:seekControl.target());if(state.overlayTimer===null)armOverlay();if(state.playing&&!seekControl.isBusy()&&Date.now()-state.playing.lastSave>10000){state.playing.lastSave=Date.now();updateHistory();}});
  }
  bindVideo();
  var fitModes=['contain','cover','fill'];
  var fitLabels=['Исходные пропорции','Заполнить с обрезкой','Растянуть на весь экран'];
  function updatePlayerOptions(){
    var tracks=video.audioTracks,index=-1;
    if(tracks)for(var i=0;i<tracks.length;i++)if(tracks[i].enabled)index=i;
    var audio=$('player-audio');audio.disabled=!tracks||tracks.length<2;
    audio.textContent=!tracks||!tracks.length?'Аудио: выбор недоступен на этом устройстве':tracks.length===1?'Аудио: одна дорожка':'Аудио: '+(index>=0?(tracks[index].label||tracks[index].language||'Дорожка '+(index+1)):'выбрать')+' · OK — следующая';
    video.style.objectFit=fitModes[state.fitIndex];
    $('player-fit').textContent='Изображение: '+fitLabels[state.fitIndex];
    if(state.optionsOpen&&audio.disabled&&document.activeElement===audio)$('player-fit').focus();
  }
  function openPlayerOptions(){
    if(!state.playing)return;
    if(state.episodesOpen)closeEpisodes();
    state.optionsOpen=true;$('player-options').className='';updatePlayerOptions();showOverlay();
    ($('player-audio').disabled?$('player-fit'):$('player-audio')).focus();
  }
  function closePlayerOptions(){
    if(!state.optionsOpen)return;
    state.optionsOpen=false;$('player-options').className='hidden';video.focus();showOverlay();
  }
  function audioTrack(){
    var tracks=video.audioTracks;if(!tracks||tracks.length<2)return toast('Другие аудиодорожки недоступны в этом файле или на этом устройстве');
    var index=-1;for(var i=0;i<tracks.length;i++)if(tracks[i].enabled)index=i;
    var next=(index+1)%tracks.length;
    try{tracks[next].enabled=true;for(var j=0;j<tracks.length;j++)if(j!==next)tracks[j].enabled=false;updatePlayerOptions();toast('Аудио: '+(tracks[next].label||tracks[next].language||next+1));}
    catch(_){toast('Устройство не поддерживает переключение этой аудиодорожки');}
  }
  function navigate(code){return window.TWNavigation?window.TWNavigation.navigate(code):true;}
  document.addEventListener('keydown',function(e){var c=e.keyCode,active=document.activeElement,back=c===461||c===27||(c===8&&active.tagName!=='INPUT');
    // webOS remote Enter does not synthesize an HTML button click reliably.
    if(c===13){if(state.enterHeld||e.repeat){e.preventDefault();return;}state.enterHeld=true;}
    if(window.TWNavigation&&window.TWNavigation.handleKeyDown(e))return;
    if(c===13&&!state.playing&&active.tagName==='BUTTON'){e.preventDefault();active.click();return;}
    if(c===13&&!state.playing&&active.tagName==='INPUT'&&active.form){e.preventDefault();var submit=document.createEvent('Event');submit.initEvent('submit',true,true);active.form.dispatchEvent(submit);return;}
    if(state.playing&&state.optionsOpen){
      if(back||c===40||c===38){e.preventDefault();closePlayerOptions();return;}
      if(c===37||c===39){e.preventDefault();var options=Array.prototype.filter.call($('player-options').querySelectorAll('button'),function(b){return !b.disabled;});var index=options.indexOf(active);options[(index+(c===37?-1:1)+options.length)%options.length].focus();return;}
      if(c===13){e.preventDefault();if(active.tagName==='BUTTON')active.click();return;}
    }
    if(state.playing&&state.episodesOpen){
      if(back||c===38){e.preventDefault();closeEpisodes();return;}
      if(c===37||c===39){e.preventDefault();focusEpisode(state.episodeIndex+(c===37?-1:1));return;}
      if(c===13){e.preventDefault();var card=$('episode-list').querySelectorAll('button')[state.episodeIndex];if(card)card.click();return;}
      if(c===40){e.preventDefault();showOverlay();return;}
    }
    if(state.playing&&c===13&&(state.playing.failed||active===$('player-back')&&$('player-back').className!=='hidden')){e.preventDefault();stopPlayer();return;}
    if(state.playing){if(back){e.preventDefault();stopPlayer();return;}if([13,19,415,10252].indexOf(c)>=0){e.preventDefault();togglePlayback();return;}if(c===413){e.preventDefault();stopPlayer();return;}if(c===40||c===38){e.preventDefault();if(c===40)openEpisodes();else openPlayerOptions();return;}if([37,39,412,417].indexOf(c)>=0){e.preventDefault();seek((c===37||c===412?-1:1)*seekStep());return;}if(c===405){e.preventDefault();audioTrack();return;}showOverlay();return;}
    if(back){e.preventDefault();if(state.view==='filmix-search'){leaveFilmix();}else if(state.view==='details'){change(state.detailOrigin);}else if(state.view==='files'){returnToResults();}else if(state.view==='search'&&state.searchFromDetail&&state.detailItem){openDetails(state.detailItem);}else if(state.view!=='home'){change('home');}else if(document.activeElement!==$('nav-home')){$('nav-home').focus();}else if(window.PalmSystem&&PalmSystem.platformBack){PalmSystem.platformBack();}return;}
    if(c>=37&&c<=40){if(navigate(c))e.preventDefault();}
  });
  document.addEventListener('keyup',function(e){if(e.keyCode===13){state.enterHeld=false;if(document.activeElement.tagName==='BUTTON'||state.playing)e.preventDefault();}});
  // The native shell uses only these fixed key/lifecycle hooks, without exposing a Java bridge.
  window.TWAndroidKey=function(code,down,repeat){
    if(code===13&&document.activeElement.tagName==='INPUT')return false;
    var event=document.createEvent('Event');event.initEvent(down?'keydown':'keyup',true,true);event.keyCode=code;event.repeat=!!repeat;document.dispatchEvent(event);return true;
  };
  window.TWAndroidBack=function(){
    if(!state.playing&&!(window.TWNavigation&&window.TWNavigation.picker)&&state.view==='home'&&document.activeElement===$('nav-home'))return false;
    window.TWAndroidKey(27,true,false);return true;
  };
  document.addEventListener('volkino-pause',function(){if(state.playing){video.pause();updateHistory();}});
  window.addEventListener('blur',function(){state.enterHeld=false;});
  document.addEventListener('visibilitychange',function(){if(document.hidden&&state.playing){video.pause();updateHistory();}});window.addEventListener('beforeunload',function(){updateHistory();});
  Array.prototype.forEach.call(document.querySelectorAll('[data-view]'),function(b){b.onclick=function(){state.searchFromDetail=false;change(b.getAttribute('data-view'));};});
  api('session',null,function(err,r){if(err){message('Помощник недоступен',err.message);return;}state.token=r.token;api('config',null,function(e,c){if(e){message('Ошибка настроек',e.message);return;}state.config=c;storeHistory();change('home');health(false);});});
}());
