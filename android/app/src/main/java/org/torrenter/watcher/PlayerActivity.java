package org.torrenter.watcher;

import android.app.*;
import android.content.*;
import android.media.AudioManager;
import android.content.res.ColorStateList;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.text.TextUtils;
import org.json.*;
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
    private FrameLayout controls;
    private LinearLayout optionsPanel, episodesPanel;
    private TextView status;
    private ProgressBar buffering;
    private Button audioButton, fitButton;
    private JSONArray episodes = new JSONArray();
    private long nextFileId = -1;
    private int fitMode;
    private static final int TEXT = 0xfff5f2ed, ACCENT = 0xfff4bd68;
    private TextView time;
    private Button pause;
    private SeekBar timeline;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long resume, position, duration, lastPublish;
    private boolean completed, seeking, viewsAttached;
    private int restoreAudioTrack = -1;
    private int step;
    private AudioManager audio;
    private final AudioManager.OnAudioFocusChangeListener audioFocus = change -> {
        if (change < 0 && player != null) player.pause();
    };
    private final Runnable hide = this::hideControls;
    private final Runnable tick = new Runnable() {
        public void run() {
            if (player == null) return;
            position = resume > 0 ? resume : Math.max(0, player.getTime()); duration = Math.max(0, player.getLength());
            if (!seeking) timeline.setProgress(duration > 0 ? (int)(position * 1000 / duration) : 0);
            if (!seeking) time.setText(format(position) + " / " + format(duration));
            if (optionsPanel.getVisibility() == View.VISIBLE) updateAudio();
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
        controls = new FrameLayout(this);
        root.addView(controls, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout top = column(); top.setPadding(dp(28), dp(24), dp(28), dp(32));
        top.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xdd000000, 0x00000000}));
        top.setClickable(true);
        controls.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));
        optionsPanel = column(); optionsPanel.setVisibility(View.GONE); top.addView(optionsPanel);
        LinearLayout optionButtons = row(optionsPanel);
        audioButton = add(optionButtons, "Аудио: загрузка…", this::cycleAudio);
        fitButton = add(optionButtons, "", () -> { fitMode = (fitMode + 1) % 3; applyFit(); });
        add(optionButtons, "Готово", () -> { optionsPanel.setVisibility(View.GONE); showControls(); });
        TextView eyebrow = label("СЕЙЧАС НА ЭКРАНЕ", 11); eyebrow.setTextColor(0xffc3c1cb);
        top.addView(eyebrow);
        TextView title = label(getIntent().getStringExtra("title"), 23);
        title.setMaxLines(2); title.setEllipsize(TextUtils.TruncateAt.END); top.addView(title);
        status = label("Буферизация · загружаем видео…", 15); status.setTextColor(0xffc3c1cb); top.addView(status);

        LinearLayout bottomPanel = column(); bottomPanel.setPadding(dp(28), dp(36), dp(28), dp(18));
        bottomPanel.setClickable(true);
        bottomPanel.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0x00000000, 0xee000000}));
        controls.addView(bottomPanel, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        LinearLayout buttons = row(bottomPanel);
        step = Math.max(1, Math.min(3600, getIntent().getIntExtra("step", 30)));
        if (isTV()) add(buttons, "Назад", this::finish);
        add(buttons, "−" + step + " сек", () -> seek(-step));
        if (isTV()) pause = add(buttons, "Пауза", this::toggle);
        add(buttons, "+" + step + " сек", () -> seek(step));
        add(buttons, "Серии", this::openEpisodes);
        add(buttons, "Звук и изображение", this::openOptions);
        timeline = new SeekBar(this); timeline.setMax(1000);
        timeline.setPadding(dp(8), 0, dp(8), 0);
        timeline.setProgressTintList(ColorStateList.valueOf(ACCENT));
        timeline.setThumbTintList(ColorStateList.valueOf(ACCENT));
        timeline.setProgressBackgroundTintList(ColorStateList.valueOf(0x66ffffff));
        bottomPanel.addView(timeline, new LinearLayout.LayoutParams(-1, dp(48)));
        time = label("0:00 / 0:00", 17); bottomPanel.addView(time);
        episodesPanel = column(); episodesPanel.setVisibility(View.GONE); bottomPanel.addView(episodesPanel);
        buffering = new ProgressBar(this); buffering.setIndeterminateTintList(ColorStateList.valueOf(ACCENT));
        root.addView(buffering, new FrameLayout.LayoutParams(dp(42), dp(42), Gravity.CENTER));
        setContentView(root);
        root.setOnClickListener(v -> {
            if (!isTV()) { toggle(); showControls(); }
            else if (controls.getVisibility() == View.VISIBLE) hideControls(); else showControls();
        });
        try { episodes = new JSONArray(getIntent().getStringExtra("episodes")); } catch (Exception ignored) { }
        fitMode = getPreferences(MODE_PRIVATE).getInt("fitMode", 0);
        if (state != null) fitMode = state.getInt("fitMode", fitMode);
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
            viewsAttached = true;
            applyFit();
            player.setEventListener(event -> {
                if (resume > 0 && (event.type == MediaPlayer.Event.Playing || event.type == MediaPlayer.Event.SeekableChanged) && player.isSeekable()) { player.setTime(resume); resume = 0; }
                if (event.type == MediaPlayer.Event.Playing) {
                    if (restoreAudioTrack >= 0 && player.setAudioTrack(restoreAudioTrack)) restoreAudioTrack = -1;
                    if (pause != null) pause.setText("Пауза"); status.setText(""); buffering.setVisibility(View.GONE); showControls();
                } else if (event.type == MediaPlayer.Event.Paused) { if (pause != null) pause.setText("Продолжить"); status.setText("Пауза"); showControls(); }
                else if (event.type == MediaPlayer.Event.Buffering) {
                    boolean waiting = event.getBuffering() < 100;
                    buffering.setVisibility(waiting ? View.VISIBLE : View.GONE);
                    status.setText(waiting ? "Буферизация · " + (int)event.getBuffering() + "%" : player.isPlaying() ? "" : "Пауза");
                }
                else if (event.type == MediaPlayer.Event.EndReached) { completed = true; finish(); }
                else if (event.type == MediaPlayer.Event.EncounteredError) {
                    publish(true, "Не удалось воспроизвести видео. Проверьте поток или выберите другое качество."); finish();
                }
            });
            Media media = new Media(vlc, Uri.parse(getIntent().getStringExtra("url")));
            media.setHWDecoderEnabled(true, false);
            media.addOption(":network-caching=1500");
            player.setMedia(media); media.release(); player.play();
            focusControls(); showControls();
        } catch (Exception | LinkageError e) { publish(true, "Не удалось запустить видеоплеер"); finish(); }
    }
    private boolean isTV() { return (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_TYPE_MASK) == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION; }
    private void focusControls() { if (pause != null) pause.requestFocus(); else timeline.requestFocus(); }
    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private LinearLayout column() { LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); return layout; }
    private TextView label(String text, int size) {
        TextView view = new TextView(this); view.setText(text); view.setTextColor(TEXT); view.setTextSize(size);
        view.setPadding(0, dp(4), 0, dp(4)); return view;
    }
    private LinearLayout row(LinearLayout parent) {
        HorizontalScrollView scroll = new HorizontalScrollView(this); scroll.setHorizontalScrollBarEnabled(false);
        scroll.setClipToPadding(false); scroll.setPadding(dp(4), dp(4), dp(4), dp(4));
        LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL); scroll.addView(row);
        parent.addView(scroll, new LinearLayout.LayoutParams(-1, -2)); return row;
    }
    private GradientDrawable rounded(int color, boolean focus) {
        GradientDrawable shape = new GradientDrawable(); shape.setColor(color); shape.setCornerRadius(dp(15));
        if (focus) shape.setStroke(dp(2), ACCENT); return shape;
    }
    private Button add(LinearLayout row, String text, Runnable action) {
        Button button = new Button(this); button.setText(text); button.setAllCaps(false);
        button.setTextSize(18); button.setTextColor(TEXT); button.setGravity(Gravity.CENTER);
        button.setMinWidth(0); button.setMinimumWidth(0); button.setMinHeight(dp(54));
        button.setPadding(dp(20), dp(12), dp(20), dp(12)); button.setStateListAnimator(null);
        StateListDrawable background = new StateListDrawable();
        background.addState(new int[]{android.R.attr.state_pressed}, rounded(0xff363024, true));
        background.addState(new int[]{android.R.attr.state_focused}, rounded(0xff363024, true));
        background.addState(new int[]{}, rounded(0xff292b38, false)); button.setBackground(background);
        button.setOnClickListener(v -> { action.run(); showControls(); });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, -2); params.setMargins(0, 0, dp(12), 0);
        row.addView(button, params); return button;
    }
    private boolean panelOpen() { return optionsPanel.getVisibility() == View.VISIBLE || episodesPanel.getVisibility() == View.VISIBLE; }
    private void hideControls() {
        handler.removeCallbacks(hide); controls.setVisibility(View.GONE);
        optionsPanel.setVisibility(View.GONE); episodesPanel.setVisibility(View.GONE);
    }
    private void showControls() {
        controls.setVisibility(View.VISIBLE); handler.removeCallbacks(hide);
        if (player != null && player.isPlaying() && !seeking && !panelOpen()) handler.postDelayed(hide, 5000);
    }
    private void applyFit() {
        fitMode = Math.max(0, Math.min(2, fitMode));
        String[] names = {"Исходные пропорции", "Заполнить с обрезкой", "Растянуть на весь экран"};
        MediaPlayer.ScaleType[] scales = {MediaPlayer.ScaleType.SURFACE_BEST_FIT, MediaPlayer.ScaleType.SURFACE_FIT_SCREEN, MediaPlayer.ScaleType.SURFACE_FILL};
        if (player != null) player.setVideoScale(scales[fitMode]);
        fitButton.setText("Изображение: " + names[fitMode]);
        getPreferences(MODE_PRIVATE).edit().putInt("fitMode", fitMode).apply();
    }
    private void openOptions() {
        episodesPanel.setVisibility(View.GONE); optionsPanel.setVisibility(View.VISIBLE); updateAudio();
        showControls(); fitButton.requestFocus();
    }
    private void openEpisodes() {
        optionsPanel.setVisibility(View.GONE); episodesPanel.removeAllViews();
        episodesPanel.addView(label("Файлы в этой папке", 20));
        LinearLayout cards = row(episodesPanel);
        for (int i = 0; i < episodes.length(); i++) {
            JSONObject episode = episodes.optJSONObject(i); if (episode == null) continue;
            long id = episode.optLong("id", -1); boolean selected = episode.optBoolean("current");
            Button card = add(cards, (selected ? "▶ " : "") + episode.optString("title"), () -> {
                if (selected) { episodesPanel.setVisibility(View.GONE); return; }
                nextFileId = id; finish();
            });
            card.setMaxWidth(dp(300)); card.setMaxLines(2); card.setEllipsize(TextUtils.TruncateAt.END);
            if (selected) card.setTextColor(ACCENT);
        }
        if (episodes.length() == 0) episodesPanel.addView(label("Список файлов недоступен", 16));
        add(cards, "Готово", () -> episodesPanel.setVisibility(View.GONE));
        episodesPanel.setVisibility(View.VISIBLE); showControls();
    }
    private void toggle() { if (player != null) { if (player.isPlaying()) player.pause(); else play(); } }
    private void play() { if (player != null && viewsAttached) player.play(); }
    private void seek(int seconds) {
        if (player != null && player.isSeekable()) player.setTime(Math.max(0, Math.min(Math.max(0, player.getLength()-1000), player.getTime() + seconds * 1000L)));
        showControls();
    }
    private ArrayList<MediaPlayer.TrackDescription> audioTracks() {
        ArrayList<MediaPlayer.TrackDescription> audible = new ArrayList<>();
        MediaPlayer.TrackDescription[] tracks = player == null ? null : player.getAudioTracks();
        if (tracks != null) for (MediaPlayer.TrackDescription track : tracks) if (track.id >= 0) audible.add(track);
        return audible;
    }
    private void updateAudio() {
        ArrayList<MediaPlayer.TrackDescription> tracks = audioTracks();
        String name = "Аудио: дорожки ещё не загружены";
        for (MediaPlayer.TrackDescription track : tracks) if (track.id == player.getAudioTrack()) name = "Аудио: " + track.name;
        audioButton.setText(name + (tracks.size() > 1 ? " · следующая" : "")); audioButton.setEnabled(tracks.size() > 1);
        audioButton.setAlpha(tracks.size() > 1 ? 1f : .65f);
    }
    private void cycleAudio() {
        ArrayList<MediaPlayer.TrackDescription> tracks = audioTracks();
        if (tracks.size() < 2) return;
        int current = -1; for (int i = 0; i < tracks.size(); i++) if (tracks.get(i).id == player.getAudioTrack()) current = i;
        MediaPlayer.TrackDescription next = tracks.get((current + 1) % tracks.size());
        if (player.setAudioTrack(next.id)) audioButton.setText("Аудио: " + next.name + " · следующая");
    }
    private String format(long ms) { long sec = ms / 1000; return sec >= 3600 ? String.format(java.util.Locale.ROOT, "%d:%02d:%02d", sec/3600, sec/60%60, sec%60) : String.format(java.util.Locale.ROOT, "%d:%02d", sec/60, sec%60); }
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
        if (closed && nextFileId >= 0) update.putExtra("nextFileId", nextFileId);
        sendBroadcast(update);
    }
    @Override public void onBackPressed() {
        if (panelOpen()) { optionsPanel.setVisibility(View.GONE); episodesPanel.setVisibility(View.GONE); showControls(); focusControls(); }
        else finish();
    }
    @Override public void onConfigurationChanged(android.content.res.Configuration config) {
        super.onConfigurationChanged(config); applyFit();
    }
    @Override public void finish() { publish(true, null); super.finish(); }
    @Override protected void onStart() {
        super.onStart();
        if (player != null) {
            if (!viewsAttached) {
                player.attachViews(surface, null, false, false);
                viewsAttached = true;
                applyFit();
                status.setText("Пауза");
                buffering.setVisibility(View.GONE);
                showControls();
            }
            handler.post(tick);
        }
    }
    @Override protected void onResume() {
        super.onResume(); audio.requestAudioFocus(audioFocus, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
    }
    @Override protected void onPause() { if (player != null) { player.pause(); publish(false, null); }
        audio.abandonAudioFocus(audioFocus); super.onPause(); }
    @Override protected void onStop() {
        handler.removeCallbacks(tick); handler.removeCallbacks(hide);
        if (player != null && viewsAttached) {
            // A locked screen destroys SurfaceView. Release the decoder before
            // detaching so the next play cannot keep rendering into its old surface.
            publish(false, null);
            resume = position;
            restoreAudioTrack = player.getAudioTrack();
            player.stop();
            player.detachViews();
            viewsAttached = false;
        }
        super.onStop();
    }
    @Override protected void onSaveInstanceState(Bundle state) { state.putLong("position", position); state.putInt("fitMode", fitMode); super.onSaveInstanceState(state); }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            int key = event.getKeyCode();
            if (key == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) { toggle(); return true; }
            if (key == KeyEvent.KEYCODE_MEDIA_PLAY && player != null) { play(); return true; }
            if (key == KeyEvent.KEYCODE_MEDIA_PAUSE && player != null) { player.pause(); return true; }
            if (key == KeyEvent.KEYCODE_MEDIA_REWIND) { seek(-step); return true; }
            if (key == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) { seek(step); return true; }
            if (key == KeyEvent.KEYCODE_PROG_YELLOW) { cycleAudio(); return true; }
            if (!panelOpen() && key == KeyEvent.KEYCODE_DPAD_UP) { openOptions(); return true; }
            if (!panelOpen() && key == KeyEvent.KEYCODE_DPAD_DOWN) { openEpisodes(); return true; }
            if (controls.getVisibility() != View.VISIBLE && key >= KeyEvent.KEYCODE_DPAD_UP && key <= KeyEvent.KEYCODE_DPAD_CENTER) { showControls(); focusControls(); return true; }
            if (key >= KeyEvent.KEYCODE_DPAD_UP && key <= KeyEvent.KEYCODE_DPAD_CENTER) showControls();
        }
        return super.dispatchKeyEvent(event);
    }
    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (player != null) { player.setEventListener(null); player.stop(); if (viewsAttached) player.detachViews(); player.release(); }
        if (vlc != null) vlc.release(); super.onDestroy();
    }
}
