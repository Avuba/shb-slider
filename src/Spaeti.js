import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';
import { default as SharedScope } from './SharedScope.js';
import { default as TouchToPush } from './TouchToPush.js';
import { default as Momentum } from './Momentum.js';


let defaults = {
  config: {
    // main container for defining the boundaries of the scrollable area and
    // setting the event listeners. is expected to be a simple DOM node
    container: null,

    // array containing the moveable DOM nodes representing each page/card
    moveables: [],

    // decide what axis to allow scrolling on, gets translated into an array by
    // the class constructor
    axis: 'x',

    // allow scrolling beyond the edge of moveable
    overscroll: true,

    // maximum amount of pixels for touch-led overscrolling
    maxTouchOverscroll: 300,

    // maximum amount of pixels for momentum-led overscrolling
    maxMomentumOverscroll: 100,

    // how much time (in msec) it takes to bounce back
    bounceTime: 500,

    // the minimum value under which momentum is stopped during bounce
    minPxPerFrameWhileMomentum: 3
  },

  private: {
    container: {
      height: 0,
      width: 0
    },
    // a single abstract moveable is used to represent the current page
    moveable: {
      height: 0,
      width: 0,
      x: 0,
      y: 0
    },
    boundaries: {
      x: {
        axisStart: 0,
        axisEnd: 0,
        isSmallerThanContainer: false
      },
      y: {
        axisStart: 0,
        axisEnd: 0,
        isSmallerThanContainer: false
      }
    },
    overscroll: {
      x: {
        axisStart: false,
        axisEnd: false,
        px: 0,
        isBounceActive: false,
        bounceStartTime: 0,
        bounceStartPosition: 0
      },
      y: {
        axisStart: false,
        axisEnd: false,
        px: 0,
        isBounceActive: false,
        bounceStartTime: 0,
        bounceStartPosition: 0
      }
    },
    axis: ['x'],
    axisStartEnd: ['axisStart', 'axisEnd'],
    currentMoveableIndex: 0
  },

  state: {
    isTouchActive: false,
    momentum: { x: false, y: false }
  }
}


let topics = {
  refresh: 'main:refresh',
  destroy: 'main:destroy',
  positionManuallySet: 'spaeti:positionManuallySet',
  positionStableOnAxis: 'spaeti:positionStableOnAxis',
  freezeScroll: 'spaeti:freezeScroll'
};


let events = {
  positionChanged: 'wegbier:positionChanged'
};


export default class Spaeti {
  constructor(config) {
    this._config = fUtils.cloneDeep(defaults.config);
    this._private = fUtils.cloneDeep(defaults.private);
    this._state = fUtils.cloneDeep(defaults.state);

    if (config) fUtils.mergeDeep(this._config, config);

    this.sharedScope = new SharedScope();
    this.touchToPush = new TouchToPush(config, this.sharedScope);
    this.momentum = new Momentum(config, this.sharedScope);

    this._subscribePubsubs();
    this._calculateParams();
    this._bindBounce();

    this._config.moveables.forEach((moveable) => {
      console.debug(moveable);
    });

    this._resetDOMNodePositions();
    this._updateDOMNodePositions();
  }


  // PUBLIC


  refresh(config) {
    this.sharedScope.publish(topics.refresh, config);
  }


  destroy() {
    this.sharedScope.publish(topics.destroy);
  }


  // instantly scrolls to a given pos = {x, y} (or nearest possible).
  scrollTo(position) {
    this.spaeti.setMoveablePosition(position);
  }


  freezeScroll(shouldFreeze) {
    this.sharedScope.publish(topics.freezeScroll, shouldFreeze);
  }


  getBoundaries() {
    return fUtils.cloneDeep(this._private.boundaries);
  }


  setMoveablePosition(position) {
    let validPosition = {
      x: 0,
      y: 0
    };

    this.sharedScope.publish(topics.positionManuallySet);

    this._forXY((xy) => {
      // check if coordinates are within bounds, constrain them otherwise
      if (position[xy] > this._private.boundaries[xy].axisStart) {
        validPosition[xy] = this._private.boundaries[xy].axisStart;
      } else if (position[xy] < this._private.boundaries[xy].axisEnd) {
        validPosition[xy] = this._private.boundaries[xy].axisEnd;
      } else {
        validPosition[xy] = position[xy];
      }
    });

    // apply changes
    this._updateCoords(validPosition);
  }


  // LIFECYCLE


  _subscribePubsubs() {
    this.sharedScope.subscribe('main:refresh', this._onRefresh.bind(this));
    this.sharedScope.subscribe('main:destroy', this._onDestroy.bind(this));

    this.sharedScope.subscribe('momentum:pushBy', this._onPushBy.bind(this));
    this.sharedScope.subscribe('touchToPush:pushBy', this._onPushBy.bind(this));

    this.sharedScope.subscribe('touchToPush:touchstart', (event) => {
      this._state.isTouchActive = true;

      // kill event to avoid unwanted touch interactions with potential elements
      // inside of moveable
      if (this._private.overscroll.x.isBounceActive || this._private.overscroll.y.isBounceActive) {
        utils.stopEvent(event);
        this._stopBounce();
      }
    });

    this.sharedScope.subscribe('touchToPush:touchend', (event) => {
      this._state.isTouchActive = false;
      // wait for a potential momentum push to kick in
      setTimeout(this._checkForBounceStart.bind(this), 10);
    });

    this.sharedScope.subscribe('momentum:stop', (event) => {
      this._state.momentum.x = this._state.momentum.y = false;
      this._checkForBounceStart();
    });

    this.sharedScope.subscribe('momentum:startedOnAxis', (axis) => {
      this._state.momentum[axis] = true;
    });

    this.sharedScope.subscribe('momentum:stoppedOnAxis', (axis) => {
      this._state.momentum[axis] = false;
      this._checkForBounceStart(axis);
    });

    this.sharedScope.subscribe('wegbier:freezeScroll', (shouldFreeze) => {
      if (shouldFreeze) {
        // publish positionStable so that momentum stops
        this._forXY((xy) => {
          this.sharedScope.publish(topics.positionStableOnAxis, xy);
        });
      }
    });
  }


  _resetDOMNodePositions() {
    this._config.moveables.forEach((moveable) => {
      moveable.style.webkitTransform = 'translate3d(' + this._private.moveable.width + 'px, ' + 0 + 'px, 0px)';
    });
  }


  _onRefresh(config) {
    if (config) fUtils.mergeDeep(this._config, config);
    this._private.axis = this._config.axis.split('');
    this._calculateParams();

    // we reset the moveable's position because certain changes (for instance,
    // dimensions of container or moveable) may cause inconsistencies on display
    this._updateCoords({x: 0, y: 0});
  }


  _onDestroy() {
    this._config.container = null;
  }


  // COORDS RELATED


  _calculateParams() {
    this._private.container.width = this._config.container.clientWidth;
    this._private.container.height = this._config.container.clientHeight;

    // TODO remove
    // this._private.moveable.width = this._config.moveable.clientWidth;
    // this._private.moveable.height = this._config.moveable.clientHeight;
    this._private.moveable.width = this._config.moveables[0].clientWidth;
    this._private.moveable.height = this._config.moveables[0].clientHeight;

    // calculate the maximum and minimum coordinates for scrolling. these are
    // used as boundaries for determining overscroll status, initiating bounce
    // (if allowed); or when bouncing back, to determine where bounce should end
    this._forXY((xy) => {
      let dimension = xy === 'x' ? 'width' : 'height';

      // for a moveable smaller than the container, the boundaries are the same
      // for both extremities: up/left. as result, the moveable has a single
      // anchor/snap point, and can't be scrolled (on this axis)
      if (this._private.moveable[dimension] < this._private.container[dimension]) {
        this._private.boundaries[xy].axisStart = 0;
        this._private.boundaries[xy].axisEnd   = 0;
      }
      // otherwise, start and end boundaries are different and the moveable can
      // be scrolled between them (on this axis)
      else {
        this._private.boundaries[xy].axisStart = 0;
        this._private.boundaries[xy].axisEnd   = this._private.container[dimension] - this._private.moveable[dimension];
      }
    });
  }


  _onPushBy(pushBy) {
    let newCoordinates = {
        x: this._private.moveable.x,
        y: this._private.moveable.y
      },
      boundaries = this._private.boundaries;

    this._forXY((xy) => {
      let pxToAdd = pushBy[xy].px * pushBy[xy].direction;

      newCoordinates[xy] = this._private.moveable[xy] + pxToAdd;

      // OVERSCROLLING IS ALLOWED

      if (this._config.overscroll) {
        let multiplier;

        // for non-touch pushes (i.e. momentum) we use a smaller overscroll
        // maximum, so that the momentum is reduced (and stopped) earlier.
        // this gets us closer to the iOS behaviour
        let maxOverscroll = this._state.isTouchActive ? this._config.maxTouchOverscroll : this._config.maxMomentumOverscroll;

        // check on axis start (left or top)
        if (pushBy[xy].direction > 0 && newCoordinates[xy] > boundaries[xy].axisStart) {
          multiplier = utils.easeLinear(Math.abs(newCoordinates[xy]), 1, -1, maxOverscroll);
        }
        // check on axis end (right or bottom)
        else if (pushBy[xy].direction < 0 && newCoordinates[xy] < boundaries[xy].axisEnd) {
          let rightBottom = boundaries[xy].axisEnd - newCoordinates[xy];
          multiplier = utils.easeLinear(Math.abs(rightBottom), 1, -1, maxOverscroll);
        }

        if (multiplier) {
          pxToAdd *= multiplier;
          newCoordinates[xy] = this._private.moveable[xy] + pxToAdd;
        }

        if (this._state.momentum[xy]
          && Math.abs(pxToAdd) < this._config.minPxPerFrameWhileMomentum
          && (this._private.overscroll[xy].axisStart || this._private.overscroll[xy].axisEnd)) {
          this.sharedScope.publish(topics.positionStableOnAxis, xy);
        }
      }

      // OVERSCROLLING IS NOT ALLOWED

      else {
        // check on axis start (left or top)
        if (newCoordinates[xy] > boundaries[xy].axisStart) {
          newCoordinates[xy] = boundaries[xy].axisStart;
          this.sharedScope.publish(topics.positionStableOnAxis, xy);
        }
        // check on axis end (right or bottom)
        else if (newCoordinates[xy] < boundaries[xy].axisEnd) {
          newCoordinates[xy] = boundaries[xy].axisEnd;
          this.sharedScope.publish(topics.positionStableOnAxis, xy);
        }
      }
    });

    this._updateCoords(newCoordinates);
  }


  _updateCoords(newCoordinates) {
    this._forXY((xy) => {

      // DEAL WITH OVERSCROLLING

      if (this._config.overscroll) {
        let overscroll = this._private.overscroll,
          boundaries = this._private.boundaries;

        // reset
        overscroll[xy].axisStart = overscroll[xy].axisEnd = false;

        // check on axis start (left or top)
        if (newCoordinates[xy] > boundaries[xy].axisStart) {
          overscroll[xy].axisStart = true;
          overscroll[xy].px = newCoordinates[xy] - boundaries[xy].axisStart;
        }
        // check on axis end (right or bottom)
        else if (newCoordinates[xy] < boundaries[xy].axisEnd) {
          overscroll[xy].axisEnd = true;
          overscroll[xy].px = boundaries[xy].axisEnd - newCoordinates[xy];
        }
      }
    });

    // APPLY NEW COORDINATES AND DISPATCH EVENT

    if (this._private.moveable.x != newCoordinates.x || this._private.moveable.y != newCoordinates.y) {
      this._private.moveable.x = newCoordinates.x;
      this._private.moveable.y = newCoordinates.y;

      this._updateDOMNodePositions();
    }
  }


  _updateDOMNodePositions() {
    this._config.moveables[this._private.currentMoveableIndex].style.webkitTransform = 'translate3d(' + this._private.moveable.x + 'px, ' + this._private.moveable.y + 'px, 0px)';
    //this._config.moveables[this._private.currentMoveableIndex].style.webkitTransform = 'translate3d(50px, ' + this._private.moveable.y + 'px, 0px)';


    if (this._private.currentMoveableIndex > 0) {
      this._config.moveables[this._private.currentMoveableIndex -1].style.webkitTransform = 'translate3d(' + (this._private.moveable.x - this._private.moveable.width) + 'px, ' + this._private.moveable.y + 'px, 0px)';
    }

    if (this._private.currentMoveableIndex < this._config.moveables.length -1) {
      console.log("zamn " + (this._private.moveable.x + this._private.moveable.width));
      this._config.moveables[this._private.currentMoveableIndex +1].style.webkitTransform = 'translate3d(' + (this._private.moveable.x + this._private.moveable.width) + 'px, ' + this._private.moveable.y + 'px, 0px)';
      //this._config.moveables[this._private.currentMoveableIndex +1].style.webkitTransform = 'translate3d(30px, ' + this._private.moveable.y + 'px, 0px)';
      console.debug(this._config.moveables[this._private.currentMoveableIndex +1]);
    }
  }


  // BOUNCE


  _bindBounce() {
    this._private.boundBounce = this._runBounce.bind(this);
  }


  _checkForBounceStart() {
    this._forXY((xy) => {
      this._checkForBounceStartOnAxis(xy);
    });
  }


  _checkForBounceStartOnAxis(axis) {
    let overscroll = this._private.overscroll;

    if (!this._state.isTouchActive
      && !this._state.momentum[axis]
      && (overscroll[axis].axisStart || overscroll[axis].axisEnd)) {
      this._startBounceOnAxis(axis);
    }
  }


  _startBounceOnAxis(axis) {
    cancelAnimationFrame(this._private.currentFrame);

    let overscroll = this._private.overscroll;

    if (!this._private.overscroll[axis].isBounceActive) {
      this._private.overscroll[axis].isBounceActive = true;

      overscroll[axis].bounceStartTime = Date.now();
      overscroll[axis].bounceStartPosition = overscroll[axis].px;
    }

    this._private.currentFrame = requestAnimationFrame(this._private.boundBounce);
  }


  _runBounce() {
    let newCoordinates = {
      x: this._private.moveable.x,
      y: this._private.moveable.y
    };

    this._forXY((xy) => {
      if (this._private.overscroll[xy].isBounceActive) {
        let overscroll = this._private.overscroll,
          timePassed = Date.now() - overscroll[xy].bounceStartTime;

        // CALCULATE NEW OVERSCROLL POSITION

        let overscrollAmount = utils.easeOutCubic(
          timePassed,
          overscroll[xy].bounceStartPosition,
          -overscroll[xy].bounceStartPosition,
          this._config.bounceTime);

        // APPLY NEW OVERSCROLL POSITION

        // we test how much time has passed and not the overscroll value.
        // testing the overscroll value (for zero or negative values)
        // doesn't make sense because:
        // a) exponential functions never really cross the axis;
        // b) some ease functions will cross the axes (spring-like effect).
        if (timePassed < this._config.bounceTime) {
          if (overscroll[xy].axisStart) {
            newCoordinates[xy] = this._private.boundaries[xy].axisStart + overscrollAmount;
          } else if (overscroll[xy].axisEnd) {
            newCoordinates[xy] = this._private.boundaries[xy].axisEnd - overscrollAmount;
          }
        } else {
          // stop bounce and snap the moveable to it's boundaries
          if (overscroll[xy].axisStart) {
            overscroll[xy].axisStart = false;
            newCoordinates[xy] = this._private.boundaries[xy].axisStart;
          } else if (overscroll[xy].axisEnd) {
            overscroll[xy].axisEnd = false;
            newCoordinates[xy] = this._private.boundaries[xy].axisEnd;
          }
          this._private.overscroll[xy].isBounceActive = false;
        }
      }
    });

    this._updateCoords(newCoordinates);

    if (this._private.overscroll.x.isBounceActive || this._private.overscroll.y.isBounceActive) {
      this._private.currentFrame = requestAnimationFrame(this._private.boundBounce);
    } else {
      this._stopBounce();
    }
  }


  _stopBounce() {
    this._private.overscroll.x.isBounceActive = this._private.overscroll.y.isBounceActive = false;
    cancelAnimationFrame(this._private.currentFrame);
  }


  // HELPERS


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }


  _forStartEnd(toExecute) {
    this._private.axisStartEnd.forEach(toExecute);
  }
};
