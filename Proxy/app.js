/* jshint strict:false */
/* global console, require, process */
"use strict";
var httpProxy = require('http-proxy');
var request = require('request');
var express = require('express');
var monitorUrl = "http://localhost:9999";
var FAIL_TYPES = {
    'SUCCESS': 200,
    'TIMEOUT': 999,
    'NOT_FOUND': 404,
    'SERVER_ERROR': 500
};
var proxy = httpProxy.createProxyServer({});
var Settings = require('./settings');
init();

/*******************************************************/
/********************* START STUFF *********************/
/*******************************************************/

function init(){
    var app = express();
    _readCommandLineSettings(process.argv);
    _registerRoutes(app);
    app.listen(3000, function(){ console.log("Listening to port 3000 as proxy"); });
}

function _readCommandLineSettings(args){
    if(args[2]){ Settings.set('fiddler', "http://localhost:"+args[2].split("=")[1]); }
}

function _registerRoutes(app, settings){
    app.post("/settings/:setting/:value", function(req, res){
        Settings.set(req.params.setting, req.params.value, function(err){
            res.sendStatus(err ? 500 : 200);
        });
    });
    app.all("*", handleRequest);
}

/*******************************************************/
/**************** FAILING RULE HANDLING ****************/
/*******************************************************/

function handleRequest(req, res){
    var requestHandling = applyRulesToRequest(req, res);
    console.log(requestHandling);
    res.setHeader('x-request-time', (+new Date()));
    res.setHeader('x-delay-time', requestHandling.latency);
    setTimeout(function(){
        if(requestHandling.status === 200){
            sendRequestViaProxy(req, res);
        }else{
            res.status(Number(requestHandling.status));
            res.send(Number(requestHandling.status));
            sendMessageToMonitor({
                date: new Date(),
                contentType: req.headers["content-type"],
                url: req.url,
                status: requestHandling.status,
                message: "Failed by Pretty Proxy"
            });
        }
    }, requestHandling.latency);
}


function applyRulesToRequest(){
    var failResult = [failWithPercent, failForTimeSince].map(function(chainFunc){
        return chainFunc();
    }).filter(function(item){
        return item !== FAIL_TYPES.SUCCESS;
    });

    return {
        status: failResult.length === 0 ? FAIL_TYPES.SUCCESS : failResult[0],
        latency: getLatency()
    };
}

function failWithPercent(req, res){
    if(Math.random() > Settings.get('failrate')){
        return FAIL_TYPES.SUCCESS;
    }else{
        return FAIL_TYPES.TIMEOUT;
    }
}
function failForTimeSince(req, res){
    return FAIL_TYPES.SUCCESS;
}
function getLatency(){
    return Math.random()*Settings.get('latency');
}

/*******************************************************/
/********************* PROXY STUFF *********************/
/*******************************************************/

function sendRequestViaProxy(req, res){
    proxy.web(req, res, {
        target: Settings.get('fiddler') || req.url
    }, handleError);
}
function handleError(e){
    // console.log(Object.keys(e));
    console.log("ERROR", e.message);
    sendMessageToMonitor({
        date: new Date(),
        contentType: "-",
        url: e.message,
        status: e.code,
        message: e.code
    });
}

proxy.on('proxyReq', function(proxyReq, req, res){
    console.log(">>> Request:", req.method, req.url);
    // proxyReq.setHeader('X-Special-Proxy-Header', new Date());

});
proxy.on('proxyRes', function (proxyRes, req, res) {
    var duration = (+new Date())-res._headers['x-request-time'];
    console.log("<<< Response", req.method, req.url, duration, "(delayed "+Math.round(res._headers['x-delay-time'])+" ms)");
    sendMessageToMonitor({
        date: proxyRes.headers.date,
        contentType: proxyRes.headers["content-type"],
        duration: duration + "ms (delayed "+Math.round(res._headers['x-delay-time'])+"ms)",
        url: req.url,
        status: proxyRes.statusCode,
        message: proxyRes.statusMessage
    });
});
proxy.on('error', function(){
    console.log(":(");
});

/*******************************************************/
/**************** MONITOR COMMUNICATION ****************/
/*******************************************************/

function sendMessageToMonitor(options){
    request({
        method: "POST",
        url: monitorUrl,
        json: true,
        body: options
    }, function(err, response, body){
        if(err){console.log(err);}
    });
}

/*******************************************************/
/*********************** SETTINGS **********************/
/*******************************************************/
