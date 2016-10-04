import { default as Kotti } from '../node_modules/kotti/dist/Kotti.js';
import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';
import { default as Bounce } from './Bounce.js';
import { default as ResizeDebouncer } from './ResizeDebouncer.js';


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
    minMomentumForTransition: 5,

    // when set to true, listens to debounced window.resize events and calls refresh
    refreshOnResize: true
  },

  private: {
    container: {
      height: 0,
      width: 0
    },
    // an abstract moveable representing the dimensions of the combined collection of slides
    moveable: {
      height: 0,
      width: 0
    },
    boundaries: {
      x: {
        axisStart: 0,
        axisEnd: 0
      },
      y: {
        axisStart: 0,
        axisEnd: 0
      }
    },
    // the current position, relative to the upper-left corner of the first slide
    position: {
      px: { x: 0, y: 0 },
      percent: { x: 0, y: 0 }
    },
    axis: ['x'],
    isBouncingOnAxis: { x: false, y: false },
    currentSlideIndex: 0,
    previousSlideIndex: -1,
    currentSlidePositionX: 0
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

    this.kotti = new Kotti(this._config);
    this.bounce = new Bounce(this._config);

    if (this._config.refreshOnResize) this.resizeDebouncer = new ResizeDebouncer();

    this.events = events;
    utils.addEventTargetInterface(this);
    this._bindEvents();

    this._private.boundUpdateSlidePositions = this._updateSlidePositions.bind(this);

    requestAnimationFrame(() => {
      this._setupDomElements();
      this._calculateParams();
      this._resetSlidePositions();
      this._updateSlidePositions();
    });
  }


  // PUBLIC


  refresh(config) {
    let previousWidth = this._private.container.width,
      previousHeight = this._private.container.height;

    if (config) fUtils.mergeDeep(this._config, config);

    requestAnimationFrame(() => {
      this._calculateParams();
      this._resetSlidePositions();

      // since the slides are set to the same size as the container, we can restore the position
      this._private.position.px.x *= this._private.container.width/previousWidth;
      this._private.position.px.y *= this._private.container.height/previousHeight;

      this._updateSlidePositions();
    });
  }


  destroy() {
    this._unbindEvents();
    this.kotti.destroy();
    if (this.resizeDebouncer) this.resizeDebouncer.destroy();

    this._config.container = null;
    this._config.slides = null;
  }


  scrollToSlide(slideIndex, shouldAnimate, animateTime) {
    this.scrollToPosition(slideIndex * -this._private.container.width, this._private.position.px.y, shouldAnimate, animateTime);
  }


  scrollTo(left, top, shouldAnimate, animateTime) {
    let validPosition = { x: left, y: top };

    this._forXY((xy) => {
      // check if coordinates are within bounds, constrain them otherwise
      if (validPosition[xy] < this._private.boundaries[xy].axisStart) {
        validPosition[xy] = this._private.boundaries[xy].axisStart;
      }
      else if (validPosition[xy] > this._private.boundaries[xy].axisEnd) {
        validPosition[xy] = this._private.boundaries[xy].axisEnd;
      }
    });

    if (shouldAnimate) {
      this.bounce.bounceToTarget(this._private.position.px, validPosition, animateTime);
    }
    else {
      // if we suddenly "jump" over too many slides, our current slide will remain in its current
      // visible position, so we need to push it out; the "current" index is passed because the
      // actual index may have changed when the RAF code gets executed
      if (Math.abs(validPosition.x - this._private.position.px.x) >= this._private.container.width) {
        requestAnimationFrame(() =>{
          this._hideSlide(this._private.currentSlideIndex);
        });
      }
      this._updateCoords(validPosition);

      // on animated scroll, events happen as result of the animation logic; on an instant scroll
      // we need to trigger them here, as the transition is instant
      let eventData = {
        previousIndex: this._private.previousSlideIndex,
        currentIndex: this._private.currentSlideIndex
      };

      this.dispatchEvent(new Event(events.slideChangeStart), eventData);
      this.dispatchEvent(new Event(events.slideChange), eventData);
      this.dispatchEvent(new Event(events.slideChangeEnd), eventData);
    }
  }


  freezeScroll(shouldFreeze) {
    this.kotti.setEnabled(!shouldFreeze);
  }


  // LIFECYCLE


  _bindEvents() {
    this._private.boundHandlersKotti = {
      touchStart: this._handleTouchStart.bind(this),
      touchEnd: this._handleTouchEnd.bind(this),
      pushBy: this._handlePushBy.bind(this),
      finishedTouchWithMomentum: this._handleMomentum.bind(this)
    };

    fUtils.forEach(this._private.boundHandlersKotti, (handler, eventType) => {
      this.kotti.addEventListener(this.kotti.events[eventType], handler);
    });

    this._private.boundHandlersBounce = {
      bounceStartOnAxis: this._handleBounceStartOnAxis.bind(this),
      bounceEndOnAxis: this._handleBounceEndOnAxis.bind(this),
      bounceToPosition: this._handleBounceToPosition.bind(this)
    };

    fUtils.forEach(this._private.boundHandlersBounce, (handler, eventType) => {
      this.bounce.addEventListener(this.bounce.events[eventType], handler);
    });

    if (this.resizeDebouncer) {
      this._private.boundHandlerResize = this._handleResize.bind(this);
      this.resizeDebouncer.addEventListener(this.resizeDebouncer.events.resize, this._private.boundHandlerResize);
    }
  }


  _unbindEvents() {
    fUtils.forEach(this._private.boundHandlersKotti, (handler, eventType) => {
      this.kotti.removeEventListener(this.kotti.events[eventType], handler);
    });

    fUtils.forEach(this._private.boundHandlersBounce, (handler, eventType) => {
      this.bounce.removeEventListener(this.bounce.events[eventType], handler);
    });

    if (this.resizeDebouncer) {
      this.resizeDebouncer.removeEventListener(this.resizeDebouncer.events.resize, this._private.boundHandlerResize);
    }
  }


  // EVENT HANDLERS


  _handleResize() {
    this.refresh();
  }


  _handleTouchStart() {
    this._state.isTouchActive = true;
    if (this._private.isBouncingOnAxis.x || this._private.isBouncingOnAxis.y) {
      this.bounce.stop();
    }
  }


  _handleTouchEnd() {
    this._state.isTouchActive = false;
    this._checkForBounceStart();
    this._checkForSlideChangeEnd();
    this._checkForPositionStable();
  }


  _handleBounceStartOnAxis(event) {
    this._private.isBouncingOnAxis[event.data.axis] = true;
  }


  _handleBounceEndOnAxis(event) {
    this._private.isBouncingOnAxis[event.data.axis] = false;
    this._checkForSlideChangeEnd();
    this._checkForPositionStable();
  }


  _handleBounceToPosition(event) {
    this._updateCoords(event.data);
  }


  _handlePushBy(event) {
    let pushBy = event.data,
      newCoordinates = {
        x: this._private.position.px.x,
        y: this._private.position.px.y
      },
      boundaries = this._private.boundaries;

    this._forXY((xy) => {
      // direction obtained from kotti is opposite to how we keep coordinates
      let pxToAdd = pushBy[xy].px * (-pushBy[xy].direction);

      // OVERSCROLLING IS ALLOWED

      // the further you overscroll, the smaller is the displacement; we multiply the displacement
      // by a linear factor of the overscroll distance
      if (this._config.overscroll) {
        // check on axis start (left or top)
        if (pushBy[xy].direction > 0 && this._private.position.px[xy] < boundaries[xy].axisStart) {
          pxToAdd *= utils.easeLinear(Math.abs(this._private.position.px[xy]), 1, -1, this._config.maxTouchOverscroll);
        }
        // check on axis end (right or bottom)
        else if (pushBy[xy].direction < 0 && this._private.position.px[xy] > boundaries[xy].axisEnd) {
          let rightBottom = boundaries[xy].axisEnd - this._private.position.px[xy];
          pxToAdd *= utils.easeLinear(Math.abs(rightBottom), 1, -1, this._config.maxTouchOverscroll);
        }

        newCoordinates[xy] = this._private.position.px[xy] + pxToAdd;
      }

      // OVERSCROLLING IS NOT ALLOWED

      else {
        newCoordinates[xy] = this._private.position.px[xy] + pxToAdd;
        // check on axis start (left or top)
        if (newCoordinates[xy] < boundaries[xy].axisStart)
          newCoordinates[xy] = boundaries[xy].axisStart;
        // check on axis end (right or bottom)
        else if (newCoordinates[xy] > boundaries[xy].axisEnd)
          newCoordinates[xy] = boundaries[xy].axisEnd;
      }
    });

    this._updateCoords(newCoordinates);
  }


  _handleMomentum(event) {
    let momentum = event.data,
      targetPositionPx;

    // enough momentum on the x axis will trigger a slide transition, otherwise ignore. we only
    // care about momentum on the x axis, as the Spaeti will only move in this direction
    if (momentum.x.pxPerFrame < this._config.minMomentumForTransition) return;

    // before calculating a target position, we also check if the we are in the first (or last)
    // slide and if the current slide is already bouncing from a transition in the same
    // direction as the momentum; so if the user's finger lifts when already transitioning to the
    // next slide, momentum is ignored (otherwise the total transition would be 2 slides)
    if (momentum.x.direction > 0
        && this._private.currentSlideIndex > 0
        && this._private.currentSlidePositionX < 0) {
      targetPositionPx = (this._private.currentSlideIndex -1) * this._private.container.width;
    }
    else if (momentum.x.direction < 0
        && this._private.currentSlideIndex < this._config.slides.length -1
        && this._private.currentSlidePositionX > 0) {
      targetPositionPx = (this._private.currentSlideIndex +1) * this._private.container.width;
    }

    if (targetPositionPx >= 0) {
      this.bounce.bounceToTargetOnAxis('x', this._private.position.px.x, targetPositionPx);
    }
  }


  // POSITION AND MOVEMENT


  _calculateParams() {
    this._private.container.width = this._config.container.clientWidth;
    this._private.container.height = this._config.container.clientHeight;

    // the virtual moveable is the width of the combined slides. we assume that each slide
    // has the same width and height as the container
    this._private.moveable.width = this._private.container.width * this._config.slides.length;
    this._private.moveable.height = this._private.container.height;

    // calculate the maximum and minimum coordinates for scrolling. these are used as boundaries for
    // determining overscroll status, initiating bounce (if allowed); and also to determine bounce
    // target position when overscrolling
    this._forXY((xy) => {
      let dimension = xy === 'x' ? 'width' : 'height';
      this._private.boundaries[xy].axisStart = 0;
      this._private.boundaries[xy].axisEnd = this._private.moveable[dimension] - this._private.container[dimension];
    });
  }


  _updateCoords(newCoordinates) {
    let position = this._private.position;

    if (position.px.x !== newCoordinates.x || position.px.y !== newCoordinates.y) {
      this._forXY((xy) => {
        position.px[xy] = newCoordinates[xy];
        if (this._private.boundaries[xy].axisEnd > 0) {
          position.percent[xy] = position.px[xy] / this._private.boundaries[xy].axisEnd;
        }
      });
      requestAnimationFrame(this._private.boundUpdateSlidePositions);

      this.dispatchEvent(new Event(events.positionChanged), {
        position: {
          x: position.px.x,
          y: position.px.y
        },
        percent: {
          x: position.percent.x,
          y: position.percent.y
        }
      });
    }
  }


  // DOM MANIPULATION


  // sets the attributes of dom elements for use with the spaeti
  _setupDomElements() {
    this._config.container.style.overflow = 'hidden';

    this._config.slides.forEach((slide) => {
      slide.style.width = '100%';
      slide.style.height = '100%';
      slide.style.position = 'absolute';
      slide.style.webkitTransform = 'translate3d(0px, 0px, 0px)';
      slide.style.willChange = 'transform';
    });
  }


  // sets the position of all slides to the left of the container, so they aren't visible
  _resetSlidePositions() {
    this._config.slides.forEach((moveable) => {
      moveable.style.webkitTransform = `translate3d(${this._private.container.width}px, 0px, 0px)`;
    });
  }


  _hideSlide(slideIndex) {
    this._config.slides[slideIndex].style.webkitTransform = `translate3d(${this._private.container.width}px, 0px, 0px)`;
  }


  _updateSlidePositions() {
    let updatedSlideIndex = Math.round(this._private.position.px.x / this._private.container.width);

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
        this.dispatchEvent(new Event(events.slideChangeStart), {
          previousIndex: this._private.previousSlideIndex,
          currentIndex: this._private.currentSlideIndex
        });
      }

      this.dispatchEvent(new Event(events.slideChange), {
        previousIndex: this._private.previousSlideIndex,
        currentIndex: this._private.currentSlideIndex
      });
    }

    this._private.currentSlidePositionX = this._private.position.px.x - (this._private.currentSlideIndex * this._private.container.width);

    // apply the transform to the current slide
    this._config.slides[this._private.currentSlideIndex].style.webkitTransform = `translate3d(
      ${-this._private.currentSlidePositionX}px, ${-this._private.position.px.y}px, 0px)`;

    // apply the transform to the slide to the left
    if (this._private.currentSlideIndex > 0) {
      this._config.slides[this._private.currentSlideIndex -1].style.webkitTransform = `translate3d(
        ${-this._private.currentSlidePositionX - this._private.container.width}px, ${-this._private.position.px.y}px, 0px)`;
    }

    // apply the transform to the slide to the right
    if (this._private.currentSlideIndex < this._config.slides.length -1) {
      this._config.slides[this._private.currentSlideIndex +1].style.webkitTransform = `translate3d(
        ${-this._private.currentSlidePositionX + this._private.container.width}px, ${-this._private.position.px.y}px, 0px)`;
    }
  }


  // CONDITION CHECKING


  _checkForBounceStart() {
    this._forXY((xy) => {
      this._checkForBounceStartOnAxis(xy);
    });
  }


  _checkForBounceStartOnAxis(axis) {
    if (!this._state.isTouchActive && !this._private.isBouncingOnAxis[axis]) {
      let targetPositionOnAxis = this._getClosestBounceTargetOnAxis(axis);

      if (targetPositionOnAxis !== this._private.position.px[axis]) {
        this.bounce.bounceToTargetOnAxis(axis, this._private.position.px[axis], targetPositionOnAxis);
      }
    }
  }


  _checkForPositionStable() {
    if (!this._state.isTouchActive
        && !this._private.isBouncingOnAxis.x
        && !this._private.isBouncingOnAxis.y) {

      let position = this._private.position;

      this.dispatchEvent(new Event(events.positionStable), {
        position: {
          x: position.px.x,
          y: position.px.y
        },
        percent: {
          x: position.percent.x,
          y: position.percent.y
        }
      });
    }
  }


  _checkForSlideChangeEnd() {
    if (!this._private.isBouncingOnAxis.x
        && !this._private.isBouncingOnAxis.y
        && this._private.previousSlideIndex >= 0) {
      this.dispatchEvent(new Event(events.slideChangeEnd), {
        previousIndex: this._private.previousSlideIndex,
        currentIndex: this._private.currentSlideIndex
      });
      this._private.previousSlideIndex = -1;
    }
  }


  // HELPERS


  // returns the closest bounce-to target on the given axis
  _getClosestBounceTargetOnAxis(axis) {
    let position = this._private.position,
      bounceTarget = position.px[axis];

    // check the outer boundaries of the moveable
    if (position.px[axis] < this._private.boundaries[axis].axisStart) {
      bounceTarget = this._private.boundaries[axis].axisStart;
    }
    else if (position.px[axis] > this._private.boundaries[axis].axisEnd) {
      bounceTarget = this._private.boundaries[axis].axisEnd;
    }
    // check the inner boundaries of the current moveable; only applies to x-axis
    else if (axis === 'x') {
      let targetLeft = this._private.currentSlideIndex * this._private.container.width,
        targetRight = targetLeft + this._private.container.width;

      if (Math.abs(position.px[axis] - targetLeft) < this._private.container.width / 2) {
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
}
