# Как устроены VilkaDB, ForkPlayer и TorrServer

Проверено 25 октября 2026 на LG 55UN73506LB / webOS 5.6.0.

## Поиск

VilkaDB — портал на сервере, а ForkPlayer — клиент, понимающий его FXML (JSON с `channels`, шаблонами и действиями). Поиск фильма в каталоге: `http://fxmlparsers.in.net/VilkaDB/?id=search&search=...`. Карточка: `?id=tmdb&tid=10378&media_type=movie`. Кнопка «Торренты» ведёт на страницу с параметром `torr=<название>`; `torr_only=1` позволяет запросить выдачу раздач непосредственно по названию.

Рабочий запрос для приложения:

```
GET http://fxmlparsers.in.net/VilkaDB/?id=tmdb&torr_only=1&torr=Big%20Buck%20Bunny
```

Раздача в `channels` содержит `title`, `stream_url` (magnet), `description` с размером, сидерами, трекером. Шаблоны `template`, CSS и `cmd:` принадлежат чужому порталу и не исполняются в нашем приложении. Читаем только строки, выводим через `textContent`. В некоторых ответах Unicode и амперсанды экранированы дважды: нормализуем `\\uXXXX`, `&amp;` и `\\/`. Magnet содержит `xt=urn:btih:<hash>` и трекеры.

Серверные исходники VilkaDB не опубликованы в изученных источниках: реализация его агрегатора неизвестна. В проверенной выдаче были раздачи Rutracker и Rutor. Мы используем публичный ответ портала; внутреннее API может измениться. Портал доступен по HTTP; HTTPS на проверенных зеркалах выдавал несоответствие сертификата. Проверка сертификатов нигде не отключена.

## Воспроизведение

В изученном клиентском коде ForkPlayer `app_2306.js` обнаружен переход от magnet к:

```
http://<TorrServer>/stream/playlists.m3u?link=<encoded magnet>&m3u
```

Плейлист содержит HTTP-адреса конкретных файлов. Сам ForkPlayer не является BitTorrent-клиентом.

Наш клиент использует эквивалентный JSON API MatriX:

1. `POST /torrents` → `{action:"add",link:<magnet>,save_to_db:true}`.
2. `POST /torrents` → `{action:"get",hash:<hash>}` — ждём `file_stats`.
3. Каждый `file_stats[].id` — номер файла TorrServer, **от 1**, а не индекс отфильтрованного массива.
4. `GET /stream/video?link=<hash>&index=<id>&preload&stat` — подготовка.
5. `GET /stream/video?link=<hash>&index=<id>&play` — байтовый поток. HTTP Range / 206 нужны для перемотки.

Локальный помощник на ТВ передаёт поток без перекодирования и без сохранения видео на диск. Учётные данные Basic Auth внешнего TorrServer остаются в конфигурации помощника. Нужные кодеки декодирует телевизор; DTS, некоторые Dolby Vision/AV1 и другие неподдерживаемые форматы требуют другой раздачи либо отдельного транскодера. TorrServer не транскодирует.

## Запасные источники

- Rutor: встроенный индекс внешнего TorrServer, `GET /search/?query=...`; перед первым использованием нужен `EnableRutorSearch`. Проверено на MatriX.142.2; сохранены остальные настройки сервера. Индекс автоматически скачивает сам TorrServer.
- Torznab: `/torznab/search/?query=...`; индексаторы Jackett/Prowlarr настраиваются в TorrServer. Адаптер реализован; живого настроенного индексатора в сети не было для проверки.
- Jacred: `/api/v1.0/torrents?search=...`; адрес задаёт владелец. Публичные адреса в момент исследования были недоступны/с некорректным сертификатом; нет обещания работоспособности произвольного публичного зеркала.

## Источники

- http://fxmlparsers.in.net/VilkaDB/
- https://wiki.forkbrowser.top/wiki/Torrserve_Fork
- https://raw.githubusercontent.com/komivp/appinfodl/main/app_2306.js
- https://github.com/YouROK/TorrServer/blob/MatriX.126/server/web/api/torrents.go
- https://github.com/YouROK/TorrServer/blob/MatriX.126/server/web/api/stream.go
- https://github.com/YouROK/TorrServer/blob/MatriX.126/server/torr/state/state.go
- https://github.com/YouROK/TorrServer/tree/master/server/web/api
