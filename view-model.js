'use babel';

import component from './component';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import Vue from 'vue';
import debugHelper from './lib/debug-helper';
import {ExpressionF} from './service/debug-interface';
import logger from './lib/debug-log';
import {CompositeDisposable} from 'atom';
export default class VueViewModel {
    constructor(view, model) {
        let _this = this;
        this.view = view;
        this.model = model;
        this.texteditorObserver = new CompositeDisposable();
        _this.vue = new Vue({
            el: this.view,
            data: function() {
                return _this.model;
            },
            methods: {
                updateThis: function(thisObject) {
                    thisObject.name = 'this';
                    this.thisObject = thisObject;
                },
                updateWatch: function() {
                    this.watchExpressions = debugHelper.getWatchList().map(expression => new ExpressionF(expression));
                    this.watchExpressions.forEach(expression => {
                        if (expression._result && !expression._result.children && debugHelper.isDebugging()) {
                            if (debugHelper.getOpenStatus(expression._result)) {
                                expression._result.fetchChildren();
                            } else {
                                expression._result.fetchChildren({isPreview: true});
                            }
                        }
                    });
                },
                updateScope: function(scopes) {
                    this.scopes = scopes;
                },
                loadScope: function(isLoadding) {
                    this.$refs.scopepanel.loadding(isLoadding);
                },
                loadWatch: function(isLoadding) {
                    this.$refs.watchpanel.loadding(isLoadding);
                },
                loadConsole: function(isLoadding) {
                    this.$refs.consolepanel.loadding(isLoadding);
                },
                saveData: function() {
                    try {
                        fs.writeJSONSync(path.join(__dirname, 'log.json'), this.$data, {depth:10});
                    } catch(err) {
                        logger.warn('fail save log ', err);
                    }
                }
            }
        });
        debugHelper.on('updateBreakpoint', () => {
            _this.vue.breakpoints = (debugHelper.getBreakpoints() || []).map(res => {
                res.name = path.basename(res.script);
                return res;
            });
        });
        debugHelper.on('updateWatch', () => {
            _this.vue.updateWatch();
        });
        // force fetch breakpoints. In case breakpoint added before vue setup.
        debugHelper.emit('updateBreakpoint');
    }

    destroy() {
        this.texteditorObserver.dispose();
    }

    serialize() {
        return {
            breakpoints: debugHelper.getBreakpoints() || []
        }
    }

    debug(wsUri, debugOptions) {
        console.trace('debug was called', wsUri, debugOptions);
        let _this = this;
        console.log('debug', arguments);
        let breakpoints = debugHelper ? debugHelper.breakpoints : [];
        let watchLists = debugHelper ? debugHelper.getWatchList() : [];
        this.vue.loadding = true;
        if (debugHelper.isDebugging()) {
            console.log('add pendding debug helper', arguments);
            debugger;
            this.penddingDebugHelper = {wsUri: wsUri, debugOptions: debugOptions, breakpoints: breakpoints, watchLists: watchLists};
            debugHelper.close();
            return;
        }
        debugHelper.once('start', () => {
            _this.vue.loadding = false;
            _this.vue.running = true;
            try {
                fs.ensureDirSync(debugOptions.tempDir);
            } catch(err) {
                logger.warn('error ensure dir ', debugOptions.tempDir, err);
            }
            _this.vue.$refs.breakpointpanel.setPauseMode();
            _this.vue.debugging = true;
            _this.texteditorObserver.add(atom.workspace.observeTextEditors(editor => {
                // live edit
                if (!atom.config.get('atom-js-debug.Liveedit')) {
                    return;
                }
                _this.texteditorObserver.add(editor.onDidSave(event => {
                    const savePath = event.path;
                    debugHelper.setScriptSource(savePath).then(res => {
                        if (res.callFrames || res.result) {
                            atom.notifications.addInfo('Source code update success' + savePath);
                            _this.vue.callframes = res.callFrames.map(callframe => {
                                let script = debugHelper.getScriptById(callframe.location.scriptId);
                                if (script && script.remotePath) {
                                    callframe.scriptName = path.basename(script.remotePath);
                                } else {
                                    callframe.scriptName = '';
                                }
                                return callframe;
                            });
                            _this.vue.updateWatch();
                        }
                    }).catch(err => {
                        if (err.message && err.message === 'Not debugging.') {
                            _this.texteditorObserver.dispose();
                            _this.texteditorObserver.clear();
                        }
                        atom.notifications.addWarning(err.message || err, 'Live Edit Error:');
                        logger.error(err);
                    });
                    //console.log(savePath);
                }));
            }));
        });

        debugHelper.on('paused', (callFrames, data) => {
            _this.vue.running = false;
            _this.vue.pauseData = data;
            _this.vue.callframes = callFrames.map(callframe => {
                let script = debugHelper.getScriptById(callframe.location.scriptId);
                if (script && script.remotePath) {
                    callframe.scriptName = path.basename(script.remotePath);
                } else {
                    callframe.scriptName = '';
                }
                return callframe;
            });
            console.log(_this.vue.callframes);
            _this.vue.updateWatch();
            Vue.nextTick(() => {
                _this.vue.$refs.callframepanel.select(0);
            });
            //_this.gotoCallFrame(callFrames[0], 'current');
            _this.vue.loadding = false;
            // Demo of live edit(set script source)
            // let fsContent = fs.readFileSync(path.join(__dirname, 'Main.js')).toString();
            // debugHelper.setScriptSource(callFrames[0].location.scriptId, fsContent);
        });

        debugHelper.on('resumed', () => {
            _this.vue.running = true;
            _this.vue.scopes = [];
            _this.vue.callframes = [];
        });

        debugHelper.on('scriptUpdate', script => {
            _this.vue.scriptTree = debugHelper.getScriptTree().scriptTree;
        });

        debugHelper.on('console', message => {
            _this.vue.$refs.consolepanel.message(message);
        });

        debugHelper.on('end', code => {
            // Not sure how to clear state yet
            switch (code) {
                case 1000:
                    break;
                case 1006:
                    atom.notifications.addWarning('Debug stop abnormally.Maybe due to connection broken');
                    break;
                case 'detached':
                    atom.notifications.addWarning('Remote debugging connection is detached');
                    break;
                case 'request timeout':
                    atom.notifications.addWarning('Request timeout');
                    break;
                default:
                    atom.notifications.addInfo('Debug stop due to websocket close ' + code);
            }
            _this.vue.watchExpressions = debugHelper.getWatchList().map(expression => {
                delete expression._result;
                return new ExpressionF(expression)
            });
            debugHelper.removeAllListeners('start');
            debugHelper.removeAllListeners('paused');
            debugHelper.removeAllListeners('resumed');
            debugHelper.removeAllListeners('scriptUpdate');
            debugHelper.removeAllListeners('end');
            debugHelper.removeAllListeners('console');
            _this.vue.scopes = [];
            _this.vue.callframes = [];
            _this.vue.consoles = [];
            _this.vue.selectedCallframe = 0;
            _this.vue.running = false;
            _this.vue.loaddingScope = false;
            _this.vue.loaddingWatch = false;
            _this.vue.loaddingConsole = false;
            _this.vue.loadding = false;
            _this.vue.debugging = false;
            _this.vue.pauseData = {};
            _this.vue.scriptTree = {};
            _this.vue.thisObject = {};//TODO: TO CALCULATE
            _this.vue.$refs.consolepanel.clean();
            _this.vue.$refs.consolepanel.loadding(false);
            _this.vue.$refs.scopepanel.loadding(false);
            _this.vue.$refs.watchpanel.loadding(false);
            _this.texteditorObserver.dispose();
            _this.texteditorObserver.clear();
            if (_this.penddingDebugHelper) {
                console.log('add pending debug connection', _this.penddingDebugHelper);
                debugHelper.attach(_this.penddingDebugHelper.wsUri, _this.penddingDebugHelper.debugOptions, _this.penddingDebugHelper.breakpoints, _this.penddingDebugHelper.watchLists);
                _this.penddingDebugHelper = {};
            }
        });
        console.log('connect');
        debugHelper.attach(wsUri, debugOptions, breakpoints, watchLists);
    }
}
