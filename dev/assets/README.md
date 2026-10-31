`demo.mp4` — локальный тестовый видеосигнал, созданный FFmpeg, 45 секунд,
H.264/AAC, 480×270. Фильмы и внешние сервисы для просмотра UI не нужны.

Для пересоздания (FFmpeg нужен только для этой необязательной операции):

```sh
ffmpeg -y -f lavfi -i 'testsrc=size=480x270:rate=15' \
  -f lavfi -i 'sine=frequency=440:sample_rate=44100' -t 45 \
  -c:v libx264 -preset veryfast -crf 35 -pix_fmt yuv420p \
  -c:a aac -b:a 24k -af volume=0.04 -movflags +faststart dev/assets/demo.mp4
```
