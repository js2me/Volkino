import { VM } from '../../shared/lib/mobx';

/** Owns the application lifecycle; shared state and services live in Globals. */
export class AppVM extends VM {
  protected didMount() {
    this.globals.start();
  }
  protected willUnmount() {
    this.globals.dispose();
  }
}
