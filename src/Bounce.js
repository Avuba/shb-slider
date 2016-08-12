import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';


let defaults = {
  config: {
    axis: 'xy',
    bounceTime: 500,
  },

  private: {
    axis: ['x', 'y'],
    isActive: { x: false, y: false },
    startPosition: { x: 0, y: 0 },
    currentPosition: { x: 0, y: 0 },
    targetPosition: { x: 0, y: 0 },
    animateTime: { x: 0, y: 0 },
    startTime: { x: 0, y: 0 }
  }
}


let events = {
  bounceStart: 'bounceStart',
  bounceStartOnAxis: 'bounceStartOnAxis',
  bounceToPosition: 'bounceToPosition',
  bounceEnd: 'bounceEnd',
  bounceEndOnAxis: 'bounceEndOnAxis'
};


export default class Bounce {
  constructor(config) {
    this._config = fUtils.cloneDeep(defaults.config);
    this._private = fUtils.cloneDeep(defaults.private);

    if (config) fUtils.mergeDeep(this._config, config);
    this._private.axis = this._config.axis.split('');

    this._bindBounce();

    this.events = events;
    utils.addEventTargetInterface(this);
  }


  // PUBLIC


  bounceToTarget(startPosition, targetPosition, animateTime) {
    this._forXY((xy) => {
      this._startBounceOnAxis(xy, startPosition[xy], targetPosition[xy], animateTime);
    });
  }


  stop() {
    this._stopBounce();
  }


  // LIFECYCLE


  _bindBounce() {
    this._private.boundBounce = this._runBounce.bind(this);
  }


  _startBounceOnAxis(axis, startPositionPx, targetPositionPx, animateTime) {
    cancelAnimationFrame(this._private.currentFrame);

    if (!this._private.isActive.x && !this._private.isActive.y) {
      this.dispatchEvent(new Event(events.bounceStart));
    }

    this._private.isActive[axis] = true;
    this._private.startPosition[axis] = startPositionPx;
    this._private.currentPosition[axis] = startPositionPx;
    this._private.targetPosition[axis] = targetPositionPx;
    this._private.startTime[axis] = Date.now();
    this._private.animateTime[axis] = animateTime > 0 ? animateTime : this._config.bounceTime;

    this.dispatchEventWithData(new Event(events.bounceStartOnAxis), { axis: axis });

    this._private.currentFrame = requestAnimationFrame(this._private.boundBounce);
  }


  _runBounce() {
    this._forXY((xy) => {
      if (this._private.isActive[xy]) {
        let timePassed = Date.now() - this._private.startTime[xy];

        // CALCULATE NEW POSITION

        // we test how much time has passed and not the position.
        // testing the position doesn't make sense because:
        // a) exponential functions never really cross the axis;
        // b) some ease functions will cross the axes (spring-like effect).
        if (timePassed < this._private.animateTime[xy]) {
          this._private.currentPosition[xy] = utils.easeOutCubic(
            timePassed,
            this._private.startPosition[xy],
            this._private.targetPosition[xy] - this._private.startPosition[xy],
            this._private.animateTime[xy]);
        }
        // bounce stops on this axis: snap to target, un-flag bounce, dispatch event
        else {
          this._private.currentPosition[xy] = this._private.targetPosition[xy];
          this._private.isActive[xy] = false;

          this.dispatchEventWithData(new Event(events.bounceEndOnAxis), { axis: xy });
        }
      }
    });

    this.dispatchEventWithData(new Event(events.bounceToPosition), this._private.currentPosition);

    if (this._private.isActive.x || this._private.isActive.y) {
      this._private.currentFrame = requestAnimationFrame(this._private.boundBounce);
    }
    else {
      this._stopBounce();
    }
  }


  _stopBounce() {
    this._forXY((xy) => {
      if (this._private.isActive[xy]) {
        this._private.isActive[xy] = false;
        this.dispatchEventWithData(new Event(events.bounceEndOnAxis), { axis: xy });
      }
    });

    cancelAnimationFrame(this._private.currentFrame);
    this.dispatchEvent(new Event(events.bounceEnd));
  }


  // HELPERS


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }
}
