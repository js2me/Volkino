/* ES5: the local helper can still be starting when webOS opens the app. */
(function () {
  var started = Date.now(), timer;
  function check() {
    var request = new Image(), finished = false, timeout;
    function retry() {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (Date.now() - started < 60000) {
        var seconds = Math.floor((Date.now() - started) / 1000);
        document.getElementById('launch-status').textContent = 'Ожидаем готовности приложения…' + (seconds ? ' ' + seconds + ' с' : '');
        timer = setTimeout(check, 1000);
      }
      else {
        document.getElementById('launch-status').textContent = 'Не удалось запустить приложение. Повторите попытку или перезагрузите телевизор.';
        document.getElementById('launch-retry').style.display = 'block';
      }
    }
    // An image probe works from file:// without exposing the session token via CORS.
    request.onload = function () {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      document.getElementById('launch-status').textContent = 'Открываем библиотеку…';
      window.location.replace('http://127.0.0.1:32190/');
    };
    request.onerror = retry;
    timeout = setTimeout(retry, 2000);
    request.src = 'http://127.0.0.1:32190/icon.png?ready=' + Date.now();
  }
  window.addEventListener('DOMContentLoaded', function () {
    document.getElementById('launch-retry').onclick = function () {
      clearTimeout(timer); started = Date.now(); this.style.display = 'none';
      document.getElementById('launch-status').textContent = 'Проверяем готовность приложения…'; check();
    };
    check();
  });
})();
