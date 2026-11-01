import { ViewModelBase, ViewModelInfo } from "mobx-view-model";
import { Globals } from "../../../globals";


export class VM extends ViewModelBase {
  globals: Globals = this.vm.data.globals;
}