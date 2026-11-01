import { ViewModelStoreBase } from 'mobx-view-model';
import type { AppServices } from '../shared/types/screens';
import { createCatalogSession } from './catalog';
import { createLatestSession } from './latest';
import { audioProcessor } from '../app/audio/processor';

/** Application-owned services and state shared between screen instances. */
export class Globals {
  app!: AppServices;
  readonly audio = audioProcessor;
  readonly catalog = createCatalogSession();
  readonly latest = createLatestSession();
  readonly stores = {
    viewModels: new ViewModelStoreBase({
      vmConfig: {
        observable: {
          viewModels: { useDecorators: false },
          viewModelStores: { useDecorators: false },
        },
        resource: {
          read:() => {
            return {
              globals: this,
            }
          }
        }
      },
    }),
  };

}
