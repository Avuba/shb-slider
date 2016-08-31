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
    if (!(type in target.listeners)) return;

    let stack = target.listeners[type];
    for (let i = 0, l = stack.length; i < l; i++) {
      if (stack[i] === callback) {
        stack.splice(i, 1);
        return target.removeEventListener(type, callback);
      }
    }
  };

  target.dispatchEvent = (event, data) => {
    if (!(event.type in target.listeners)) return;
    if (data) event.data = data;

    let stack = target.listeners[event.type];
    for (let i = 0, l = stack.length; i < l; i++) {
      stack[i].call(target, event);
    }
  };
};


export default _export;
