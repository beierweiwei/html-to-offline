/**
 * 1. 从source读取文件,写入到dist
 * 2. 替换路径
 *   2.1 源路径使用域名
 *     域名中的资源都会在dist根目录下,替换规则,将带http, https, \\开头的url协议改成相对dist目录的相对路径
 *   2.2 源路径使用相对路径
 *      不做修改
 *   2.3 源路径使用/绝对路径
 *      向上查找dist下的一级目录如 /test
 */
const { writeFileSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync } = require("fs")
const { resolve, basename, relative, extname, sep, join, dirname } = require("path")
const { get } = require("https")
const config = require('./config')
const ignores = /^\./
let options = createOptions(config)
const hosts = getAllHosts()
const fileMap = {}

run(options.rootPath)

function run (p) {
  readR(options.rootPath, replaceFileText)
}
function readR (dir, cb) {
  const files = readdirSync(dir)
  for (let f of files) {
    let fPath = resolve(dir, f)
    if (ignores.test(f)) continue
    if (statSync(fPath).isDirectory()) {
      readR(fPath, cb)
    } else {
      if (isHtml(f)) {
        cb(fPath)
      } else {
        writeFileToOutput(fPath, readFileSync(fPath))
      }
    }
  }
}

function replace(text, replaceArr, tplVarsMap) {
  // 获取根路径的相对路径，替换以下路径
  for (let replaceItem of replaceArr) {
    let [ originUrl, targetUrl ] = replaceItem
    if (hasTplVar(targetUrl)) {
      targetUrl = replaceTplVar(targetUrl, tplVarsMap)
    }
    text = text.replace(new RegExp(originUrl, 'g'), targetUrl)
  }
  return text
}
/**
 * 1. 从source读取文件,写入到dist
 * 2. 替换路径
 *   2.1 源路径使用域名
 *     域名中的资源都会在dist根目录下,替换规则,将带http, https, \\开头的url协议改成相对dist目录的相对路径
 *   2.2 源路径使用相对路径
 *      不做修改
 *   2.3 源路径使用/绝对路径
 *      向上查找dist下的一级目录如 /test
 * 
 *   
 */
function transUrlToLocalPath(originUrl, filePath) {

  let relativeToEntry = relative(dirname(filePath), options.rootPath)

  let target = originUrl
  console.log(originUrl)
  if (isHttp(target)) {
    // 替换originUrl
    let host = getUrlHost(target)
    if (!host) return target

    target = join(relativeToEntry ,  getUrlHost(target))
  } else if (isRootUrl(target)) {
    let fileHost = getFileHostDir(filePath)
    if (!fileHost) return target
    target = join(relativeToEntry, fileHost, originUrl.split('/')[1])
  }
  return  target
}

function replacePathForWebpack (filePath) {

}
function defaultReplaceUrl(text, filePath) {
  return text.replace(/(href=|link=|src=|url\()("|')((https?:)?\/\/|\/)([^\/"']+)/g, function(match, p1, p2, proto, p4, host) {
    let res =  p1 + p2 + transUrlToLocalPath(proto+host, filePath)
    return res;
  })
}

function replaceTplVar(tpl, varsMap = {}) {
  Object.keys(varsMap).forEach(varName => {
    let varValue = varsMap[varName]
    tpl = tpl.replace(new RegExp("{\\s*" + varName + "\\s*}", 'g'), varValue)
  })
  return tpl
}
/**
 * 
 * @param {*} path 
 */
function replaceFileText (path) {
  let replaceArr = options.replaceArr
  let text = readFileSync(path, {encoding: 'utf-8'})
  let tplVarsMap = {
    rootPath: options.rootPath,
    output: options.output,
    project: process.cwd(),
    rootRelative: options.rootRelative,
    outputRelative: options.outputRelative

  }
  // text = replace(text, replaceArr, tplVarsMap)
  text = defaultReplaceUrl(text, path)
  // 替换js中webpack__require路径
  text = replacePathForWebpack(path)
  writeFileToOutput(path, text)
}

function getPath (relativePath) {
  const curt = process.cwd()
  return resolve(curt, relativePath)
}
function getUrlHost (url) {
  res = /(https?:)?\/\/([^\/]+)/.exec(url)
  return res && res[2] || ''
}
function getAllHosts () {
  return readdirSync(options.rootPath)
}
function getFileHostDir(filePath) {
  // dist或source的直接子目录
  return hosts.find(item => {
    return filePath.includes(item)
  })
}
function getRelativeToOutput (path) {
  return resolve(options.output,  relative(options.rootPath, path))
}
function isHtml (file) {
  return ['.html', '.js', '.css'].includes(extname(file))
}
function isJs(file) {

}
function isHttp (url) {
  return /^(https?:)?\/\//.test(url)
}
function isRootUrl (url) {
  return /^\//.test(url)
}
function createOptions (config) {
  let options = {}
  // createReplaceOptions
  const { replace } = config

  options.replaceArr  = Object.entries(replace).reduce((optionArr, [key, value]) => {
    // key是原始路径, value是被替换的路径
    optionArr.push([key, value])
    return optionArr
  }, [])
  // rootPath
  options.rootPath = getPath(config.entry)
  options.rootRelative = relative(process.cwd(), options.rootPath)
  // output
  options.output = getPath(config.output)
  options.outputRelative = relative(options.rootPath, options.output)
  console.log('-----options------', options)
  return options
}

function hasTplVar (str) {
  return /{\s*\S+\s*}/.test(str)
}

function writeFile (path, content) {
  const relativePath = relative(options.rootPath, path)
  const pathArr = relativePath.split(sep)
  pathArr.reduce((_path, fragment, idx) => {
    if (idx >= pathArr.length - 1) return _path
    _path = _path +  sep + fragment
    if (!existsSync(_path)) {
      mkdirSync(_path)
    }
    return _path
  }, options.rootPath)
  writeFileSync(path, content)

}
function writeFileToOutput (path, content) {
  writeFile(getRelativeToOutput(path), content)
}

function mapFile (source, target) {
  let res
  if (!target) {
     res = fileMap[source]
     if (!res) {
       let matchTargetItem = Object.entries(fileMap).find(([s, t]) => t === source)
       if (matchTargetItem) return matchTargetItem[0]
     }
  }
  fileMap[source] = target
  return fileMap
}

