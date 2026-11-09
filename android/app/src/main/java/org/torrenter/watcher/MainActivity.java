package org.torrenter.watcher;

import android.app.*;
import android.content.*;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.webkit.*;
import android.widget.*;
import java.net.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    static final String PLAYER_UPDATE = "org.torrenter.watcher.PLAYER_UPDATE";
    private static final int UPDATE_PERMISSION = 701, UPDATE_INSTALL = 702;
    private boolean waitingForUpdatePermission, updateInstallerOpen;
    private java.io.File updateFile() { return new java.io.File(getFilesDir(), "updates/update.apk"); }
    private void cleanUpdate() {
        updateFile().delete();
        new java.io.File(getFilesDir(), "updates/update.apk.part").delete();
    }
    private void installUpdate() {
        if (waitingForUpdatePermission || updateInstallerOpen) return;
        try {
            java.io.File apk = updateFile();
            if (!apk.isFile()) throw new Exception("Пакет удалён. Проверьте обновления и скачайте его снова.");
            android.content.pm.PackageInfo info = getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
            long code = info == null ? 0 : (Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode);
            if (info == null || !getPackageName().equals(info.packageName) || code <= BuildConfig.VERSION_CODE)
                throw new Exception("APK не подходит для обновления этого приложения.");
            if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                waitingForUpdatePermission = true;
                startActivityForResult(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName())), UPDATE_PERMISSION);
                return;
            }
            Uri uri = androidx.core.content.FileProvider.getUriForFile(this, getPackageName() + ".updates", apk);
            Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.putExtra(Intent.EXTRA_RETURN_RESULT, true);
            updateInstallerOpen = true;
            startActivityForResult(intent, UPDATE_INSTALL);
        } catch (Exception e) {
            waitingForUpdatePermission = false; updateInstallerOpen = false;
            cleanUpdate();
            Toast.makeText(this, e.getMessage(), Toast.LENGTH_LONG).show();
            refreshUpdateStatus();
        }
    }
    private void refreshUpdateStatus() {
        if (web != null && !destroyed && loaded) web.evaluateJavascript("window.dispatchEvent(new Event('volkino-update-finished'))", null);
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == UPDATE_PERMISSION && waitingForUpdatePermission) {
            waitingForUpdatePermission = false;
            if (Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls()) installUpdate();
            else { cleanUpdate(); refreshUpdateStatus(); }
        } else if (request == UPDATE_INSTALL) {
            updateInstallerOpen = false;
            cleanUpdate(); refreshUpdateStatus();
        }
    }
    private String playerToken;
    private final BroadcastReceiver playerUpdates = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent data) {
            if (destroyed || web == null || playerToken == null || !playerToken.equals(data.getStringExtra("token"))) return;
            org.json.JSONObject result = new org.json.JSONObject();
            try {
                result.put("token", playerToken);
                result.put("position", data.getDoubleExtra("position", 0));
                result.put("duration", data.getDoubleExtra("duration", 0));
                result.put("closed", data.getBooleanExtra("closed", false));
                result.put("completed", data.getBooleanExtra("completed", false));
                if (data.hasExtra("nextFileId")) result.put("nextFileId", data.getLongExtra("nextFileId", -1));
                result.put("error", data.getStringExtra("error"));
            } catch (org.json.JSONException ignored) { return; }
            web.evaluateJavascript("window.TWAndroidPlayback && window.TWAndroidPlayback(" + result + ")", null);
            if (data.getBooleanExtra("closed", false)) playerToken = null;
        }
    };
    private WebView web;
    private TextView status;
    private Messenger runtime;
    private boolean bound, loaded, destroyed, startupFailed;
    private String origin;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private long deadline;
    private String startupStage = "подключение к помощнику";
    private final Runnable startupTimeout = () -> {
        if (!destroyed && !loaded && !startupFailed) fail("Не удалось запустить VolKino за минуту: " + startupStage +
            ".\nAndroid " + Build.VERSION.RELEASE + " · " + Build.SUPPORTED_ABIS[0] +
            "\nЗакройте и откройте приложение. Если ошибка повторяется, передайте этот текст разработчику.");
    };
    private final Messenger replies = new Messenger(new Handler(Looper.getMainLooper(), msg -> {
        if (destroyed || startupFailed || loaded) return true;
        String error = msg.getData().getString("error");
        if (error != null) fail(error);
        else if (msg.arg1 > 0) probe(msg.arg1);
        else handler.postDelayed(this::requestRuntime, 300);
        return true;
    }));
    private final ServiceConnection connection = new ServiceConnection() {
        public void onServiceConnected(ComponentName name, IBinder binder) { runtime = new Messenger(binder); requestRuntime(); }
        public void onServiceDisconnected(ComponentName name) {
            runtime = null;
            if (!loaded && !startupFailed) {
                startupStage = "помощник отключился или аварийно завершился";
                status.setText("Перезапускаем помощник…");
            } else if (loaded) {
                loaded = false;
                fail("Помощник отключился. Закройте и откройте приложение.");
            }
        }
    };
    private boolean isTV() { return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_TYPE_MASK) == Configuration.UI_MODE_TYPE_TELEVISION; }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        cleanUpdate();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        FrameLayout layout = new FrameLayout(this);
        web = new WebView(this); layout.addView(web);
        status = new TextView(this); status.setText("Запускаем VolKino…"); status.setTextColor(0xffe8f7ff); status.setBackgroundColor(0xff080e19); status.setGravity(Gravity.CENTER); status.setPadding(24, 24, 24, 24);
        layout.addView(status, new FrameLayout.LayoutParams(-1, -1)); setContentView(layout);
        setVolumeControlStream(android.media.AudioManager.STREAM_MUSIC);
        IntentFilter updates = new IntentFilter(PLAYER_UPDATE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(playerUpdates, updates, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(playerUpdates, updates);
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public void play(String path, String title, double position, int step, String token, String episodes) {
                handler.post(() -> {
                    if (destroyed || !loaded || !local(Uri.parse(web.getUrl()))) return;
                    Uri uri = Uri.parse(path);
                    if (uri.isAbsolute() || !(path.startsWith("/stream?") || path.startsWith("/filmix-stream/") || path.startsWith("/download-media/"))) return;
                    playerToken = token;
                    Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                    intent.putExtra("url", origin + path); intent.putExtra("title", title);
                    intent.putExtra("position", (long)(Math.max(0, position) * 1000));
                    intent.putExtra("step", step); intent.putExtra("token", token); intent.putExtra("episodes", episodes);
                    startActivity(intent);
                });
            }
        }, "TWNativePlayer");
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public void install() {
                handler.post(() -> {
                    if (destroyed || !loaded || !local(Uri.parse(web.getUrl()))) return;
                    installUpdate();
                });
            }
        }, "TWNativeUpdater");
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true); settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setUseWideViewPort(true); settings.setLoadWithOverviewMode(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !local(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return !local(Uri.parse(url)); }
            @Override public void onPageFinished(WebView view, String url) {
                if (destroyed || startupFailed || !local(Uri.parse(url))) return;
                web.evaluateJavascript("!!document.querySelector('.version')", ready -> {
                    if (destroyed || startupFailed) return;
                    if (!"true".equals(ready)) {
                        fail("Не удалось запустить интерфейс. Обновите Android System WebView и откройте приложение снова.\nAndroid " + Build.VERSION.RELEASE);
                        return;
                    }
                    loaded = true; status.setVisibility(View.GONE);
                    handler.removeCallbacks(startupTimeout);
                    String device = isTV() ? "tv" : "tablet";
                    web.evaluateJavascript("document.documentElement.setAttribute('data-device','" + device + "');document.querySelector('.version').textContent='Android " + (isTV() ? "TV" : "· планшет") + " · v" + BuildConfig.VERSION_NAME + "';" +
                        (isTV() ? "document.querySelector('meta[name=viewport]').content='width=1280';" : ""), null);
                    web.requestFocus();
                });
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) fail("Не удалось открыть интерфейс. Закройте и откройте приложение.");
            }
        });
        deadline = android.os.SystemClock.elapsedRealtime() + 60000;
        // Independent of Binder replies and HTTP callbacks: either can stop arriving.
        handler.postDelayed(startupTimeout, 60000);
        bound = bindService(new Intent(this, RuntimeService.class), connection, BIND_AUTO_CREATE);
        if (!bound) fail("Не удалось запустить помощник");
    }
    private boolean local(Uri url) { return origin != null && (origin.equals(url.toString()) || origin.equals(url.getScheme() + "://" + url.getAuthority())); }
    private void fail(String text) { if (!destroyed) { startupFailed = true; handler.removeCallbacks(startupTimeout); status.setText(text); status.setVisibility(View.VISIBLE); } }
    private void requestRuntime() {
        if (destroyed || loaded || startupFailed) return;
        if (android.os.SystemClock.elapsedRealtime() >= deadline) { startupTimeout.run(); return; }
        if (runtime == null) return;
        Message request = Message.obtain(null, 1); request.replyTo = replies;
        try { runtime.send(request); } catch (RemoteException e) { fail(e.toString()); }
    }
    private void probe(int port) {
        if (destroyed || loaded || startupFailed) return;
        startupStage = "запуск локального HTTP-сервера";
        String address = "http://127.0.0.1:" + port;
        network.execute(() -> {
            boolean ready = false; HttpURLConnection request = null;
            try {
                request = (HttpURLConnection) new URL(address + "/api/session").openConnection();
                request.setConnectTimeout(800); request.setReadTimeout(800);
                ready = request.getResponseCode() == 200;
            } catch (Exception ignored) { } finally { if (request != null) request.disconnect(); }
            final boolean ok = ready;
            handler.post(() -> {
                if (destroyed || loaded || startupFailed) return;
                if (ok) { startupStage = "загрузка интерфейса WebView"; origin = address; web.loadUrl(address + "/"); }
                else handler.postDelayed(this::requestRuntime, 300);
            });
        });
    }
    @Override public void onBackPressed() {
        if (!loaded) { finish(); return; }
        web.evaluateJavascript("window.TWAndroidBack ? window.TWAndroidBack() : false", handled -> { if (!"true".equals(handled)) finish(); });
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        int key = event.getKeyCode(), code = 0;
        if (key == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || key == KeyEvent.KEYCODE_MEDIA_PLAY || key == KeyEvent.KEYCODE_MEDIA_PAUSE) code = 415;
        else if (key == KeyEvent.KEYCODE_MEDIA_STOP) code = 413;
        else if (key == KeyEvent.KEYCODE_MEDIA_REWIND) code = 412;
        else if (key == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) code = 417;
        else if (key == KeyEvent.KEYCODE_PROG_YELLOW) code = 405;
        else if (key == KeyEvent.KEYCODE_DPAD_CENTER) code = 13;
        if (!loaded || code == 0) return super.dispatchKeyEvent(event);
        final int mapped = code;
        final boolean down = event.getAction() == KeyEvent.ACTION_DOWN;
        web.evaluateJavascript("window.TWAndroidKey ? window.TWAndroidKey(" + mapped + "," + down + "," + (event.getRepeatCount() > 0) + ") : false", handled -> {
            if (mapped == 13 && down && "false".equals(handled)) {
                web.requestFocus(); ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(web, InputMethodManager.SHOW_IMPLICIT);
            }
        });
        return true;
    }
    @Override protected void onPause() {
        if (loaded) web.evaluateJavascript("document.dispatchEvent(new Event('volkino-pause'))", null);
        web.onPause(); super.onPause();
    }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        destroyed = true; unregisterReceiver(playerUpdates); handler.removeCallbacksAndMessages(null);
        if (bound) unbindService(connection);
        network.shutdownNow(); web.destroy(); super.onDestroy();
    }
}
