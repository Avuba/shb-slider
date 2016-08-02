import { default as fUtils } from './index.js';


let _export = {},
  _private = {};


/**
 * deep clone of a given object of almost any type. excluded types are
 * functions and the window object
 *
 * @note
 * - the clone will not contain any references to the source, all objects get
 * duplicated in the process
 * - cloneDeep detects infinite recursions
 * - cloned functions / classes will not contain prototype properties
 *
 * @reference
 * - inspired by / read more: http://mzl.la/1li0d0T
 * - additional inspiration: http://bit.ly/1MupRFr
 *
 * @param {Object} source : object to clone
 * @return {Object} : returns the clone
 */
_export.cloneDeep = function(source) {
  /*
  required entry point before the actual recursive part of the function for
  re-creating an empty recursion buffer on every new call
  */
  return _private.cloneDeep(source, []);
};


_private.cloneDeep = function(source, recursionBuffer) {
  if (!(source instanceof Object)) {
    return source;
  }

  if (source instanceof Window) {
    fUtils.error('_export.cloneDeep', 'input type not supported');
  }

  if (fUtils.isMutableAndIterateable(source)) {
    /*
    a recursion happens when the same object appears twice while going down
    a single branch of the source object tree. for illustration:

    source object tree:
      toClone: {
        a: {
          b: toClone <-- this is where the recursion happens
        }
      }

    single branch (= sequence of branch elements = recursionBuffer):
      [
        toClone,
        { b: toClone }, <-- no recursion detected, toClone !== { b: toClone }
        toClone <-- recursion detected, toClone === toClone
      ]
    */
    if (recursionBuffer.indexOf(source) > -1) {
      fUtils.error('_export.cloneDeep', 'infinite recursion detected');
    }
    else {
      recursionBuffer.push(source);
    }
  }

  var toReturn;

  if (source instanceof Function) {
    toReturn = new Function('return ' + source.toString())();
  }
  else if (fUtils.isArrayLike(source)) {
    toReturn = (function() { return arguments; }());
  }
  else {
    var Constructor = source.constructor;

    switch (Constructor) {
      case RegExp:
        toReturn = new Constructor(source);
        break;
      case Date:
        toReturn = new Constructor(source.getTime());
        break;
      default:
        toReturn = new Constructor();
    }
  }

  fUtils.forEach(source, function(value, key) {
    toReturn[key] = _private.cloneDeep(value, recursionBuffer);
  });

  /*
  remove the latest addition to the recursionBuffer when exiting the current
  branch of the source object tree
  */
  recursionBuffer.splice(recursionBuffer.length - 1, 1);

  return toReturn;
};


export default _export;
