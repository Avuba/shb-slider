import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';
import { default as SharedScope } from './SharedScope.js';
import { default as TouchToPush } from './TouchToPush.js';
import { default as PushToCoords } from './PushToCoords.js';
import { default as Momentum } from './Momentum.js';


let topics = {
  refresh: 'main:refresh',
  destroy: 'main:destroy',
  freezeScroll: 'wegbier:freezeScroll'
};


export default class Wegbier {
  constructor(config) {
    this.sharedScope = new SharedScope();
    this.touchToPush = new TouchToPush(config, this.sharedScope);
    this.pushToCoords = new PushToCoords(config, this.sharedScope);
    this.momentum = new Momentum(config, this.sharedScope);

    utils.addEventDispatcher(this, config.container);

    this.sharedScope.subscribe('sharedScope:dispatchEvent', (dispatch) => {
      let event = new Event(dispatch.eventName);
      event.data = dispatch.data;
      this.dispatchEvent(event);
    });
  }


  refresh(config) {
    this.sharedScope.publish(topics.refresh, config);
  }


  destroy() {
    this.sharedScope.publish(topics.destroy);
  }


  // instantly scrolls to a given pos = {x, y} (or nearest possible).
  scrollTo(position) {
    this.pushToCoords.setMoveablePosition(position);
  }


  freezeScroll(shouldFreeze) {
    this.sharedScope.publish(topics.freezeScroll, shouldFreeze);
  }


  getBoundaries() {
    return this.pushToCoords.getBoundaries();
  }
};
