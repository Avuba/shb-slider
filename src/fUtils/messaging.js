import { default as fUtils } from './index.js';


let _export = {};


/**
 * throw an error
 *
 * @param {1,2,n} : arbitrary list of arguments
 */
_export.error = function() {
  var message = 'ERROR:';

  fUtils.forEach(arguments, function(argument) {
    if (argument) message = message + '\n' + argument.toString();
  });

  if (!message) return;

  throw new Error(message);
};


/**
 * log a warning
 *
 * @param {1,2,n} : arbitrary list of arguments
 */
_export.warning = function() {
  var message = 'WARNING:';

  fUtils.forEach(arguments, function(argument) {
    if (argument) message = message + '\n' + argument.toString();
  });

  if (!message) return;

  if (console.warn) {
    console.warn(message);
  } else {
    console.log(message);
  }
};


export default _export;
