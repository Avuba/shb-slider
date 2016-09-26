import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';


let defaults = {
  config: {
    debounceTime: 100
  },

  private: {
    boundOnResize: null,
    currentTimeout: null
  }
};


let events = {
  resize: 'resizeDebouncer:resize',
};


export default class ResizeDebouncer {
  constructor(config) {
    this._config = fUtils.cloneDeep(defaults.config);
    this._private = fUtils.cloneDeep(defaults.private);

    if (config) fUtils.mergeDeep(this._config, config);

    this.events = events;
    utils.addEventTargetInterface(this);

    this._private.boundOnResize = this._onResize.bind(this);
    addEventListener('resize', this._private.boundOnResize);
  }


  // PUBLIC


  destroy() {
    removeEventListener('resize', this._private.boundOnResize);
  }


  // PRIVATE


  _onResize(event) {
    if (this._private.currentTimeout) clearTimeout(this._private.currentTimeout);

    this._private.currentTimeout = setTimeout(() => {
      this.dispatchEvent(new Event(events.resize));
      this._private.currentTimeout = null;
    }, this._config.debounceTime);
  }
}
