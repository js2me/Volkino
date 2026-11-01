package org.torrenter.watcher;

import android.app.*;
import android.content.*;
import android.media.AudioManager;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.widget.*;
import org.videolan.libvlc.*;
import org.videolan.libvlc.util.VLCVideoLayout;
import java.util.ArrayList;

/** Native decoding avoids WebView's device-dependent audio codec support. */
public final class PlayerActivity extends Activity {
    private LibVLC vlc;
    private MediaPlayer player;
    private VLCVideoLayout surface;
    private LinearLayout controls;
    private TextView time;
    private Button pause;
    private SeekBar timeline;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long resume, position, duration, lastPublish;
    private boolean completed, seeking;
    private int step;
    private AudioManager audio;
    private final AudioManager.OnAudioFocusChangeListener audioFocus = change -> {
        if (change < 0 && player != null) player.pause();
    };
    private final Runnable hide = () -> controls.setVisibility(View.GONE);
    private final Runnable tick = new Runnable() {
        public void run() {
            if (player == null) return;
            position = resume > 0 ? resume : Math.max(0, player.getTime()); duration = Math.max(0, player.getLength());
            if (!seeking) timeline.setProgress(duration > 0 ? (int)(position * 1000 / duration) : 0);
            if (!seeking) time.setText(format(position) + " / " + format(duration));
            if (SystemClock.elapsedRealtime() - lastPublish >= 5000) { publish(false, null); lastPublish = SystemClock.elapsedRealtime(); }
            handler.postDelayed(this, 1000);
        }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        audio = (AudioManager)getSystemService(AUDIO_SERVICE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(5894);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xff000000);
        surface = new VLCVideoLayout(this); root.addView(surface, new FrameLayout.LayoutParams(-1, -1));
        controls = new LinearLayout(this); controls.setOrientation(LinearLayout.VERTICAL);
        controls.setPadding(16,16,16,16); controls.setBackgroundColor(0xdd202028);
        TextView title = new TextView(this); title.setText(getIntent().getStringExtra("title")); title.setTextColor(-1); controls.addView(title);
        time = new TextView(this); time.setTextColor(-1); controls.addView(time);
        timeline = new SeekBar(this); timeline.setMax(1000); controls.addView(timeline);
        HorizontalScrollView scroll = new HorizontalScrollView(this);
        LinearLayout buttons = new LinearLayout(this); scroll.addView(buttons); controls.addView(scroll);
        step = Math.max(1, Math.min(3600, getIntent().getIntExtra("step", 30)));
        add(buttons, "Назад", this::finish);
        add(buttons, "−" + step + " сек", () -> seek(-step));
        pause = add(buttons, "Пауза", this::toggle);
        add(buttons, "+" + step + " сек", () -> seek(step));
        add(buttons, "Аудиодорожка", this::audioTracks);
        add(buttons, "Серии", this::finish);
        FrameLayout.LayoutParams bottom = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        root.addView(controls, bottom); setContentView(root);
        controls.setClickable(true);
        root.setOnClickListener(v -> {
            if (controls.getVisibility() == View.VISIBLE) {
                handler.removeCallbacks(hide); controls.setVisibility(View.GONE);
            } else showControls();
        });
        timeline.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onStartTrackingTouch(SeekBar bar) { seeking = true; handler.removeCallbacks(hide); }
            public void onProgressChanged(SeekBar bar, int progress, boolean user) {
                if (user && duration > 0) time.setText(format(duration * progress / 1000) + " / " + format(duration));
            }
            public void onStopTrackingTouch(SeekBar bar) {
                if (player != null && player.isSeekable() && duration > 0) player.setTime(duration * bar.getProgress() / 1000);
                seeking = false; showControls();
            }
        });
        resume = state != null ? state.getLong("position") : getIntent().getLongExtra("position", 0);
        position = resume;
        try {
            ArrayList<String> options = new ArrayList<>();
            vlc = new LibVLC(this, options); player = new MediaPlayer(vlc);
            player.setAudioDigitalOutputEnabled(false);
            player.attachViews(surface, null, false, false);
            player.setEventListener(event -> {
                if (resume > 0 && (event.type == MediaPlayer.Event.Playing || event.type == MediaPlayer.Event.SeekableChanged) && player.isSeekable()) { player.setTime(resume); resume = 0; }
                if (event.type == MediaPlayer.Event.Playing) {
                    pause.setText("Пауза"); showControls();
                } else if (event.type == MediaPlayer.Event.Paused) { pause.setText("Продолжить"); showControls(); }
                else if (event.type == MediaPlayer.Event.EndReached) { completed = true; finish(); }
                else if (event.type == MediaPlayer.Event.EncounteredError) {
                    publish(true, "Не удалось воспроизвести видео. Проверьте поток или выберите другое качество."); finish();
                }
            });
            Media media = new Media(vlc, Uri.parse(getIntent().getStringExtra("url")));
            media.setHWDecoderEnabled(true, false);
            media.addOption(":network-caching=1500");
            player.setMedia(media); media.release(); player.play();
            handler.post(tick); pause.requestFocus(); showControls();
        } catch (Exception | LinkageError e) { publish(true, "Не удалось запустить видеоплеер"); finish(); }
    }
    private Button add(LinearLayout row, String label, Runnable action) {
        Button button = new Button(this); button.setText(label);
        button.setOnClickListener(v -> { action.run(); showControls(); }); row.addView(button); return button;
    }
    private void showControls() {
        controls.setVisibility(View.VISIBLE); handler.removeCallbacks(hide);
        if (player != null && player.isPlaying() && !seeking) handler.postDelayed(hide, 5000);
    }
    private void toggle() { if (player != null) { if (player.isPlaying()) player.pause(); else player.play(); } }
    private void seek(int seconds) {
        if (player != null && player.isSeekable()) player.setTime(Math.max(0, Math.min(Math.max(0, player.getLength()-1000), player.getTime() + seconds * 1000L)));
        showControls();
    }
    private void audioTracks() {
        if (player == null) return;
        MediaPlayer.TrackDescription[] tracks = player.getAudioTracks();
        if (tracks == null || tracks.length == 0) { Toast.makeText(this, "Аудиодорожки ещё не загружены", Toast.LENGTH_SHORT).show(); return; }
        ArrayList<MediaPlayer.TrackDescription> audible = new ArrayList<>();
        for (MediaPlayer.TrackDescription track : tracks) if (track.id >= 0) audible.add(track);
        String[] names = new String[audible.size()]; int selected = -1;
        for (int i = 0; i < names.length; i++) { names[i] = audible.get(i).name; if (audible.get(i).id == player.getAudioTrack()) selected = i; }
        handler.removeCallbacks(hide);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Аудиодорожка").setSingleChoiceItems(names, selected, (d, index) -> {
            player.setAudioTrack(audible.get(index).id); d.dismiss();
        }).setNegativeButton("Закрыть", null).create();
        dialog.setOnDismissListener(d -> showControls()); dialog.show();
    }
    private String format(long ms) { long sec = ms / 1000; return String.format(java.util.Locale.ROOT, "%d:%02d:%02d", sec/3600, sec/60%60, sec%60); }
    private void publish(boolean closed, String error) {
        if (player != null) {
            if (resume == 0 && player.getTime() >= 0) position = player.getTime();
            if (player.getLength() > 0) duration = player.getLength();
        }
        // Explicit package prevents other apps from receiving stream history.
        Intent update = new Intent(MainActivity.PLAYER_UPDATE).setPackage(getPackageName());
        update.putExtra("token", getIntent().getStringExtra("token"));
        update.putExtra("position", position / 1000.0); update.putExtra("duration", duration / 1000.0);
        update.putExtra("closed", closed); update.putExtra("completed", completed); update.putExtra("error", error);
        sendBroadcast(update);
    }
    @Override public void finish() { publish(true, null); super.finish(); }
    @Override protected void onResume() {
        super.onResume(); audio.requestAudioFocus(audioFocus, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
    }
    @Override protected void onPause() { if (player != null) { player.pause(); publish(false, null); }
        audio.abandonAudioFocus(audioFocus); super.onPause(); }
    @Override protected void onSaveInstanceState(Bundle state) { state.putLong("position", position); super.onSaveInstanceState(state); }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            int key = event.getKeyCode();
            if (key == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) { toggle(); return true; }
            if (key == KeyEvent.KEYCODE_MEDIA_PLAY && player != null) { player.play(); return true; }
            if (key == KeyEvent.KEYCODE_MEDIA_PAUSE && player != null) { player.pause(); return true; }
            if (key == KeyEvent.KEYCODE_MEDIA_REWIND) { seek(-step); return true; }
            if (key == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) { seek(step); return true; }
            if (controls.getVisibility() != View.VISIBLE && key >= KeyEvent.KEYCODE_DPAD_UP && key <= KeyEvent.KEYCODE_DPAD_CENTER) { showControls(); pause.requestFocus(); return true; }
            if (key >= KeyEvent.KEYCODE_DPAD_UP && key <= KeyEvent.KEYCODE_DPAD_CENTER) showControls();
        }
        return super.dispatchKeyEvent(event);
    }
    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (player != null) { player.setEventListener(null); player.stop(); player.detachViews(); player.release(); }
        if (vlc != null) vlc.release(); super.onDestroy();
    }
}
