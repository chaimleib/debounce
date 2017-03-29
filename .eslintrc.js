module.exports = {
  "extends": "eslint:recommended",
  "env": {
    "node": true,
  },
  "rules": {
    "indent": ["error", 2],
    "linebreak-style": ["error", "unix"],
    "semi": ["error", "always"],
    "no-trailing-spaces": "error",
    "no-console": "off",
  },
  "plugins": ["json"],
  "parserOptions": {
    "ecmaVersion": 2016,
    "ecmaFeatures": {
      "impliedStrict": true,
    },
  },
};

