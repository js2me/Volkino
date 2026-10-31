'use strict';

function pageNumber(value) {
  var page=value===undefined?1:Number(value);
  if(!isFinite(page)||Math.floor(page)!==page||page<1||page>500)throw new Error('Некорректная страница последних добавлений');
  return page;
}

function filmixPage(data,page) {
  if(!Array.isArray(data))throw new Error('Filmix не вернул ленту последних добавлений');
  var seen={},items=data.slice(0,100).filter(function(item){return item&&/^\d+$/.test(String(item.id))&&Number(item.id)>0&&Number(item.id)<=2147483647&&!seen[item.id]&&(seen[item.id]=true);}).map(function(item){
    var episode=item.last_episode||{},categories=Array.isArray(item.categories)?item.categories:[];
    var series=Number(episode.episode)>0||item.serial_stats&&Number(item.serial_stats.post_id)>0||categories.some(function(name){return /сериал|дорам/i.test(String(name));});
    var date=Date.parse(item.date_atom||'');
    return{id:'filmix:'+Number(item.id),filmixId:Number(item.id),source:'filmix',title:String(item.title||item.original_title||'Filmix').slice(0,500),year:String(item.year||'').slice(0,4),type:series?'tv':'movie',updatedAt:isFinite(date)?new Date(date).toISOString():'',season:series?Number(episode.season)||0:0,episode:series?Number(episode.episode)||0:0,quality:String(item.quality||'').slice(0,80)};
  });
  return{source:'filmix',items:items,page:page,hasMore:data.length>=50&&page<500,note:'По дате публикации и обновления Filmix. Новые серии тоже поднимают сериал в списке.',updatedAt:Date.now()};
}

module.exports={pageNumber:pageNumber,filmixPage:filmixPage};
