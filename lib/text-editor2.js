'use babel';
import $ from 'jquery';
import {Range, Point} from 'atom';
import GutterHelper from './gutter-helper';
import EventCode from './eventcode';
import BreakType from '../component/breaktype';
import logger from './debug-log';
import {CompositeDisposable} from 'atom';
import MsgMgr from '../msg-mgr';

const GUTTER_NAME = 'atom-js-debug-debugger';

/**
 * TextEditor2
 *    - IS_DEBUGGING: true|false
 */
export default {
    // 是否处于调试模式
    IS_DEBUGGING: false,

    /**
     * TextEditor2初始化 开始监听事件, 装饰TextEditor
     */
    bootstrap() {
        const _this = this;
        //TODO: destroy handle subscriptions
        this.subscriptions = new CompositeDisposable();
        this.subscriptions.add(atom.workspace.observeTextEditors(function (editorInstance) {

            if (editorInstance && editorInstance.getPath() && editorInstance.getPath().toLowerCase().endsWith('.js')) {
                // 定制化TextEditor
                // logger.warn('changePath', editorInstance);
                _this.enhanceEditor(editorInstance);
            }

            editorInstance.onDidChangePath((filePath) => {
                // logger.warn('changePath', filePath);
                if (filePath && filePath.toLowerCase().endsWith('.js')) {
                    // 定制化TextEditor
                    _this.enhanceEditor(editorInstance);
                } else {
                    // 取消定制化TextEditor
                    _this.revertEditor(editorInstance);
                }
            });
        }));

        /**
         * 调试模式开始
         * - 设置 IS_DEBUGGING = true
         */
        MsgMgr.on(EventCode.D2T_DEBUG_BGN, (data) => {
            _this.IS_DEBUGGING = true;
        });

        /**
         * 调试模式结束
         * - 设置 IS_DEBUGGING = false
         * - 设置UNVERFIED样式的断点为DISABLED或DEFAULT
         */
        MsgMgr.on(EventCode.D2T_DEBUG_END, (data) => {
            _this.IS_DEBUGGING = false;
            atom.workspace.getTextEditors().forEach((editorInstance) => {
                if (editorInstance.hasOwnProperty('osHadEditorMarkerChanged')) delete editorInstance.osHadEditorMarkerChanged;
                editorInstance.getDecorations({ gutterName: GUTTER_NAME }).forEach((decorator) => {
                    // - 没有 breakEnable
                    //   => 移除decorator
                    // - 有breakEnable
                    //   - CLASS === CSS_CURRENT_LINE
                    //     - 调试中
                    //       - 有修改 => CSS_UNVERIFIED
                    //       - 未修改
                    //          - breakEnable = true  => CSS_DEFAULT
                    //          - breakEnable = false => CSS_DISABLE
                    //     - 非调试
                    //       - breakEnable = true  => CSS_DEFAULT
                    //       - breakEnable = false => CSS_DISABLE
                    if (!decorator.getProperties().hasOwnProperty('breakEnable')) {
                        decorator.destroy();
                    } else {
                        const props = decorator.getProperties();
                        if (props.breakEnable) {
                            _this.updateDecoratorProperty(decorator, { class: BreakType.CSS_DEFAULT });
                        } else {
                            _this.updateDecoratorProperty(decorator, { class: BreakType.CSS_DISABLE });
                        }
                    }
                });
            });
        });
    },

    /**
     * 增强编辑器, 支持各种Debug功能
     *    - editorInstance.osGutter
     *    - editorInstance.osHadEditorMarkerChanged
     */
    enhanceEditor(editorInstance) {
        const _this = this;
        editorInstance.osOnDidSaveDisposable = editorInstance.onDidSave(() => { _this.editorOnDidSaveHandler(editorInstance); });

        MsgMgr.on(EventCode.D2T_BREAK_ENABLE, (data) => {
            logger.info('EventCode.D2T_BREAK_ENABLE');
        });

        MsgMgr.on(EventCode.D2T_BREAK_DISABLE, (data) => {
            logger.info('EventCode.D2T_BREAK_DISABLE');
        });

        // 收到删除断点的消息
        // 非调试模式
        MsgMgr.on(EventCode.D2T_BREAK_DEL, (data) => {
            if (editorInstance.getPath() === data.script) {
                const dt = _this.getDecoratorByBufferRow(editorInstance, data.row);
                if (dt && dt.getProperties().hasOwnProperty('breakEnable')) {
                    if (dt.getProperties().class === BreakType.CSS_CURRENT_BREAK) {
                        _this.updateDecoratorProperty(dt, { breakEnable: undefined, class: BreakType.CSS_CURRENT_LINE });
                    } else if (dt.getProperties().class === BreakType.CSS_CURRENT_LINE) {
                        _this.updateDecoratorProperty(dt, { breakEnable: undefined, class: BreakType.CSS_CURRENT_LINE });
                    } else {
                        dt.destroy();
                    }
                }
            }
        });

        MsgMgr.on(EventCode.D2T_BREAK_ENABLE, (data) => {
            if (editorInstance.getPath() === data.script) {
                const dt = _this.getDecoratorByBufferRow(editorInstance, data.row);
                if (dt && dt.getProperties().hasOwnProperty('breakEnable')) {
                    if (!_this.IS_DEBUGGING) {
                        // 非调试
                        _this.updateDecoratorProperty(dt, { breakEnable: true, class: BreakType.CSS_DEFAULT });
                    } else {
                        // 调试
                        // 没改动 && CSS_DISABLE => CSS_DEFAULT
                        // 有改动 && CSS_DISABLE => CSS_UNVERIFIED
                        // 没改动 && CSS_CURRENT_LINE => CSS_CURRENT_BREAK
                        // 有改动 && CSS_CURRENT_LINE => CSS_CURRENT_LINE
                        const props = dt.getProperties();
                        if (!editorInstance.osHadEditorMarkerChanged) {
                            if (props.class === BreakType.CSS_CURRENT_LINE) {
                                _this.updateDecoratorProperty(dt, { breakEnable: true, class: BreakType.CSS_CURRENT_BREAK });
                            } else {
                                _this.updateDecoratorProperty(dt, { breakEnable: true, class: BreakType.CSS_DEFAULT });
                            }
                        } else {
                            if (props.class === BreakType.CSS_CURRENT_LINE) {
                                _this.updateDecoratorProperty(dt, { breakEnable: true, class: BreakType.CSS_CURRENT_LINE });
                            } else {
                                _this.updateDecoratorProperty(dt, { breakEnable: true, class: BreakType.CSS_UNVERIFIED });
                            }
                        }
                    }
                }
            }
        });

        MsgMgr.on(EventCode.D2T_DEBUG_RESUME, () => {
            _this.removeIndexStyle();
        });

        MsgMgr.on(EventCode.D2T_BREAK_ADD, data => {
            if (editorInstance.getPath() === data.script) {
                const _this = this;
                logger.info(`EventCode.D2T_BREAK_ADD`);
                const dt = _this.getDecoratorByBufferRow(editorInstance, data.row);
                if (!_this.IS_DEBUGGING) {
                    // 非调试模式
                    if (dt) {
                        logger.info('Add a breakpoint in a existed position');
                    } else {
                        // 断点不存在
                        const point = new Point(data.row, 0);
                        const marker = editorInstance.markBufferRange(Range.fromObject([point, point]), { invalidate: 'inside' });
                        marker.onDidChange(() => { _this.displayMakerOnDidChangeHandler(editorInstance); });

                        !marker.isDestroyed() && editorInstance.osGutter.decorateMarker(marker, { breakEnable: true, class: BreakType.CSS_DEFAULT });
                        logger.info('非调试|添加断点|{ breakEnable: true, class: BreakType.CSS_DEFAULT }|' + data.row);
                        //MsgMgr.send(EventCode.T2D_BREAK_ADD, { script: editorInstance.getPath(), row: point.row });
                    }
                } else {
                    // 调试模式
                    if (dt) {
                        if (dt.getProperties().class === BreakType.CSS_CURRENT_LINE) {
                            _this.updateDecoratorProperty(dt, { breakEnable:true, class: BreakType.CSS_CURRENT_BREAK });
                            logger.info('调试|添加断点断点');
                        } else {
                            logger.info('Add a breakpoint in a existed position');
                        }
                    } else {
                        // 断点不存在
                        // - Marker有变化
                        //   => 新断点设置为 CSS_UNVERIFIED
                        // - Marker无变化
                        //   - 文件已存盘
                        //     => 新断点设置为 CSS_DEFAULT
                        //     => 发送消息
                        //   - 文件未存盘
                        //     => 新断点设置为 CSS_UNVERIFIED
                        if (editorInstance.osHadEditorMarkerChanged === true) {
                            let point = new Point(data.row, 0);
                            let marker = editorInstance.markBufferRange(Range.fromObject([point, point]), { invalidate: 'inside' });
                            marker.onDidChange(() => { _this.displayMakerOnDidChangeHandler(editorInstance); });
                            !marker.isDestroyed() && editorInstance.osGutter.decorateMarker(marker, { breakEnable: true, class: BreakType.CSS_UNVERIFIED });
                        } else {
                            if (!editorInstance.isModified()) {
                                let point = new Point(data.row, 0);
                                let marker = editorInstance.markBufferRange(Range.fromObject([point, point]), { invalidate: 'inside' });
                                marker.onDidChange(() => { _this.displayMakerOnDidChangeHandler(editorInstance); });

                                !marker.isDestroyed() && editorInstance.osGutter.decorateMarker(marker, { breakEnable: true, class: BreakType.CSS_DEFAULT });
                                logger.info('调试|添加断点|{ breakEnable: true, class: BreakType.CSS_DEFAULT }|' + data.row);
                                //MsgMgr.send(EventCode.T2D_BREAK_ADD, { script: editorInstance.getPath(), row: point.row });
                            } else {
                                let point = new Point(data.row, 0);
                                let marker = editorInstance.markBufferRange(Range.fromObject([point, point]), { invalidate: 'inside' });
                                marker.onDidChange(() => { _this.displayMakerOnDidChangeHandler(editorInstance); });
                                !marker.isDestroyed() && editorInstance.osGutter.decorateMarker(marker, { breakEnable: true, class: BreakType.CSS_UNVERIFIED });
                            }
                        }
                    }
                }
            }
        });

        MsgMgr.on(EventCode.D2T_BREAK_DISABLE, _this.onDisableBreakpoint.bind(_this, editorInstance));

        MsgMgr.on(EventCode.D2T_BREAK_INDEX, (data) => {
            if (editorInstance.getPath() === data.script) {
                if (_this.IS_DEBUGGING) {
                    // 调试模式
                    //   - 有断点
                    //     - 已修改 - CSS_CURRENT_LINE
                    //     - 未修改 - CSS_CURRENT_BREAK
                    //   - 没断点
                    //     - 已修改 - class: CSS_CURRENT_LINE
                    // 清理其余的INDEX
                    const dt = _this.getDecoratorByBufferRow(editorInstance, data.row);
                    if (dt) {
                        if (editorInstance.osHadEditorMarkerChanged) {
                            _this.updateDecoratorProperty(dt, { class: BreakType.CSS_CURRENT_LINE });
                        } else {
                            _this.updateDecoratorProperty(dt, { class: BreakType.CSS_CURRENT_BREAK });
                        }
                    } else {
                        // _this.updateDecoratorProperty(dt, { class: BreakType.CSS_CURRENT_LINE });
                        const point = new Point(data.row, 0);
                        const marker = editorInstance.markBufferRange(Range.fromObject([point, point]), { invalidate: 'inside' });
                        // marker.onDidChange(() => { _this.displayMakerOnDidChangeHandler(editorInstance); });
                        !marker.isDestroyed() && editorInstance.osGutter.decorateMarker(marker, { class: BreakType.CSS_CURRENT_LINE });
                    }
                }
                _this.removeIndexStyle(data.script, data.row);
            }
        });

        // 初始化 editorInstance.osGutter;
        editorInstance.osGutter = editorInstance.getGutters().find((g) => { return g.name === GUTTER_NAME });
        if (!editorInstance.osGutter) {
            const observer = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                    if (mutation.addedNodes.length > 0 && $(mutation.addedNodes[0]).attr('gutter-name') === GUTTER_NAME) {
                        logger.info('Gutter added');
                        const gutterDbg = $(atom.views.getView(editorInstance).querySelector('.gutter[gutter-name=' + GUTTER_NAME + ']'));
                        gutterDbg.css('width', 20);
                        const gutterEvt = $._data(gutterDbg[0], "events");

                        // Gutter的Click事件, 用于添加断点
                        if (!gutterEvt || !gutterEvt.click) {
                            logger.info('Add gutter click handler');
                            gutterDbg.bind({
                                'click': (evt) => {
                                    const row = atom.views.getView(editorInstance).component.screenPositionForMouseEvent(evt).row;
                                    _this.editorOnOsGutterClickHandler(editorInstance, row);
                                }
                            });
                        }

                        // 查询并添加已有断点
                        _this.bootstrapBreakpointOnTextEditor(editorInstance);
                        // GutterHelper.filterBreakpoints({ script: editorInstance.getPath() }).forEach((item) => {
                        //     _this.editorOnOsGutterClickHandler(editorInstance, item.row);
                        //     if (!item.isEnabled) {
                        //         _this.onDisableBreakpoint(editorInstance, item);
                        //     }
                        // });
                    }
                });
            });
            observer.observe(atom.views.getView(editorInstance).querySelector('.gutter-container'), { childList: true });

            logger.info('Add gutter');
            editorInstance.osGutter = editorInstance.addGutter({ name: GUTTER_NAME });
        }
    },

    bootstrapBreakpoints() {
        atom.workspace.getTextEditors().map(editor => {
            this.bootstrapBreakpointOnTextEditor(editor);
        });
    },

    bootstrapBreakpointOnTextEditor(editor) {
        const _this = this;
        GutterHelper.filterBreakpoints({script: editor.getPath() }).forEach(item => {
            _this.editorOnOsGutterClickHandler(editor, item.row);
            if (!item.isEnabled) {
                _this.onDisableBreakpoint(editor, item);
            }
        });
    },

    /**
     * GUTTER点击事件
     */
    editorOnOsGutterClickHandler(editorInstance, row) {
        const _this = this;
        logger.info(`Gutter click at ${row} of ${editorInstance.getPath()}`);
        const dt = _this.getDecoratorByBufferRow(editorInstance, row);
        if (!_this.IS_DEBUGGING) {
            // 非调试模式
            if (dt) {
                // 断点存在
                dt.destroy();
                logger.info('非调试|删除已有断点');
                logger.info('SendMsg:: ' + JSON.stringify([EventCode.T2D_BREAK_DEL, { script: editorInstance.getPath(), row: row }]));
                MsgMgr.send(EventCode.T2D_BREAK_DEL, { script: editorInstance.getPath(), row: row });
            } else {
                // 断点不存在
                const point = new Point(row, 0);
                const marker = editorInstance.markBufferRange(Range.fromObject([point, point]), { invalidate: 'inside' });
                marker.onDidChange(() => { _this.displayMakerOnDidChangeHandler(editorInstance); });

                !marker.isDestroyed() && editorInstance.osGutter.decorateMarker(marker, { breakEnable: true, class: BreakType.CSS_DEFAULT });
                logger.info('非调试|添加断点|{ breakEnable: true, class: BreakType.CSS_DEFAULT }|' + row);
                logger.info('SendMsg:: ' + JSON.stringify([EventCode.T2D_BREAK_ADD, { script: editorInstance.getPath(), row: row }]));
                MsgMgr.send(EventCode.T2D_BREAK_ADD, { script: editorInstance.getPath(), row: point.row });
            }
        } else {
            // 调试模式
            if (dt) {
                // 断点存在
                switch (dt.getProperties().class) {
                    case BreakType.CSS_CURRENT_BREAK:
                        _this.updateDecoratorProperty(dt, { breakEnable:undefined, class: BreakType.CSS_CURRENT_LINE });
                        logger.info('调试|删除已有断点');
                        logger.info('SendMsg:: ' + JSON.stringify([EventCode.T2D_BREAK_DEL, { script: editorInstance.getPath(), row: row }]));
                        MsgMgr.send(EventCode.T2D_BREAK_DEL, { script: editorInstance.getPath(), row: row });
                        break;
                    case BreakType.CSS_CURRENT_LINE:
                        _this.updateDecoratorProperty(dt, { breakEnable:true, class: BreakType.CSS_CURRENT_BREAK });
                        logger.info('调试|添加断点断点');
                        logger.info('SendMsg:: ' + JSON.stringify([EventCode.T2D_BREAK_ADD, { script: editorInstance.getPath(), row: row }]));
                        MsgMgr.send(EventCode.T2D_BREAK_ADD, { script: editorInstance.getPath(), row: row });
                        break;
                    default:
                        dt.destroy();
                        logger.info('调试|删除已有断点');
                        logger.info('SendMsg:: ' + JSON.stringify([EventCode.T2D_BREAK_DEL, { script: editorInstance.getPath(), row: row }]));
                        MsgMgr.send(EventCode.T2D_BREAK_DEL, { script: editorInstance.getPath(), row: row });
                }
            } else {
                // 断点不存在
                // - Marker有变化
                //   => 新断点设置为 CSS_UNVERIFIED
                // - Marker无变化
                //   - 文件已存盘
                //     => 新断点设置为 CSS_DEFAULT
                //     => 发送消息
                //   - 文件未存盘
                //     => 新断点设置为 CSS_UNVERIFIED
                if (editorInstance.osHadEditorMarkerChanged === true) {
                    let point = new Point(row, 0);
                    let marker = editorInstance.markBufferRange(Range.fromObject([point, point]), { invalidate: 'inside' });
                    marker.onDidChange(() => { _this.displayMakerOnDidChangeHandler(editorInstance); });
                    !marker.isDestroyed() && editorInstance.osGutter.decorateMarker(marker, { breakEnable: true, class: BreakType.CSS_UNVERIFIED });
                } else {
                    if (!editorInstance.isModified()) {
                        let point = new Point(row, 0);
                        let marker = editorInstance.markBufferRange(Range.fromObject([point, point]), { invalidate: 'inside' });
                        marker.onDidChange(() => { _this.displayMakerOnDidChangeHandler(editorInstance); });
                        !marker.isDestroyed() && editorInstance.osGutter.decorateMarker(marker, { breakEnable: true, class: BreakType.CSS_DEFAULT });
                        logger.info('调试|添加断点|{ breakEnable: true, class: BreakType.CSS_DEFAULT }|' + row);
                        logger.info('SendMsg:: ' + JSON.stringify([EventCode.T2D_BREAK_ADD, { script: editorInstance.getPath(), row: row }]));
                        MsgMgr.send(EventCode.T2D_BREAK_ADD, { script: editorInstance.getPath(), row: point.row });
                    } else {
                        let point = new Point(row, 0);
                        let marker = editorInstance.markBufferRange(Range.fromObject([point, point]), { invalidate: 'inside' });
                        marker.onDidChange(() => { _this.displayMakerOnDidChangeHandler(editorInstance); });
                        !marker.isDestroyed() && editorInstance.osGutter.decorateMarker(marker, { breakEnable: true, class: BreakType.CSS_UNVERIFIED });
                    }
                }
            }
        }
    },

    /**
     * DisplayMarker发生变化
     */
    displayMakerOnDidChangeHandler(editorInstance) {
        //const _this = this;
        // XXX: live edit seems to support auto fit breakpoints.
        // if (!_this.IS_DEBUGGING) {
            // 非调试模式, 首先干掉编辑器的osHadEditorMarkerChanged属性
        //    if (editorInstance.hasOwnProperty('osHadEditorMarkerChanged')) delete editorInstance.osHadEditorMarkerChanged;
            // 然后同步一下当前编辑器的所有断点的状态
        // } else {
        //     if (editorInstance.osHadEditorMarkerChanged !== true) editorInstance.osHadEditorMarkerChanged = true
        //     // 更新已存在断点设置为 CSS_UNVERIFIED 或 CSS_CURRENT_LINE
        //     _this.switchUnverified(editorInstance);
        // }
    },

    /**
     * 编辑器存盘
     */
    editorOnDidSaveHandler(editorInstance) {
        if (this.IS_DEBUGGING) {
            this.syncBreakPoint(editorInstance);
        }
        logger.info(`Gutter didsave evt of ${editorInstance.getPath()}`);
    },

    /**
     * 恢复编辑器, 取消各种Debug功能, 如文件从.JS文件改名为其他类型的文件
     */
    revertEditor(editorInstance) {
        delete editorInstance.emitter.handlersByEventName[EventCode.D2T_BREAK_DEL];
        delete editorInstance.emitter.handlersByEventName[EventCode.D2T_BREAK_ENABLE];
        delete editorInstance.emitter.handlersByEventName[EventCode.D2T_BREAK_DISABLE];
        delete editorInstance.emitter.handlersByEventName[EventCode.D2T_BREAK_INDEX];

        if (editorInstance.osOnDidSaveDisposable) editorInstance.osOnDidSaveDisposable.dispose()
        if (editorInstance.osGutter) editorInstance.osGutter.destroy();
    },

    onDisableBreakpoint(editorInstance, data) {
        if (editorInstance.getPath() === data.script) {
            const dt = this.getDecoratorByBufferRow(editorInstance, data.row);
            if (dt && dt.getProperties().hasOwnProperty('breakEnable')) {
                if (!this.IS_DEBUGGING) {
                    // 非调试
                    this.updateDecoratorProperty(dt, { breakEnable: false, class: BreakType.CSS_DISABLE });
                } else {
                    // 调试
                    // 有改动 && CSS_CURRENT_LINE => CSS_CURRENT_LINE
                    // 有改动 => CSS_UNVERIFIED
                    // 没改动 && CSS_CURRENT_BREAK => CSS_CURRENT_LINE
                    // 没改动 => CSS_DISABLE
                    const props = dt.getProperties();
                    if (editorInstance.osHadEditorMarkerChanged) {
                        if (props.class === BreakType.CSS_CURRENT_LINE) {
                            this.updateDecoratorProperty(dt, { breakEnable: false, class: BreakType.CSS_CURRENT_LINE });
                        } else {
                            this.updateDecoratorProperty(dt, { breakEnable: false, class: BreakType.CSS_UNVERIFIED });
                        }
                    } else {
                        if (props.class === BreakType.CSS_CURRENT_BREAK) {
                            this.updateDecoratorProperty(dt, { breakEnable: false, class: BreakType.CSS_CURRENT_LINE });
                        } else {
                            this.updateDecoratorProperty(dt, { breakEnable: false, class: BreakType.CSS_DISABLE });
                        }
                    }
                }
            }
        }
    },

    //=============================================================================================
    // MISC
    //=============================================================================================
    syncBreakPoint(editorInstance) {
        const _this = this;
        if (_this.SYNC_BREAKPOINT_HANDLER_TIMEOUT) clearTimeout(_this.SYNC_BREAKPOINT_HANDLER_TIMEOUT);
        _this.SYNC_BREAKPOINT_HANDLER_TIMEOUT = setTimeout(() => {
            let breakPointLst = [];
            editorInstance.getDecorations({ gutterName: GUTTER_NAME }).forEach((decorator) => {
                if ('breakEnable' in decorator.getProperties()) {
                    breakPointLst.push({ row: decorator.getMarker().getBufferRange().start.row, isEnabled: decorator.getProperties().breakEnable });
                }
            });
            if (breakPointLst.length > 0) {
                logger.info('非调试|MARKER变化|同步断点信息');
                logger.info('SendMsg:: ' + JSON.stringify([EventCode.T2D_BREAK_SYNC, { script: editorInstance.getPath(), breakpoints: breakPointLst }]));
                MsgMgr.send(EventCode.T2D_BREAK_SYNC, { script: editorInstance.getPath(), breakpoints: breakPointLst });
            }
        }, 500);
    },

    switchUnverified(editorInstance) {
        const _this = this;
        if (_this.SWITCH_UNVERIFIED_HANDLER_TIMEOUT) clearTimeout(_this.SWITCH_UNVERIFIED_HANDLER_TIMEOUT);
        _this.SWITCH_UNVERIFIED_HANDLER_TIMEOUT = setTimeout(() => {
            editorInstance.getDecorations({ gutterName: GUTTER_NAME }).forEach((decorator) => {
                let props = decorator.getProperties();
                if (props.breakEnable && props.class === BreakType.CSS_DEFAULT) {
                    _this.updateDecoratorProperty(decorator, { class: BreakType.CSS_UNVERIFIED });
                } else if (props.breakEnable && props.class === BreakType.CSS_CURRENT_BREAK) {
                    _this.updateDecoratorProperty(decorator, { class: BreakType.CSS_CURRENT_LINE });
                } else if (!props.hasOwnProperty('breakEnable') && props.class === BreakType.CSS_CURRENT_LINE) {
                    _this.updateDecoratorProperty(decorator, { class: BreakType.CSS_CURRENT_LINE });
                }
            });
        }, 500);
    },

    removeIndexStyle(skipFile, skipRow) {
        const _this = this;
        atom.workspace.getTextEditors().forEach((editorInstance) => {
            if (editorInstance && editorInstance.getPath() && editorInstance.getPath().toLowerCase().endsWith('.js')) {
                editorInstance.getDecorations({ gutterName: GUTTER_NAME }).forEach((decorator) => {
                    const bufferRow = decorator.getMarker().getBufferRange().start.row;
                    if ((!skipFile || editorInstance.getPath() !== skipFile) || (!skipRow || bufferRow !== skipRow)) {
                        // - 没有 breakEnable
                        //   => 移除decorator
                        // - 有breakEnable
                        //   - CLASS === CSS_CURRENT_LINE
                        //     - 调试中
                        //       - 有修改 => CSS_UNVERIFIED
                        //       - 未修改
                        //          - breakEnable = true  => CSS_DEFAULT
                        //          - breakEnable = false => CSS_DISABLE
                        //     - 非调试
                        //       - breakEnable = true  => CSS_DEFAULT
                        //       - breakEnable = false => CSS_DISABLE
                        if (!decorator.getProperties().hasOwnProperty('breakEnable')) {
                            decorator.destroy();
                        } else {
                            const props = decorator.getProperties();
                            if (props.class === BreakType.CSS_CURRENT_BREAK || props.class === BreakType.CSS_CURRENT_LINE) {
                                if (_this.IS_DEBUGGING) {
                                    if (editorInstance.osHadEditorMarkerChanged) {
                                        _this.updateDecoratorProperty(decorator, { class: BreakType.CSS_UNVERIFIED });
                                    } else {
                                        if (props.breakEnable) {
                                            _this.updateDecoratorProperty(decorator, { class: BreakType.CSS_DEFAULT });
                                        } else {
                                            _this.updateDecoratorProperty(decorator, { class: BreakType.CSS_DISABLE });
                                        }
                                    }
                                } else {
                                    if (props.breakEnable) {
                                        _this.updateDecoratorProperty(decorator, { class: BreakType.CSS_DEFAULT });
                                    } else {
                                        _this.updateDecoratorProperty(decorator, { class: BreakType.CSS_DISABLE });
                                    }
                                }
                            }
                        }
                    }
                });
            }
        });
    },

    getDecoratorByBufferRow(editor, row) {
        let result;
        editor.getDecorations({ gutterName: GUTTER_NAME }).forEach((decorator) => {
            const bufferRow = decorator.getMarker().getBufferRange().start.row;
            if (!result && bufferRow === row) result = decorator;
        });
        return result;
    },

    getDecoratorsByScreenRow(editor, row) {
        let result = [];
        editor.getDecorations({ gutterName: GUTTER_NAME }).forEach((decorator) => {
            const screenRow = decorator.getMarker().getScreenRange().start.row;
            if (screenRow === row) result.push(decorator);
        });
        return result;
    },

    // 更新Decoration, 如果属性值为undefined, 则删除这个属性
    updateDecoratorProperty(decorator, dataMap) {
        if (decorator && dataMap) {
            const props = decorator.getProperties();
            for (let key in dataMap) {
                if (dataMap[key] === undefined)
                    delete props[key];
                else
                    props[key] = dataMap[key];
            }
            decorator.setProperties(props);
        }
    }
}
