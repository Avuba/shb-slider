import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';
import { default as SharedScope } from './SharedScope.js';
import { default as TouchToPush } from './TouchToPush.js';


let defaults = {
  config: {
    // main container for defining the boundaries of the scrollable area and
    // setting the event listeners. is expected to be a simple DOM node
    container: null,

    // array containing the moveable DOM nodes representing each slide
    slides: [],

    // decide what axis to allow scrolling on, gets translated into an array by
    // the class constructor
    axis: 'x',

    // allow scrolling beyond the edge of moveable
    overscroll: true,

    // maximum amount of pixels for touch-led overscrolling
    maxTouchOverscroll: 150,

    // how much time (in msec) it takes to bounce back
    bounceTime: 500,

    // the minimum amount of momentum which triggers a transition to the previous/next slide
    minMomentumForTransition: 20
  },

  private: {
    container: {
      height: 0,
      width: 0
    },
    // a single abstract moveable is used to represent the combined collection of slides
    moveable: {
      height: 0,
      width: 0,
      x: 0,
      y: 0
    },
    boundaries: {
      x: {
        axisStart: 0,
        isAxisEnd: 0
      },
      y: {
        axisStart: 0,
        isAxisEnd: 0
      }
    },
    overscroll: {
      x: {
        isAxisStart: false,
        isAxisEnd: false,
        px: 0
      },
      y: {
        isAxisStart: false,
        isAxisEnd: false,
        px: 0
      }
    },
    bounce: {
      x: {
        isActive: false,
        bounceStartTime: 0,
        bounceStartPosition: 0,
        bounceTargetPosition: 0
      },
      y: {
        isActive: false,
        bounceStartTime: 0,
        bounceStartPosition: 0,
        bounceTargetPosition: 0
      },
      isAnimatedScroll: false
    },
    axis: ['x'],
    currentSlideIndex: 0,
    currentMoveablePositionX: 0
  },

  state: {
    isTouchActive: false
  }
};


let topics = {
  refresh: 'main:refresh',
  destroy: 'main:destroy',
  freezeScroll: 'spaeti:freezeScroll'
};

let events = {
  positionChanged: 'positionChanged',
  slideChanged: 'slideChanged',
  animatedScrollEnd: 'animatedScrollEnd'
};

export default class Spaeti {
  constructor(config) {
    this._config = fUtils.cloneDeep(defaults.config);
    this._private = fUtils.cloneDeep(defaults.private);
    this._state = fUtils.cloneDeep(defaults.state);

    if (config) fUtils.mergeDeep(this._config, config);

    this.sharedScope = new SharedScope();
    this.touchToPush = new TouchToPush(config, this.sharedScope);

    this.events = events;
    utils.addEventDispatcher(this, this._config.container);

    this._subscribePubsubs();
    this._calculateParams();
    this._bindBounce();

    this._setSlideDimensions();
    this._resetSlidePositions();

    requestAnimationFrame(() => {
      this._updateSlidePositions();
    });
  }


  // PUBLIC


  refresh(config) {
    this.sharedScope.publish(topics.refresh, config);
  }


  destroy() {
    this.sharedScope.publish(topics.destroy);
  }


  scrollToSlide(slideIndex, shouldAnimate, animateTimeMillis) {
    this.scrollToPosition(slideIndex * -this._private.container.width, this._private.moveable.y, shouldAnimate, animateTimeMillis);
  }


  // instantly scrolls to a given position or nearest possible
  scrollToPosition(x, y, shouldAnimate, animateTimeMillis) {
    let position = { x: x, y: y },
      validPosition = { x: 0, y: 0 };

    this._forXY((xy) => {
      validPosition[xy] = position[xy];

      // check if coordinates are within bounds, constrain them otherwise
      if (validPosition[xy] > this._private.boundaries[xy].axisStart) {
        validPosition[xy] = this._private.boundaries[xy].axisStart;
      }
      else if (validPosition[xy] < this._private.boundaries[xy].axisEnd) {
        validPosition[xy] = this._private.boundaries[xy].axisEnd;
      }
    });

    if (shouldAnimate === true) {
      this._private.bounce.isAnimatedScroll = true;
      this._forXY((xy) => {
        this._startBounceOnAxis(xy, validPosition[xy], animateTimeMillis);
      });
    }
    else {
      this._updateCoords(validPosition);
    }
  }


  freezeScroll(shouldFreeze) {
    this.sharedScope.publish(topics.freezeScroll, shouldFreeze);
  }


  getBoundaries() {
    return fUtils.cloneDeep(this._private.boundaries);
  }


  // LIFECYCLE


  _subscribePubsubs() {
    this.sharedScope.subscribe('main:refresh', this._onRefresh.bind(this));
    this.sharedScope.subscribe('main:destroy', this._onDestroy.bind(this));

    this.sharedScope.subscribe('touchToPush:pushBy', this._onPushBy.bind(this));
    this.sharedScope.subscribe('touchToPush:finishTouchWithMomentum', this._onMomentum.bind(this));

    this.sharedScope.subscribe('touchToPush:touchstart', (event) => {
      this._state.isTouchActive = true;
      if (this._private.bounce.x.isActive || this._private.bounce.y.isActive) {
        this._stopBounce();
      }
    });

    this.sharedScope.subscribe('touchToPush:touchend', (event) => {
      this._state.isTouchActive = false;
      this._checkForBounceStart();
    });
  }


  _onRefresh(config) {
    if (config) fUtils.mergeDeep(this._config, config);
    this._private.axis = this._config.axis.split('');

    this._calculateParams();
    this._setSlideDimensions();
    this._resetSlidePositions();

    requestAnimationFrame(() => {
      this._updateSlidePositions();
    });
  }


  _onDestroy() {
    this._config.container = null;
    this._config.slides = null;
  }


  // COORDS AND MOVEMENT


  _onMomentum(momentum) {
    if (momentum.x.pxPerFrame < this._config.minMomentumForTransition) {
      return;
    }
    else {
      let targetPositionPx;

      // before calculating a target position, we also check if the we are in the first (or last)
      // slide and if the current slide is already bouncing from a transition in the same
      // direction as the momentum; so if the user's finger lifts when already transitioning to the
      // next slide, momentum is ignored (otherwise the total transition would be 2 slides)
      if (momentum.x.direction > 0
          && this._private.currentSlideIndex > 0
          && this._private.currentMoveablePositionX > 0) {
        targetPositionPx = (this._private.currentSlideIndex -1) * -this._private.container.width;
      }
      else if (momentum.x.direction < 0
          && this._private.currentSlideIndex < this._config.slides.length -1
          && this._private.currentMoveablePositionX < 0) {
        targetPositionPx = (this._private.currentSlideIndex +1) * -this._private.container.width;
      }

      if (fUtils.is(targetPositionPx)) this._startBounceOnAxis('x', targetPositionPx);
    }
  }


  _calculateParams() {
    this._private.container.width = this._config.container.clientWidth;
    this._private.container.height = this._config.container.clientHeight;

    // the virstual moveable is the width of the combined slides. we assume that each slide
    // has the same width and height as the container
    this._private.moveable.width = this._private.container.width * this._config.slides.length;
    this._private.moveable.height = this._private.container.height;

    // calculate the maximum and minimum coordinates for scrolling. these are used as boundaries for
    // determining overscroll status, initiating bounce (if allowed); and also to determine bounce
    // target position when overscrolling
    this._forXY((xy) => {
      let dimension = xy === 'x' ? 'width' : 'height';
      this._private.boundaries[xy].axisStart = 0;
      this._private.boundaries[xy].axisEnd   = this._private.container[dimension] - this._private.moveable[dimension];
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

        // check on axis start (left or top)
        if (pushBy[xy].direction > 0 && newCoordinates[xy] > boundaries[xy].axisStart) {
          multiplier = utils.easeLinear(Math.abs(newCoordinates[xy]), 1, -1, this._config.maxTouchOverscroll);
        }
        // check on axis end (right or bottom)
        else if (pushBy[xy].direction < 0 && newCoordinates[xy] < boundaries[xy].axisEnd) {
          let rightBottom = boundaries[xy].axisEnd - newCoordinates[xy];
          multiplier = utils.easeLinear(Math.abs(rightBottom), 1, -1, this._config.maxTouchOverscroll);
        }

        if (multiplier) {
          pxToAdd *= multiplier;
          newCoordinates[xy] = this._private.moveable[xy] + pxToAdd;
        }
      }

      // OVERSCROLLING IS NOT ALLOWED

      else {
        // check on axis start (left or top)
        if (newCoordinates[xy] > boundaries[xy].axisStart)
          newCoordinates[xy] = boundaries[xy].axisStart;
        // check on axis end (right or bottom)
        else if (newCoordinates[xy] < boundaries[xy].axisEnd)
          newCoordinates[xy] = boundaries[xy].axisEnd;
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
        overscroll[xy].isAxisStart = overscroll[xy].isAxisEnd = false;

        // check on axis start (left or top)
        if (newCoordinates[xy] > boundaries[xy].axisStart) {
          overscroll[xy].isAxisStart = true;
          overscroll[xy].px = newCoordinates[xy] - boundaries[xy].axisStart;
        }
        // check on axis end (right or bottom)
        else if (newCoordinates[xy] < boundaries[xy].axisEnd) {
          overscroll[xy].isAxisEnd = true;
          overscroll[xy].px = boundaries[xy].axisEnd - newCoordinates[xy];
        }
      }
    });

    // APPLY NEW COORDINATES AND DISPATCH EVENT

    if (this._private.moveable.x !== newCoordinates.x || this._private.moveable.y !== newCoordinates.y) {
      this._private.moveable.x = newCoordinates.x;
      this._private.moveable.y = newCoordinates.y;
      this._updateSlidePositions();

      let event = new Event(events.positionChanged);
      event.data = {
        positionPx: { x: this._private.moveable.x, y: this._private.moveable.y },
        positionPercent: {
          x: this._private.moveable.x / (this._private.moveable.width - this._private.container.width),
          y: this._private.moveable.y / (this._private.moveable.height - this._private.container.height)
        }
      };
      this.dispatchEvent(event);
    }
  }


  // DOM MANIPULATION


  // sets the dimension of all slides to fill up the container
  _setSlideDimensions() {
    this._config.slides.forEach((moveable) => {
      requestAnimationFrame(() => {
        moveable.style.width = '100%';
        moveable.style.height = '100%';
      });
    });
  }


  // sets the position of all slides to the left of the container, so they aren't visible
  _resetSlidePositions() {
    this._config.slides.forEach((moveable) => {
      requestAnimationFrame(() => {
        moveable.style.webkitTransform = `translate3d(${this._private.container.width}px, 0px, 0px)`;
      });
    });
  }


  _updateSlidePositions() {
    let updatedSlideIndex = Math.round(-this._private.moveable.x / this._private.container.width);

    // constrain the calculated index when overscrolling
    if (updatedSlideIndex < 0) {
      updatedSlideIndex = 0;
    }
    else if (updatedSlideIndex >= this._config.slides.length) {
      updatedSlideIndex = this._config.slides.length -1;
    }

    // the following is necessary because scrolled-out slides can still be left with a bit visible
    // inside the container area (if the animation is fast); so we detect slide transitions and make
    // sure the "old" (scrolled-out) slide is pushed off limits and nothing is left hanging out.
    // this behaviour is present in Android 6 Chrome (at least) but not on iOS 9.3.1 Safari
    if (updatedSlideIndex > this._private.currentSlideIndex && this._private.currentSlideIndex - 1 >= 0) {
      this._config.slides[this._private.currentSlideIndex - 1].style.webkitTransform = `translate3d(
        ${this._private.container.width}px, 0px, 0px)`;
    }
    else if (updatedSlideIndex < this._private.currentSlideIndex && this._private.currentSlideIndex + 1 < this._config.slides.length) {
      this._config.slides[this._private.currentSlideIndex + 1].style.webkitTransform = `translate3d(
        ${this._private.container.width}px, 0px, 0px)`;
    }

    if (updatedSlideIndex != this._private.currentSlideIndex) {
      let event = new Event(events.slideChanged);
      event.data = {
        previousIndex: this._private.currentSlideIndex,
        currentIndex: updatedSlideIndex
      };

      this._private.currentSlideIndex = updatedSlideIndex;
      this.dispatchEvent(event);
    }

    this._private.currentMoveablePositionX = this._private.moveable.x + (this._private.currentSlideIndex * this._private.container.width);

    // apply the transform to the current slide
    this._config.slides[this._private.currentSlideIndex].style.webkitTransform = `translate3d(
      ${this._private.currentMoveablePositionX}px, ${this._private.moveable.y}px, 0px)`;

    // apply the transform to the slide to the left
    if (this._private.currentSlideIndex > 0) {
      this._config.slides[this._private.currentSlideIndex -1].style.webkitTransform = `translate3d(
        ${this._private.currentMoveablePositionX - this._private.container.width}px, ${this._private.moveable.y}px, 0px)`;
    }

    // apply the transform to the slide to the right
    if (this._private.currentSlideIndex < this._config.slides.length -1) {
      this._config.slides[this._private.currentSlideIndex +1].style.webkitTransform = `translate3d(
        ${this._private.currentMoveablePositionX + this._private.container.width}px, ${this._private.moveable.y}px, 0px)`;
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
    if (!this._state.isTouchActive && !this._private.bounce[axis].isActive) {
      let targetPosition = this._getClosestBounceTargetOnAxis(axis);
      if (targetPosition !== this._private.moveable[axis]) {
        this._startBounceOnAxis(axis, targetPosition);
      }
    }
  }


  _startBounceOnAxis(axis, targetPositionPx, animateTimeMillis) {
    cancelAnimationFrame(this._private.currentFrame);

    let bounce = this._private.bounce;

    bounce[axis].isActive = true;
    bounce[axis].bounceStartPosition = this._private.moveable[axis];
    bounce[axis].bounceTargetPosition = targetPositionPx;
    bounce[axis].bounceStartTime = Date.now();
    bounce[axis].bounceAnimateTime = animateTimeMillis > 0 ? animateTimeMillis : this._config.bounceTime;
    this._private.currentFrame = requestAnimationFrame(this._private.boundBounce);
  }


  _runBounce() {
    let newCoordinates = {
      x: this._private.moveable.x,
      y: this._private.moveable.y
    };

    this._forXY((xy) => {
      if (this._private.bounce[xy].isActive) {
        let bounce = this._private.bounce,
          overscroll = this._private.overscroll,
          timePassed = Date.now() - bounce[xy].bounceStartTime;

        // CALCULATE NEW POSITION

        // we test how much time has passed and not the overscroll value.
        // testing the overscroll value (for zero or negative values)
        // doesn't make sense because:
        // a) exponential functions never really cross the axis;
        // b) some ease functions will cross the axes (spring-like effect).
        if (timePassed < bounce[xy].bounceAnimateTime) {
          newCoordinates[xy] = utils.easeOutCubic(
            timePassed,
            bounce[xy].bounceStartPosition,
            bounce[xy].bounceTargetPosition - bounce[xy].bounceStartPosition,
            bounce[xy].bounceAnimateTime);
        }
        else {
          // snap the moveable to it's target, un-flag bounce and overscroll
          newCoordinates[xy] = bounce[xy].bounceTargetPosition;
          bounce[xy].isActive = false;
          overscroll[xy].isAxisStart = overscroll[xy].isAxisEnd = false;
        }
      }
    });

    this._updateCoords(newCoordinates);

    if (this._private.bounce.x.isActive || this._private.bounce.y.isActive) {
      this._private.currentFrame = requestAnimationFrame(this._private.boundBounce);
    }
    else {
      this._stopBounce();
    }
  }


  _stopBounce() {
    this._private.bounce.x.isActive = this._private.bounce.y.isActive = false;
    cancelAnimationFrame(this._private.currentFrame);

    if (this._private.bounce.isAnimatedScroll) {
      this._private.bounce.isAnimatedScroll = false;
      this.dispatchEvent(new Event(events.animatedScrollEnd));
    }
  }


  // HELPERS


  // returns the closest bounce-to target on the given axis
  _getClosestBounceTargetOnAxis(axis) {
    let bounceTarget = this._private.moveable[axis];

    // check the outer boundaries of the moveable
    if (this._private.moveable[axis] > this._private.boundaries[axis].axisStart) {
      bounceTarget = this._private.boundaries[axis].axisStart;
    }
    else if (this._private.moveable[axis] < this._private.boundaries[axis].axisEnd) {
      bounceTarget = this._private.boundaries[axis].axisEnd;
    }
    // check the inner boundaries of the current moveable; only applies to x-axis
    else if (axis === 'x') {
      let targetLeft = this._private.currentSlideIndex * -this._private.container.width,
        targetRight = targetLeft - this._private.container.width;

      if (Math.abs(this._private.moveable[axis] - targetLeft) < this._private.container.width / 2) {
        bounceTarget = targetLeft;
      }
      else {
        bounceTarget = targetRight;
      }
    }

    return bounceTarget;
  }


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }
};
