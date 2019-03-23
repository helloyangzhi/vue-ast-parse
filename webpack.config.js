const webpack = require('webpack');
const path = require('path');

module.exports = {
    entry: {
        index: './index.js'
    },

    output: {
        filename: "[name].min.js",
        path: path.resolve(path.join(__dirname, '/dist'))
    },

    module: {
        rules: [
            {
                test: /\.js$/,
                use: 'babel-loader'
            }
        ]
    }
}