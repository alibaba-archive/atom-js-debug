'use babel';
import DebugAdapter from './debug-adapter';
import EventEmitter from 'events';
import {BasicInfo, PendingBreakpoint, Breakpoint, Expression} from './debug-interface';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import MessageHandler from './message-handler';
import logger from './debug-log';
import _ from 'underscore';
let debugHelper;

class DebugHelper extends EventEmitter {

    /**
     * Get a debugHelper instance.Setup some basic infomation
     * @param {Object} options
     */
    constructor() {
        super();
        this.breakpoints = [];
        this.watchLists = [];
        this.MessageHandler = new MessageHandler({
            onAddBreakpoint: this.onAddBreakpoint.bind(this),
            onRemoveBreakpoint: this.onRemoveBreakpoint.bind(this),
            onResetBreakpoint: this.onResetBreakpoint.bind(this)
        });
    }

    get running() {
        return this._running;
    }

    set running(flag) {
        this._running = flag;
    }

    /**
     * Attach to a node-inspector to debug target page
     * After attach success, 'start' event will be emitted on DebugHelper
     * @param {String} wsUri A websocket uri provided by node-inspector
     * @param {object} options a object include deviceId, domain, page and srcPath
     * @param {Array.<PendingBreakpoint>} breakpoints an array of breakpoints to be initialized
     * @param {Array.<Expression>} watchList  an array of expressions to be initialized
     */
    attach(wsUri, debugOptions, breakpoints, watchLists) {
        let _this = this;
        // empty temp folder for remote files
        BasicInfo.setInfo(debugOptions);
        try {
            fs.removeSync(BasicInfo.tempDir);
        } catch(err) {
            logger.warn('fail remove temp folder', BasicInfo.tempDir);
        }
        this.breakpoints = breakpoints;
        this.watchLists = watchLists;
        this.running = true;
        this.OpenStatus = {};
        //reset highlight line
        _this.highlightLine && _this.highlightLine.destroy && _this.highlightLine.destroy();
        _this.highlightCurrentLine && _this.highlightCurrentLine.destroy && _this.highlightCurrentLine.destroy();
        this.debugAdapter = new DebugAdapter(wsUri, () => {
            //initialize watch expressions after debug start
            _this.watchLists.forEach(expression => {
                _this.addWatchList(expression.expression);
            });
            _this.emit('start');
            this.MessageHandler.sendDebugStart();
        });
        this.debugAdapter.on('paused', async (callFrames, data) => {
            _this.running = false;
            let tempBp = _this.breakpoints.filter(bp => bp.temp);
            for (let bp of tempBp) {
                await _this.onRemoveBreakpoint({script: bp.script || _this.getScriptById(bp.location.scriptId).localPath, row: bp.location.lineNumber}, true);
            }
            this.emit('paused', callFrames, data);
        });
        this.debugAdapter.on('resumed', () => {
            _this.MessageHandler.sendDebugResume();
            _this.running = true;
            //reset highlight line
            _this.highlightLine && _this.highlightLine.destroy && _this.highlightLine.destroy();
            _this.highlightCurrentLine && _this.highlightCurrentLine.destroy && _this.highlightCurrentLine.destroy();
            _this.emit('resumed');
        });
        this.debugAdapter.on('end', code => {
            //reset highlight line
            _this.highlightLine && _this.highlightLine.destroy && _this.highlightLine.destroy();
            _this.highlightCurrentLine && _this.highlightCurrentLine.destroy && _this.highlightCurrentLine.destroy();
            // falldown to pendingBreakpoints
            _this.breakpoints = _this.breakpoints.map(breakpoint => {
                if (breakpoint.location) {
                    const script = _this.getScriptById(breakpoint.location.scriptId);
                    if (!script) return null;
                    return new PendingBreakpoint(
                        script.localPath,
                        breakpoint.location.lineNumber,
                        true
                    );
                } else {
                    return breakpoint;
                }
            }).filter(res => res);
            logger.info('falldown breakpoints', _this.breakpoints);
            _this.MessageHandler.sendDebugEnd();
            _this.emit('end', code);
            delete _this.debugAdapter;
            BasicInfo.eventHandler && BasicInfo.eventHandler.postClose && BasicInfo.eventHandler.postClose();
        });
        this.debugAdapter.on('console', message => {
            this.emit('console', message);
        });
        this.debugAdapter.on('scriptUpdate', async script => {
            // here comes a new script
            let updatedBreakpoint = false;
            for (let i = 0; i < this.breakpoints.length; i++) {
                // we loop through all breakpoints
                let bp = this.breakpoints[i];
                if (bp && bp.script && bp.script === script.localPath && bp.isEnabled) {
                    updatedBreakpoint = true;
                    // should set a breakpoint
                    let breakpoint = await this.debugAdapter.setBreakpoint(script, bp.row)
                    // remove all breakpoint in same position
                    for (let j = 0; j < this.breakpoints.length; j++) {
                        let bp = this.breakpoints[j];
                        if (this.compareBreakpoint(bp, breakpoint[0])) {
                            this.MessageHandler.sendBreakpointRemoved(bp);
                            this.breakpoints[j] = null;
                        }
                    }
                    // re add breakpoints in case it's on a impossible position
                    if (this.breakpoints[i]) {
                        this.MessageHandler.sendBreakpointRemoved(this.breakpoints[i]);
                    }
                    this.MessageHandler.sendBreakpointAdded(new PendingBreakpoint(script.localPath, breakpoint[0].location.lineNumber));
                    this.breakpoints[i] = breakpoint[0];
                }
            }
            this.breakpoints = this.breakpoints.filter(bp => bp !== null);
            updatedBreakpoint && this.emit('updateBreakpoint');
            this.emit('scriptUpdate');
        });
    }

    // use to check an object is expanded/collapsed
    setOpenStatus(obj, status) {
        if (!this.debugAdapter) {
            return;
        }
        this.OpenStatus[`${obj.belong}-${obj.fullName}-${obj.objectId}}`] = status;
    }

    getOpenStatus(obj) {
        if (!this.debugAdapter) {
            return false;
        }
        return !!this.OpenStatus[`${obj.belong}-${obj.fullName}-${obj.objectId}}`];
    }

    isDebugging() {
        return !!this.debugAdapter;
    }

    async runToCursor(script, line) {
        if (this.running) {
            return;
        }
        await this.onAddBreakpoint({script: script, row: line, isEnabled: true, temp: true});
        await this.resume();
    }

    resumeOrPause() {
        if (!this.debugAdapter) {
            return;
        }
        if (this.running) {
            return this.debugAdapter.pause();
        } else {
            return this.debugAdapter.resume();
        }
    }

    /**
     * Request to resume the debugged page
     * @returns {Promise} resolve when request received by node-inspector.Note that it does *not* mean the page has been resumed.Listen to 'resumed' event instead
     */
    resume() {
        if (!this.debugAdapter) {
            return;
        }
        return this.debugAdapter.resume();
    }

    /**
     * Request to pause the debugged page
     * @returns {Promise} resolve when request received by node-inspector.Note that it does *not* mean the page has been Paused.Listen to 'paused' event instead
     */
    pause() {
        if (!this.debugAdapter) {
            return;
        }
        return this.debugAdapter.pause();
    }

    /**
     * Request to step into the debugged page
     * @returns {Promise} resolve when request received by node-inspector.Note that it does *not* mean the page has been Paused.Listen to 'paused' event instead
     */
    stepInto() {
        if (!this.debugAdapter) {
            return;
        }
        return this.debugAdapter.stepInto();
    }

    /**
     * Request to step over the debugged page
     * @returns {Promise} resolve when request received by node-inspector.Note that it does *not* mean the page has been Paused.Listen to 'paused' event instead
     */
    stepOver() {
        if (!this.debugAdapter) {
            return;
        }
        return this.debugAdapter.stepOver();
    }

    /**
     * Request to step out the debugged page
     * @returns {Promise} resolve when request received by node-inspector.Note that it does *not* mean the page has been Paused.Listen to 'paused' event instead
     */
    stepOut() {
        if (!this.debugAdapter) {
            return;
        }
        return this.debugAdapter.stepOut();
    }

    setPauseOnExceptions(mode) {
        if (!this.debugAdapter) {
            return;
        }
        return this.debugAdapter.setPauseOnExceptions(mode);
    }

    evaluateOnCallFrame(expression, callFrame) {
        if (!this.debugAdapter) {return Promise.resolve({});}
        return this.debugAdapter.evaluateOnCallFrame(expression, callFrame);
    }

    compareBreakpoint(bp1, bp2) {
        if (!bp1 || !bp2) {
            return false;
        }
        if (bp1.location) {
            if (bp2.location) {
                return bp1.location.scriptId === bp2.location.scriptId && bp1.location.lineNumber === bp2.location.lineNumber;
            } else {
                return bp1.location.scriptId === (this.getScriptByLocalPath(bp2.script) || {}).scriptId && bp1.location.lineNumber === bp2.row;
            }
        } else {
            if (bp2.location) {
                return (this.getScriptByLocalPath(bp1.script) || {}).scriptId === bp2.location.scriptId && bp1.row === bp2.location.lineNumber;
            } else {
                return bp1.script === bp2.script && bp1.row === bp2.row;
            }
        }
    }

    onAddBreakpoint(options) {
        logger.info('onadd', options);
        let {script, row, isEnabled, temp} = options;
        let _this = this;
        return new Promise((resolve, reject) => {
            let bp = new PendingBreakpoint(script, row, isEnabled, temp);
            // return if breakpoint already exist
            if (this.breakpoints.filter(breakpoint => this.compareBreakpoint(bp, breakpoint)).length > 0) return resolve();
            if (this.debugAdapter && bp.isEnabled) {
                // when it's debugging, script loaded and add an active breakpoints. we must apply it.
                let scriptI = this.getScriptByLocalPath(script);
                if (scriptI) {
                    this.debugAdapter.setBreakpoint(scriptI, row).then(breakpoint => {
                        // if not same breakpoint. we add it.
                        temp && (breakpoint[0].temp = true);
                        if (_this.breakpoints.filter(bp => _this.compareBreakpoint(bp, breakpoint[0])).length === 0) {
                            _this.breakpoints = _this.breakpoints.concat(breakpoint);
                        }
                        // reapply it in case breakpoint has different positon to options
                        logger.info('set bp', options, 'actually', breakpoint);
                        _this.MessageHandler.sendBreakpointRemoved(options);
                        breakpoint.forEach(bp => {
                            _this.MessageHandler.sendBreakpointAdded(new PendingBreakpoint(script, bp.location.lineNumber));
                        });
                        _this.emit('updateBreakpoint');
                        return resolve();
                    });
                } else {
                    this.breakpoints.push(bp);
                    this.emit('updateBreakpoint');
                    return resolve();
                }
            } else {
                this.breakpoints.push(bp);
                this.emit('updateBreakpoint');
                return resolve();
            }
        });
    }

    removeAllWatchs() {
        this.getWatchList().forEach(expression => {
            this.removeWatchList(expression);
        });
    }

    async removeAllBreakpoints() {
        let breakpoints = this.getBreakpoints();
            // Currently we can not do it in parallel.
        for (let i=0; i<breakpoints.length; i++) {
            await this.onRemoveBreakpoint(breakpoints[i], true);
        }
    }

    async disableAllBreakpoints() {
        for (let bp of this.getBreakpoints()) {
            await this.changeBreakpoint(bp, false);
        }
        this.emit('updateBreakpoint');
    }

    async enableAllBreakpoints() {
        for (let bp of this.getBreakpoints()) {
            await this.changeBreakpoint(bp, true);
        }
        this.emit('updateBreakpoint');
    }

    async onRemoveBreakpoint(options, callByPanel) {
        logger.info('onremove', options);
        let {script, row} = options;
        let scriptI = this.debugAdapter && this.getScriptByLocalPath(script);
        for (let i = 0; i < this.breakpoints.length; i++) {
            let bp = this.breakpoints[i];
            if (bp instanceof Breakpoint) {
                if (scriptI && scriptI.scriptId === bp.location.scriptId && row === bp.location.lineNumber) {
                    await this.debugAdapter.removeBreakpoint(bp);
                    this.breakpoints[i] = null;
                }
            } else {
                if (bp.script === script && bp.row === row) {
                    this.breakpoints[i] = null;
                }
            }
        }
        this.breakpoints = this.breakpoints.filter(bp => bp !== null);
        if (callByPanel) {
            this.MessageHandler.sendBreakpointRemoved(options);
        }
        this.emit('updateBreakpoint');
        return Promise.resolve();
    }

    onResetBreakpoint(options) {
        let {script, breakpoints} = options;
        let scriptI = this.debugAdapter && this.getScriptByLocalPath(script);
        this.breakpoints = this.breakpoints.filter(bp => {
            if (bp instanceof Breakpoint) {
                if (scriptI && scriptI.scriptId === bp.location.scriptId) {
                    this.debugAdapter.removeBreakpoint(bp);
                    return false;
                } else {
                    return true;
                }
            } else {
                return bp.script !== script
            }
        });
        // XXX: their are async. It may cause probleams
        breakpoints.forEach(bp => {
            this.onAddBreakpoint({script: script, row: bp.row, isEnabled: bp.isEnabled});
        });
    }

    changeBreakpoint(breakpoint, isEnabled) {
        let _this = this;
        //this.breakpoints.forEach((bp, index) => {
        return new Promise((resolve, reject) => {
            for (let index = 0; index < _this.breakpoints.length; index++) {
                let bp = _this.breakpoints[index];
                if (bp.script && bp.script === breakpoint.script && bp.row && bp.row === breakpoint.row) {
                    bp.isEnabled = isEnabled;
                    if (isEnabled) {
                        if (_this.isDebugging()) {
                            // we apply _this breakpoint when it's enabled when debuging
                            let script = _this.getScriptByLocalPath(bp.script);
                            if (script) {
                                _this.onRemoveBreakpoint(bp, true).then(function () {
                                    _this.onAddBreakpoint(bp).then(resolve);
                                });
                            } else {
                                _this.MessageHandler.sendBreakpointEnable(bp);
                                return resolve();
                            }
                        } else {
                            _this.MessageHandler.sendBreakpointEnable(bp);
                            return resolve();
                        }
                    } else {
                        _this.MessageHandler.sendBreakpointDisable(bp);
                        return resolve();
                    }
                }
                if (bp.location && _this.getScriptById(bp.location.scriptId).localPath === breakpoint.script &&
                bp.location.lineNumber === breakpoint.row) {
                    bp.isEnabled = isEnabled;
                    if (isEnabled) {
                        // we apply _this breakpoint
                        // in fact it's impossible to enable a breakpoint already exist;
                        logger.warn('enable a breakpoint already in debug');
                        _this.debugAdapter.setBreakpoint(_this.getScriptById(bp.location.scriptId), bp.location.lineNumber).then(breakpoints => {
                            _this.MessageHandler.sendBreakpointRemoved(breakpoint);
                            breakpoints.forEach(bp => {
                                _this.MessageHandler.sendBreakpointAdded(new PendingBreakpoint(breakpoint.script, bp.location.lineNumber));
                            });
                            _this.breakpoints[index] = new PendingBreakpoint(breakpoint.script, breakpoints[0].location.lineNumber);
                            return resolve();
                        });
                    } else {
                        // we remove _this breakpoint
                        _this.debugAdapter.removeBreakpoint(bp).then(function() {
                            logger.info('remove', bp);
                            _this.breakpoints[index] = new PendingBreakpoint(breakpoint.script, breakpoint.row, false);
                            _this.MessageHandler.sendBreakpointDisable(breakpoint);
                            logger.info('after remove', _this.breakpoints);
                            return resolve();
                        });
                    }
                }
            }
        });
    }

    async bootStrapBreakpoints(breakpoints) {
        if (!breakpoints || breakpoints.constructor !== Array) {
            return;
        }
        return await Promise.all(breakpoints.map(bp => debugHelper.onAddBreakpoint({
            script: bp._script,
            row: bp._row,
            isEnabled: bp._isEnabled
        })));
    }

    async highlight(path, row, type) {
        let _this = this;
        try {
            if (this.debugAdapter) {
                let script = this.getScriptByLocalPath(path);
                if (script && !script.fetched) {
                    let output = await this.debugAdapter.getScriptSource(script.scriptId);
                    try {
                        fs.outputFileSync(path, output);
                        script.fetched = true;
                    } catch(err) {
                        logger.error('fail to save remote file in ' , path);
                    }
                }
            }
            fs.accessSync(path);
            atom.workspace.open(path, {initialLine: row, pending: true}).then(textEditor => {
                if (type !== 'goto') {
                    // goto means no highlight color
                    _this.MessageHandler.sendHighlightLine({script: path, row:row});
                    if (type === 'current') {
                        _this.highlightCurrentLine && _this.highlightCurrentLine.destroy && _this.highlightCurrentLine.destroy();
                        let marker = textEditor.markBufferPosition([row, 0], {invalidate: 'never'});
                        _this.highlightCurrentLine = textEditor.decorateMarker(marker, {type: 'line', class: 'debug-highlight-background'});
                    } else {
                        _this.highlightLine && _this.highlightLine.destroy && _this.highlightLine.destroy();
                        let marker = textEditor.markBufferPosition([row, 0], {invalidate: 'never'});
                        _this.highlightLine = textEditor.decorateMarker(marker, {type: 'line', class:'debug-background'});
                    }
                }
            });
        } catch(err) {
            logger.warn('highlight fail', err);
        }
    }
    /**
     * Request to set a break point
     * @param {Script} script A Script instance to set breakpoint
     * @param {Number} row row number of breakpoint
     * @deprecated
     * @returns {Promise<Array.<Breakpoint>>} resolve a array of breakpoint instance after breakpoint set done.Note that it's an array as it may have many breakpoint in one line
     */
    setBreakpoint(script, row) {
        if (!this.debugAdapter) {
            return;
        }
        return this.debugAdapter.setBreakpoint(script, row);
    }

    /**
     * Request to remove a break point
     * @param {Breakpoint} breakpoint breakpoint to remove
     * @deprecated
     * @returns {Promise} resolve when remove breakpoint success
     */
    removeBreakpoint(breakpoint) {
        if (!this.debugAdapter) {
            return;
        }
        return this.debugAdapter.removeBreakpoint(breakpoint);
    }

    setScriptSource(scriptPath) {
        // use in live edit.not supported yet
        const _this = this;
        if (!this.debugAdapter) {
            return Promise.reject(new Error('Not debugging.'));
        }
        let script = this.getScriptByLocalPath(scriptPath);
        if (script) {
            return new Promise((resolve, reject) => {
                fs.readFile(script.localPath, (err, data) => {
                    if (err) {
                        reject(new Error('Fail to get file content.'))
                    } else {
                        if (scriptPath.startsWith(fs.realpathSync(os.tmpdir()))) {
                            data = data.toString();
                        } else {
                            data = "(function (exports, require, module, __filename, __dirname, nativeLoad) {" + data.toString() + "\n});"
                        }
                        _this.debugAdapter.setScriptSource(script.scriptId, data).then(res => {
                            resolve(res);
                        }).catch(err => {reject(err)});
                    }
                });
            });
        } else {
            return Promise.resolve('not a script in engine');
        }
    }

    /**
     * get all parsed script.
     * @returns {ScriptTree} An ScriptTree instance
     */
    getScriptTree() {
        if (!this.debugAdapter) {
            return;
        }
        return this.debugAdapter.scriptTree;
    }

    getScriptSource(scriptId) {
        if (!this.debugAdapter) {
            throw new Error('Not Debugging');
        }
        return this.debugAdapter.getScriptSource(scriptId);
    }

    /**
     * list all breakpoints
     * @returns {Array.<PendingBreakpoint>} all breakpoints
     */
    getBreakpoints() {
        return this.breakpoints.filter(bp => bp).map(breakpoint => {
            if (breakpoint instanceof Breakpoint) {
                return new PendingBreakpoint(this.getScriptById(breakpoint.location.scriptId).localPath, breakpoint.location.lineNumber, true);
            } else return new PendingBreakpoint(breakpoint.script, breakpoint.row, breakpoint.isEnabled);
        }).sort((s1,s2) => s1.script.localeCompare(s2.script) === 0 ?  s1.row - s2.row : s1.script.localeCompare(s2.script));
    }

    getScriptById(scriptId) {
        //TODO: we should use some data struct to increase speed.
        //TODO: should consider byID and by LocalPath
        if (!this.debugAdapter) {
            return;
        }
        return this.debugAdapter.scriptTree.scriptList[scriptId];
        //return (this.debugAdapter.scriptTree.scriptList.filter(script => script.scriptId === scriptId) || [])[0];
    }

    getScriptByLocalPath(localPath, fsNode) {
        const _this = this;
        // check it's debugging
        if (!this.debugAdapter) {
            return;
        }
        fsNode = fsNode || this.debugAdapter.scriptTree.scriptTree;
        // check it's found
        if (fsNode.relateScript && fsNode.relateScript.localPath === localPath) {
            return fsNode.relateScript;
        }
        // check we fail
        if (!fsNode.children) {
            return null;
        }
        // find posibile routes
        const fsChilds = fsNode.children.filter(fsChild => {
            return localPath.includes(path.join(fsChild.name));
        });
        // try all possible routes
        let ans =  fsChilds ? _.flatten(fsChilds.map(fsChild => _this.getScriptByLocalPath(localPath, fsChild))) : null;
        // pick the first answer as candidate
        if (ans && ans.filter(res => res).length > 0) {
            for (let candidate of ans) {
                if (candidate) {
                    ans = candidate;
                    break;
                }
            }
        } else {
            let res = (this.debugAdapter.scriptTree.scriptList.filter(script => {
                    return script.localPath === localPath}
                ) || [])[0];
            return res;
        }
        return ans;
        // this is o(n) solution. we search in tree to speed up this function.
        // return (this.debugAdapter.scriptTree.scriptList.filter(script => {
        //     return script.localPath === localPath}
        // ) || [])[0];
    }

    /**
     * get watch list
     * @returns {Array} an Array of expression
     */
    getWatchList() {
        if (this.debugAdapter) {
            this.watchLists = this.debugAdapter.watchList;
            return this.watchLists;
        } else {
            return this.watchLists;
        }
    }

    /**
     * add an expression to watch list
     * @param {String} expression
     */
    addWatchList(expression) {
        if (this.debugAdapter) {
            this.debugAdapter.addWatchList(new Expression(expression));
            this.watchLists = this.debugAdapter.watchList;
        } else {
            this.watchLists.push(new Expression(expression));
        }
        this.emit('updateWatch');
    }

    evaluateWatchList() {
        if (!this.debugAdapter) return Promise.reject('not debugging');
        if (this.running) return Promise.reject('only evaluate watch when paused');
        return this.debugAdapter.evaluateWatchList();
    }

    getPossibleBreakpoints(location) {
        if (!this.debugAdapter) return Promise.reject('not debugging');
        return this.debugAdapter.getPossibleBreakpoints(location);
    }

    /**
     * remove an expression from watch list
     * @param {Expression} expression
     */
    removeWatchList(expression) {
        if (this.debugAdapter) {
            this.debugAdapter.removeWatchList(expression);
            this.watchLists = this.debugAdapter.watchList;
        } else {
            this.watchLists = this.watchLists.filter(exp => exp !== expression);
        }
        this.emit('updateWatch');
    }

    /**
     * fetch object detail info by object id
     * @param objectId
     * @returns {*}
     */
    loopProperties(remoteObject, options) {
        if (!this.debugAdapter) return Promise.reject('not debugging');
        return this.debugAdapter.loopProperties(remoteObject, options);
    }

    close() {
        if (!this.debugAdapter) return Promise.reject('not debugging');
        this.debugAdapter.close();
    }

    /**
     * Emitted when debugHelper successfully attach and set up basic enviroment to debug
     * Anything related to debug should be ignored before this event
     * @event DebuggerHelper#start
     */

    /**
     * Emitted when Script paused.
     * Currently we only provide infomation about callFrames.
     * @event DebuggerHelper#paused
     * @param {Array.<CallFrame>} callFrames An array of callFrames.
     */

    /**
     * Emitted when Script resumed.
     * @event DebuggerHelper#resumed
     */

    /**
     * Emitted when new script be parsed.
     * @event DebuggerHelper#scriptUpdate
     * @param {Script} script An Script instance.
     */

    /**
     * Emitted when debug ends
     * @event DebuggerHelper#end
     */
}

!debugHelper && (debugHelper = new DebugHelper());
export default debugHelper;
