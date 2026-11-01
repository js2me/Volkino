import { Show } from 'solid-js';
import type { CatalogItem } from '../../../globals/catalog';

export function PosterCard(props: { item: CatalogItem; onOpen: () => void }) {
  return <button class="poster-card" data-media-type={props.item.type} data-catalog-id={props.item.id}
    aria-label={props.item.title + (props.item.year ? ' · ' + props.item.year : '')} onClick={props.onOpen}>
    <div class="poster-art"><span class="poster-fallback">{props.item.title.slice(0, 1)}</span>
      <Show when={props.item.poster}><img src={props.item.poster} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} /></Show>
      <Show when={props.item.rating}><span class="poster-rating" classList={{ 'rating-high': Number(props.item.rating) >= 8 }}>{props.item.rating}</span></Show>
    </div>
    <span class="poster-name">{props.item.title}</span>
    <span class="poster-meta">{props.item.year || ''}{props.item.type === 'tv' ? ' · Сериал' : ' · Фильм'}</span>
  </button>;
}
