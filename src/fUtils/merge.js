import { default as fUtils } from './index.js';


let _export = {},
  _private = {};


/**
 * deep merge of a source object with a target object. accepts all objects
 * that are mutable and iterateable (dicts, collections, globals, array-likes)
 * as target and as source
 *
 * @note
 * - keys inside source are always stronger than keys inside target
 * - object references of source remain intact inside target but only in case
 * target has got corresponding object itself. in case target has, the keys
 * of the object inside source get merged with the keys inside target
 * - onDuplicate and onKey are only passive listeners and have no power of
 * breaking an ongoing merge
 *
 * @param {Object} target : object source gets merged into
 * @param {Object} source : object to merge into target
 * @return {Object} : returns the updated target
 */
_export.mergeDeep = function(target, source, options) {
  /*
  required pre-check before the actual recursive part of the function as the
  assignment using "target = source" can only work on the top-most level
  */
  if (fUtils.isMutableAndIterateable(target)
      && fUtils.isMutableAndIterateable(source)) {
    _private.mergeDeep(target, source, options);
  }
  else {
    target = source;
  }

  return target;
};


_private.mergeDeep = function(target, source, options) {
  // set convertKeys true in case we're merging a dict into an array
  var convertKeys = (target instanceof Array && !(source instanceof Array)),
    sourceKeys = convertKeys ? Object.keys(source) : null;

  fUtils.forEach(source, function(value, key) {
    // converting dict- to array-keys enables merging dicts into arrays
    if (convertKeys && isNaN(key)) {
      key = sourceKeys.indexOf(key);
    }

    if (options) {
      if (options.onKey) {
        options.onKey(value, key);
      }

      if (fUtils.is(target[key]) && options.onDuplicate) {
        options.onDuplicate(value, key);
      }
    }

    if (target[key]
      && fUtils.isMutableAndIterateable(target[key])
        && fUtils.isMutableAndIterateable(value)) {
      _private.mergeDeep(target[key], value, options);
    }
    else {
      // assignment must happen using target[key] to keep object references
      target[key] = value;
    }
  });

  return target;
};


export default _export;
