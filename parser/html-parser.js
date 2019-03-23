/**
 * html-parser.js
 */

import { makeMap } from './helpers'

const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/

const ncname = '[a-zA-Z_][\\w\\-\\.]*'
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
const startTagOpen = new RegExp(`^<${qnameCapture}`)
const startTagClose = /^\s*(\/?)>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being pased as HTML comment when inlined in page
const comment = /^<!\--/
const conditionalComment = /^<!\[/

const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t'
}

const encodedAttr = /&(?:lt|gt|quot|amp);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#10|#9);/g

export const isPlainTextElement = makeMap('script,style,textarea', true)

export function parseHTML (html, options) {
    const stack = [];
    let index = 0;
    let last, lastTag;
    while (html) {
        last = html;
        //是否存在最后一个tag
        if(!lastTag || !isPlainTextElement(lastTag)){
            //判断<位置
            let textEnd = html.indexOf('<');
            //开始标记,如 <div
            if(textEnd == 0) {

                // End tag:
                const endTagMatch = html.match(endTag)
                if (endTagMatch) {
                    const curIndex = index
                    advance(endTagMatch[0].length)
                    parseEndTag(endTagMatch[1], curIndex, index)
                    continue
                }

                const startTagMatch = parseStartTag();//转换字符串为match
                if (startTagMatch) {
                    handleStartTag(startTagMatch);//处理match对象，主要移除无用的信息
                    continue;
                }
            }

            //不是以<标记开始
            let text, rest, next
            if(textEnd >= 0){
                rest = html.slice(textEnd)
                //非结束标签，非开始标记
                while (
                    !endTag.test(rest) &&
                    !startTagOpen.test(rest)
                ) {
                    next = rest.indexOf('<', 1)
                    if(next < 0) break;
                    textEnd += next;
                    rest = html.slice(textEnd)
                }
                text = html.substring(0, textEnd)
                advance(textEnd)
            }

            if(textEnd < 0) {
                text = html
                html = ''
            }

            //处理字符
            if(options.chars && text) {
                options.chars(text)
            }
        } else {
          let endTagLength = 0
          const stackedTag = lastTag.toLowerCase()
          const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
          const rest = html.replace(reStackedTag, function (all, text, endTag) {
            endTagLength = endTag.length
            if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
              text = text
                .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
                .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
            }
           
            if (options.chars) {
              options.chars(text)
            }
            return ''
          })
          index += html.length - rest.length
          html = rest
          parseEndTag(stackedTag, index - endTagLength, index)
        }

        if (html === last) {
          options.chars && options.chars(html)
          if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
            options.warn(`Mal-formatted tag at end of template: "${html}"`)
          }
          break
        }
    }

    function advance (n) {
        index += n
        html = html.substring(n)
    }

    function parseStartTag () {
        const start = html.match(startTagOpen)
        if (start) {
            const match = {
                tagName: start[1],
                attrs: [],
                start: index
            }
            advance(start[0].length)
            //处理attr节点
            let end, attr
            while (!(end = html.match(startTagClose)) && (attr = html.match(attribute))) {
                advance(attr[0].length)
                match.attrs.push(attr)
            }
            //处理结束标记
            if (end) {
                match.unarySlash = end[1]
                advance(end[0].length)
                match.end = index
                return match
            }
        }
    }

    //push match into stack
    function handleStartTag (match) {
        const tagName = match.tagName

        const l = match.attrs.length
        const attrs = new Array(l);
        //处理属性
        for(let i = 0 ; i < l ; i++) {
            const args = match.attrs[i];
            const value = args[3] || args[4] || args[5] || ''
            attrs[i] = {
                name: args[1],
                value: value
            }
        }
        //push进stack
        stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs })
        lastTag = tagName
        
        //处理属性
        if(options.start) {
            options.start(tagName, attrs, match.start, match.end);
        }
    }

    function parseEndTag (tagName, start, end)　{
        let pos, lowerCasedTagName
        if (start == null) start = index
        if (end == null) end = index

        if (tagName) { //有tagName
            //查找tagName在stack中的位置
            for (pos = stack.length - 1; pos >= 0; pos --) {
                if (stack[pos].lowerCasedTagName == lowerCasedTagName) {
                    break;
                }
            }
        } else {
            //如果没有，则置为 0
            pos = 0;
        }
        //存在tagName
        if (pos >= 0) {
            for (let i = stack.length - 1; i >= pos; i--) {
                if ((i > pos || !tagName) && options.warn) {
                    options.warn(
                        `tag <${stack[i].tag}> has no matching end tag.`
                    )
                }
                if (options.end) {
                    options.end(stack[i].tag, start, end);
                }
            }

            stack.length = pos;
            lastTag = pos && stack[pos - 1].tag
        }

    }
}