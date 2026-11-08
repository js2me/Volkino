package org.torrenter.watcher;

import android.app.Service;
import android.content.Intent;
import android.os.*;
import java.io.*;
import java.net.ServerSocket;
import java.util.zip.*;

/** Separate process: Node may start only once, and is stopped when the UI unbinds. */
public final class RuntimeService extends Service {
    private static native int startNode(String root, String config, String binary, int port);
    private volatile int port;
    private volatile String error;
    private final Messenger messenger = new Messenger(new Handler(Looper.getMainLooper(), msg -> {
        if (msg.replyTo != null) {
            Message reply = Message.obtain(null, 1, port, 0);
            Bundle data = new Bundle(); data.putString("error", error); reply.setData(data);
            try { msg.replyTo.send(reply); } catch (RemoteException ignored) { }
        }
        return true;
    }));
    @Override public void onCreate() {
        super.onCreate();
        new Thread(() -> {
            try {
                // Report linker errors to the Activity instead of crashing before binding.
                System.loadLibrary("node");
                System.loadLibrary("volkino");
                File root = new File(getFilesDir(), "runtime");
                unpack(root);
                int selected;
                int savedPort = getSharedPreferences("runtime", MODE_PRIVATE).getInt("port", 0);
                try (ServerSocket socket = new ServerSocket(savedPort, 1, java.net.InetAddress.getLoopbackAddress())) { selected = socket.getLocalPort(); }
                // Keep the origin stable across restarts so WebView localStorage retains watch history.
                getSharedPreferences("runtime", MODE_PRIVATE).edit().putInt("port", selected).commit();
                // A port is advertised only after extraction. The Activity waits for /api/session.
                port = selected;
                int code = startNode(root.getAbsolutePath(), new File(getFilesDir(), "config.json").getAbsolutePath(),
                    getApplicationInfo().nativeLibraryDir + "/libtorrserver.so", selected);
                error = "Помощник завершился (" + code + ")"; port = 0;
            } catch (UnsatisfiedLinkError | Exception e) { error = e.toString(); port = 0; }
        }, "volkino-node").start();
    }
    private void unpack(File root) throws IOException {
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("Cannot create runtime directory");
        try (ZipInputStream zip = new ZipInputStream(getAssets().open("runtime.zip"))) {
            ZipEntry entry; byte[] buffer = new byte[65536];
            while ((entry = zip.getNextEntry()) != null) {
                File target = new File(root, entry.getName());
                if (!target.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator)) throw new IOException("Invalid asset path");
                if (entry.isDirectory()) { target.mkdirs(); continue; }
                File parent = target.getParentFile();
                if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("Cannot create asset directory");
                try (FileOutputStream out = new FileOutputStream(target)) {
                    int count; while ((count = zip.read(buffer)) != -1) out.write(buffer, 0, count);
                }
            }
        }
    }
    @Override public IBinder onBind(Intent intent) { return messenger.getBinder(); }
    @Override public boolean onUnbind(Intent intent) { stopSelf(); return false; }
    @Override public void onDestroy() {
        super.onDestroy();
        // Node's SIGTERM handler also terminates its TorrServer child.
        android.os.Process.sendSignal(android.os.Process.myPid(), 15);
    }
}
