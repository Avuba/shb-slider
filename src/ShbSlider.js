import { default as utils } from './utils/utils';
import { default as lodash } from './utils/lodash';
// TODO: import via npm as soon as available
import { default as ShbTouch } from './vendor/ShbTouch';
import { default as Bounce } from './Bounce';


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
    minMomentumForTransition: 5,

    // NOTE: please take a look at the config objects inside ShbTouch.js and Bounce.js regarding
    // what other possible config parameters can be passed
  },

  private: {
    container: {
      width: 0,
      height: 0
    },
    // a purely virtual object acting as if all slides would be combined to one big plane. we mainly
    // manipulate this object and then translate its parameters to the actual slide movements
    moveable: {
      position: 0, // in pixels
      progress: 0 // in percent
    },
    boundaries: {
      start: 0,
      end: 0
    },
    // the absolute position of the currently most visible (> 50%) slide, used to determine what
    // slides to actually move in the DOM and what position to bounce to if required
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


export default class ShbSlider {
  constructor(config) {
    this._config = lodash.cloneDeep(defaults.config);
    this._private = lodash.cloneDeep(defaults.private);
    this._state = lodash.cloneDeep(defaults.state);

    if (config) lodash.merge(this._config, config);
    // required to constrain ShbTouch to x axis only
    this._config.axis = 'x';

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


  scrollToSlide(slideIndex, animateTime) {
    this.scrollToPosition(slideIndex * this._private.container.width, animateTime);
  }


  scrollToPosition(targetPosition, animateTime) {
    if (targetPosition < 0) {
      targetPosition = 0;
    }
    else if (targetPosition > this._private.boundaries.end) {
      targetPosition = this._private.boundaries.end;
    }

    if (this._state.isBounceActive) this.bounce.stop();

    if (animateTime) {
      this.bounce.start(this._private.moveable.position, targetPosition, animateTime);
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


  disableScrolling(isDisabled) {
    this.shbTouch.disableScrolling(isDisabled);
  }


  refresh(config) {
    let previousWidth = this._private.container.width;

    if (config) lodash.merge(this._config, config);

    requestAnimationFrame(() => {
      this._calculateParams();
      this._hideAllSlides();
      // restore previous position (in case a window resize event happened)
      this._private.moveable.position *= this._private.container.width / previousWidth;
      this._updateSlidePositions();
    });
  }


  destroy() {
    this._unbindEvents();
    this.shbTouch.destroy();
    this.bounce.stop();

    this._config.container = null;
    this._config.slides = null;
  }


  // LIFECYCLE


  _bindEvents() {
    this._private.boundShbTouchHandlers = {
      touchStart: this._onTouchStart.bind(this),
      touchEnd: this._onTouchEnd.bind(this),
      pushBy: this._onPushBy.bind(this),
      touchEndWithMomentum: this._onTouchEndWithMomentum.bind(this)
    };

    lodash.forEach(this._private.boundShbTouchHandlers, (handler, eventName) => {
      this.shbTouch.addEventListener(eventName, handler);
    });

    this._private.boundBounceHandlers = {
      bounceStart: this._onBounceStart.bind(this),
      bounceEnd: this._onBounceEnd.bind(this),
      bounceBy: this._onBounceBy.bind(this)
    };

    lodash.forEach(this._private.boundBounceHandlers, (handler, eventName) => {
      this.bounce.addEventListener(eventName, handler);
    });

    if (this._config.refreshOnResize) {
      this._private.boundDebouncedRefresh = utils.getDebounced(this.refresh.bind(this));
      window.addEventListener('resize', this._private.boundDebouncedRefresh);
    }
  }


  _unbindEvents() {
    lodash.forEach(this._private.boundShbTouchHandlers, (handler, eventName) => {
      this.shbTouch.removeEventListener(this.shbTouch.events[eventName], handler);
    });

    lodash.forEach(this._private.boundBounceHandlers, (handler, eventName) => {
      this.bounce.removeEventListener(eventName, handler);
    });

    if (this._private.boundDebouncedRefresh) {
      window.removeEventListener('resize', this._private.boundDebouncedRefresh);
    }
  }


  _calculateParams() {
    this._private.container.width = this._config.container.clientWidth;
    this._private.container.height = this._config.container.clientHeight;
    this._private.boundaries.end = this._private.container.width * (this._config.slides.length - 1);
  }


  // EVENT HANDLERS


  _onTouchStart() {
    this._state.isTouchActive = true;
    if (this._state.isBounceActive) this.bounce.stop();
  }


  _onTouchEnd() {
    this._state.isTouchActive = false;
    this._checkForBounceStart();
    this._checkForSlideChangeEnd();
    this._checkForPositionStable();
  }


  _onPushBy(event) {
    let pushBy = event.data,
      targetPosition = this._private.moveable.position;

    // directions obtained from ShbTouch are negative, ShbSwipe works with positive coordinates
    let pxToAdd = pushBy.x.px * pushBy.x.direction * -1;

    // overscrolling is allowed, multiply the displacement by a linear factor of the distance
    if (this._config.overscroll) {
      // overscrolling on the left end
      if (pushBy.x.direction > 0 && this._private.moveable.position < 0) {
        pxToAdd *= utils.easeLinear(Math.abs(this._private.moveable.position), 1, -1, this._config.maxTouchOverscroll);
      }
      // overscrolling on the right end
      else if (pushBy.x.direction < 0 && this._private.moveable.position > this._private.boundaries.end) {
        let distanceFromRight = this._private.boundaries.end - this._private.moveable.position;
        pxToAdd *= utils.easeLinear(Math.abs(distanceFromRight), 1, -1, this._config.maxTouchOverscroll);
      }

      targetPosition = this._private.moveable.position + pxToAdd;
    }
    // overscrolling is not allowed, constrain movement to the boundaries
    else {
      targetPosition = this._private.moveable.position + pxToAdd;

      // overscrolling on the left end
      if (targetPosition < 0) {
        targetPosition = 0;
      }
      // overscrolling on the right end
      else if (targetPosition > this._private.boundaries.end) {
        targetPosition = this._private.boundaries.end;
      }
    }

    this._updateMoveablePosition(targetPosition);
  }


  _onTouchEndWithMomentum(event) {
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
      this.bounce.start(this._private.moveable.position, targetPosition);
    }
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


  // CONDITION CHECKERS


  _checkForBounceStart() {
    if (!this._state.isTouchActive && !this._state.isBounceActive) {
      let targetPosition = this._getClosestBounceTarget();

      if (targetPosition !== this._private.moveable.position) {
        this.bounce.start(this._private.moveable.position, targetPosition);
      }
    }
  }


  _checkForPositionStable() {
    if (!this._state.isTouchActive && !this._state.isBounceActive) {
      this.dispatchEvent(new Event(events.positionStable), {
        position: this._private.moveable.position,
        progress: this._private.moveable.progress
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


  // MOVEMENT AND POSITIONING


  _updateMoveablePosition(newPosition) {
    if (newPosition !== this._private.moveable.position) {
      this._private.moveable.position = newPosition;
      this._private.moveable.progress = this._private.moveable.position / this._private.boundaries.end;

      // NOTE: not sure if this should be inside a RAF, as:
      // - pushBy gets triggered by a finger movement event (that's already in sync with RAF)
      // - bounceBy already gets executed by a RAF
      // TODO: test and research, especially on Android devices
      // requestAnimationFrame(() => this._updateSlidePositions());
      this._updateSlidePositions();

      this.dispatchEvent(new Event(events.positionChanged), {
        position: this._private.moveable.position,
        progress: this._private.moveable.progress
      });
    }
  }


  _updateSlidePositions() {
    // index of the slide that's currently most visible (> 50%)
    let newCurrentSlideIndex = Math.round(this._private.moveable.position / this._private.container.width),
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
    this._private.currentSlideAbsolutePosition = this._private.moveable.position - (this._private.currentSlideIndex * this._private.container.width);
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
    lodash.forEach(this._state.isSlideVisible, (isVisible, slideIndex) => {
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


  // HELPERS


  _getClosestBounceTarget() {
    let bounceTarget = this._private.moveable.position;

    // swiper is overscrolling left
    if (this._private.moveable.position < 0) {
      bounceTarget = 0;
    }
    // swiper is overscrolling right
    else if (this._private.moveable.position > this._private.boundaries.end) {
      bounceTarget = this._private.boundaries.end;
    }
    // swiper is somewhere in the middle
    else {
      // slide hangs on the left side relative to the container center
      if (Math.abs(this._private.currentSlideAbsolutePosition) < this._private.container.width / 2) {
        bounceTarget = this._private.currentSlideIndex * this._private.container.width;
      }
      // slide hangs on the right side relative to the container center
      else {
        bounceTarget = (this._private.currentSlideIndex + 1) * this._private.container.width;
      }
    }

    return bounceTarget;
  }
}
