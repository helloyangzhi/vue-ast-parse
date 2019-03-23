# vue-ast-parse
关于Vue中AST(abstract syntax tree)的生成过程，包括对template的解析，以及对属性，指令，事件，以及slot，component的处理。

``` javascript
    <div id="app" class="klz">
        <li v-bind:test = "fdfdfa">v-bind</li>
        <slot>fadsfa</slot>
        <li ref = "p1">v-bind</li>
        <li v-for="(item,index) in itemList">v-for</li>
        <li v-if="num == 10">v-if</li>
        <router-view></router-view>
    </div>
```

![code](https://github.com/helloyangzhi/vue-ast-parse/blob/master/1111.png)
