import { default as ShbTouch } from '../node_modules/kotti/dist/Kotti.js';
import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';
import { default as Bounce } from './Bounce.js';


let defaults = {
  config: {
    // main container, direct parent of all slides
    container: null,

    // array containing the moveable DOM nodes representing each slide
    slides: [],

    // decide what axis to allow scrolling on, gets translated into an array by the class
    // constructor. NOTE: this class only supports the X axis
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
    // this refers to the "abstract moveable", which has the length of all slides combined. the
    // values are relative to the upper-left corner of the first slide
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
    // the position of the "abstract moveable". the values are relative to the upper-left corner of
    // the first slide
    position: {
      x: {
        px: 0,
        percentage: 0
      },
      y: {
        px: 0,
        percentage: 0
      }
    },
    // stores the relative position of the currently most visible (> 50%) slide, used when
    // scrolling, esp. to determine which slides to actually move in the DOM, and which position
    // to bounce to if required
    currentSlidePositionX: 0,
    currentSlideIndex: 0,
    previousSlideIndex: -1,
    axis: ['x']
  },

  state: {
    isTouchActive: false,
    isSlideVisible: {},
    isBouncingOnAxis: {
      x: false,
      y: false
    }
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

    this.shbTouch = new ShbTouch(this._config);
    this.bounce = new Bounce(this._config);

    this.events = events;
    utils.addEventTargetInterface(this);
    this._bindEvents();

    requestAnimationFrame(() => {
      this._setupDomElements();
      this._calculateParams();
      this._hideAllSlides();
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
      this._hideAllSlides();

      // since the slides are set to the same size as the container, we can restore the position
      this._private.position.x.px *= this._private.container.width / previousWidth;
      this._private.position.y.px *= this._private.container.height / previousHeight;

      this._updateSlidePositions();
    });
  }


  destroy() {
    this._unbindEvents();
    this.shbTouch.destroy();

    this._config.container = null;
    this._config.slides = null;
  }


  scrollToSlide(slideIndex, shouldAnimate, animateTime) {
    this.scrollTo(slideIndex * this._private.container.width, this._private.position.y.px, shouldAnimate, animateTime);
  }


  scrollTo(left, top, shouldAnimate, animateTime) {
    let validPosition = { x: left, y: top };

    // check if coordinates are within bounds, constrain them otherwise
    if (validPosition.x < this._private.boundaries.x.axisStart) {
      validPosition.x = this._private.boundaries.x.axisStart;
    }
    else if (validPosition.x > this._private.boundaries.x.axisEnd) {
      validPosition.x = this._private.boundaries.x.axisEnd;
    }

    if (shouldAnimate) {
      this.bounce.bounceToTarget({ x: this._private.position.x.px, y: this._private.position.y.px }, validPosition, animateTime);
    }
    else {
      // if we suddenly "jump" over too many slides, our current slide will remain in its current
      // visible position, so we need to push it out; the "current" index is passed because the
      // actual index may have changed when the RAF code gets executed
      if (Math.abs(validPosition.x - this._private.position.x.px) >= this._private.container.width) {
        requestAnimationFrame(() => {
          this._hideSingleSlide(this._private.currentSlideIndex);
        });
      }

      this._updateCoords(validPosition);

      // on animated scroll, events happen as result of the animation logic; on an instant scroll,
      // we need to trigger them all here, as the transition is instant
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
    this.shbTouch.setEnabled(!shouldFreeze);
  }


  // LIFECYCLE


  _bindEvents() {
    this._private.boundShbTouchHandlers = {
      touchStart: this._handleTouchStart.bind(this),
      touchEnd: this._handleTouchEnd.bind(this),
      pushBy: this._handlePushBy.bind(this),
      finishedTouchWithMomentum: this._handleMomentum.bind(this)
    };

    fUtils.forEach(this._private.boundShbTouchHandlers, (handler, eventName) => {
      this.shbTouch.addEventListener(this.shbTouch.events[eventName], handler);
    });

    this._private.boundBounceHandlers = {
      bounceStartOnAxis: this._handleBounceStartOnAxis.bind(this),
      bounceEndOnAxis: this._handleBounceEndOnAxis.bind(this),
      bounceToPosition: this._handleBounceToPosition.bind(this)
    };

    fUtils.forEach(this._private.boundBounceHandlers, (handler, eventName) => {
      this.bounce.addEventListener(eventName, handler);
    });

    if (this._config.refreshOnResize) {
      this._private.boundDebouncedRefresh = utils.getDebounced(this.refresh.bind(this));
      window.addEventListener('resize', this._private.boundDebouncedRefresh);
    }
  }


  _unbindEvents() {
    fUtils.forEach(this._private.boundShbTouchHandlers, (handler, eventName) => {
      this.shbTouch.removeEventListener(this.shbTouch.events[eventName], handler);
    });

    fUtils.forEach(this._private.boundBounceHandlers, (handler, eventName) => {
      this.bounce.removeEventListener(eventName, handler);
    });

    if (this._private.boundDebouncedRefresh) {
      window.removeEventListener('resize', this._private.boundDebouncedRefresh);
    }
  }


  // EVENT HANDLERS


  _handleTouchStart() {
    this._state.isTouchActive = true;
    if (this._state.isBouncingOnAxis.x || this._state.isBouncingOnAxis.y) {
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
    this._state.isBouncingOnAxis[event.data.axis] = true;
  }


  _handleBounceEndOnAxis(event) {
    this._state.isBouncingOnAxis[event.data.axis] = false;
    this._checkForSlideChangeEnd();
    this._checkForPositionStable();
  }


  _handleBounceToPosition(event) {
    this._updateCoords(event.data);
  }


  _handlePushBy(event) {
    let pushBy = event.data,
      newCoordinates = {
        x: this._private.position.x.px,
        y: this._private.position.y.px
      },
      boundaries = this._private.boundaries;

    // directions obtained from ShbTouch are negative, ShbSwipe works with positive coordinates
    let pxToAdd = pushBy.x.px * pushBy.x.direction * -1;

    // OVERSCROLLING IS ALLOWED

    // the further you overscroll, the smaller the displacement; we multiply the displacement
    // by a linear factor of the overscroll distance
    if (this._config.overscroll) {
      // check on axis start (left end)
      if (pushBy.x.direction > 0 && this._private.position.x.px < boundaries.x.axisStart) {
        pxToAdd *= utils.easeLinear(Math.abs(this._private.position.x.px), 1, -1, this._config.maxTouchOverscroll);
      }
      // check on axis end (right end)
      else if (pushBy.x.direction < 0 && this._private.position.x.px > boundaries.x.axisEnd) {
        let rightBottom = boundaries.x.axisEnd - this._private.position.x.px;
        pxToAdd *= utils.easeLinear(Math.abs(rightBottom), 1, -1, this._config.maxTouchOverscroll);
      }

      newCoordinates.x = this._private.position.x.px + pxToAdd;
    }

    // OVERSCROLLING IS NOT ALLOWED

    else {
      newCoordinates.x = this._private.position.x.px + pxToAdd;

      // check on axis start (left or top)
      if (newCoordinates.x < boundaries.x.axisStart) {
        newCoordinates.x = boundaries.x.axisStart;
      }
      // check on axis end (right or bottom)
      else if (newCoordinates.x > boundaries.x.axisEnd) {
        newCoordinates.x = boundaries.x.axisEnd;
      }
    }

    this._updateCoords(newCoordinates);
  }


  _handleMomentum(event) {
    let momentum = event.data,
      targetPositionX;

    // only a certain amount of momentum will trigger a slide transition. we only care about
    // momentum on the x axis, as the ShbSwipe only moves along this axis
    if (momentum.x.pxPerFrame < this._config.minMomentumForTransition) return;

    // before calculating a target position, we also check:
    // - if the we are in the first or last
    // - if the current slide hasn't passed the center point already (momentum won't trigger a
    // bounceToTargetOnAxis() in this case because a transition to the next slide will happen once
    // the user lifts his finger)

    if (momentum.x.direction > 0 // -1 = moving left
        && this._private.currentSlideIndex > 0 // shouldn't be first slide
        && this._private.currentSlidePositionX < 0) { // check if slide hasn't passed the center
      targetPositionX = (this._private.currentSlideIndex -1) * this._private.container.width;
    }
    else if (momentum.x.direction < 0 // 1 = moving right
        && this._private.currentSlideIndex < this._config.slides.length -1 // shouldn't be last slide
        && this._private.currentSlidePositionX > 0) { // check if slide hasn't passed the center
      targetPositionX = (this._private.currentSlideIndex +1) * this._private.container.width;
    }

    if (targetPositionX >= 0) {
      this.bounce.bounceToTargetOnAxis('x', this._private.position.x.px, targetPositionX);
    }
  }


  // POSITION AND MOVEMENT


  _calculateParams() {
    this._private.container.width = this._config.container.clientWidth;
    this._private.container.height = this._config.container.clientHeight;

    this._private.boundaries.x.axisStart = 0;
    this._private.boundaries.x.axisEnd = this._private.container.width * (this._config.slides.length - 1);
  }


  _updateCoords(newCoordinates) {
    let position = this._private.position;

    if (position.x.px !== newCoordinates.x) {
      // set the current position in pixels
      position.x.px = newCoordinates.x;

      // calculate the percentage. if the moveable is smaller than the container, we skip this and
      // avoid a division by 0, in which case the percentage will remain unchanged and always be 0
      if (this._private.boundaries.x.axisEnd > 0) {
        position.x.percentage = position.x.px / this._private.boundaries.x.axisEnd;
      }

      requestAnimationFrame(() => this._updateSlidePositions());

      this.dispatchEvent(new Event(events.positionChanged), {
        position: {
          x: position.x.px,
          y: position.y.px
        },
        percentage: {
          x: position.x.percentage,
          y: position.y.percentage
        }
      });
    }
  }


  // DOM MANIPULATION


  _setupDomElements() {
    // attributes requried by the container
    this._config.container.style.overflow = 'hidden';

    // attributes requried by the slides
    this._config.slides.forEach((slide) => {
      slide.style.position = 'absolute';
      slide.style.left = '0px';
      slide.style.top = '0px';
      slide.style.webkitTransform = 'translate3d(0px, 0px, 0px)';
      slide.style.width = '100%';
      slide.style.height = '100%';
      slide.style.willChange = 'transform';
    });
  }


  _applySlidePosition(slideIndex, position) {
    this._config.slides[slideIndex].style.webkitTransform = `translate3d(${position}px, 0px, 0px)`;
  }


  _updateSlidePositions() {
    // index of the slide that's currently most visible (> 50%)
    let updatedSlideIndex = Math.round(this._private.position.x.px / this._private.container.width);

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
    if (updatedSlideIndex > this._private.currentSlideIndex && this._private.currentSlideIndex -1 >= 0) {
      this._applySlidePosition(this._private.currentSlideIndex -1, this._private.container.width);
    }
    else if (updatedSlideIndex < this._private.currentSlideIndex && this._private.currentSlideIndex +1 < this._config.slides.length) {
      this._applySlidePosition(this._private.currentSlideIndex +1, this._private.container.width);
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

    // calculate and apply position to the currently most visible (> 50%) slide
    this._private.currentSlidePositionX = this._private.position.x.px - (this._private.currentSlideIndex * this._private.container.width);
    this._applySlidePosition(this._private.currentSlideIndex, -this._private.currentSlidePositionX);
    this._state.isSlideVisible[this._private.currentSlideIndex] = true;

    // apply transform to left slide if available and visible, make sure it's hidden otherwise
    if (this._private.currentSlideIndex > 0) {
      let leftSlideIndex = this._private.currentSlideIndex - 1;

      if (this._private.currentSlidePositionX < 0) {
        this._applySlidePosition(leftSlideIndex, -this._private.currentSlidePositionX - this._private.container.width);
        this._state.isSlideVisible[leftSlideIndex] = true;
      }
      else if (this._state.isSlideVisible[leftSlideIndex]) {
        this._hideSingleSlide(leftSlideIndex);
      }
    }

    // apply transform to right slide if available and visible, make sure it's hidden otherwise
    if (this._private.currentSlideIndex < this._config.slides.length -1) {
      let rightSlideIndex = this._private.currentSlideIndex + 1;

      if (this._private.currentSlidePositionX > 0) {
        this._applySlidePosition(rightSlideIndex, -this._private.currentSlidePositionX + this._private.container.width);
        this._state.isSlideVisible[rightSlideIndex] = true;
      }
      else if (this._state.isSlideVisible[rightSlideIndex]) {
        this._hideSingleSlide(rightSlideIndex);
      }
    }
  }


  _hideSingleSlide(slideIndex) {
    // move slide outside of the container
    this._applySlidePosition(slideIndex, this._private.container.width);
    this._state.isSlideVisible[slideIndex] = false;
  }


  _hideAllSlides() {
    this._config.slides.forEach((slide, slideIndex) => this._hideSingleSlide(slideIndex));
  }


  // CONDITION CHECKING


  _checkForBounceStart() {
    if (!this._state.isTouchActive && !this._state.isBouncingOnAxis.x) {
      let targetPositionX = this._getClosestBounceTarget();

      if (targetPositionX !== this._private.position.x.px) {
        this.bounce.bounceToTargetOnAxis('x', this._private.position.x.px, targetPositionX);
      }
    }
  }


  _checkForPositionStable() {
    if (!this._state.isTouchActive
        && !this._state.isBouncingOnAxis.x
        && !this._state.isBouncingOnAxis.y) {
      let position = this._private.position;

      this.dispatchEvent(new Event(events.positionStable), {
        position: {
          x: position.x.px,
          y: position.y.px
        },
        percentage: {
          x: position.x.percentage,
          y: position.y.percentage
        }
      });
    }
  }


  _checkForSlideChangeEnd() {
    if (!this._state.isBouncingOnAxis.x
        && !this._state.isBouncingOnAxis.y
        && this._private.previousSlideIndex >= 0) {
      this.dispatchEvent(new Event(events.slideChangeEnd), {
        previousIndex: this._private.previousSlideIndex,
        currentIndex: this._private.currentSlideIndex
      });

      this._private.previousSlideIndex = -1;
    }
  }


  // HELPERS


  _getClosestBounceTarget() {
    let position = this._private.position,
      bounceTarget = position.x.px;

    // swiper is overscrolling left
    if (position.x.px < this._private.boundaries.x.axisStart) {
      bounceTarget = this._private.boundaries.x.axisStart;
    }
    // swiper is overscrolling right
    else if (position.x.px > this._private.boundaries.x.axisEnd) {
      bounceTarget = this._private.boundaries.x.axisEnd;
    }
    // swiper somewhere in the middle
    else {
      // slide hangs on the left side relative to the container center
      if (Math.abs(this._private.currentSlidePositionX) < this._private.container.width / 2) {
        bounceTarget = this._private.currentSlideIndex * this._private.container.width;
      }
      // slide hangs on the right side relative to the container center
      else {
        bounceTarget = (this._private.currentSlideIndex +1) * this._private.container.width;
      }
    }

    return bounceTarget;
  }
}
