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

    // allow scrolling beyond the edge of moveable
    overscroll: true,

    // when set to true, listens to debounced window.resize events and calls refresh
    refreshOnResize: true,

    // maximum amount of pixels for touch-led overscrolling
    maxTouchOverscroll: 150,

    // the minimum amount of momentum which triggers a transition to the previous/next slide
    minMomentumForTransition: 5
  },

  private: {
    container: {
      height: 0,
      width: 0
    },
    moveable: {
      position: 0, // in pixels
      progress: 0, // in percent
      width: 0 // in pixels
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
    // stores the absolute position of the currently most visible (> 50%) slide, used to determine
    // what slides to actually move in the DOM and which position to bounce to if required
    currentSlideAbsolutePosition: 0,
    currentSlideIndex: 0,
    previousSlideIndex: -1
  },

  state: {
    isTouchActive: false,
    isBounceActive: false,
    isSlideVisible: {}
  }
};


let events = {
  slideChange: 'slideChange',
  slideChangeStart: 'slideChangeStart',
  slideChangeEnd: 'slideChangeEnd',
  positionChanged: 'positionChanged',
  positionStable: 'positionStable'
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
    let previousWidth = this._private.container.width;

    if (config) fUtils.mergeDeep(this._config, config);

    requestAnimationFrame(() => {
      this._calculateParams();
      this._hideAllSlides();
      // restore previous position (in case a window resize event happened)
      this._private.position.x.px *= this._private.container.width / previousWidth;
      this._updateSlidePositions();
    });
  }


  destroy() {
    this._unbindEvents();
    this.shbTouch.destroy();

    this._config.container = null;
    this._config.slides = null;
  }


  scrollToSlide(slideIndex, animateTime) {
    this.scrollTo(slideIndex * this._private.container.width, animateTime);
  }


  scrollTo(targetPosition, animateTime) {
    // check if coordinates are within bounds, constrain them otherwise
    if (targetPosition < 0) {
      targetPosition = 0;
    }
    else if (targetPosition > this._private.boundaries.x.axisEnd) {
      targetPosition = this._private.boundaries.x.axisEnd;
    }

    if (this._state.isBounceActive) this.bounce.stopBounce();

    if (animateTime) {
      this.bounce.startBounce(this._private.position.x.px, targetPosition, animateTime);
    }
    else {
      requestAnimationFrame(() => this._updateMoveablePosition(targetPosition));

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
      touchStart: this._onTouchStart.bind(this),
      touchEnd: this._onTouchEnd.bind(this),
      pushBy: this._onPushBy.bind(this),
      finishedTouchWithMomentum: this._onFinishedTouchWithMomentum.bind(this)
    };

    fUtils.forEach(this._private.boundShbTouchHandlers, (handler, eventName) => {
      this.shbTouch.addEventListener(this.shbTouch.events[eventName], handler);
    });

    this._private.boundBounceHandlers = {
      bounceStart: this._onBounceStart.bind(this),
      bounceEnd: this._onBounceEnd.bind(this),
      bounceBy: this._onBounceBy.bind(this)
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


  _calculateParams() {
    this._private.container.width = this._config.container.clientWidth;
    this._private.container.height = this._config.container.clientHeight;

    this._private.boundaries.x.axisStart = 0;
    this._private.boundaries.x.axisEnd = this._private.container.width * (this._config.slides.length - 1);
  }


  // EVENT HANDLERS


  _onTouchStart() {
    this._state.isTouchActive = true;
    if (this._state.isBounceActive) this.bounce.stopBounce();
  }


  _onTouchEnd() {
    this._state.isTouchActive = false;
    this._checkForBounceStart();
    this._checkForSlideChangeEnd();
    this._checkForPositionStable();
  }


  _onBounceStart() {
    this._state.isBounceActive = true;
  }


  _onBounceEnd() {
    this._state.isBounceActive = false;
    this._checkForSlideChangeEnd();
    this._checkForPositionStable();
  }


  _onBounceBy(event) {
    this._updateMoveablePosition(event.data);
  }


  _onPushBy(event) {
    let pushBy = event.data,
      targetPosition = this._private.position.x.px,
      boundaries = this._private.boundaries;

    // directions obtained from ShbTouch are negative, ShbSwipe works with positive coordinates
    let pxToAdd = pushBy.x.px * pushBy.x.direction * -1;

    // overscrolling is allowed, multiply the displacement by a linear factor of the distance
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

      targetPosition = this._private.position.x.px + pxToAdd;
    }
    // overscrolling is not allowed, constrain movement to the boundaries
    else {
      targetPosition = this._private.position.x.px + pxToAdd;

      // check on axis start (left end)
      if (targetPosition < boundaries.x.axisStart) {
        targetPosition = boundaries.x.axisStart;
      }
      // check on axis end (right end)
      else if (targetPosition > boundaries.x.axisEnd) {
        targetPosition = boundaries.x.axisEnd;
      }
    }

    this._updateMoveablePosition(targetPosition);
  }


  _onFinishedTouchWithMomentum(event) {
    let momentum = event.data,
      targetPosition;

    // only a certain amount of momentum will trigger a slide transition. we only care about
    // momentum on the x axis, as the ShbSwipe only moves along this axis
    if (momentum.x.pxPerFrame < this._config.minMomentumForTransition) return;

    // before calculating a target position, we also check:
    // - if the we are in the first or last slide
    // - if the current slide hasn't passed the center point already (momentum won't trigger a
    // bounceToTarget() in this case because a transition to the next slide will happen once
    // the user lifts his finger)

    if (momentum.x.direction > 0 // -1 = moving left
        && this._private.currentSlideIndex > 0 // shouldn't be first slide
        && this._private.currentSlideAbsolutePosition < 0) { // check if slide hasn't passed the center
      targetPosition = (this._private.currentSlideIndex - 1) * this._private.container.width;
    }
    else if (momentum.x.direction < 0 // 1 = moving right
        && this._private.currentSlideIndex < this._config.slides.length -1 // shouldn't be last slide
        && this._private.currentSlideAbsolutePosition > 0) { // check if slide hasn't passed the center
      targetPosition = (this._private.currentSlideIndex + 1) * this._private.container.width;
    }

    if (targetPosition >= 0) {
      this.bounce.startBounce(this._private.position.x.px, targetPosition);
    }
  }


  // DOM MANIPULATION


  _updateMoveablePosition(newPosition) {
    if (newPosition !== this._private.position.x.px) {
      this._private.position.x.px = newPosition;
      this._private.position.x.percentage = this._private.position.x.px / this._private.boundaries.x.axisEnd;

      // NOTE: not sure if this should be inside a RAF, as:
      // - pushBy gets triggered by a finger movement event (that's already in sync with RAF)
      // - bounceBy already gets executed by a RAF
      // TODO: test and research, especially on Android devices
      // requestAnimationFrame(() => this._updateSlidePositions());
      this._updateSlidePositions()

      this.dispatchEvent(new Event(events.positionChanged), {
        position: {
          x: this._private.position.x.px,
          y: 0
        },
        percentage: {
          x: this._private.position.x.percentage,
          y: 0
        }
      });
    }
  }


  _updateSlidePositions() {
    // index of the slide that's currently most visible (> 50%)
    let newCurrentSlideIndex = Math.round(this._private.position.x.px / this._private.container.width),
      shouldSlideBeVisible = {};

    // constrain the calculated index when overscrolling
    if (newCurrentSlideIndex < 0) {
      newCurrentSlideIndex = 0;
    }
    else if (newCurrentSlideIndex >= this._config.slides.length) {
      newCurrentSlideIndex = this._config.slides.length -1;
    }

    // in case the slide changed, update the previous and current index, send out events
    if (newCurrentSlideIndex !== this._private.currentSlideIndex) {
      let isSlideChangeStart = this._private.previousSlideIndex < 0;

      this._private.previousSlideIndex = this._private.currentSlideIndex;
      this._private.currentSlideIndex = newCurrentSlideIndex;

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
    this._private.currentSlideAbsolutePosition = this._private.position.x.px - (this._private.currentSlideIndex * this._private.container.width);
    this._applySingleSlidePosition(this._private.currentSlideIndex, -this._private.currentSlideAbsolutePosition);
    shouldSlideBeVisible[this._private.currentSlideIndex] = true;

    // apply position to left slide if available and visible
    if (this._private.currentSlideIndex > 0
        && this._private.currentSlideAbsolutePosition < 0) {
      let leftSlideIndex = this._private.currentSlideIndex - 1;

      this._applySingleSlidePosition(leftSlideIndex, -this._private.currentSlideAbsolutePosition - this._private.container.width);
      shouldSlideBeVisible[leftSlideIndex] = true;
    }

    // apply position to right slide if available and visible
    if (this._private.currentSlideIndex < this._config.slides.length -1
       && this._private.currentSlideAbsolutePosition > 0) {
      let rightSlideIndex = this._private.currentSlideIndex + 1;

      this._applySingleSlidePosition(rightSlideIndex, -this._private.currentSlideAbsolutePosition + this._private.container.width);
      shouldSlideBeVisible[rightSlideIndex] = true;
    }

    // make sure that all slides that shouldn't be visible are actually hidden. this is important
    // as fast finger movements or animations may potentially skip slides
    fUtils.forEach(this._state.isSlideVisible, (isVisible, slideIndex) => {
      if (shouldSlideBeVisible[slideIndex]) {
        this._state.isSlideVisible[slideIndex] = true;
      } else if (isVisible) {
        this._hideSingleSlide(slideIndex);
      }
    });
  }


  _applySingleSlidePosition(slideIndex, position) {
    this._config.slides[slideIndex].style.webkitTransform = `translate3d(${position}px, 0px, 0px)`;
  }


  _hideSingleSlide(slideIndex) {
    // move slide outside of the container, hide it either on the right or left side depending on
    // the index of the currently visible slide
    let hideAt = slideIndex < this._private.currentSlideIndex ? -this._private.container.width : this._private.container.width;

    this._applySingleSlidePosition(slideIndex, hideAt);
    this._state.isSlideVisible[slideIndex] = false;
  }


  _hideAllSlides() {
    this._config.slides.forEach((slide, slideIndex) => this._hideSingleSlide(slideIndex));
  }


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


  // CONDITION CHECKING


  _checkForBounceStart() {
    if (!this._state.isTouchActive && !this._state.isBounceActive) {
      let targetPosition = this._getClosestBounceTarget();

      if (targetPosition !== this._private.position.x.px) {
        this.bounce.startBounce(this._private.position.x.px, targetPosition);
      }
    }
  }


  _checkForPositionStable() {
    if (!this._state.isTouchActive && !this._state.isBounceActive) {
      this.dispatchEvent(new Event(events.positionStable), {
        position: {
          x: this._private.position.x.px,
          y: 0
        },
        percentage: {
          x: this._private.position.x.percentage,
          y: 0
        }
      });
    }
  }


  _checkForSlideChangeEnd() {
    if (!this._state.isBounceActive && this._private.previousSlideIndex >= 0) {
      this.dispatchEvent(new Event(events.slideChangeEnd), {
        previousIndex: this._private.previousSlideIndex,
        currentIndex: this._private.currentSlideIndex
      });

      this._private.previousSlideIndex = -1;
    }
  }


  // HELPERS


  _getClosestBounceTarget() {
    let bounceTarget = this._private.position.x.px;

    // swiper is overscrolling left
    if (this._private.position.x.px < this._private.boundaries.x.axisStart) {
      bounceTarget = this._private.boundaries.x.axisStart;
    }
    // swiper is overscrolling right
    else if (this._private.position.x.px > this._private.boundaries.x.axisEnd) {
      bounceTarget = this._private.boundaries.x.axisEnd;
    }
    // swiper is somewhere in the middle
    else {
      // slide hangs on the left side relative to the container center
      if (Math.abs(this._private.currentSlideAbsolutePosition) < this._private.container.width / 2) {
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
