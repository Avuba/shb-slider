import { default as fUtils } from './index.js';


let _export = {};


/**
 * using "typeof object" can be missleading as it returns "object" in many
 * cases. for example, "typeof []" and "typeof null" both return "object".
 * also "instanceof object" can lead to unexpected results. for example,
 * "'test' instanceof String" will return false
 *
 * @reference
 * inspired by / read more: http://bit.ly/1ZJgADf
 *
 * @examples
 * see fUtils.spec.js around line 70 for detailed examples
 *
 * @param {Object} toCheck
 * @return {String} : type of toCheck as a string
 */
_export.getType = function(toCheck) {
  if (toCheck === undefined) return 'undefined';
  if (toCheck === null) return 'null';
  if (toCheck === Infinity) return 'infinity';
  if (typeof toCheck === 'number' && isNaN(toCheck)) return 'NaN';

  return Object.prototype.toString.call(toCheck).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
};


/**
 * checking the existence of a javascript object using "if (object)" can lead
 * to false negatives as "0" and "" both return "false" even though the number
 * / string actually exists
 *
 * @param {Object} toCheck
 * @return {Boolean} : returns true if toCheck is not null or undefined
 */
_export.is = function(toCheck) {
  return toCheck !== null && toCheck !== undefined;
};


/**
 * inverted version of _export.is()
 *
 * @param {Object} toCheck
 * @return {Boolean} : returns true if toCheck is null or undefined
 */
_export.isNot = function(toCheck) {
  return toCheck === null || toCheck === undefined;
};


/**
 * some objects, like a nodelist or the arguments object inside a function,
 * may look like an array but still miss some critical array methods, for
 * example forEach()
 *
 * @examples
 * see fUtils.spec.js around line 110 for detailed examples
 *
 * @param {Object} toCheck
 * @return {String} : returns true if toCheck is array-like
 */
_export.isArrayLike = function(toCheck) {
  return _export.is(toCheck)
    && _export.is(toCheck.length)
      && !(/^(array|string|function|global)$/.test(_export.getType(toCheck)));
};


/**
 * check if object has enumerable properties
 *
 * @param  {Object} toCheck
 * @return {Boolean} : returns true if toCheck is iterateable
 */
_export.isIterateable = function(toCheck) {
  return /^(object|array|global|string)$/.test(_export.getType(toCheck)) || _export.isArrayLike(toCheck);
};


/**
 * check if object is mutable, e.g. it's possible to edit its value without
 * creating a new copy of it
 *
 * @param  {Object} toCheck
 * @return {Boolean} : returns true if toCheck is mutable
 */
_export.isMutable = function(toCheck) {
  return /^(object|array|global|function|date|regexp|error)$/.test(_export.getType(toCheck)) || _export.isArrayLike(toCheck);
};


/**
 * check if object is mutable and has enumerable properties
 *
 * @param  {Object} toCheck
 * @return {Boolean} : returns true if toCheck is mutable and iterateable
 */
_export.isMutableAndIterateable = function(toCheck) {
  return /^(object|array|global)$/.test(_export.getType(toCheck)) || _export.isArrayLike(toCheck);
};


/**
 * check if object is immutable, e.g. the only way to edit its value is by
 * creating a new copy of it
 *
 * @param  {Object} toCheck
 * @return {Boolean} : returns true if toCheck is mutable
 */
_export.isImmutable = function(toCheck) {
  return /^(boolean|string|number|NaN|infinity|null|undefined)$/.test(_export.getType(toCheck));
};


/**
 * although it's possible to find out if an object is a number using a reverse
 * isNaN() check, ES5 has no way to find out if an object is an integer
 *
 * @reference
 * inspired by / read more: http://bit.ly/1OYkVgJ
 *
 * @examples
 * see fUtils.spec.js around line 140 for detailed examples
 *
 * @param {Object} toCheck
 * @return {String} : returns true if toCheck is an integer
 */
_export.isInt = function(toCheck) {
  if (isNaN(toCheck)) return false;
  var x = parseFloat(toCheck);
  return (x | 0) === x;
};


export default _export;
