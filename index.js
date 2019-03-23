/**
 * index
 */

import { parser } from './parser/index.js';

export function render(template) {
    return parser(template);
}

var template = document.getElementById("app").outerHTML;
//var template = '<div id="app" class="ssd"><router-view></router-view></div>';

let res = render(template);
console.log(res);
