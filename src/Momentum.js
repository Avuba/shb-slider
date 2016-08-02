import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';


let defaults = {
  config: {
    // maximum speed that can be reached via momentum
    maxPxPerFrame: 35,

    // stop momentum if it drops beneath this spead
    minPxPerFrame: 0.5,

    // speed to be subtracted from pxPerFrame per frame when momentum is active
    subtractMomentumPerFrame: 0.2,

    // decide what axis to allow scrolling on, gets translated into an array by
    // the class constructor
    axis: 'xy'
  },

  private: {
    boundMomentum: null,
    currentMomentum: null,
    currentFrame: null,
    axis: ['x', 'y']
  },

  state: {
    momentum: { x: false, y: false }
  }
};


let topics = {
  pushBy: 'momentum:pushBy',
  start: 'momentum:start',
  startedOnAxis: 'momentum:startedOnAxis',
  stoppedOnAxis: 'momentum:stoppedOnAxis',
  stop: 'momentum:stop'
};


export default class Momentum {
  constructor(config, sharedScope) {
    this.sharedScope = sharedScope;

    this._config = fUtils.cloneDeep(defaults.config);
    this._private = fUtils.cloneDeep(defaults.private);
    this._state = fUtils.cloneDeep(defaults.state);

    if (config) fUtils.mergeDeep(this._config, config);
    this._private.axis = this._config.axis.split('');

    this._subscribePubsubs();
    this._bindMomentum();
  }


  // LIFECYCLE


  _subscribePubsubs() {
    this.sharedScope.subscribe('main:destroy', this._onDestroy.bind(this));

    this.sharedScope.subscribe('pushToCoords:positionManuallySet', this._stopMomentum.bind(this));
    this.sharedScope.subscribe('touchToPush:finishTouchWithMomentum', this._startMomentum.bind(this));
    this.sharedScope.subscribe('pushToCoords:positionStableOnAxis', this._stopMomentumOnAxis.bind(this));

    this.sharedScope.subscribe('touchToPush:touchstart', (event) => {
      this._private.currentMomentum = null;

      // kill event to avoid unwanted touch interactions with potential elements
      // inside of moveable
      if (this._state.momentum.x || this._state.momentum.y) {
        utils.stopEvent(event);
        this._stopMomentum();
      }
    });
  }


  _onDestroy() {
    this._config.container = null;
  }


  // AUTOMATTED SCROLL RELATED


  _bindMomentum() {
    this._private.boundMomentum = this._runMomentum.bind(this);
  }


  _startMomentum(momentum) {
    // limit pixel per frame
    this._forXY((xy) => {
      if (momentum[xy].pxPerFrame > 0) {
        if (momentum[xy].pxPerFrame > this._config.maxPxPerFrame) momentum[xy].pxPerFrame = this._config.maxPxPerFrame;
        this._state.momentum[xy] = true;
        this.sharedScope.publish(topics.startedOnAxis, xy);
      }
    });

    this._private.currentMomentum = momentum;

    cancelAnimationFrame(this._private.currentFrame);
    this._private.currentFrame = requestAnimationFrame(this._private.boundMomentum);

    this.sharedScope.publish(topics.start);
  }


  _runMomentum() {
    let pushBy = {
        x: { direction: 0, px: 0 },
        y: { direction: 0, px: 0 }
      };

    // while momentum is running, currentMomentum might have been set to null
    // as result of a touchToPush:touchstart event, so we check it to be sure.
    if (this._private.currentMomentum) {
      this._forXY((xy) => {
        if (this._state.momentum[xy]) {
          if (this._private.currentMomentum[xy].pxPerFrame >= this._config.minPxPerFrame) {
            pushBy[xy].direction = this._private.currentMomentum[xy].direction;
            pushBy[xy].px = this._private.currentMomentum[xy].pxPerFrame;

            // decrease pxPerFrame to decrease scroll speed
            this._private.currentMomentum[xy].pxPerFrame -= this._config.subtractMomentumPerFrame;
          }
          else {
            this._stopMomentumOnAxis(xy);
          }
        }
      });
    }

    if (!this._state.momentum.x && !this._state.momentum.y) {
      this._stopMomentum();
    } else {
      this.sharedScope.publish(topics.pushBy, pushBy);
      this._private.currentFrame = requestAnimationFrame(this._private.boundMomentum);
    }
  }


  _stopMomentumOnAxis(axis) {
    if (this._private.currentMomentum && this._private.currentMomentum[axis].pxPerFrame > 0) {
      this._private.currentMomentum[axis].direction = 0;
      this._private.currentMomentum[axis].pxPerFrame = 0;
      this._state.momentum[axis] = false;
      
      this.sharedScope.publish(topics.stoppedOnAxis, axis);
    }
  }


  _stopMomentum() {
    this._state.momentum.x = this._state.momentum.y = false;
    cancelAnimationFrame(this._private.currentFrame);
    this.sharedScope.publish(topics.stop);
  }


  // HELPERS


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }
};
