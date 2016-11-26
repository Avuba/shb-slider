import { default as utils } from './utils/utils';
import { default as lodash } from './utils/lodash';
import { default as ease } from './utils/ease';


let defaults = {
  config: {
    animateTime: 500,
    easeAlg: 'easeOutCubic'
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
  animateStart: 'animateStart',
  animatePositionChange: 'animatePositionChange',
  animateEnd: 'animateEnd'
};


export default class Animate {
  constructor(config) {
    this._config = lodash.cloneDeep(defaults.config);
    this._private = lodash.cloneDeep(defaults.private);
    this._state = lodash.cloneDeep(defaults.state);

    if (config) lodash.merge(this._config, config);

    this._private.boundRunAnimate = this._runAnimate.bind(this);

    this.events = events;
    utils.addEventTargetInterface(this);
  }


  // PUBLIC


  start(startPosition, targetPosition, animateTime, easeAlg) {
    cancelAnimationFrame(this._private.currentFrame);

    if (!this._state.isActive) this.dispatchEvent(new Event(events.animateStart));
    this._state.isActive = true;

    this._private.startPosition = startPosition;
    this._private.currentPosition = startPosition;
    this._private.targetPosition = targetPosition;

    this._private.startTime = Date.now();
    this._private.animateTime = animateTime > 0 ? animateTime : this._config.animateTime;
    this._private.easeAlg = easeAlg && ease[easeAlg] ? ease[easeAlg] : ease[this._config.easeAlg];

    this._private.currentFrame = requestAnimationFrame(this._private.boundRunAnimate);
  }


  stop() {
    if (this._state.isActive) {
      this._state.isActive = false;
      this.dispatchEvent(new Event(events.animateEnd));
    }

    cancelAnimationFrame(this._private.currentFrame);
  }


  // PRIVATE


  _runAnimate() {
    let shouldAnimateEnd = false;

    if (this._state.isActive) {
      let timePassed = Date.now() - this._private.startTime;

      // continue if time has not run out and the target position hasn't been reached
      if (timePassed < this._private.animateTime
          && Math.abs(this._private.targetPosition - this._private.currentPosition) > 0.5) {
        this._private.currentPosition = this._private.easeAlg(
          timePassed,
          this._private.startPosition,
          this._private.targetPosition - this._private.startPosition,
          this._private.animateTime);
      }
      // snap to target and tell animate to end otherwise
      else {
        this._private.currentPosition = this._private.targetPosition;
        shouldAnimateEnd = true;
      }
    }

    this.dispatchEvent(new Event(events.animatePositionChange), this._private.currentPosition);

    // check for this._state.isActive in addition to shouldAnimateEnd as a fail-safe in case the
    // _runAnimate() keeps on executing even after the animate should have ended
    if (!shouldAnimateEnd && this._state.isActive) {
      this._private.currentFrame = requestAnimationFrame(this._private.boundRunAnimate);
    }
    else {
      this.stop();
    }
  }
}
