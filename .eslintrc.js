module.exports = {
  "root": true,
  "parserOptions": {
    "ecmaVersion": 6,
    "sourceType": "module"
  },
  "rules": {
    // items followed by a comment can be automatically fixed

    // possible errors
    "no-extra-semi": "warn", //
    "no-irregular-whitespace": "warn",
    "no-unreachable": "warn",

    // best practices
    "curly": ["warn", "multi-line"],
    "no-multi-spaces": "warn", //
    "vars-on-top": "warn",

    // strict mode

    // variables
    "no-unused-vars": "warn",
    "no-use-before-define": "warn",

    // node.js and commonjs

    // stylistic issues
    "block-spacing": "warn", //
    "brace-style": ["warn", "stroustrup"],
    "camelcase": "warn",
    "comma-dangle": "warn",  //
    "comma-spacing": ["warn", { "before": false, "after": true }],  //
    "comma-style": ["warn", "last"],
    "func-style": ["warn", "declaration", { "allowArrowFunctions": true }],
    "indent": ["warn", 2],  //
    "key-spacing": ["warn", { "beforeColon": false, "afterColon": true }],  //
    "keyword-spacing": ["warn", { "before": true, "after": true }],  //
    "no-array-constructor": "warn",
    "no-tabs": "warn",
    "no-trailing-spaces": "warn", //
    "no-whitespace-before-property": "warn", //
    "one-var": ["warn"],
    "semi-spacing": ["warn", {"before": false, "after": true}], //
    "semi": "warn", //
    "space-before-blocks": "warn", //

    // ecmascript 6
    "constructor-super": "warn",
    "no-class-assign": "warn",
    "no-const-assign": "warn",
    "no-dupe-class-members": "warn",
    "no-this-before-super": "warn",
    "no-var": "warn", //
    "prefer-arrow-callback": "warn"
  }
}
