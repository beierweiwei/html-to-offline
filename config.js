module.exports = {
  replace: {
    "//at.alicdn.com": "{outputRelative}\\at.alicdn.com",
    "href=\"/": "{outputRelative}\\ant.design"
  },
  entry: "./source",
  output: "./dist"
}