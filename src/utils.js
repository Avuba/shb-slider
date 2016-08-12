let _export = {};


/**
 * getting the absolute position relative to the DOCUMENT of a DOM NODE inside
 * another css transformed DOM NODE can be tricky. this method provides a simple
 * abstraction using WebKitCSSMatrix
 *
 * inspired by: http://stackoverflow.com/questions/4975727/how-do-i-get-the-position-of-an-element-after-css3-translation-in-javascript
 */
_export.getTranslatedNodePosition = function(domNode) {
  let nodeMatrix = new WebKitCSSMatrix(getComputedStyle(domNode).webkitTransform);

  return {
    x: domNode.offsetLeft + nodeMatrix.m41,
    y: domNode.offsetTop + nodeMatrix.m42
  }
};


/**
 * stops every form of event propagation
 */
_export.stopEvent = function(event) {
  event.stopPropagation();
  event.stopImmediatePropagation();
};


/**
  * @param {Number} t : the current time
  * @param {Number} b : the start value
  * @param {Number} c : the change in value
  * @param {Number} d : the duration time
  */
_export.easeLinear = function(t, b, c, d) {
  return c*t/d + b;
};


/**
  * @param {Number} t : the current time
  * @param {Number} b : the start value
  * @param {Number} c : the change in value
  * @param {Number} d : the duration time
  */
_export.easeOutCubic = function (t, b, c, d) {
  return c*((t=t/d-1)*t*t + 1) + b;
};


/**
 * adds the EventTarget interface to an object
 */
_export.addEventTargetInterface = function(target) {
  target.listeners = {};

  target.addEventListener = (type, callback) => {
    if (!(type in target.listeners)) {
      target.listeners[type] = [];
    }
    target.listeners[type].push(callback);
  };

  target.removeEventListener = (type, callback) => {
    if (!(type in target.listeners)) {
      return;
    }
    let stack = target.listeners[type];
    for (let i = 0, l = stack.length; i < l; i++) {
      if (stack[i] === callback) {
        stack.splice(i, 1);
        return target.removeEventListener(type, callback);
      }
    }
  };

  target.dispatchEvent = (event) => {
    if (!(event.type in target.listeners)) {
      return;
    }
    let stack = target.listeners[event.type];
    // TODO this doesn't work, event.target is protected; in any case, should be a DOM node
    // event.target = target;
    for (let i = 0, l = stack.length; i < l; i++) {
      stack[i].call(target, event);
    }
  };

  target.dispatchEventWithData = (event, data) => {
    event.data = data;
    target.dispatchEvent(event);
  };
};


// TODO remove
/**
 * adds EventTarget functionality to an object by "borrowing" the EventTarget
 * functionality of a DOMNode.
 */
/*
_export.addEventDispatcher = function(target, domNode) {
  target.addEventListener = domNode.addEventListener.bind(domNode);
  target.removeEventListener = domNode.removeEventListener.bind(domNode);
  target.dispatchEvent = domNode.dispatchEvent.bind(domNode);
};
*/

export default _export;
