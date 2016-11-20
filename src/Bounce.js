import { default as utils } from './utils.js';
import { default as lodash } from './lodash.js';


let defaults = {
  config: {
    bounceTime: 500
  },

  private: {
    startPosition: 0,
    currentPosition: 0,
    targetPosition: 0,
    animateTime: 0,
    startTime: 0
  },

  state: {
    isActive: false
  }
};


let events = {
  bounceStart: 'bounceStart',
  bounceBy: 'bounceBy',
  bounceEnd: 'bounceEnd'
};


export default class Bounce {
  constructor(config) {
    this._config = lodash.cloneDeep(defaults.config);
    this._private = lodash.cloneDeep(defaults.private);
    this._state = lodash.cloneDeep(defaults.state);

    if (config) lodash.merge(this._config, config);

    this._bindRunBounce();

    this.events = events;
    utils.addEventTargetInterface(this);
  }


  // PUBLIC


  startBounce(startPosition, targetPosition, animateTime) {
    cancelAnimationFrame(this._private.currentFrame);

    if (!this._state.isActive) this.dispatchEvent(new Event(events.bounceStart));
    this._state.isActive = true;

    this._private.startPosition = startPosition;
    this._private.currentPosition = startPosition;
    this._private.targetPosition = targetPosition;
    this._private.startTime = Date.now();
    this._private.animateTime = animateTime > 0 ? animateTime : this._config.bounceTime;

    this._private.currentFrame = requestAnimationFrame(this._private.boundRunBounce);
  }


  stopBounce() {
    if (this._state.isActive) {
      this._state.isActive = false;
      this.dispatchEvent(new Event(events.bounceEnd));
    }

    cancelAnimationFrame(this._private.currentFrame);
  }


  // PRIVATE


  _runBounce() {
    let shouldBounceEnd = false;

    if (this._state.isActive) {
      let timePassed = Date.now() - this._private.startTime;

      // we test the passed time instead of the position as:
      // - exponential functions never really cross the target
      // - some ease functions will cross the axes (spring-like effect).
      if (timePassed < this._private.animateTime) {
        this._private.currentPosition = utils.easeOutCubic(
          timePassed,
          this._private.startPosition,
          this._private.targetPosition - this._private.startPosition,
          this._private.animateTime);
      }
      // snap to target and tell bounce to end
      else {
        this._private.currentPosition = this._private.targetPosition;
        shouldBounceEnd = true;
      }

      this.dispatchEvent(new Event(events.bounceBy), this._private.currentPosition);
    }

    // check for this._state.isActive in addition to shouldBounceEnd as a fail-safe in case the
    // _runBounce() keeps on executing even after the bounce should have ended
    if (!shouldBounceEnd && this._state.isActive) {
      this._private.currentFrame = requestAnimationFrame(this._private.boundRunBounce);
    }
    else {
      this.stopBounce();
    }
  }


  _bindRunBounce() {
    this._private.boundRunBounce = this._runBounce.bind(this);
  }
}
