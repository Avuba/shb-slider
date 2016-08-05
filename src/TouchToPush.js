import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';


const defaults = {
  config: {
    // main container for defining the boundaries of the scrollable area and
    // setting the event listeners. is expected to be a simple DOM node
    container: null,

    // capture touch events before they can reach other DOM nodes
    capture: false,

    // allow momentum based scrolling after touchend
    momentum: true,

    // decide what axis to allow scrolling on, gets translated into an array by
    // the class constructor
    axis: 'xy',

    // lock movement in one direction. relevant if more touch/scroll libraries
    // are at the same spot and only the locked element should move
    lock: false,

    // don't trigger momentum scrolling in case the distance between touchstart
    // and touchend is less than minPxForMomentum
    minPxForMomentum: 3,

    // maximal number of points we check for calculating the speed of momentum
    // on touchend
    maxPointsForMomentum: 3,

    // if the time between the last touchmove event and touchend is larger than
    // this value, we don't start the momentum
    maxTimeDiffForMomentum: 66
  },

  private: {
    isEnabled: true,
    boundHandlers: {},
    ignoreMovements: false,
    moveCount: 0,
    startPoint: null,
    path: {
      x: [],
      y: []
    },
    speed: {
      x: [],
      y: []
    },
    timestamps: {
      start: 0,
      move: 0,
      end: 0
    },
    direction: {
      x: 0, // 1 = left to right, -1 = right to left
      y: 0 // 1 = top to bottom, -1 = bottom to top
    },
    prevDirection: {
      x: 0,
      y: 0
    },
    axis: ['x', 'y']
  },

  state: {
    isTouchActive: false
  }
};


const events = {
  pushBy: 'pushBy',
  touchstart: 'touchstart',
  touchend: 'touchend',
  momentum: 'momentum'
};


export default class TouchToPush {
  constructor(config) {
    this.events = events;

    this._config = fUtils.cloneDeep(defaults.config);
    this._private = fUtils.cloneDeep(defaults.private);
    this._state = fUtils.cloneDeep(defaults.state);

    if (config) fUtils.mergeDeep(this._config, config);

    this._private.axis = this._config.axis.split('');
    // lock is not possible in case the movement should follow two axis
    if (this._private.axis.length > 1) this._config.lock = false;
    // lock forces capture to be true
    if (this._config.lock) this._config.capture = true;

    utils.addEventTargetInterface(this);

    this._bindEvents();
  }


  // PUBLIC


  setEnabled(shouldEnable) {
    this._private.isEnabled = shouldEnable;

    if (!this._private.isEnabled && this._state.isTouchActive) {
      this._forXY((xy) => {
        this._private.path[xy].length = 0;
        this._private.speed[xy].length = 0;
      });

      this._state.isTouchActive = false;

      // publish a touchend event so that subscribers aren't left under the impression that there is
      // still a meaningful touch hanging
      // TODO remove
      //this.sharedScope.publish(topics.touchend);
      this.dispatchEvent(new Event(events.touchend));
    }
  }


  destroy() {
    this._unbindEvents();
    // TODO remove, this isn't the eventTarget's responsibility
    /*
    fUtils.forEach(this.listeners, (type) => {
      fUtils.forEach(type, (callback) => {
        this.removeEventListener(type, callback);
      });
    });
    */
    this._config.container = null;
  }


  // TOUCH RELATED


  _bindEvents() {
    this._private.boundHandlers = {
      touchstart: this._onTouchStart.bind(this),
      touchmove: this._onTouchMove.bind(this),
      touchend: this._onTouchEnd.bind(this),
      touchcancel: this._onTouchCancel.bind(this)
    };

    fUtils.forEach(this._private.boundHandlers, (handler, event) => {
      this._config.container.addEventListener(event, handler, this._config.capture);
    });
  }


  _unbindEvents() {
    fUtils.forEach(this._private.boundHandlers, (handler, event) => {
      this._config.container.removeEventListener(event, handler, this._config.capture);
    });
  }


  _onTouchStart(event) {
    event.preventDefault();
    if (!this._private.isEnabled) return;

    this._state.isTouchActive = true;
    // TODO remove
    // this.sharedScope.publish(topics.touchstart, event);
    this.dispatchEvent(new Event(events.touchstart));

    let newTouchPoint = this._eventToPoint(event);
    this._private.startPoint = newTouchPoint;
    this._private.timestamps.start = this._private.timestamps.move = Date.now();
    this._private.ignoreMovements = false;
    this._private.moveCount = 0;

    this._forXY((xy) => {

      // RESET PREVIOUS TOUCH FLOW

      this._private.path[xy].length = 0;
      this._private.speed[xy].length = 0;

      this._private.direction[xy] = 0;
      this._private.prevDirection[xy] = 0;

      // START NEW TOUCH FLOW

      this._private.path[xy].push(newTouchPoint[xy]);
    });
  }


  _onTouchMove(event) {
    event.preventDefault();
    if (!this._private.isEnabled) return;

    if (this._private.ignoreMovements) return;

    let pushBy = {
        x: { direction: 0, px: 0 },
        y: { direction: 0, px: 0 }
      },
      newDirection = {},
      newTimeStamp = Date.now(),
      newTouchPoint = this._eventToPoint(event),
      timeDiff = newTimeStamp - this._private.timestamps.move;

    this._forXY((xy) => {

      // CALCULATE AND STORE PARAMTERS FOR FURTHER PROCESSING

      let relativeDelta = newTouchPoint[xy] - fUtils.lastPosition(this._private.path[xy]);
      this._private.path[xy].push(newTouchPoint[xy]);
      this._private.speed[xy].push({
        px: Math.abs(relativeDelta),
        ms: timeDiff
      });

      // SET DIRECTION

      // relativeDelta === 0 usually happens when the user changes direction and
      // the finger remains at the same place for a few milliseconds. we asume a
      // direction change and simple invert the direction
      if (relativeDelta === 0) {
        newDirection[xy] = this._private.direction[xy] * -1;
      }
      // we calculate the direction based on the delta value otherwise
      else {
        newDirection[xy] = relativeDelta < 0 ? -1 : 1;
      }

      // PROCSS DIRECTION CHANGE

      // check if direction has changed and update the movement related
      // parameters if yes. prevDirection !== 0 helps avoiding changing the
      // direction on the first call of the 'touchmove' event
      if (newDirection[xy] !== this._private.direction[xy]
          && this._private.prevDirection[xy] !== 0
            && this._private.prevDirection[xy] !== -0) {
        // clear all previously stored values as they are now invalid
        this._private.path[xy].length = 0;
        this._private.speed[xy].length = 0;

        // start touch path again with current point as origin
        this._private.path[xy].push(newTouchPoint[xy]);
      }

      // COMMIT VALUES TO PUSHBY OBJECT

      pushBy[xy].direction = newDirection[xy];
      pushBy[xy].px = Math.abs(relativeDelta);
    });

    this._private.prevDirection = this._private.direction
    this._private.direction = newDirection;
    this._private.timestamps.move = newTimeStamp;

    // if the movement is locked to one direction, we need to figure out if:
    //
    // - #1: the finger has succesfully followed this direction so far and
    // therfore all other potential move listeners need to be blocked (which
    // means other scroll libraries at the same spot will not get triggered)
    //
    // or:
    //
    // - #2: the finger has not followed this direction so far and therfore all
    // move events need to be ignored (therfore giving other scroll libraries at
    // the same spot the chance to capture the move event)
    if (this._config.lock) {
      // stop event propagation in case of lock === true and therefore block the
      // event for all other potential listerns. if ignoreMovements === true,
      // this section does not get entered at all and therefore stopEvent() will
      // not get triggered
      utils.stopEvent(event);

      // only enter the following area in case the moveCount is still below 2,
      // ignore the area and publish the push event if otherwise
      if (this._private.moveCount < 2) {
        // count the amount of move events we've received so far. a minimum of
        // 2 is required to make an accurate assumpation in what direction the
        // user moves his finger, don't proceed otherwise
        this._private.moveCount++;
        if (this._private.moveCount < 2) return;

        let targetAxis = this._private.axis[0],
          oppositeAxis = targetAxis === 'x' ? 'y' : 'x',
          distanceOnTargetAxis = Math.abs(newTouchPoint[targetAxis] - this._private.startPoint[targetAxis]),
          distanceOnOppositeAxis =  Math.abs(newTouchPoint[oppositeAxis] - this._private.startPoint[oppositeAxis]);

        // ignore all further events in case the movement of the finger has not
        // followed the locked direction
        if (distanceOnOppositeAxis > distanceOnTargetAxis) this._private.ignoreMovements = true;
      }
    }

    // TODO remove
    // this.sharedScope.publish(topics.pushBy, pushBy);
    let eventPushBy = new Event(events.pushBy);
    eventPushBy.data = pushBy;
    this.dispatchEvent(eventPushBy);
  }


  _onTouchEnd(event) {
    event.preventDefault();
    if (!this._private.isEnabled) return;

    // if another finger is still touching the target, we start a new path
    // instead of ending the touch sequence
    if (event.targetTouches.length > 0) {
      let newTouchPoint = this._eventToPoint(event);
      this._forXY((xy) => {
        this._private.path[xy].length = 0;
        this._private.speed[xy].length = 0;
        this._private.path[xy].push(newTouchPoint[xy]);
      });
      return;
    }

    this._state.isTouchActive = false;
    // TODO remove
    // this.sharedScope.publish(topics.touchend, event);
    this.dispatchEvent(new Event(events.touchend));

    if (!this._config.momentum) return;
    if (this._private.ignoreMovements) return;
    if (Date.now() - this._private.timestamps.move > this._config.maxTimeDiffForMomentum) return;

    let momentum = {
      x: { direction: 0, pxPerFrame: 0 },
      y: { direction: 0, pxPerFrame: 0 }
    };

    this._forXY((xy) => {

      // CHECK IF DISTANCE FROM START IS LARGE ENOUGH

      let distanceFromStart = Math.abs(fUtils.lastPosition(this._private.path[xy]) - this._private.path[xy][0]);
      if (distanceFromStart < this._config.minPxForMomentum) return;

      // CALCULATE VELOCITY

      // we try to determine the speed of momentum by calculating the average
      // scroll speed of the last maxPointsForMomentum touchmove events. we
      // choose less pointsToConsider in case the last user interaction had less
      // than maxPointsForMomentum touchmove events
      let speedPoints = this._private.speed[xy],
        pointsToConsider = speedPoints.length < this._config.maxPointsForMomentum ? speedPoints.length : this._config.maxPointsForMomentum,
        avgPxPerFrame = 0;

      // calculate the average values by iterating of the 'speedPoints' array
      // within the range of 'pointsToConsider'
      for (var i = speedPoints.length - 1; i >= speedPoints.length - pointsToConsider; i--) {
        avgPxPerFrame = avgPxPerFrame + (speedPoints[i].px / pointsToConsider);
      }

      // COMMIT VALUES TO VELOCITY OBJECT

      momentum[xy].direction = this._private.direction[xy];
      momentum[xy].pxPerFrame = avgPxPerFrame;
    });

    // TODO delete
    // this.sharedScope.publish(topics.finishTouchWithMomentum, momentum);
    let eventMomentum = new Event(events.momentum);
    eventMomentum.data = momentum;
    this.dispatchEvent(eventMomentum);
  }


  _onTouchCancel(event) {
    event.preventDefault();
    if (!this._private.isEnabled) return;

    this._state.isTouchActive = false;
  }


  // HELPERS


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }


  _eventToPoint(event) {
    return {
      x: event.touches[0].pageX,
      y: event.touches[0].pageY
    }
  }
};
