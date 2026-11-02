/** Session renewal is bounded to one retry, including when a TV retains an old page. */
export class APIClient {
  private token = '';
  request<T>(
    route: string,
    body: object | null,
    done: (error: Error | null, data: T) => void,
    renewed = false,
  ): void {
    const xhr = new XMLHttpRequest();
    const fail = (message: string) => done(new Error(message), undefined as T);
    xhr.open(body === null ? 'GET' : 'POST', '/api/' + route, true);
    xhr.timeout =
      route === 'preload' ? 50000 : route.startsWith('filmix/') ? 35000 : 25000;
    if (this.token) xhr.setRequestHeader('X-App-Token', this.token);
    if (body !== null) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        fail('Некорректный ответ сервера');
        return;
      }
      if (
        xhr.status === 403 &&
        route !== 'session' &&
        !renewed &&
        (data.code === 'SESSION_EXPIRED' ||
          data.error === 'Обновите приложение')
      ) {
        this.request<{ token: string }>('session', null, (error, session) => {
          if (error) {
            done(error, undefined as T);
            return;
          }
          this.token = session.token;
          this.request(route, body, done, true);
        });
        return;
      }
      if (xhr.status >= 400) {
        fail(data.error || 'Ошибка HTTP ' + xhr.status);
        return;
      }
      if (route === 'session') this.token = data.token;
      done(null, data);
    };
    xhr.onerror = () =>
      fail('Нет соединения с локальным помощником. Перезапустите приложение.');
    xhr.ontimeout = () =>
      fail('Сервер не ответил вовремя. Проверьте подключение.');
    xhr.send(body === null ? null : JSON.stringify(body));
  }
}
