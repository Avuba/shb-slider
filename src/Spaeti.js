import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';
import { default as TouchToPush } from './TouchToPush.js';
import { default as Bounce } from './Bounce.js';

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
    minMomentumForTransition: 5
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
      }
    },
    axis: ['x'],
    currentSlideIndex: 0,
    previousSlideIndex: -1,
    currentMoveablePositionX: 0
  },

  state: {
    isTouchActive: false
  }
};

let events = {
  positionChanged: 'positionChanged',
  positionStable: 'positionStable',
  slideChange: 'slideChange',
  slideChangeStart: 'slideChangeStart',
  slideChangeEnd: 'slideChangeEnd'
};

export default class Spaeti {
  constructor(config) {
    this._config = fUtils.cloneDeep(defaults.config);
    this._private = fUtils.cloneDeep(defaults.private);
    this._state = fUtils.cloneDeep(defaults.state);

    if (config) fUtils.mergeDeep(this._config, config);

    this.touchToPush = new TouchToPush(this._config);
    this.bounce = new Bounce(this._config);

    this.events = events;
    utils.addEventTargetInterface(this);

    this._calculateParams();
    this._subscribeToEvents();

    this._setupDomElements();
    this._resetSlidePositions();

    requestAnimationFrame(() => {
      this._updateSlidePositions();
    });
  }


  // PUBLIC


  refresh() {

  }


  destroy() {
    this.touchToPush.destroy();
  }


  freezeScroll(shouldFreeze) {
    this.touchToPush.setEnabled(!shouldFreeze);
  }


  // LIFECYCLE


  _subscribeToEvents() {
    this.touchToPush.addEventListener(this.touchToPush.events.pushBy, (event) => {
      this._onPushBy(event.data);
    });
  }


  // POSITION AND MOVEMENT


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
      this._private.boundaries[xy].axisEnd = this._private.container[dimension] - this._private.moveable[dimension];
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

      // the further you overscroll, the smaller is the displacement; we multiply the displacement
      // by a linear factor of the overscroll distance
      if (this._config.overscroll) {
        // check on axis start (left or top)
        if (pushBy[xy].direction > 0 && this._private.moveable[xy] > boundaries[xy].axisStart) {
          pxToAdd *= utils.easeLinear(Math.abs(this._private.moveable[xy]), 1, -1, this._config.maxTouchOverscroll);
        }
        // check on axis end (right or bottom)
        else if (pushBy[xy].direction < 0 && this._private.moveable[xy] < boundaries[xy].axisEnd) {
          let rightBottom = boundaries[xy].axisEnd - this._private.moveable[xy];
          pxToAdd *= utils.easeLinear(Math.abs(rightBottom), 1, -1, this._config.maxTouchOverscroll);
        }

        newCoordinates[xy] = this._private.moveable[xy] + pxToAdd;
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
        position: {
          x: this._private.moveable.x,
          y: this._private.moveable.y
        },
        percent: {
          x: this._private.moveable.x / (this._private.moveable.width - this._private.container.width),
          y: this._private.moveable.y / (this._private.moveable.height - this._private.container.height)
        }
      };
      this.dispatchEvent(event);
    }
  }


  // DOM MANIPULATION


  // sets the attributes of dom elements for use with the spaeti
  _setupDomElements() {
    requestAnimationFrame(() => {
      this._config.container.style.overflow = 'hidden';
    });

    this._config.slides.forEach((slide) => {
      requestAnimationFrame(() => {
        slide.style.width = '100%';
        slide.style.height = '100%';
        slide.style.position = 'absolute';
        slide.style.transform = 'translate3d(0px, 0px, 0px)';
        slide.style.willChange = 'transform';
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

    // in case the slide changed, update the previous and current index, send out an event
    if (updatedSlideIndex !== this._private.currentSlideIndex) {
      let isSlideChangeStart = this._private.previousSlideIndex < 0;

      this._private.previousSlideIndex = this._private.currentSlideIndex;
      this._private.currentSlideIndex = updatedSlideIndex;

      if (isSlideChangeStart) {
        let event = new Event(events.slideChangeStart);
        event.data = {
          previousIndex: this._private.previousSlideIndex,
          currentIndex: this._private.currentSlideIndex
        };
        this.dispatchEvent(event);
      }

      let event = new Event(events.slideChange);
      event.data = {
        previousIndex: this._private.previousSlideIndex,
        currentIndex: this._private.currentSlideIndex
      };
      this.dispatchEvent(event);
    }

    this._private.currentMoveablePositionX = this._private.moveable.x + (this._private.currentSlideIndex * this._private.container.width);

    console.log(this._private.currentSlideIndex);
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


  // EVENT-CHECKING


  _checkForSlideChangeEndEvent() {
    if (this._private.previousSlideIndex >= 0) {
      let event = new Event(events.slideChangeEnd);

      event.data = {
        previousIndex: this._private.previousSlideIndex,
        currentIndex: this._private.currentSlideIndex
      };

      this.dispatchEvent(event);
      this._private.previousSlideIndex = -1;
    }
  }


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }
}
