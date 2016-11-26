/**
  ease parameters explained:

  t = the current time
  b = the start value
  c = the change in value
  d = the duration time

  thanks to: http://gsgd.co.uk/sandbox/jquery/easing/jquery.easing.1.3.js
  see examples here: http://easings.net
*/


let _export = {};


_export.easeLinear = function(t, b, c, d) {
  return c*t/d + b;
};


_export.easeOutCubic = function (t, b, c, d) {
  return c*((t=t/d-1)*t*t + 1) + b;
};


_export.easeInOutCubic = function (t, b, c, d) {
  if ((t/=d/2) < 1) return c/2*t*t*t + b;
	return c/2*((t-=2)*t*t + 2) + b;
};


export default _export;
