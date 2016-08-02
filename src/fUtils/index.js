import { default as type } from './type.js';
import { default as messaging } from './messaging.js';
import { default as forEach } from './forEach.js';
import { default as merge } from './merge.js';
import { default as clone } from './clone.js';
import { default as misc } from './misc.js';


let _export = {},
  simpleMerge = function(target, source) {
    for (var key in source) {
      if (source.hasOwnProperty(key)) {
        target[key] = source[key];
      }
    }
  };


simpleMerge(_export, type);
simpleMerge(_export, messaging);
simpleMerge(_export, forEach);
simpleMerge(_export, merge);
simpleMerge(_export, clone);
simpleMerge(_export, misc);


export default _export;
