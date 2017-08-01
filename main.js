'use babel';

import { CompositeDisposable, Range } from 'atom';
import TextEditor2 from './lib/text-editor2';
import esprima from 'esprima';
import $ from 'jquery';
import debugHelper from './lib/debug-helper';
import MessageHandler from './lib/message-handler';
import DebugModel from './model';
import DebugView from './view';
import DebugViewModel from './view-model';
import Vue from 'vue';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
export default {

    debugViewModel: null,
    debugView:null,
    debugModel: null,
    debugPanel: null,
    subscriptions: null,
    currentLine: null,
    currentScript: null,
    pendingRunnerList: [],

    activate(state) {
        console.log('activate main');
        const _this = this;
        _this.astMap = new Map();
        TextEditor2.bootstrap();
        // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
        _this.subscriptions = new CompositeDisposable();

        // Register command that toggles this view
        _this.subscriptions.add(atom.commands.add('atom-workspace', {
            'atom-js-debug:start': function () {
                _this.start();
            },
            'atom-js-debug:toggle': function () {
                if (_this.panel && _this.panel.isVisible()) {
                    _this.panel.hide();
                } else {
                    _this.start();
                }
            },
            'atom-js-debug:hide': function() {
                if (_this.panel && _this.panel.isVisible()) {
                    _this.panel.hide();
                }
            },
            'atom-js-debug:resume-or-pause': function() {
                debugHelper && debugHelper.resumeOrPause();
            },
            'atom-js-debug:step-over': function() {
                debugHelper && debugHelper.stepOver();
            },
            'atom-js-debug:step-into': function() {
                debugHelper && debugHelper.stepInto();
            },
            'atom-js-debug:step-out': function() {
                debugHelper && debugHelper.stepOut();
            },
        }));
        _this.subscriptions.add(atom.commands.add('.breakpoint-panel', {
            'atom-js-debug:disable-breakpoints': function () {
                debugHelper && debugHelper.disableAllBreakpoints();
            },
            'atom-js-debug:enable-breakpoints': function() {
                debugHelper && debugHelper.enableAllBreakpoints();
            },
            'atom-js-debug:remove-breakpoints': function() {
                debugHelper && debugHelper.removeAllBreakpoints();
            }
        }));
        _this.subscriptions.add(atom.contextMenu.add({
            '.breakpoint-panel': [
                {
                    label: 'Disable All Breakpoints',
                    command: 'atom-js-debug:disable-breakpoints'
                },
                {
                    label: 'Enable All Breakpoints',
                    command: 'atom-js-debug:enable-breakpoints'
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Remove All Breakpoints',
                    command: 'atom-js-debug:remove-breakpoints'
                }
            ]
        }));
        _this.subscriptions.add(atom.commands.add('.watch-panel', {
            'atom-js-debug:remove-watchs': function () {
                debugHelper && debugHelper.removeAllWatchs();
            }
        }));
        _this.subscriptions.add(atom.contextMenu.add({
            '.watch-panel': [
                {
                    label: 'Remove All Watch Expressions',
                    command: 'atom-js-debug:remove-watchs'
                }
            ]
        }));
        _this.subscriptions.add(atom.commands.add('atom-text-editor', {
            'atom-js-debug:run-to-cursor': function () {
                if (typeof _this.currentScript !== 'string' || typeof _this.currentLine !== 'string') {
                    atom.notifications.addWarning('Please right click on code in texteditor to use Run-to-cursor.');
                    return;
                }
                _this.currentScript && _this.currentLine && debugHelper && debugHelper.runToCursor(_this.currentScript, _this.currentLine);
                _this.currentScript = null;
                _this.currentLine = null;
            }
        }));
        _this.subscriptions.add(atom.contextMenu.add({
            'atom-text-editor': [{
                label:'Run to Cursor',
                command: 'atom-js-debug:run-to-cursor',
                created: function(e) {
                    if (_this.debugViewModel && _this.debugViewModel.vue && _this.debugViewModel.vue.debugging && !_this.debugViewModel.vue.running) {
                        this.enabled = true;
                    } else {
                        this.enabled = false;
                        return;
                    }
                    _this.currentScript = atom.workspace.getActiveTextEditor().getPath();
                    _this.currentLine = e.path.map(res => $(res).attr('data-screen-row')).filter(a => a)[0];
                }
            }]
        }));
        this.MessageHandler = new MessageHandler({
            onAddBreakpoint: () => {},
            onRemoveBreakpoint: () => {},
            onResetBreakpoint: () => {}
        });
        _this.registerCodeParser();
        if (state && state.debugData) {
            //_this.debugData = state.debugDate;
            atom.deserializers.deserialize(state);
        }
        const runnerPath = path.join(__dirname, 'runner');
        fs.readdirSync(runnerPath).forEach(item => {
            try {
                console.log('load', item);
                fs.accessSync(path.join(runnerPath, item, 'package.json'));
                const pkgInfo = require(path.join(runnerPath, item, 'package.json'));
                atom.packages.onDidLoadPackage(pack => {
                    if (pack.name === pkgInfo.name) { atom.packages.activatePackage(pack.name); }
                });
                atom.packages.loadPackage(path.join(runnerPath, item));
            } catch(err) {
              console.log(err);
            }
        });
        atom.packages.triggerActivationHook('atom-js-debug:auto-start');
    },

    registerCodeParser() {
        const _this = this;
        this.subscriptions.add(atom.workspace.observeTextEditors(editor => {
            if (editor.getGrammar().name !== 'JavaScript') {
                return;
            }
            _this.subscriptions.add(editor.onDidSave(event => {
                if (editor.getGrammar().name !== 'JavaScript') {
                    return;
                }
                let fileContent = editor.getText();
                try {
                    let ast = esprima.parse(fileContent, {loc: true, tolerant: true});
                    _this.astMap.set(editor, ast);
                } catch(err) {
                }
            }));
        }));
    },

    deactivate() {
        this.subscriptions && this.subscriptions.destroy && this.subscriptions.dispose();
        this.debugView && this.debugView.destroy && this.debugView.destroy();
        this.debugViewModel && this.debugViewModel.destroy && this.debugViewModel.destroy();
        this.debugView = null;
        this.debugPanel = null;
    },

    serialize() {
        return {
            deserializer: 'AtomPluginJsDebug',
            debugData: {
                breakpoints: debugHelper.getBreakpoints()
            }
        }
    },

    deserializeAtomPluginJsDebug(state) {
        if (state && state.debugData && state.debugData.breakpoints) {
            setTimeout(async () => {
                await debugHelper.bootStrapBreakpoints(state.debugData.breakpoints);
                TextEditor2.bootstrapBreakpoints();
            }, 500);
            //textEditors.forEach(editor => TextEditor2.syncBreakPoint(editor));
        }
    },

    providerDebugHandler2() {
        const _this = this;
        console.log('provide debug');
        return {
            /**
             * Debug target websocket uri
             * @param {String} wsUri
             * @param {Object} debugOptions
             * x@param {Function} debugOptions.preDebugStep
             * x@param {Function} debugOptions.postDebugStep
             * @param {String} debugOptions.tempDir temp folder for remote script
             * @param {Object} debugOptions.eventHandler handle debug event
             * * @param {Function} debugOptions.customMappingStrategy custom file mapping strategy
             * * @param {Boolean} debugOptions.enableDefaultMappingStrategy whether to enable default file mapping strategy
             */
            debug(wsUri, {tempDir = path.join(os.tmpDir(), this.runnerName || 'atom-js-debug'), eventHandler = {}, customMappingStrategy = null, enableDefaultMappingStrategy = true} = {}) {
                console.log(arguments);
                _this.debug(wsUri, {tempDir, eventHandler, customMappingStrategy, enableDefaultMappingStrategy});
            },
            /**
             * create interface on debug panel
             * @param {Object} options
             * @param {String} options.runnerName runner name display in a select
             * @param {Array} options.debugForum a vuecomponent to generate form
             */
            createInterface(options) {
                // if (_this.debugViewModel && _this.debugViewModel.vue) {
                //     if (_this.debugViewModel.vue.runnerList.filter(runner => runner.runnerName === options.runnerName).length === 0) {
                //         _this.debugViewModel.vue.runnerList.push(options);
                //     }
                // }
                console.log(options);
                if (_this.pendingRunnerList.filter(runner => runner.runnerName === options.runnerName).length === 0) {
                    _this.pendingRunnerList.push(options);
                    Vue.component(options.runnerName, options.debugForum);
                }
                this.runnerName = options.runnerName;
            },
            destroyInterface() {

            }
        }
    },

    providerDebugHandler() {
        const _this = this;
        return {
            debug(deviceId, domain, srcPath, wsUri, page) {
                _this.start();
                _this.debug(deviceId, domain, srcPath, wsUri, page);
            }
        }
    },

    debug(wsUri, debugOptions) {
        this.debugViewModel.debug(wsUri, debugOptions);
    },

    getHyperclickProvider() {
        const _this = this;
        return {
            // wordRegExp: /[$0-9\w\.]+/g,
            // getSuggestionForWord(textEditor, text, range) {
            //     return {
            //         range: range,
            //         callback: [
            //             {
            //                 title: 'Value of text',
            //                 rightLabel: text,
            //                 callback:() => {}
            //             },
            //             {
            //                 title: 'Add to watch',
            //                 rightLabel: text,
            //                 callback:() => {}
            //             }
            //         ]
            //     }
            // }
            priority: 1,
            async getSuggestion(textEditor, position) {
                //let res = esprima.parse(textEditor.getText(), {loc: true, tolerant: true});
                if (!debugHelper.isDebugging() || !atom.config.get('atom-js-debug.Hyperclick')) {
                    return false;
                }
                let res = _this.astMap.get(textEditor);
                if (!res) {
                    try {
                        res = esprima.parse(textEditor.getText(), {loc: true, tolerant: true});
                    } catch(err) {
                        return false;
                    }
                }
                _this.ans = [];
                _this.loopDown(res, position);
                if (!_this.ans) {
                    return {
                        range: new Range(position, position),
                        callback: () => {}
                    };
                }
                let exp = _this.ans.pop();
                if (!exp || !exp.target) {
                    return {
                        range: new Range(position, position),
                        callback: () => {}
                    };
                }
                let cb = [{
                    title: exp.target,
                    rightLabel: 'add to watch',
                    callback: async () => {
                        try {
                            await debugHelper && debugHelper.addWatchList(exp.target);
                            await debugHelper && debugHelper.evaluateWatchList();
                            if (_this.debugViewModel && _this.debugViewModel.vue && debugHelper && debugHelper.isDebugging()) {
                                _this.debugViewModel.vue.updateWatch();
                            }
                        } catch(err) {

                        }

                    }
                }];
                if (exp && exp.target) {
                    //evaluate value
                    if (_this.debugViewModel && _this.debugViewModel.vue && _this.debugViewModel.vue.debugging && debugHelper && !debugHelper.running) {
                        const value = await debugHelper.evaluateOnCallFrame(exp.target);
                        let disp = value.value || value.description;
                        if (disp && disp.length > 20) {
                            disp = disp.slice(0, 17) + '...';
                        }
                        cb.unshift({
                            title: exp.target,
                            rightLabel: disp,
                            callback: () => {}
                        });
                    }
                }
                return {
                    range: new Range([exp.loc.start.line - 1, exp.loc.start.column], [exp.loc.end.line - 1, exp.loc.end.column]),
                    callback: cb
                }
            }
        }
    },

    fullVariable(node) {
        if (node.object && node.property) {
            return this.fullVariable(node.object) + '["' + (node.property.name ? node.property.name : node.property.raw) + '"]';
        } else {
            return node.type === 'ThisExpression' ? 'this' : node.name ? node.name : node.raw;
        }
    },

    includes(loc, position) {
        return position.row === loc.start.line - 1 && position.row === loc.end.line - 1 && position.column >= loc.start.column && position.column <= loc.end.column;
    },

    loopDown(node, position) {
        if (node.loc) {
            if (this.includes(node.loc, position)) {
                if (node.type && node.type.includes('Identifier')) {
                    this.ans.length === 0 && this.ans.push({target: node.name, loc: node.loc});
                }
                if (node.type && node.type.includes('Literal')) {
                    this.ans.length === 0 && this.ans.push({target: node.raw, loc: node.loc});
                }
                if (node.type && node.type.includes('Expression') && node.property && this.includes(node.property.loc, position)) {
                    let res = this.fullVariable(node);
                    if (res) {
                        this.ans.push({target: res, loc: node.loc});
                    }
                }
            }
        }
        for (let i in node) {
            if (node[i] && typeof node[i] === 'object') {
                this.loopDown(node[i], position);
            }
        }
    },

    start(state) {
        //TODO: deserialize bps;
        // Activate debug manager
        const _this = this;
        if (!_this.debugPanel) {
            _this.debugModel = new DebugModel();
            _this.debugView = new DebugView();
            _this.debugPanel = atom.workspace.getRightDock().getPanes()[0].addItem(_this.debugView.getElement(), {pending: false});
            atom.workspace.getRightDock().getPanes()[0].activateItem(_this.debugView.getElement());
            // _this.debugPanel = atom.workspace.addRightPanel({
            //     item: _this.debugView.getElement(),
            //     visible: true,
            //     priority: 1024
            // });
            _this.debugViewModel = new DebugViewModel(_this.debugView.getElement(), _this.debugModel);
            _this.debugViewModel.vue.runnerList = _this.pendingRunnerList;
        }
        global.debugMain = debugHelper;
        atom.workspace.getRightDock().show();
        atom.workspace.getRightDock().getPanes()[0].activateItem(_this.debugView.getElement());
        //_this.debugPanel.show();
        return _this.debugPanel;
    },

    stop() {
        // TODO: implements stop
    }
};
