import { withViewModel } from 'mobx-view-model-solid';
import { MagnetVM } from '../model';
import { Field } from '../../../app/ui/field';
export const Magnet = withViewModel(MagnetVM, ({ model }) => {
  return (
    <form
      class="panel"
      ref={(element) => {
        model.root = element;
      }}
      onSubmit={(event) => {
        event.preventDefault();
        model.submit();
      }}
    >
      <p>
        Вставьте magnet-ссылку или адрес .torrent. Файлы подготовит выбранный
        TorrServer.
      </p>
      <Field id="magnet-link" label="Ссылка на торрент">
        <input
          id="magnet-link"
          name="link"
          value={model.link}
          onInput={(event) => model.setLink(event.currentTarget.value)}
          class="input"
          placeholder="magnet:?xt=urn:btih:…"
          autocomplete="off"
        />
      </Field>
      <button type="submit" class="btn primary">
        Открыть торрент
      </button>
    </form>
  );
});
