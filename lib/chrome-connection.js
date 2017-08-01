'use babel';
import WS from 'ws';
import {Breakpoint, Location, Script, CallFrame, Scope, ScriptMapping} from './debug-interface';
import EventEmitter from 'events';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import logger from './debug-log';

/**
 * Manager connection to a chrome debug protocol server via websocket
 * @class ChromeConnection
 * @extends EventEmitter
 */
export default class ChromeConnection extends EventEmitter {

    /**
     * Setup websocket connection, listen to it's events
     * @constructor
     * @param {String} wsUri a websocket uri for chrome debug protocol server
     * @param {Function} readyCallback a Function to be call after websocket connection open
     */
    constructor(wsUri, readyCallback) {
        super();
        const _this = this;
        // to store to pending request
        this.task = [];
        // an auto increament id used in request
        this.id = 0;
        // make websocket connection
        this.ws = new WS(wsUri, {
            // deflate message will speed transport
            perMessageDeflate: true
        });
        this.ws.on('message', data => {
            try {
                // parse message
                let res = JSON.parse(data);
                logger.debug('received', res);
                if (!res.id) {
                    // it's an event
                    _this.eventHandler(res);
                } else {
                    // it's an response, find its request
                    let request = _this.task[res.id];
                    if (request) {
                        // remove this request and deal with the response
                        _this.resultHandler(res, request);
                        _this.task[res.id] = {};
                    }
                }
            } catch(err) {
                logger.error('parse message fail', err);
            }
        });
        this.ws.on('close', (code, reason) => {
            logger.warn('websocket close', code, reason);
            _this.ws.removeAllListeners();
            _this.emit('end', code);
        });
        this.ws.on('error', err => {
            logger.error('websocket error', err);
        });
        this.ws.on('open', () => {
            logger.info('websocket open');
            readyCallback();
        });
    }

    /**
     * close websocket connections.
     */
    close() {
        this.ws.close();
    }

    /**
     * Handle events from debug servers
     * @param {Object} event a event described in chrome debug protocol
     */
    eventHandler(event) {
        if (!event.method) {
            return;
        }
        // before handling event, we check event.method to find out which event it is.
        switch (event.method) {
            case "Debugger.scriptParsed": {
                let script = ScriptMapping.mapping(event.params.scriptId, event.params.url);
                if (script) {
                    // Successfully mapping to local file
                    this.emit('Script:add', script);
                } else {
                    // Fail to mapping to local file.thus the script won't be displayed in file panel
                    logger.error('Fail to mapping script to file', event);
                }
                break;
            }
            case "Debugger.paused": {
                // when js engine paused.we can get all callFrames and scopeChains
                let callFrames = event.params.callFrames;
                if (!callFrames) {
                    // no need to parse callframes
                    this.emit('paused');
                    break;
                }
                let callFramesImpl = callFrames.map(callFrame =>
                    new CallFrame(callFrame.callFrameId,
                        callFrame.functionName,
                        new Location(callFrame.location.scriptId, callFrame.location.lineNumber, callFrame.location.columnNumber),
                        callFrame.scopeChain.map(scope => new Scope(scope.type, scope.object, scope.name)),
                        callFrame.this));
                // return callframes and data.data contains exceptions info when we pause by an exception.
                // @return {Array.<CallFrame>} callframesImpl
                // @return {Object} data
                this.emit('paused', callFramesImpl, event.params.data);
                break;
            }
            case "Debugger.resumed":
                // just emit it
                this.emit('resumed');
                break;
            case "Debugger.scriptFailedToParse":
                //TODO: deal with scriptFailedToParse
                logger.warn('script fail to parse', event);
                break;
            case "Inspector.detached":
                // this indicated the debug end
                this.emit('end', 'detached');
                break;
            case "Console.messageAdded":
                // we should add a message to console
                // @return {ConsoleMessage} message
                // XXX: Temporary hide console message
                this.emit('console', event.params.message);
                break;
            case "Console.showConsole":
            case "Runtime.executionContextCreated":
                break;
            default:
                // we find an unhandled event.deal with them if necessary
                logger.warn('Unable to handle ' + event.method, event.params, ' Please fix me');
        }
    }

    /**
     * Handle result from debug server
     * @param {Object} event result described in chrome debug protocol
     * @param {Object} task
     * @param {Object} task.request the original request
     * @param {Function} task.resolve resolve of request promise
     * @param {Function} task.reject reject of request promise
     */
    resultHandler(event, task) {
        switch (task.request.method) {
            case 'Debugger.getScriptSource':
                // @return {String} scriptSource
                task.resolve(event.result.scriptSource);
                break;
            case 'Debugger.setScriptSource':
                if (event.error) {
                    task.reject(event.error);
                } else {
                    task.resolve(event.result);
                }
                break;
            case 'Debugger.setBreakpointByUrl': {
                // @return a list of breakpoints
                let breakpointArr = event.result.locations.map((location) =>
                    new Breakpoint(new Location(location.scriptId, location.lineNumber, location.columnNumber), event.result.breakpointId)
                );
                // @return {Array.<Breakpoint>} breakpointArr
                task.resolve(breakpointArr);
                //console.log('set break point: ', event.result.breakpointId, event.result.locations);
                break;
            }
            case 'Debugger.evaluateOnCallFrame':
                // @return {RemoteObject} result
                // TODO: handle event.result.exceptionDetails.
                task.resolve(event.result.result);
                break;
            case 'Runtime.getProperties':
                // @return
                if (event.result && event.result.result) {
                    if (event.result.internalProperties && event.result.internalProperties.length > 0) {
                        event.result.result = event.result.result.concat(event.result.internalProperties);
                    }
                    task.resolve(event.result.result);
                } else {
                    logger.warn('Fail to get properties', event, task.request);
                    task.resolve([]);
                }
                break;
            case 'Debugger.getPossibleBreakpoints':
                // TODO: currently we havn't use this request.
                // @return {Array.<Location>} locations
                task.resolve(event.result.locations);
                break;
            case 'Debugger.setPauseOnExceptions':
            case 'Debugger.removeBreakpoint':
            case 'Debugger.stepOver':
            case 'Debugger.stepInto':
            case 'Debugger.stepOut':
            case 'Debugger.pause':
            case 'Debugger.setSkipAllPauses':
            case 'Inspector.enable':
            case 'Runtime.enable':
            case 'Debugger.skipStackFrames':
            case 'Debugger.setAsyncCallStackDepth':
            case 'Debugger.enable':
            case 'Page.getResourceTree':
            case 'Page.enable':
            case 'Network.enable':
            case 'Debugger.resume':
            case 'Console.setTracingBasedTimeline':
            case 'Console.enable':
                // Those request return nothing.And we have no need to deal with them.
                break;
            default:
                // we make a request but not implement its handler? that's terrible.
                logger.warn('Fail to handle response ', event, ' by ', task.request, ' please fix me');
        }
        task.resolve();
    }

    send(data) {
        let _this = this;
        return new Promise((resolve, reject) => {
            // increate ID
            _this.id++;
            data.id = _this.id;
            // send request
            _this.ws.send(JSON.stringify(data));
            // save current request and wait for response
            _this.task[data.id] = {resolve: resolve, request: data, reject: reject};
            (function(data) {
                setTimeout(() => {
                    if (!_this.task[data.id] || !_this.task[data.id].resolve) {
                        return;
                    }
                    // timeout after 30000ms if not received response
                    _this.task = [];
                    _this.emit('end', 'request timeout');
                    //logger.error('request timeout', data);
                    //resolve();
                }, 20000);
            })(data);
            logger.debug('send :', data);
        });
    }
}
