import '../src/main';

// Keep the existing ES5 UMD helpers as classic scripts (`this` is window).
// Start the shell only after the Solid entry has registered TWCatalog.
async function boot() {
  for (const path of ['/app/history.js', '/app/playback.js', '/app/app.js']) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = path;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Не удалось загрузить ' + path));
      document.body.appendChild(script);
    });
  }
}

void boot().catch(error => {
  document.getElementById('content')!.textContent = String(error);
});
