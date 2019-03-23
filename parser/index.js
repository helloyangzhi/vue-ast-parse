/**
 * parser.js
 */

import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import he from 'he'

import { 
    cached,
    addProp,
    addAttr,
    addHandler,
    getBindingAttr,
    getAndRemoveAttr,
    addDirective,
    genAssignmentCode,
    mustUseProp,
    pluckModuleFunction,
    extend
} from './helpers'


const decodeHTMLCached = cached(he.decode)

export const onRE = /^@|^v-on:/
export const dirRE = /^v-|^@|^:/
export const forAliasRE = /([^]*?)\s+(?:in|of)\s+([^]*)/
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
const stripParensRE = /^\(|\)$/g

const argRE = /:(.*)$/
export const bindRE = /^:|^v-bind:/
const modifierRE = /\.[^.]+/g

let platformMustUseProp = mustUseProp;
const preserveWhitespace = false


export function createASTElement (tag, attrs, parent) {
    return {
        type: 1,
        tag,
        attrsList: attrs,
        attrsMap: makeAttrsMap(attrs),
        parent,
        children: []
    }
}

export function processFor (el) {
    let exp
    if ((exp = getAndRemoveAttr(el, 'v-for'))) {
        const res = parseFor(exp)
        if (res) {
            extend(el, res)
        } else if (process.env.NODE_ENV !== 'production') {
            warn(
                `Invalid v-for expression: ${exp}`
            )
        }
    }
}

function isTextTag (el) {
  return el.tag === 'script' || el.tag === 'style'
}

export function parseFor (exp) {
    const inMatch = exp.match(forAliasRE)
    if (!inMatch) return
    const res = {}
    res.for = inMatch[2].trim()
    const alias = inMatch[1].trim().replace(stripParensRE, '')
    const iteratorMatch = alias.match(forIteratorRE)
    if (iteratorMatch) {
        res.alias = alias.replace(forIteratorRE, '')
        res.iterator1 = iteratorMatch[1].trim()
        if (iteratorMatch[2]) {
            res.iterator2 = iteratorMatch[2].trim()
        }
    } else {
        res.alias = alias
    }
    return res
}

function processIf (el) {
    const exp = getAndRemoveAttr(el, 'v-if')
    if (exp) {
        el.if = exp
        addIfCondition(el, {
            exp: exp,
            block: el
        })
    } else {
        if (getAndRemoveAttr(el, 'v-else') != null) {
            el.else = true
        }
        const elseif = getAndRemoveAttr(el, 'v-else-if')
        if (elseif) {
            el.elseif = elseif
        }
    }
}

function processOnce (el) {
    const once = getAndRemoveAttr(el, 'v-once')
    if (once != null) {
        el.once = true
    }
}
function processKey (el) {
    const exp = getBindingAttr(el, 'key')
    if (exp) {
        el.key = exp
    }
}

function processRef (el) {
    //处理ref标签
    const ref = getBindingAttr(el, 'ref')
    if (ref) {
        el.ref = ref
        //检查ref标签是否则v-for标签中
        el.refInFor = checkInFor(el)
    }
}

function checkInFor (el) {
  let parent = el
  while (parent) {
    if (parent.for !== undefined) {
      return true
    }
    parent = parent.parent
  }
  return false
}

function processSlot (el) {
  if (el.tag === 'slot') {
    el.slotName = getBindingAttr(el, 'name')
  } else {
    let slotScope
    if (el.tag === 'template') {
      slotScope = getAndRemoveAttr(el, 'scope')
      el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')
    } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
      el.slotScope = slotScope
    }
    const slotTarget = getBindingAttr(el, 'slot')
    if (slotTarget) {
      el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget
      // preserve slot as an attribute for native shadow DOM compat
      // only for non-scoped slots.
      if (el.tag !== 'template' && !el.slotScope) {
        addAttr(el, 'slot', slotTarget)
      }
    }
  }
}

function processComponent (el) {
  let binding
  if ((binding = getBindingAttr(el, 'is'))) {
    el.component = binding
  }
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true
  }
}

function parseModifiers (name) {
  const match = name.match(modifierRE)
  if (match) {
    const ret = {}
    match.forEach(m => { ret[m.slice(1)] = true })
    return ret
  }
}

const camelizeRE = /-(\w)/g
export const camelize = cached((str) => {
  return str.replace(camelizeRE, (_, c) => c ? c.toUpperCase() : '')
})





function checkForAliasModel (el, value) {
  let _el = el
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
        `You are binding v-model directly to a v-for iteration alias. ` +
        `This will not be able to modify the v-for source array because ` +
        `writing to the alias is like modifying a function local variable. ` +
        `Consider using an array of objects and use v-model on an object property instead.`
      )
    }
    _el = _el.parent
  }
}



function processAttrs (el) {
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, isProp
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name
    value = list[i].value
    //dirRE = /^v-|^@|^:/ ,判定是否带有'v-'标记或者'@'或者':'
    if (dirRE.test(name)) {
      // mark element as dynamic
      el.hasBindings = true
      // modifiers
      modifiers = parseModifiers(name) //解析类似xx.xx.xx 属性
      if (modifiers) {
        name = name.replace(modifierRE, '')
      }
      //bindRE = /^:|^v-bind:/
      if (bindRE.test(name)) { // v-bind
        name = name.replace(bindRE, '')
        value = parseFilters(value)
        isProp = false//非props属性
        if (modifiers) {
          if (modifiers.prop) {
            isProp = true
            name = camelize(name)
            if (name === 'innerHtml') name = 'innerHTML'
          }
          if (modifiers.camel) {
            name = camelize(name)
          }
          if (modifiers.sync) {
            addHandler(
              el,
              `update:${camelize(name)}`,
              genAssignmentCode(value, `$event`)
            )
          }
        }
        if (isProp || (
          !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
        )) {
          addProp(el, name, value)
        } else {
          addAttr(el, name, value)
        }
      } else if (onRE.test(name)) { // v-on onRE =/^@|^v-on:/
        name = name.replace(onRE, '')
        //添加处理器
        addHandler(el, name, value, modifiers, false, warn)
      } else { // normal directives
        //dirRE = /^v-|^@|^:/ ，处理指令如v-model
        name = name.replace(dirRE, '')
        // parse arg
        const argMatch = name.match(argRE)
        const arg = argMatch && argMatch[1]
        if (arg) {
          name = name.slice(0, -(arg.length + 1))
        }
        addDirective(el, name, rawName, value, arg, modifiers)
        if (process.env.NODE_ENV !== 'production' && name === 'model') {
          checkForAliasModel(el, value)
        }
      }
    } else {
      // literal attribute
      if (process.env.NODE_ENV !== 'production') {
        const res = parseText(value)
        if (res) {
          warn(
            `${name}="${value}": ` +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div id="{{ val }}">, use <div :id="val">.'
          )
        }
      }
      addAttr(el, name, JSON.stringify(value))
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      // 如果不是组件，并且name == muted
      if (!el.component &&
          name === 'muted' &&
          platformMustUseProp(el.tag, el.attrsMap.type, name)) {
        addProp(el, name, 'true')
      }
    }
  }
}

export function processElement (element, options) {
    processKey(element)

    // determine whether this is a plain element after
    // removing structural attributes
    element.plain = !element.key && !element.attrsList.length
    //处理ref属性
    processRef(element)
    //处理slot
    processSlot(element)
    //处理component，如<componentName is="otherComponent"></componentName>
    processComponent(element)
    // for (let i = 0; i < transforms.length; i++) {
    //     element = transforms[i](element, options) || element
    // }
    processAttrs(element)
}

export function parser(template, options) {

    const stack = []
    let currentParent
    let root

    function closeElement (element) {
    }

    parseHTML(template, {
        start(tag, attrs) {
            const ns = false
            let element = createASTElement(tag, attrs, currentParent);
            processFor(element)
            processIf(element)
            processOnce(element)
            // element-scope stuff
            processElement(element, options)

            if (!root) {
                root = element
            } else if(!stack.length) {
                if(root.if && (element.elseif || element.else)) {
                    addIfCondition(root, {
                        exp: element.elseif,
                        block: element
                    })
                }
            }
            if (currentParent && !element.forbidden) {
                if(element.elseif || element.else) {
                    processIfConditions(element, currentParent)
                }else if(element.slotScope) {
                    currentParent.plain = false;
                    const name = element.slotTarget || "default";
                  ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
                }else{
                    currentParent.children.push(element)
                    element.parent = currentParent
                }
            }
            //关闭元素
            currentParent = element
            stack.push(element)
            //单元tag
            //closeElement(element)
        },

        end () {
            const element = stack[stack.length -1]
            const lastNode = element.children[element.children.length - 1]
            if (lastNode && lastNode.type === 3 && lastNode.text === ' ') {
                element.children.pop()
            }

            stack.length -= 1
            currentParent = stack[stack.length -1]
            closeElement(element)
        },

        chars (text) {
            if (!currentParent) {
                return
            }
            const children = currentParent.children;
            text = text.trim() ? isTextTag(currentParent) ? text : decodeHTMLCached(text) 
            : preserveWhitespace && children.length ? ' ' : ''

            if (text) {
                let res
                //处理text,解析出{{xx}}包含的内容，tokens
                if(text !== ' ' && (res = parseText(text))) {
                    children.push({
                        type: 2,
                        expression: res.expression,
                        tokens: res.tokens,
                        text
                    })
                } else if(text !== ' ' || !children.length || children[children.length -1].text !== ' ') {
                    children.push({
                        type: 3,
                        text
                    })
                }
            }
        }
    })

    return root;
}

export function addIfCondition (el, condition) {
    if (!el.ifConditions) {
        el.ifConditions = []
    }
    el.ifConditions.push(condition)
}

function makeAttrsMap (attrs) {
    const map = {}
    for (let i = 0, l = attrs.length; i < l; i++) {
        map[attrs[i].name] = attrs[i].value
    }
    return map
}