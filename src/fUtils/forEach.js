import { default as fUtils } from './index.js';


let _export = {};


/**
 * iterate over collections, dicts, strings and functions
 *
 * @param {Object} source : type dict, array, array-like, string or function
 * @param {Function} action : function to be performed on every key / element
 * @return {Object} : returns the original source
 */
_export.forEach = function(source, action) {
  if (fUtils.isNot(source)) return source;

  /*
  "source instanceof String" does not work with string literals (strings
  that were constructed using " " and not with new String(" ")), typeof is
  therefore required for checking
  */
  if (!(source instanceof Object) && typeof source !== 'string') {
    fUtils.error('fUtils.forEach', 'input type not supported');
  }

  if (source instanceof Array) {
    // TODO: explain why this is the fastest method, link jsPerf
    source.forEach(action);
  }
  else {
    // TODO: explain why this is the fastest method, link jsPerf
    Object.keys(source).forEach(function(key) {
      action(source[key], key);
    });
  }

  return source;
};


/**
 * reverse iterate over collections, dicts, strings and functions
 *
 * @warning
 * even though dicts are a supported input type, it's not recommended to use
 * this function for reverse-iterating dicts as the order of keys cannot be
 * guaranteed inside ES5 environments
 *
 * @param {Object} source : type dict, array, array-like, string or function
 * @param {Function} action : function to be performed on every key / element
 * @return {Object} : returns the original source
 */
_export.forEachReverse = function(source, action) {
  if (fUtils.isNot(source)) return source;

  /*
  "source instanceof String" does not work with string literals (strings
  that were constructed using " " and not with new String(" ")), typeof is
  therefore required for checking
  */
  if (!(source instanceof Object) && typeof source !== 'string') {
    fUtils.error('fUtils.forEachReverse', 'input type not supported');
  }

  if (source instanceof Array) {
    // TODO: explain why this is the fastest method, link jsPerf
    var index = source.length;
    while (index--) {
      action(source[index], index);
    }
  }
  else {
    // TODO: explain why this is the fastest method, link jsPerf
    Object.keys(source).reverse().forEach(function(key) {
      action(source[key], key);
    });
  }

  return source;
};


export default _export;
